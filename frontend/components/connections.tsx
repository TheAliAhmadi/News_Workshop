"use client";
import { useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./explorer";
import { Check } from "./fields";
import { KEY_NAMES } from "./steps";
import { api } from "@/lib/api";

type Name = "news" | "openai";
export type KeyCheck = {
  state: "ok" | "rejected" | "unchecked";
  message: string;
};

const PROVIDERS: Record<
  Name,
  { usedBy: string; link: string; linkText: string; placeholder: string }
> = {
  news: {
    usedBy: "Collect news",
    link: "https://newsapi.org/register",
    linkText: "Get a free NewsAPI key",
    placeholder: "Paste your NewsAPI key (32 letters and numbers)",
  },
  openai: {
    usedBy: "Extract, and Design with AI",
    link: "https://platform.openai.com/api-keys",
    linkText: "Create an OpenAI API key",
    placeholder: "Paste your OpenAI key (starts with sk-)",
  },
};

function Status({
  connected,
  check,
  checking,
}: {
  connected: boolean;
  check?: KeyCheck;
  checking: boolean;
}) {
  if (checking)
    return (
      <span className="key-chip checking">
        <Loader2 className="spin" size={13} /> Checking…
      </span>
    );
  if (check?.state === "rejected")
    return (
      <span className="key-chip rejected">
        <CircleAlert size={13} /> Not accepted
      </span>
    );
  if (!connected) return <span className="key-chip empty">Not set</span>;
  if (check?.state === "ok")
    return (
      <span className="key-chip ok">
        <CheckCircle2 size={13} /> Working
      </span>
    );
  return (
    <span className="key-chip saved">
      <CircleHelp size={13} /> Saved, not checked yet
    </span>
  );
}

/**
 * Keys are checked with their provider before they are saved, and the result
 * stays on screen, so students can see that a key works and where it is kept.
 */
export function Connections({
  boot,
  update,
  close,
}: {
  boot: any;
  /** Merge the new connection status into the application state. */
  update: (status: any) => void;
  close: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<Name, string>>({
    news: "",
    openai: "",
  });
  const [remember, setRemember] = useState<boolean>(
    !!boot.secure_storage.available,
  );
  const [checks, setChecks] = useState<Record<string, KeyCheck>>(
    boot.checks || {},
  );
  const [busy, setBusy] = useState<string[]>([]);
  const [error, setError] = useState("");
  const store =
    boot.build.system === "Windows"
      ? "Windows Credential Manager"
      : "the macOS Keychain";

  const run = async (names: string[], request: () => Promise<any>) => {
    setBusy(names);
    setError("");
    try {
      const result = await request();
      const next = { ...checks, ...result.checks };
      setChecks(next);
      update({ ...result, checks: next });
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy([]);
    }
  };
  const save = async () => {
    const entered = (Object.keys(drafts) as Name[]).filter((n) =>
      drafts[n].trim(),
    );
    const result = await run(entered, () =>
      api("/connections", {
        ...Object.fromEntries(entered.map((n) => [n, drafts[n]])),
        remember,
      }),
    );
    if (!result) return;
    // Keep a rejected key in the box so it can be corrected.
    setDrafts((prev) => {
      const next = { ...prev };
      for (const n of entered)
        if (result.checks?.[n]?.state !== "rejected") next[n] = "";
      return next;
    });
  };
  const remove = (name: Name) =>
    run([name], async () => {
      const result = await api("/connections", { remove: [name] });
      const next = { ...checks };
      delete next[name];
      setChecks(next);
      return { ...result, checks: {} };
    });

  return (
    <Modal
      title="Connections"
      description="Your own keys for NewsAPI and OpenAI. Classify needs no key."
      close={close}
    >
      <div className="privacy-note">
        <ShieldCheck size={20} />
        <p>
          {boot.secure_storage.available ? (
            <>
              Keys are kept on this computer in <strong>{store}</strong>, never
              in your project files or on GitHub.
            </>
          ) : (
            <>Keys are kept in memory only, never written to a file.</>
          )}{" "}
          They are only sent to NewsAPI or OpenAI when you run a step, and never
          shown again here after saving.
        </p>
      </div>
      {(Object.keys(PROVIDERS) as Name[]).map((name) => {
        const provider = PROVIDERS[name];
        const connected = !!boot.connections[name];
        const check = checks[name];
        const checking = busy.includes(name);
        return (
          <section key={name} className={"key-card " + (check?.state ?? "")}>
            <div className="key-card-head">
              <div>
                <h3>{KEY_NAMES[name]}</h3>
                <span className="hint">Used by {provider.usedBy}</span>
              </div>
              <Status connected={connected} check={check} checking={checking} />
            </div>
            {connected && (
              <p className="key-stored">
                Saved key ending in <code>{boot.hints?.[name]}</code>,{" "}
                {boot.remembered[name]
                  ? `kept in ${store}.`
                  : "for this session only (enter it again after restarting)."}
              </p>
            )}
            {check && (
              <p className={"key-message " + check.state} role="status">
                {check.message}
              </p>
            )}
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              aria-label={`${KEY_NAMES[name]} key`}
              placeholder={
                connected
                  ? "Paste a new key to replace the saved one"
                  : provider.placeholder
              }
              value={drafts[name]}
              onChange={(e) => setDrafts({ ...drafts, [name]: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
            <div className="row wrap">
              {connected && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={checking}
                    onClick={() =>
                      run([name], () => api("/connections/check", { name }))
                    }
                  >
                    Check it works
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="danger-outline"
                    disabled={checking}
                    onClick={() => remove(name)}
                  >
                    Remove
                  </Button>
                </>
              )}
              <a
                className="key-link"
                href={provider.link}
                target="_blank"
                rel="noreferrer"
              >
                {provider.linkText} <ExternalLink size={12} />
              </a>
            </div>
          </section>
        );
      })}
      {boot.secure_storage.available ? (
        <Check
          label={`Remember keys on this computer (${store})`}
          value={remember}
          set={setRemember}
        />
      ) : (
        <p className="hint" role="status">
          {boot.secure_storage.detail}
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="row wrap">
        <Button
          disabled={
            !!busy.length || !Object.values(drafts).some((v) => v.trim())
          }
          onClick={save}
        >
          {busy.length ? (
            <>
              <Loader2 className="spin" size={15} /> Checking…
            </>
          ) : (
            "Save and check"
          )}
        </Button>
        <Button variant="outline" onClick={close}>
          Done
        </Button>
      </div>
    </Modal>
  );
}
