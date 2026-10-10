"use client";
import { useEffect, useState } from "react";
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
  FlaskConical,
  Save,
  Trash2,
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
import { stepOf } from "./steps";
import { FolderPicker } from "./folder-picker";

/** Steps a dataset can be sent to from the explorer or a preview. */
const DATASET_STEPS = ["hf", "llm"];
export function Modal({
  title,
  description,
  children,
  close,
  wide = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  close: () => void;
  /** For code and tables that need the width of the screen. */
  wide?: boolean;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className={"workbench-dialog" + (wide ? " wide" : "")}>
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
  createExample: () => void;
  /** Close anything showing a file that was just deleted. */
  deleted: (f: Ref) => void;
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
  createExample,
  deleted,
}: Props) {
  const [picking, setPicking] = useState(false);
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
      if (action?.type === "mkdir")
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
  const fileCount = entries.filter((e) => e.kind === "file").length;
  const target = roots.find((r) => r.id === selectedFolder.root);
  return (
    <section className="explorer" aria-label="Files">
      <div className="explorer-heading">
        <span className="sidebar-title">Files</span>
        <button
          className="icon-button"
          title="Refresh files"
          aria-label="Refresh files"
          onClick={() => refresh().catch(report)}
        >
          <RefreshCw size={14} />
        </button>
      </div>
      <div className="explorer-actions">
        <label
          className="icon-upload upload-button"
          title="Upload a CSV, JSON, or text file into the selected folder"
        >
          <Upload size={14} /> Upload
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
        <Button variant="outline" size="sm" onClick={() => setPicking(true)}>
          <FolderOpen size={14} /> Open folder
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          title="New folder"
          aria-label="New folder"
          onClick={() => begin("mkdir")}
        >
          <FolderPlus size={15} />
        </Button>
      </div>
      {fileCount > 8 && (
        <div className="explorer-search">
          <Search size={14} />
          <input
            aria-label="Search filenames"
            placeholder="Find a file…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}
      <div className="tree" aria-label="Workspace files">
        {roots.map((root) => (
          <div key={root.id}>
            <div className="root-line">
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
                <FolderOpen size={15} />
                <strong>{root.name}</strong>
              </button>
              {root.id !== roots[0]?.id && (
                <button
                  className="root-detach"
                  title={"Close " + root.name + " (files are not deleted)"}
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
                <p>No files yet.</p>
                <p>
                  Upload a CSV or JSON file, or run <strong>Collect</strong> to
                  download articles.
                </p>
                {root.id === roots[0]?.id && (
                  <button className="link-button" onClick={createExample}>
                    <FlaskConical size={13} /> Create practice data
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="explorer-footer" title={target?.path}>
        Uploads go to{" "}
        <strong>
          {target?.name}
          {selectedFolder.path ? "/" + selectedFolder.path : ""}
        </strong>
      </div>
      {picking && (
        <FolderPicker
          title="Open a folder"
          description="Show a folder from this computer in Files. Nothing is moved or copied, and it stays listed after restarting."
          confirm="Open"
          close={() => setPicking(false)}
          onPick={async (path) => {
            const root = await api<Root>("/roots", { path });
            setPicking(false);
            setFolder({ root: root.id, path: "" });
            await refresh();
          }}
        />
      )}
      {action?.type === "delete" && (
        <Modal
          title={`Delete ${action.file!.name}?`}
          description={
            action.file!.kind === "folder"
              ? "Deletes this empty folder from your computer."
              : "Deletes this file from your computer. It does not go to the Trash, so this cannot be undone."
          }
          close={() => setAction(null)}
        >
          <div className="row wrap">
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api("/delete", { file: action.file });
                  deleted(action.file!);
                  setAction(null);
                  await refresh();
                } catch (e) {
                  report(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 size={15} /> Delete
            </Button>
            <Button variant="outline" onClick={() => setAction(null)}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}
      {(action?.type === "mkdir" || action?.type === "rename") && (
        <Modal
          title={
            action.type === "mkdir"
              ? "Create a folder"
              : "Rename file or folder"
          }
          close={() => setAction(null)}
        >
          <Field label="Name">
            <input
              autoFocus
              value={name}
              placeholder="new-folder"
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
                {DATASET_STEPS.map((tool) => (
                  <Button
                    variant="outline"
                    key={tool}
                    onClick={() => {
                      useFile(tool, action.file!);
                      setAction(null);
                    }}
                  >
                    Use in {stepOf(tool).title}
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
            <Button
              variant="outline"
              className="danger-outline"
              onClick={() => setAction({ type: "delete", file: action.file })}
            >
              <Trash2 size={14} /> Delete…
            </Button>
          </div>
        </Modal>
      )}
    </section>
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
  useEffect(() => {
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
            <span>Click a row to see the complete record.</span>
            <div className="spacer" />
            <span className="use-in-label">Use in</span>
            {DATASET_STEPS.map((t) => (
              <Button
                variant="outline"
                size="sm"
                key={t}
                onClick={() => useFile(t, file)}
              >
                {stepOf(t).title}
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
