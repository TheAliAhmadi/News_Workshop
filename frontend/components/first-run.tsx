"use client";
import { useState } from "react";
import { BrainCircuit, FolderOpen, KeyRound } from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./explorer";
import { Check, Field } from "./fields";
import { FolderPicker } from "./folder-picker";
import { KeyLinks } from "./key-links";
import { ModelPreparation } from "./model-preparation";
import { api } from "@/lib/api";

type Step = "folder" | "keys" | "model" | "done";
const ORDER: Step[] = ["folder", "keys", "model", "done"];

/**
 * Shown once, the first time a student opens the application. Every step can be
 * skipped; connections and the classifier can be set up later from the header.
 */
export function FirstRunGuide({
  bootstrap,
  onFinish,
  onBootstrapChange,
  report,
}: {
  bootstrap: any;
  onFinish: () => void;
  onBootstrapChange: (patch: any) => void;
  report: (e: unknown) => void;
}) {
  const [step, setStep] = useState<Step>("folder");
  const folder =
    bootstrap.locations?.research ||
    bootstrap.settings?.research_folder ||
    bootstrap.default_research_folder ||
    "";
  const [picking, setPicking] = useState(false);
  const [keys, setKeys] = useState({ news: "", openai: "" });
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [keyError, setKeyError] = useState("");
  const secure = bootstrap.secure_storage || { available: false, detail: "" };

  const advance = () => setStep(ORDER[ORDER.indexOf(step) + 1]);

  const finish = async () => {
    try {
      await api("/settings", { first_run_complete: true });
    } catch (e) {
      report(e);
    }
    onFinish();
  };

  const chooseFolder = async (path: string) => {
    const result = await api("/research-folder", { path });
    onBootstrapChange({ roots: result.roots, locations: result.locations });
    setPicking(false);
    advance();
  };

  const saveKeys = async () => {
    const entered = Object.fromEntries(
      Object.entries(keys).filter(([, value]) => value.trim()),
    );
    if (!Object.keys(entered).length) return advance();
    setBusy(true);
    setKeyError("");
    try {
      const status = await api("/connections", { ...entered, remember });
      onBootstrapChange(status);
      // A key the provider rejected was not saved; keep it in its box to fix.
      const rejected = Object.entries(status.checks || {}).filter(
        ([, check]: [string, any]) => check.state === "rejected",
      );
      setKeys((prev) => ({
        news: rejected.some(([n]) => n === "news") ? prev.news : "",
        openai: rejected.some(([n]) => n === "openai") ? prev.openai : "",
      }));
      if (rejected.length)
        setKeyError(
          rejected.map(([, c]: [string, any]) => c.message).join(" "),
        );
      else advance();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Welcome to Research Workbench"
      description="Three short steps. You can skip any of them and change everything later."
      close={finish}
    >
      <ol className="first-run-steps" aria-label="Setup steps">
        {ORDER.slice(0, 3).map((id, index) => (
          <li key={id} className={step === id ? "active" : ""}>
            <span>{index + 1}</span>
            {
              {
                folder: "Research folder",
                keys: "API keys",
                model: "Classifier",
              }[id as "folder" | "keys" | "model"]
            }
          </li>
        ))}
      </ol>

      {step === "folder" && (
        <>
          <p>
            <FolderOpen size={15} /> Your research files stay on this computer,
            in a folder you choose. Most students keep the suggested folder.
          </p>
          <div className="chosen-folder">
            <FolderOpen size={18} />
            <code>{folder}</code>
          </div>
          <div className="row wrap">
            <Button onClick={advance}>Use this folder</Button>
            <Button variant="outline" onClick={() => setPicking(true)}>
              Choose a different folder…
            </Button>
          </div>
          {picking && (
            <FolderPicker
              title="Choose your research folder"
              description="New results are saved here. You can create a new folder inside, for example in Documents."
              confirm="Use this folder"
              start={folder}
              close={() => setPicking(false)}
              onPick={chooseFolder}
            />
          )}
        </>
      )}

      {step === "keys" && (
        <>
          <p>
            <KeyRound size={15} /> Collecting news needs a NewsAPI key, and AI
            extraction needs an OpenAI key. Use your own accounts.
            Classification runs on this computer and needs no key.
          </p>
          <KeyLinks />
          <Field label="NewsAPI key">
            <input
              type="password"
              autoComplete="off"
              value={keys.news}
              onChange={(e) => setKeys({ ...keys, news: e.target.value })}
              placeholder="Optional"
            />
          </Field>
          <Field label="OpenAI key">
            <input
              type="password"
              autoComplete="off"
              value={keys.openai}
              onChange={(e) => setKeys({ ...keys, openai: e.target.value })}
              placeholder="Optional"
            />
          </Field>
          {secure.available ? (
            <Check
              label="Remember on this computer"
              value={remember}
              set={setRemember}
            />
          ) : (
            <p className="hint">{secure.detail}</p>
          )}
          {keyError && (
            <p className="inline-error" role="alert">
              {keyError}
            </p>
          )}
          <div className="row wrap">
            <Button onClick={saveKeys} disabled={busy}>
              {busy ? "Checking your keys…" : "Check and continue"}
            </Button>
            <Button variant="outline" onClick={advance}>
              Skip for now
            </Button>
          </div>
        </>
      )}

      {step === "model" && (
        <>
          <p>
            <BrainCircuit size={15} /> The default classifier{" "}
            <code>{bootstrap.default_classifier}</code> (about 440 MB) downloads
            the first time you use it. Preparing it now avoids waiting in class.
            You can also do this later from the Classify step.
          </p>
          <ModelPreparation report={report}>
            {(state) => (
              <Button
                variant={state === "completed" ? "default" : "outline"}
                onClick={finish}
              >
                {state === "completed" ? "Finish" : "Skip for now"}
              </Button>
            )}
          </ModelPreparation>
        </>
      )}
    </Modal>
  );
}
