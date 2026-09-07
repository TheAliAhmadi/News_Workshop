"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { Button } from "./ui/button";
import { Check, Field } from "./fields";
import { api, pretty } from "@/lib/api";
import { designerSessionPath } from "@/lib/storage";

export type EditorDesign = {
  instructions: string;
  enumsText: string;
  schemaText: string;
  preset: string;
};
type Message = { role: "user" | "assistant"; content: string };
type Session = {
  draft: string;
  history: Message[];
  mode: "new" | "refine";
  followModel: boolean;
  model: string;
  pending: boolean;
  undo: {
    design: EditorDesign;
    history: Message[];
    mode: "new" | "refine";
  } | null;
};
const initial: Session = {
  draft: "",
  history: [],
  mode: "new",
  followModel: true,
  model: "",
  pending: false,
  undo: null,
};
const example =
  "Extract product announcements: product name, launch date, target customer, price if stated, and announcement category.";

export function ExtractionDesigner({
  design,
  extractionModel,
  workspace,
  apply,
  onBusy,
}: {
  design: EditorDesign;
  extractionModel: string;
  workspace: string;
  apply: (design: EditorDesign) => void;
  onBusy: (busy: boolean) => void;
}) {
  const storagePath = designerSessionPath(workspace);
  const [session, setSession] = useState<Session>(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const latest = useRef({ design, apply, onBusy });
  latest.current = { design, apply, onBusy };
  const model = session.followModel ? extractionModel : session.model;
  const change = (value: Partial<Session>) =>
    setSession((prev) => ({ ...prev, ...value }));

  // Conversations are kept by the backend, so they survive a restart even when
  // the application opens on a different local port.
  useEffect(() => {
    let current = true;
    setReady(false);
    api(storagePath)
      .then((saved) => {
        if (!current) return;
        if (saved && Array.isArray(saved.history)) {
          setSession({ ...initial, ...saved, pending: false });
          if (saved.pending)
            setNotice(
              "Generation was interrupted. Your existing design is unchanged; send the request again to retry.",
            );
        }
      })
      .catch(
        () =>
          current &&
          setNotice(
            "The saved conversation could not be read. Your extraction design is still available in the editors.",
          ),
      )
      .finally(() => current && setReady(true));
    return () => {
      current = false;
      sequence.current++;
      controller.current?.abort();
      latest.current.onBusy(false);
    };
  }, [storagePath]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      api(storagePath, session).catch(() =>
        setNotice(
          "This conversation could not be saved. Save your extraction preset to keep the design.",
        ),
      );
    }, 600);
    return () => clearTimeout(timer);
  }, [session, ready, storagePath]);

  const cancel = () => {
    sequence.current++;
    controller.current?.abort();
    controller.current = null;
    change({ pending: false });
    latest.current.onBusy(false);
    setNotice(
      "Generation cancelled. Your design is unchanged; the request is ready to retry.",
    );
  };
  const send = async () => {
    if (
      !ready ||
      session.pending ||
      controller.current ||
      !session.draft.trim()
    )
      return;
    setError("");
    setNotice("");
    const before = { ...latest.current.design };
    let current = null;
    try {
      if (!model.trim())
        throw new Error(
          "Choose a design model, or select the extraction model below.",
        );
      if (session.mode === "refine")
        current = {
          instructions: before.instructions,
          enums: JSON.parse(before.enumsText),
          schema: JSON.parse(before.schemaText),
        };
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "Correct invalid JSON in the editors before refining, or choose New design."
          : String((e as Error).message),
      );
      return;
    }
    const id = ++sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    change({ pending: true });
    latest.current.onBusy(true);
    try {
      const result = await api<{
        kind: "design" | "clarification";
        message: string;
        design: {
          instructions: string;
          enums: Record<string, string[]>;
          schema: Record<string, unknown>;
          preset: string;
        } | null;
      }>(
        "/extraction-design",
        {
          model,
          message: session.draft,
          mode: session.mode,
          history: session.history.slice(-40),
          current_design: current,
        },
        abort.signal,
      );
      if (sequence.current !== id) return;
      if (JSON.stringify(latest.current.design) !== JSON.stringify(before)) {
        setNotice(
          "The design changed while this request was running. Its response was discarded; send again to use your latest edits.",
        );
        return;
      }
      const history: Message[] = [
        ...session.history,
        { role: "user", content: session.draft },
        { role: "assistant", content: result.message },
      ];
      if (result.kind === "design" && result.design) {
        const next = {
          instructions: result.design.instructions,
          enumsText: pretty(result.design.enums),
          schemaText: pretty(result.design.schema),
          preset: "custom",
        };
        latest.current.apply(next);
        change({
          history,
          draft: "",
          mode: "refine",
          undo: {
            design: before,
            history: session.history,
            mode: session.mode,
          },
        });
        setNotice(
          "Instructions, named enums, and output schema updated. Review the editors or send a refinement.",
        );
      } else {
        change({ history, draft: "" });
      }
    } catch (e) {
      if (sequence.current === id && !abort.signal.aborted)
        setError((e as Error).message);
    } finally {
      if (sequence.current === id) {
        controller.current = null;
        change({ pending: false });
        latest.current.onBusy(false);
      }
    }
  };
  const reset = () => {
    change({ history: [], draft: "", mode: "new" });
    setError("");
    setNotice(
      "New conversation. Your existing design remains in the editors until a valid replacement is generated.",
    );
  };

  return (
    <div
      className="extraction-designer"
      aria-label="Conversational extraction designer"
      aria-busy={session.pending}
    >
      <div className="designer-heading">
        <div>
          <h3>
            <Sparkles size={17} /> Design with AI
          </h3>
          <p>
            Describe what to extract. Refine it through chat; the editors update
            together.
          </p>
        </div>
      </div>
      <fieldset
        disabled={session.pending || !ready}
        className="designer-controls"
      >
        <div className="grid2">
          <Field label="Design starting point">
            <select
              value={session.mode}
              onChange={(e) => {
                change({
                  mode: e.target.value as "new" | "refine",
                  history: [],
                });
                setNotice(
                  "Starting point changed. Your existing design is unchanged.",
                );
              }}
            >
              <option value="new">New design</option>
              <option value="refine">Refine current design</option>
            </select>
          </Field>
          <Field
            label="Design model"
            hint={
              session.followModel
                ? "Following the extraction model. Type here to use a different model."
                : "This model is used only for design chat."
            }
          >
            <input
              value={model}
              placeholder="Choose or enter an OpenAI model ID"
              onChange={(e) =>
                change({ model: e.target.value, followModel: false })
              }
            />
          </Field>
        </div>
        <div className="row wrap">
          <Check
            label="Use extraction model"
            value={session.followModel}
            set={(followModel) =>
              change({ followModel, model: model || session.model })
            }
          />
          <Button
            variant="outline"
            size="sm"
            disabled={loadingModels}
            onClick={async () => {
              setLoadingModels(true);
              setError("");
              try {
                setModels(await api<string[]>("/models/openai"));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setLoadingModels(false);
              }
            }}
          >
            {loadingModels ? "Loading models…" : "Load design models"}
          </Button>
          {models.length > 0 && (
            <select
              aria-label="Design account models"
              value=""
              onChange={(e) =>
                e.target.value &&
                change({ model: e.target.value, followModel: false })
              }
            >
              <option value="">Choose an account model…</option>
              {models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          )}
        </div>
      </fieldset>
      <div
        className="designer-history"
        role="log"
        aria-label="Design conversation"
        aria-live="polite"
      >
        {!session.history.length && (
          <p className="hint">
            Start with any extraction task. No dataset or earlier processing is
            required.
          </p>
        )}
        {session.history.map((message, i) => (
          <div key={i} className={"designer-message " + message.role}>
            <strong>
              {message.role === "user" ? "You" : "Design assistant"}
            </strong>
            <p>{message.content}</p>
          </div>
        ))}
        {session.pending && (
          <div className="designer-message user">
            <strong>You</strong>
            <p>{session.draft}</p>
          </div>
        )}
      </div>
      <fieldset
        disabled={session.pending || !ready}
        className="designer-controls"
      >
        <Field label="Describe your extraction task">
          <textarea
            rows={4}
            value={session.draft}
            placeholder={example}
            onChange={(e) => change({ draft: e.target.value })}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                void send();
              }
            }}
          />
        </Field>
        <div className="row wrap">
          <Button onClick={send} disabled={!session.draft.trim()}>
            <Send size={15} />
            {session.history.length ? "Send refinement" : "Generate design"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => change({ draft: example })}
          >
            Use product example
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!session.undo}
            onClick={() => {
              if (!session.undo) return;
              latest.current.apply(session.undo.design);
              change({
                history: session.undo.history,
                mode: session.undo.mode,
                undo: null,
              });
              setNotice(
                "Restored the instructions, enums, and schema from before the last generated update.",
              );
              setError("");
            }}
          >
            <RotateCcw size={14} /> Undo last generated update
          </Button>
          <Button variant="ghost" size="sm" onClick={reset}>
            New conversation
          </Button>
        </div>
      </fieldset>
      {session.pending && (
        <div className="designer-progress" role="status">
          <Loader2 className="spin" size={17} />
          <span>Generating and validating your design…</span>
          <Button variant="outline" size="sm" onClick={cancel}>
            <X size={14} /> Cancel generation
          </Button>
        </div>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="designer-notice" role="status">
          {notice}
        </p>
      )}
      <p className="hint">
        Only this conversation and, when refining, the current design are sent.
        Dataset rows are not included. Generating a design does not process your
        dataset.
      </p>
    </div>
  );
}
