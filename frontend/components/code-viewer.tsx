"use client";
import { useState } from "react";
import { Check, Copy, Download, Minus, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./explorer";

export type TeachingCode = {
  filename: string;
  script: string;
  source: { name: string; file: string; line: number; code: string }[];
};

// Enough Python highlighting to read code on a projector; no dependencies.
const TOKENS =
  /(#[^\n]*)|([rRfF]?(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'))|\b(def|return|import|from|as|for|in|if|elif|else|while|break|continue|try|except|finally|raise|with|not|and|or|is|None|True|False|lambda|class|pass|yield|global)\b|\b(\d+(?:\.\d+)?)\b/g;
const KINDS = ["comment", "string", "keyword", "number"];

function highlight(code: string) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const match of code.matchAll(TOKENS)) {
    const start = match.index!;
    if (start > last) parts.push(code.slice(last, start));
    const kind = KINDS[match.slice(1).findIndex((group) => group)];
    parts.push(
      <span key={start} className={"tok-" + kind}>
        {match[0]}
      </span>,
    );
    last = start + match[0].length;
  }
  parts.push(code.slice(last));
  return parts;
}

function CodeBlock({
  code,
  firstLine = 1,
  size,
}: {
  code: string;
  firstLine?: number;
  size: number;
}) {
  const lines = code.replace(/\n$/, "").split("\n").length;
  return (
    <div className="code-block" style={{ fontSize: size }}>
      <pre className="code-gutter" aria-hidden>
        {Array.from({ length: lines }, (_, i) => firstLine + i).join("\n")}
      </pre>
      <pre className="code-text">
        <code>{highlight(code.replace(/\n$/, ""))}</code>
      </pre>
    </div>
  );
}

/** "Show the Python code": a runnable script, and the workbench's own code. */
export function CodeViewer({
  title,
  code,
  close,
}: {
  title: string;
  code: TeachingCode;
  close: () => void;
}) {
  const [tab, setTab] = useState<"script" | "source">("script");
  const [size, setSize] = useState(14);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code.script);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused; Download still works.
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([code.script], { type: "text/x-python" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = code.filename;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Modal
      title={`The Python behind “${title}”`}
      description="The same process as this page, written out step by step. It uses your current settings."
      close={close}
      wide
    >
      <div className="code-toolbar">
        <div className="segmented" role="tablist" aria-label="Which code">
          <button
            role="tab"
            aria-selected={tab === "script"}
            className={tab === "script" ? "active" : ""}
            onClick={() => setTab("script")}
          >
            Run it yourself
          </button>
          <button
            role="tab"
            aria-selected={tab === "source"}
            className={tab === "source" ? "active" : ""}
            onClick={() => setTab("source")}
          >
            Inside the workbench
          </button>
        </div>
        <span className="spacer" />
        <div className="row" role="group" aria-label="Text size">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Smaller text"
            onClick={() => setSize(Math.max(11, size - 1))}
          >
            <Minus size={14} />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Larger text"
            onClick={() => setSize(Math.min(24, size + 1))}
          >
            <Plus size={14} />
          </Button>
        </div>
        {tab === "script" && (
          <>
            <Button variant="outline" size="sm" onClick={copy}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button size="sm" onClick={download}>
              <Download size={14} /> Download {code.filename}
            </Button>
          </>
        )}
      </div>
      {tab === "script" ? (
        <>
          <p className="code-intro">
            A short, complete script that does what this step does. Save it in
            the <strong>News_Workshop</strong> folder and run it with the
            command at the top. Keys are read from a <code>.env</code> file,
            never written in the code.
          </p>
          <CodeBlock code={code.script} size={size} />
        </>
      ) : (
        <>
          <p className="code-intro">
            The functions the workbench actually runs for this step. They do the
            same work as the script, plus the safety features: progress you can
            resume, retries, and checks on every result.
          </p>
          {code.source.map((part) => (
            <section key={part.name} className="source-part">
              <h3>
                <code>{part.name}</code>
                <span>
                  {part.file}, line {part.line}
                </span>
              </h3>
              <CodeBlock code={part.code} firstLine={part.line} size={size} />
            </section>
          ))}
        </>
      )}
    </Modal>
  );
}
