"use client";
import { useEffect, useState } from "react";
import {
  BrainCircuit,
  CheckCircle2,
  FolderOpen,
  KeyRound,
  Loader2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./explorer";
import { Check, Field } from "./fields";
import { api, formatBytes } from "@/lib/api";

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
  const [preparation, setPreparation] = useState<any>(null);
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

  // Poll only while a download is actually running.
  useEffect(() => {
    if (step !== "model" || !preparation || preparation.state !== "running")
      return;
    const timer = setInterval(async () => {
      try {
        setPreparation(await api("/models/prepare"));
      } catch (e) {
        report(e);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [step, preparation, report]);

  const prepare = async () => {
    try {
      setPreparation(await api("/models/prepare", {}));
    } catch (e) {
      report(e);
    }
  };

  const share =
    preparation?.total > 0
      ? Math.min(
          100,
          Math.round((preparation.downloaded / preparation.total) * 100),
        )
      : 0;

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
            in a folder you choose. It is kept when you upgrade or remove the
            application.
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
            <KeyRound size={15} /> NewsAPI and OpenAI need your own accounts and
            keys. Hugging Face classification runs on this computer and needs no
            key.
          </p>
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
            <code>{bootstrap.default_classifier}</code> downloads the first time
            you use it. Preparing it now avoids waiting in class. It is kept on
            this computer afterwards.
          </p>
          {preparation && (
            <div className="prepare-progress" role="status">
              <progress
                aria-label="Classifier download progress"
                value={preparation.total ? preparation.downloaded : undefined}
                max={preparation.total || 1}
              />
              <span>
                {preparation.state === "running" && (
                  <Loader2 className="spin" size={14} />
                )}
                {preparation.state === "completed" && (
                  <CheckCircle2 size={14} />
                )}
                {preparation.phase}
                {preparation.total
                  ? ` · ${formatBytes(preparation.downloaded)} of ${formatBytes(preparation.total)} (${share}%)`
                  : ""}
              </span>
              {preparation.error && (
                <span className="inline-error">{preparation.error}</span>
              )}
            </div>
          )}
          <div className="row wrap">
            <Button
              onClick={prepare}
              disabled={preparation?.state === "running"}
            >
              {preparation?.state === "failed" ||
              preparation?.state === "cancelled"
                ? "Try again"
                : "Prepare FinBERT for class"}
            </Button>
            <Button variant="outline" onClick={finish}>
              {preparation?.state === "completed" ? "Finish" : "Skip for now"}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
