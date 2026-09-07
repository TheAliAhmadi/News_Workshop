"use client";
import {
  ReactNode,
  useId,
  Children,
  isValidElement,
  cloneElement,
  ReactElement,
} from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Entry, Ref, Root } from "@/lib/api";
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  const direct = Children.toArray(children).some(
    (child) =>
      isValidElement(child) &&
      ["input", "select", "textarea"].includes(String(child.type)),
  );
  const controls = Children.map(children, (child) =>
    isValidElement(child) &&
    ["input", "select", "textarea"].includes(String(child.type))
      ? cloneElement(child as ReactElement<any>, {
          id,
          "aria-describedby": hint ? id + "-hint" : undefined,
        })
      : child,
  );
  return (
    <div
      className="field"
      role={direct ? undefined : "group"}
      aria-labelledby={direct ? undefined : id + "-label"}
    >
      {direct ? (
        <label className="label" htmlFor={id}>
          {label}
        </label>
      ) : (
        <span className="label" id={id + "-label"}>
          {label}
        </span>
      )}
      {controls}
      {hint && (
        <span className="hint" id={id + "-hint"}>
          {hint}
        </span>
      )}
    </div>
  );
}
export function Section({
  number,
  title,
  detail,
  children,
}: {
  number?: string;
  title: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <div className="section-head">
        {number && <span className="step-number">{number}</span>}
        <div>
          <h2>{title}</h2>
          {detail && <p>{detail}</p>}
        </div>
      </div>
      <div className="section-body">{children}</div>
    </section>
  );
}
export function Check({
  label,
  value,
  set,
}: {
  label: string;
  value: boolean;
  set: (b: boolean) => void;
}) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => set(e.target.checked)}
      />
      {label}
    </label>
  );
}
export function FileSelect({
  value,
  set,
  files,
  upload,
}: {
  value?: Ref;
  set: (r: Ref) => void;
  files: Entry[];
  upload: (file: File) => Promise<Ref>;
}) {
  const id = useId();
  return (
    <div className="input-file-row">
      <select
        aria-label="Input dataset"
        value={value ? JSON.stringify(value) : ""}
        onChange={(e) => e.target.value && set(JSON.parse(e.target.value))}
      >
        <option value="">Choose a CSV or JSON dataset…</option>
        {files
          .filter((f) => /\.(csv|json)$/i.test(f.path))
          .map((f) => (
            <option
              key={f.root + f.path}
              value={JSON.stringify({ root: f.root, path: f.path })}
            >
              {f.path}
            </option>
          ))}
      </select>
      <label className="upload-button" htmlFor={id}>
        Upload
        <input
          id={id}
          type="file"
          accept=".csv,.json"
          onChange={async (e) => {
            try {
              if (e.target.files?.[0]) set(await upload(e.target.files[0]));
            } catch {
              /* Shared uploader reports errors. */
            } finally {
              e.target.value = "";
            }
          }}
        />
      </label>
    </div>
  );
}
export function ColumnPicker({
  columns,
  value,
  set,
}: {
  columns: string[];
  value: string[];
  set: (v: string[]) => void;
}) {
  return (
    <div className="column-picker">
      <div className="ordered-columns">
        {value.map((col, i) => (
          <div className="column-chip" key={col}>
            <span className="order">{i + 1}</span>
            <span>{col}</span>
            <button
              title={"Move " + col + " up"}
              disabled={!i}
              onClick={() => {
                const next = [...value];
                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                set(next);
              }}
            >
              <ArrowUp size={12} />
            </button>
            <button
              title={"Move " + col + " down"}
              disabled={i === value.length - 1}
              onClick={() => {
                const next = [...value];
                [next[i + 1], next[i]] = [next[i], next[i + 1]];
                set(next);
              }}
            >
              <ArrowDown size={12} />
            </button>
            <button
              title={"Remove " + col}
              onClick={() => set(value.filter((c) => c !== col))}
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <select
        aria-label="Add text column"
        value=""
        onChange={(e) => e.target.value && set([...value, e.target.value])}
      >
        <option value="">+ Add a column…</option>
        {columns
          .filter((c) => !value.includes(c))
          .map((c) => (
            <option key={c}>{c}</option>
          ))}
      </select>
    </div>
  );
}
export function Destination({
  value,
  set,
  roots,
  folders,
}: {
  value: any;
  set: (v: any) => void;
  roots: Root[];
  folders: Entry[];
}) {
  return (
    <div className="destination">
      <div className="grid2">
        <Field label="Workspace">
          <select
            value={value.root || roots[0]?.id || ""}
            onChange={(e) => set({ ...value, root: e.target.value, path: "" })}
          >
            {roots.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Output folder">
          <select
            value={value.path || ""}
            onChange={(e) => set({ ...value, path: e.target.value })}
          >
            <option value="">Workspace root</option>
            {folders
              .filter((f) => f.root === (value.root || roots[0]?.id))
              .map((f) => (
                <option key={f.path} value={f.path}>
                  {f.path}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Filename">
          <input
            value={value.filename || ""}
            onChange={(e) => set({ ...value, filename: e.target.value })}
            placeholder="my_results.csv"
          />
        </Field>
        <Field label="Format">
          <select
            value={value.format || "csv"}
            onChange={(e) => {
              const fmt = e.target.value;
              set({
                ...value,
                format: fmt,
                filename:
                  (value.filename || "results.csv").replace(/\.[^.]+$/, "") +
                  "." +
                  fmt,
              });
            }}
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </Field>
      </div>
      <Check
        label="Replace this file if it already exists"
        value={!!value.overwrite}
        set={(overwrite) => set({ ...value, overwrite })}
      />
    </div>
  );
}
export function ImportText({
  accept = ".json,.txt,.md",
  onText,
  label = "Upload file",
}: {
  accept?: string;
  onText: (t: string) => void;
  label?: string;
}) {
  return (
    <label className="upload-button">
      {label}
      <input
        type="file"
        accept={accept}
        onChange={async (e) => {
          if (e.target.files?.[0]) onText(await e.target.files[0].text());
          e.target.value = "";
        }}
      />
    </label>
  );
}
