"use client";
import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  FileSpreadsheet,
  Folder,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  Upload,
  Search,
  MoreHorizontal,
  Pencil,
  Download,
  X,
  Save,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { api, Entry, Ref, Root, keyOf, query, pretty } from "@/lib/api";
import { Field } from "./fields";
export function Modal({
  title,
  description,
  children,
  close,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  close: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="workbench-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description || "Choose the details for this workspace action."}
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
type Props = {
  roots: Root[];
  entries: Entry[];
  refresh: () => Promise<void>;
  open: (f: Ref) => void;
  useFile: (tool: string, f: Ref) => void;
  report: (e: unknown) => void;
  selectedFolder: Ref;
  setFolder: (f: Ref) => void;
  upload: (file: File) => Promise<Ref>;
};
export function Explorer({
  roots,
  entries,
  refresh,
  open,
  useFile,
  report,
  selectedFolder,
  setFolder,
  upload,
}: Props) {
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<{ type: string; file?: Entry } | null>(
    null,
  );
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState("");
  const execute = async () => {
    setBusy(true);
    try {
      if (action?.type === "attach") await api("/roots", { path: name });
      else if (action?.type === "mkdir")
        await api("/folders", {
          ...selectedFolder,
          path: [selectedFolder.path, name].filter(Boolean).join("/"),
        });
      else if (action?.type === "rename")
        await api("/rename", { file: action.file, name });
      setAction(null);
      await refresh();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };
  const begin = (type: string, file?: Entry) => {
    setName(type === "rename" ? file!.name : "");
    setAction({ type, file });
  };
  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const tree = (root: string, path = "", depth = 0): React.ReactNode =>
    entries
      .filter(
        (e) =>
          e.root === root &&
          (e.path.includes("/")
            ? e.path.slice(0, e.path.lastIndexOf("/"))
            : "") === path,
      )
      .map((e) => {
        const key = keyOf(e);
        const expandedHere = expanded.has(key);
        const active = selected === key;
        if (
          search &&
          e.kind === "file" &&
          !e.name.toLowerCase().includes(search.toLowerCase())
        )
          return null;
        return (
          <div key={key}>
            <div
              className={"tree-row " + (active ? "selected" : "")}
              style={{ paddingLeft: 12 + depth * 14 }}
            >
              <button
                className="tree-item"
                aria-expanded={e.kind === "folder" ? expandedHere : undefined}
                onClick={() => {
                  setSelected(key);
                  if (e.kind === "folder") {
                    setFolder({ root: e.root, path: e.path });
                    toggle(key);
                  } else open(e);
                }}
                onKeyDown={(event) => {
                  if (
                    e.kind === "folder" &&
                    ["ArrowRight", "ArrowLeft"].includes(event.key)
                  ) {
                    event.preventDefault();
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      event.key === "ArrowRight"
                        ? next.add(key)
                        : next.delete(key);
                      return next;
                    });
                  }
                }}
              >
                {e.kind === "folder" ? (
                  <>
                    {expandedHere ? (
                      <ChevronDown size={12} />
                    ) : (
                      <ChevronRight size={12} />
                    )}
                    <Folder size={15} />
                  </>
                ) : (
                  <>
                    {/\.(csv|json)$/.test(e.name) ? (
                      <FileSpreadsheet size={15} className="file-green" />
                    ) : (
                      <FileText size={15} className="file-blue" />
                    )}
                  </>
                )}
                <span>{e.name}</span>
              </button>
              <button
                className="tree-menu"
                aria-label={"Actions for " + e.name}
                onClick={() => setAction({ type: "menu", file: e })}
              >
                <MoreHorizontal size={15} />
              </button>
            </div>
            {e.kind === "folder" &&
              (expandedHere || search) &&
              tree(root, e.path, depth + 1)}
          </div>
        );
      });
  return (
    <aside className="explorer">
      <div className="explorer-heading">
        <span>EXPLORER</span>
        <div>
          <button title="Add Folder" onClick={() => begin("attach")}>
            <FolderPlus size={15} />
          </button>
          <button
            title="Refresh explorer"
            onClick={() => refresh().catch(report)}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>
      <div className="explorer-search">
        <Search size={14} />
        <input
          aria-label="Search filenames"
          placeholder="Find a file…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="explorer-actions">
        <Button variant="outline" size="sm" onClick={() => begin("attach")}>
          <FolderOpen size={14} /> Open folder
        </Button>
        <label className="icon-upload" title="Upload into selected folder">
          <Upload size={15} />
          <input
            type="file"
            accept=".csv,.json,.txt,.md"
            onChange={async (e) => {
              try {
                if (e.target.files?.[0]) await upload(e.target.files[0]);
              } catch (err) {
                report(err);
              }
              e.target.value = "";
            }}
          />
        </label>
        <button title="Create folder" onClick={() => begin("mkdir")}>
          <FolderPlus size={15} />
        </button>
      </div>
      <div className="tree" aria-label="Workspace files">
        {roots.map((root) => (
          <div key={root.id}>
            <button
              className={
                "root-row " +
                (selectedFolder.root === root.id && !selectedFolder.path
                  ? "active-root"
                  : "")
              }
              title={root.path}
              onClick={() => setFolder({ root: root.id, path: "" })}
            >
              <ChevronDown size={13} />
              <FolderOpen size={15} />
              <strong>{root.name}</strong>
            </button>
            <div className="root-detach">
              {root.id !== roots[0]?.id && (
                <button
                  title={"Detach " + root.name}
                  onClick={async () => {
                    try {
                      await api("/roots/detach", { root: root.id });
                      if (selectedFolder.root === root.id)
                        setFolder({ root: roots[0].id, path: "" });
                      await refresh();
                    } catch (e) {
                      report(e);
                    }
                  }}
                >
                  Close folder
                </button>
              )}
            </div>
            {tree(root.id)}
            {!entries.some((e) => e.root === root.id) && (
              <div className="empty-tree">
                Your files live here.
                <br />
                Upload a dataset or open a research folder.
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="explorer-footer">
        <span className="status-dot" /> Local files ·{" "}
        {entries.filter((e) => e.kind === "file").length} files
        <p title={selectedFolder.path}>
          Upload to: {selectedFolder.path || "workspace root"}
        </p>
      </div>
      {action && action.type !== "menu" && (
        <Modal
          title={
            action.type === "attach"
              ? "Open / Add Folder"
              : action.type === "mkdir"
                ? "Create a folder"
                : "Rename file or folder"
          }
          close={() => setAction(null)}
          description={
            action.type === "attach"
              ? "Attach an existing research directory. It stays available after restarting the workbench."
              : undefined
          }
        >
          <Field
            label={action.type === "attach" ? "Absolute folder path" : "Name"}
          >
            <input
              autoFocus
              value={name}
              placeholder={
                action.type === "attach"
                  ? "/Users/you/Documents/Research"
                  : "new-folder"
              }
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && execute()}
            />
          </Field>
          <Button disabled={busy || !name.trim()} onClick={execute}>
            {busy ? "Working…" : "Save"}
          </Button>
        </Modal>
      )}
      {action?.type === "menu" && (
        <Modal title={action.file!.name} close={() => setAction(null)}>
          <div className="file-actions">
            {action.file!.kind === "file" && (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    open(action.file!);
                    setAction(null);
                  }}
                >
                  Open preview
                </Button>
                {["hf", "llm", "clean", "review", "aggregate"].map((tool) => (
                  <Button
                    variant="outline"
                    key={tool}
                    onClick={() => {
                      useFile(tool, action.file!);
                      setAction(null);
                    }}
                  >
                    {
                      (
                        {
                          hf: "Use in Hugging Face",
                          llm: "Use in LLM",
                          clean: "Clean",
                          review: "Review",
                          aggregate: "Aggregate",
                        } as any
                      )[tool]
                    }
                  </Button>
                ))}
                <a
                  className="button-link"
                  href={"/api/download?" + query(action.file!)}
                  download
                >
                  <Download size={14} /> Download
                </a>
              </>
            )}
            <Button
              variant="outline"
              onClick={() => begin("rename", action.file!)}
            >
              <Pencil size={14} /> Rename
            </Button>
          </div>
        </Modal>
      )}
    </aside>
  );
}
export function Preview({
  roots,
  entries,
  file,
  report,
  refresh,
  useFile,
}: {
  roots: Root[];
  entries: Entry[];
  file: Ref;
  report: (e: unknown) => void;
  refresh: () => Promise<void>;
  useFile: (t: string, f: Ref) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [offset, setOffset] = useState(0);
  const [text, setText] = useState("");
  const [record, setRecord] = useState<any>(null);
  const [saveAs, setSaveAs] = useState(false);
  const [newName, setNewName] = useState("");
  const [identity, setIdentity] = useState("");
  const [saveFolder, setSaveFolder] = useState<Ref>({
    root: file.root,
    path: file.path.slice(0, file.path.lastIndexOf("/") + 1).replace(/\/$/, ""),
  });
  // Fetch when the tab identity or page changes; no source dataset is ever edited here.
  const load = async (start = offset) => {
    try {
      const d = await api("/preview?" + query(file) + "&offset=" + start);
      setData(d);
      setText(d.content || "");
      setIdentity(keyOf(file));
    } catch (e) {
      report(e);
    }
  };
  // Effect is below to keep a tab's editor draft while other workspaces are selected.
  ReactUseEffect(() => {
    load();
  }, [file.root, file.path, offset]);
  const save = async (as = false) => {
    try {
      if (as && (!newName.trim() || /[\/\\]/.test(newName)))
        throw new Error("Enter a filename without path separators.");
      const target = as
        ? {
            ...saveFolder,
            path: [saveFolder.path, newName].filter(Boolean).join("/"),
          }
        : file;
      const value = await api("/text", {
        file: target,
        content: text,
        overwrite: !as,
        expected_hash: as ? undefined : data.hash,
      });
      if (!as) setData({ ...data, hash: value.hash });
      setSaveAs(false);
      await refresh();
    } catch (e) {
      report(e);
    }
  };
  if (!data || identity !== keyOf(file))
    return <div className="empty-state">Loading file preview…</div>;
  return (
    <div className="preview-view">
      <div className="preview-toolbar">
        <div>
          <FileSpreadsheet size={18} />
          <strong>{file.path}</strong>
          <span className="tag">
            {data.kind === "dataset"
              ? "Read-only dataset"
              : "Configuration editor"}
          </span>
        </div>
        <div>
          <Button variant="outline" size="sm" onClick={() => load()}>
            Reload
          </Button>
          <a
            className="button-link"
            href={"/api/download?" + query(file)}
            download
          >
            Download
          </a>
        </div>
      </div>
      {data.kind === "dataset" ? (
        <>
          <div className="dataset-summary">
            <span>
              <strong>{data.total.toLocaleString()}</strong> rows
            </span>
            <span>
              <strong>{data.columns.length}</strong> columns
            </span>
            <span>Click a row to inspect its complete record.</span>
            <div className="spacer" />
            {["hf", "llm", "clean", "review"].map((t) => (
              <Button
                variant="outline"
                size="sm"
                key={t}
                onClick={() => useFile(t, file)}
              >
                {
                  (
                    {
                      hf: "Hugging Face",
                      llm: "LLM",
                      clean: "Clean",
                      review: "Review",
                    } as any
                  )[t]
                }
              </Button>
            ))}
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  {data.columns.map((c: string) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r: any, i: number) => (
                  <tr
                    key={i}
                    tabIndex={0}
                    onClick={() => setRecord(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setRecord(r);
                      }
                    }}
                  >
                    <td>{offset + i + 1}</td>
                    {data.columns.map((c: string) => (
                      <td
                        key={c}
                        title={
                          typeof r[c] === "object"
                            ? JSON.stringify(r[c])
                            : String(r[c] ?? "")
                        }
                      >
                        {typeof r[c] === "object"
                          ? JSON.stringify(r[c])
                          : String(r[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              Rows {data.total ? offset + 1 : 0}–
              {Math.min(offset + 30, data.total)} of {data.total}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!offset}
              onClick={() => setOffset(Math.max(0, offset - 30))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + 30 >= data.total}
              onClick={() => setOffset(offset + 30)}
            >
              Next
            </Button>
          </div>
        </>
      ) : (
        <div className="text-preview">
          <textarea
            aria-label="Configuration file contents"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="row">
            <Button onClick={() => save()}>
              <Save size={15} /> Save
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setNewName(file.path.split("/").pop() || "instructions.md");
                setSaveAs(true);
              }}
            >
              Save As…
            </Button>
          </div>
        </div>
      )}
      {record && (
        <Modal title="Record inspector" close={() => setRecord(null)}>
          <pre className="record-inspector">{pretty(record)}</pre>
        </Modal>
      )}
      {saveAs && (
        <Modal title="Save configuration as" close={() => setSaveAs(false)}>
          <Field label="Save As workspace">
            <select
              value={saveFolder.root}
              onChange={(e) =>
                setSaveFolder({ root: e.target.value, path: "" })
              }
            >
              {roots.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Save As folder">
            <select
              value={saveFolder.path}
              onChange={(e) =>
                setSaveFolder({ ...saveFolder, path: e.target.value })
              }
            >
              <option value="">Workspace root</option>
              {entries
                .filter(
                  (f) => f.kind === "folder" && f.root === saveFolder.root,
                )
                .map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.path}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="New filename">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </Field>
          <Button onClick={() => save(true)}>Save new file</Button>
        </Modal>
      )}
    </div>
  );
}
import { useEffect as ReactUseEffect } from "react";
