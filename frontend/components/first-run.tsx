"use client";
import { useState } from "react";
import { BrainCircuit, FolderOpen, KeyRound } from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./explorer";
import { Check, Field } from "./fields";
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
  const [folder, setFolder] = useState(
    bootstrap.settings?.research_folder ||
      bootstrap.default_research_folder ||
      "",
  );
  const [keys, setKeys] = useState({ news: "", openai: "" });
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
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

  const chooseFolder = async () => {
    setBusy(true);
    try {
      const result = await api("/research-folder", {
        path: folder,
        create: true,
      });
      onBootstrapChange({ roots: result.roots });
      advance();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };

  const saveKeys = async () => {
    const entered = Object.fromEntries(
      Object.entries(keys).filter(([, value]) => value.trim()),
    );
    if (!Object.keys(entered).length) return advance();
    setBusy(true);
    try {
      const status = await api("/connections", { ...entered, remember });
      onBootstrapChange(status);
      setKeys({ news: "", openai: "" });
      advance();
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
          <Field
            label="Research folder"
            hint="Enter a full path. It is created if it does not exist yet."
          >
            <input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              spellCheck={false}
            />
          </Field>
          <div className="row wrap">
            <Button onClick={chooseFolder} disabled={busy || !folder.trim()}>
              Use this folder
            </Button>
            <Button variant="outline" onClick={advance}>
              Keep the default
            </Button>
          </div>
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
          <div className="row wrap">
            <Button onClick={saveKeys} disabled={busy}>
              Save and continue
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
