"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FolderOpen,
  Newspaper,
  BrainCircuit,
  Sparkles,
  Brush,
  ClipboardCheck,
  ChartNoAxesCombined,
  Settings2,
  X,
  PanelBottom,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  Play,
  Square,
  RefreshCw,
  Files,
  HelpCircle,
  FlaskConical,
} from "lucide-react";
import { Button } from "./ui/button";
import { Explorer, Modal, Preview } from "./explorer";
import { FirstRunGuide } from "./first-run";
import { Tool, defaults } from "./tools";
import { Check, Destination, Field } from "./fields";
import {
  api,
  Entry,
  Ref,
  Root,
  keyOf,
  pretty,
  query,
  setToken,
} from "@/lib/api";
import { loadPreferences, savePreferences } from "@/lib/storage";
const TOOLS = [
  { id: "news", title: "News API", icon: Newspaper },
  { id: "hf", title: "Hugging Face", icon: BrainCircuit },
  { id: "llm", title: "LLM extraction", icon: Sparkles },
  { id: "clean", title: "Clean", icon: Brush },
  { id: "review", title: "Human validation", icon: ClipboardCheck },
  { id: "aggregate", title: "Aggregate / export", icon: ChartNoAxesCombined },
];
export default function Workbench() {
  const [boot, setBoot] = useState<any>(null);
  const [roots, setRoots] = useState<Root[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [folder, setFolder] = useState<Ref>({ root: "", path: "" });
  const [active, setActive] = useState("news");
  const [tabs, setTabs] = useState<Ref[]>([]);
  const [configs, setConfigs] = useState<any>(defaults);
  const [jobs, setJobs] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [connections, setConnections] = useState(false);
  const [keys, setKeys] = useState({ news: "", openai: "" });
  const [remember, setRemember] = useState(true);
  const [firstRun, setFirstRun] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [jobsHeight, setJobsHeight] = useState(166);
  const [jobDetail, setJobDetail] = useState<any>(null);
  const [help, setHelp] = useState(false);
  const [example, setExample] = useState(false);
  const [exampleDest, setExampleDest] = useState<any>({
    filename: "synthetic_example.csv",
    path: "",
    format: "csv",
  });
  const [resumeJob, setResumeJob] = useState<any>(null);
  const [resumeDest, setResumeDest] = useState<any>(null);
  const savedSignature = useRef("");
  const report = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
  }, []);
  const refresh = useCallback(async () => {
    const r: Root[] = await api("/roots");
    setRoots(r);
    const all: Entry[] = [];
    const walk = async (root: string, path = "", depth = 0) => {
      const children: Entry[] = await api(
        "/tree?" + new URLSearchParams({ root, path }),
      );
      all.push(...children);
      if (depth < 15 && all.length < 20000)
        await Promise.all(
          children
            .filter((e) => e.kind === "folder")
            .map((e) => walk(root, e.path, depth + 1)),
        );
    };
    const results = await Promise.allSettled(
      r.map(async (root) => {
        try {
          await walk(root.id);
        } finally {
          setEntries([...all]);
        }
      }),
    );
    const failed = results.find((x) => x.status === "rejected");
    if (failed?.status === "rejected") report(failed.reason);
  }, [report]);
  useEffect(() => {
    api("/bootstrap")
      .then(async (b) => {
        setToken(b.token);
        setRemember(!!b.secure_storage?.available);
        setRoots(b.roots);
        setFolder({ root: b.roots[0].id, path: "" });
        // Preferences come from backend user storage, which survives a restart
        // on a different local port. Existing browser settings are adopted once.
        let saved: any = {};
        try {
          saved = await loadPreferences();
        } catch (e) {
          report(e);
        }
        const initial = Object.fromEntries(
          Object.entries(defaults).map(([tool, value]) => [
            tool,
            { ...value, ...saved[tool] },
          ]),
        );
        if (!saved.llm)
          initial.llm = {
            ...initial.llm,
            ...b.templates.esg,
            schemaText: pretty(b.templates.esg.schema),
            enumsText: pretty(b.templates.esg.enums),
            model: b.default_model,
          };
        setConfigs(initial);
        setBoot(b);
        setFirstRun(!b.settings?.first_run_complete);
        await refresh();
      })
      .catch(report);
  }, [refresh, report]);
  // Debounced so typing in a tool form does not write on every keystroke.
  useEffect(() => {
    if (!boot) return;
    const timer = setTimeout(() => {
      savePreferences(configs).catch(report);
    }, 600);
    return () => clearTimeout(timer);
  }, [configs, boot, report]);
  const poll = useCallback(async () => {
    try {
      const list = await api("/jobs");
      setJobs(list);
      const sig = list
        .filter((j: any) => j.saved)
        .map((j: any) => j.id + j.output_hash)
        .join();
      if (sig !== savedSignature.current) {
        savedSignature.current = sig;
        await refresh();
      }
    } catch (e) {
      report(e);
    }
  }, [refresh, report]);
  useEffect(() => {
    if (!boot) return;
    poll();
    const interval = setInterval(poll, 1500);
    return () => clearInterval(interval);
  }, [boot, poll]);
  const open = (f: Ref) => {
    const ref = { root: f.root, path: f.path };
    setTabs((prev) =>
      prev.some((p) => keyOf(p) === keyOf(ref)) ? prev : [...prev, ref],
    );
    setActive(keyOf(ref));
  };
  const useFile = async (tool: string, file: Ref) => {
    try {
      const data = await api("/preview?" + query(file) + "&limit=1");
      if (data.kind !== "dataset")
        throw new Error("Choose a CSV or JSON dataset for this tool.");
      const preferred = [
        "headline",
        "title",
        "lead",
        "description",
        "content",
      ].filter((c) => data.columns.includes(c));
      setConfigs((prev: any) => ({
        ...prev,
        [tool]: {
          ...prev[tool],
          input: { root: file.root, path: file.path },
          columns: preferred.length ? preferred : data.columns.slice(0, 1),
          context_columns: [],
          fields: [],
          mapping: {},
          filter: { column: "", mode: "include", values: [] },
        },
      }));
      setActive(tool);
    } catch (e) {
      report(e);
    }
  };
  const upload = async (file: File) => {
    const form = new FormData();
    form.append("root", folder.root);
    form.append("path", folder.path);
    form.append("file", file);
    try {
      const ref = await api<Ref>("/upload", form);
      await refresh();
      setMessage("Uploaded " + file.name);
      return ref;
    } catch (e) {
      report(e);
      throw e;
    }
  };
  const drag = (axis: "x" | "y", event: React.PointerEvent) => {
    event.preventDefault();
    const start = axis === "x" ? event.clientX : event.clientY;
    const initial = axis === "x" ? sidebarWidth : jobsHeight;
    const move = (e: PointerEvent) => {
      if (axis === "x")
        setSidebarWidth(
          Math.max(190, Math.min(500, initial + e.clientX - start)),
        );
      else
        setJobsHeight(Math.max(40, Math.min(500, initial - e.clientY + start)));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };
  const jobAction = async (job: any, action: string) => {
    try {
      await api("/jobs/" + job.id + "/" + action, {});
      await poll();
    } catch (e) {
      report(e);
    }
  };
  const activeCount = jobs.filter((j) =>
    ["queued", "running"].includes(j.state),
  ).length;
  if (!boot)
    return (
      <main className="loading-screen">
        <BrainCircuit size={28} />
        <h1>Research Workbench</h1>
        <p>{error || "Opening your local workspace…"}</p>
        {error && (
          <Button onClick={() => location.reload()}>Retry connection</Button>
        )}
      </main>
    );
  return (
    <div className="workbench">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <BrainCircuit size={18} />
          </span>
          <strong>Research Workbench</strong>
          <span className="header-divider" />
          <span className="muted">News & structured analysis</span>
        </div>
        <div className="header-actions">
          <span className="local-badge">
            <span className="status-dot" /> Local workspace
          </span>
          <button title="Workbench help" onClick={() => setHelp(true)}>
            <HelpCircle size={17} />
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConnections(true)}
          >
            <Settings2 size={14} /> Connections
          </Button>
        </div>
      </header>
      <div className="shell">
        <nav className="activity-bar" aria-label="Tools">
          <button className="activity-selected" title="Explorer">
            <Files size={21} />
          </button>
          <div className="activity-line" />
          {TOOLS.map((t) => (
            <button
              key={t.id}
              className={active === t.id ? "selected" : ""}
              title={t.title}
              aria-label={t.title}
              onClick={() => setActive(t.id)}
            >
              <t.icon size={20} />
            </button>
          ))}
          <div className="spacer" />
          <button
            title="Optional synthetic example"
            onClick={() => setExample(true)}
          >
            <FlaskConical size={20} />
          </button>
        </nav>
        <div style={{ width: sidebarWidth }} className="sidebar-container">
          <Explorer
            roots={roots}
            entries={entries}
            refresh={refresh}
            open={open}
            useFile={useFile}
            report={report}
            selectedFolder={folder}
            setFolder={setFolder}
            upload={upload}
          />
        </div>
        <div
          className="resize-handle vertical"
          role="separator"
          aria-label="Resize explorer"
          aria-orientation="vertical"
          aria-valuenow={sidebarWidth}
          aria-valuemin={190}
          aria-valuemax={500}
          tabIndex={0}
          onPointerDown={(e) => drag("x", e)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight")
              setSidebarWidth(Math.min(500, sidebarWidth + 20));
            if (e.key === "ArrowLeft")
              setSidebarWidth(Math.max(190, sidebarWidth - 20));
          }}
        />
        <main className="main-workspace">
          <div
            className="workspace-tabs"
            role="tablist"
            aria-label="Workspaces"
          >
            {TOOLS.map((t) => (
              <button
                role="tab"
                aria-selected={active === t.id}
                key={t.id}
                className={active === t.id ? "active" : ""}
                onClick={() => setActive(t.id)}
              >
                <t.icon size={14} />
                {t.title}
              </button>
            ))}
            {tabs.map((f) => (
              <div
                className={"file-tab " + (active === keyOf(f) ? "active" : "")}
                key={keyOf(f)}
              >
                <button
                  role="tab"
                  aria-selected={active === keyOf(f)}
                  onClick={() => setActive(keyOf(f))}
                >
                  <Files size={13} />
                  {f.path.split("/").pop()}
                </button>
                <button
                  title={"Close " + f.path}
                  onClick={() => {
                    setTabs((prev) =>
                      prev.filter((t) => keyOf(t) !== keyOf(f)),
                    );
                    if (active === keyOf(f)) setActive("news");
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
          {error && (
            <div role="alert" className="alert-bar">
              <CircleAlert size={16} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {message && (
            <div role="status" className="message-bar">
              <CheckCircle2 size={15} />
              <span>{message}</span>
              <button
                aria-label="Dismiss message"
                onClick={() => setMessage("")}
              >
                <X size={14} />
              </button>
            </div>
          )}
          <div className="workspace-content">
            {TOOLS.map((t) => (
              <div
                key={t.id}
                hidden={active !== t.id}
                className="tool-container"
                role="tabpanel"
                aria-label={t.title}
              >
                <Tool
                  visible={active === t.id}
                  tool={t.id}
                  config={configs[t.id]}
                  set={(c) =>
                    setConfigs((prev: any) => ({ ...prev, [t.id]: c }))
                  }
                  roots={roots}
                  entries={entries}
                  bootstrap={boot}
                  upload={upload}
                  refresh={refresh}
                  report={report}
                  submitted={(job) => {
                    setMessage(
                      "Queued " +
                        job.filename +
                        ". You can keep working in any tool.",
                    );
                    setJobsHeight(Math.max(jobsHeight, 166));
                    poll();
                  }}
                />
              </div>
            ))}
            {tabs.map((f) => (
              <div
                key={keyOf(f)}
                hidden={active !== keyOf(f)}
                className="file-container"
              >
                <Preview
                  roots={roots}
                  entries={entries}
                  file={f}
                  report={report}
                  refresh={refresh}
                  useFile={useFile}
                />
              </div>
            ))}
          </div>
          <div
            className="resize-handle horizontal"
            role="separator"
            aria-label="Resize jobs panel"
            aria-orientation="horizontal"
            aria-valuenow={jobsHeight}
            aria-valuemin={40}
            aria-valuemax={500}
            tabIndex={0}
            onPointerDown={(e) => drag("y", e)}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp")
                setJobsHeight(Math.min(500, jobsHeight + 20));
              if (e.key === "ArrowDown")
                setJobsHeight(Math.max(40, jobsHeight - 20));
            }}
          />
          <section
            className="jobs-panel"
            aria-label="Job status"
            style={{ height: jobsHeight }}
          >
            <div className="jobs-heading">
              <div>
                <PanelBottom size={14} />
                <strong>JOBS</strong>
                <span className="count-badge">{jobs.length}</span>
                <span className="hint">
                  One worker ·{" "}
                  {activeCount ? activeCount + " active / queued" : "ready"}
                </span>
              </div>
              <button
                title="Collapse or expand jobs"
                onClick={() => setJobsHeight(jobsHeight > 45 ? 40 : 166)}
              >
                <PanelBottom size={15} />
              </button>
            </div>
            <div className="jobs-list">
              {!jobs.length && (
                <div className="jobs-empty">
                  <CheckCircle2 size={18} />
                  <div>
                    No jobs yet.
                    <span>
                      {" "}
                      Start any tool to see its progress here. Files and
                      settings are independent.
                    </span>
                  </div>
                </div>
              )}
              {jobs.map((j) => (
                <div className="job-row" key={j.id}>
                  <div className={"job-icon " + j.state}>
                    {j.state === "running" ? (
                      <LoaderCircle className="spin" size={16} />
                    ) : j.state === "completed" ? (
                      <CheckCircle2 size={16} />
                    ) : j.state === "failed" ? (
                      <CircleAlert size={16} />
                    ) : (
                      <span className="tiny-dot" />
                    )}
                  </div>
                  <button
                    className="job-name"
                    onClick={async () => {
                      try {
                        setJobDetail(await api("/jobs/" + j.id));
                      } catch (e) {
                        report(e);
                      }
                    }}
                  >
                    <strong>{j.filename}</strong>
                    <span>
                      {j.tool.toUpperCase()} · {j.phase}
                      {j.error ? " · " + j.error : ""}
                    </span>
                  </button>
                  <div className="job-progress">
                    <div className="row">
                      <span>
                        {j.completed}
                        {j.total != null ? " / " + j.total : ""}{" "}
                        {j.tool === "news" ? "articles" : "rows"}
                      </span>
                      <span>
                        {j.started_at
                          ? Math.max(
                              0,
                              Math.round(
                                (j.finished_at || Date.now() / 1000) -
                                  j.started_at,
                              ),
                            ) + "s"
                          : ""}
                      </span>
                    </div>
                    <progress
                      aria-label={"Progress for " + j.filename}
                      value={
                        j.total
                          ? j.completed
                          : ["queued", "running"].includes(j.state)
                            ? undefined
                            : 0
                      }
                      max={j.total || 1}
                    />
                  </div>
                  <span className={"state-tag " + j.state}>
                    {j.state}
                    {j.failed ? " · " + j.failed + " failed" : ""}
                  </span>
                  <div className="job-actions">
                    {["queued", "running"].includes(j.state) ? (
                      <button
                        title="Cancel job"
                        onClick={() => jobAction(j, "cancel")}
                      >
                        <Square size={13} />
                      </button>
                    ) : ["interrupted", "cancelled", "failed"].includes(
                        j.state,
                      ) || j.failed ? (
                      <>
                        <button
                          title="Resume / retry failed rows"
                          onClick={() => jobAction(j, "resume")}
                        >
                          <Play size={14} />
                        </button>
                        <button
                          title="Resume to a different destination"
                          onClick={() => {
                            setResumeJob(j);
                            setResumeDest({
                              root: j.output.root,
                              path: j.output.path
                                .slice(0, j.output.path.lastIndexOf("/") + 1)
                                .replace(/\/$/, ""),
                              filename: "resumed_" + j.filename,
                              format: j.filename.endsWith(".json")
                                ? "json"
                                : "csv",
                            });
                          }}
                        >
                          <FolderOpen size={14} />
                        </button>
                      </>
                    ) : null}
                    {j.saved && (
                      <button
                        title="Open result"
                        onClick={() => open(j.output)}
                      >
                        <FolderOpen size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
      <footer className="statusbar">
        <span>
          <span className="status-dot" /> Backend connected
        </span>
        <span>
          {roots.length} attached folder{roots.length !== 1 ? "s" : ""}
        </span>
        <div className="spacer" />
        <span>CSV / JSON</span>
        <span>Files stay on this computer</span>
        <span title={boot.locations.research}>
          {boot.build.display_name} {boot.build.version} · {boot.build.platform}
        </span>
      </footer>
      {connections && (
        <Modal
          title="API connections"
          description="Keys are held by the local backend and are never sent back to this page."
          close={() => {
            setConnections(false);
            setKeys({ news: "", openai: "" });
          }}
        >
          {(
            [
              ["news", "NewsAPI key"],
              ["openai", "OpenAI key"],
            ] as const
          ).map(([name, label]) => (
            <Field
              key={name}
              label={
                label +
                " · " +
                (boot.connections[name]
                  ? boot.remembered[name]
                    ? "remembered on this computer"
                    : "set for this session"
                  : "not configured")
              }
            >
              <input
                type="password"
                autoComplete="off"
                value={keys[name]}
                onChange={(e) => setKeys({ ...keys, [name]: e.target.value })}
                placeholder="Leave blank to keep the current key"
              />
            </Field>
          ))}
          {boot.secure_storage.available ? (
            <Check
              label="Remember on this computer"
              value={remember}
              set={setRemember}
            />
          ) : (
            <p className="hint" role="status">
              {boot.secure_storage.detail}
            </p>
          )}
          <p className="hint">
            {boot.secure_storage.available
              ? "Remembered keys are stored by " +
                (boot.build.system === "Windows"
                  ? "Windows Credential Manager"
                  : "the macOS Keychain") +
                ". Clear this box to keep a key for this session only."
              : "Keys are never written to a plain file."}
          </p>
          <div className="row wrap">
            <Button
              onClick={async () => {
                try {
                  const entered = Object.fromEntries(
                    Object.entries(keys).filter(([, v]) => v.trim()),
                  );
                  const result = await api("/connections", {
                    ...entered,
                    remember,
                  });
                  setBoot({ ...boot, ...result });
                  setKeys({ news: "", openai: "" });
                  setConnections(false);
                  setMessage("API connections updated.");
                } catch (e) {
                  report(e);
                }
              }}
            >
              Save connections
            </Button>
            {(["news", "openai"] as const)
              .filter((name) => boot.connections[name])
              .map((name) => (
                <Button
                  key={name}
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      const result = await api("/connections", {
                        remove: [name],
                      });
                      setBoot({ ...boot, ...result });
                      setMessage(
                        `The ${name === "news" ? "NewsAPI" : "OpenAI"} key was removed from this computer.`,
                      );
                    } catch (e) {
                      report(e);
                    }
                  }}
                >
                  Remove {name === "news" ? "NewsAPI" : "OpenAI"} key
                </Button>
              ))}
          </div>
        </Modal>
      )}
      {firstRun && boot && (
        <FirstRunGuide
          bootstrap={boot}
          report={report}
          onBootstrapChange={(patch) => {
            setBoot((prev: any) => ({ ...prev, ...patch }));
            if (patch.roots) setRoots(patch.roots);
          }}
          onFinish={() => {
            setFirstRun(false);
            refresh().catch(report);
          }}
        />
      )}
      {jobDetail && (
        <Modal
          title="Job details & checkpoint"
          description="The request below is the frozen configuration used by this job. Successful rows are retained when retrying."
          close={() => setJobDetail(null)}
        >
          <a
            className="button-link"
            href={"/api/jobs/" + jobDetail.status.id + "/checkpoint"}
            download
          >
            Download full checkpoint JSON
          </a>
          <pre className="record-inspector">{pretty(jobDetail)}</pre>
        </Modal>
      )}
      {resumeJob && (
        <Modal
          title="Resume to a new destination"
          close={() => setResumeJob(null)}
        >
          <Destination
            value={resumeDest}
            set={setResumeDest}
            roots={roots}
            folders={entries.filter((e) => e.kind === "folder")}
          />
          <Button
            onClick={async () => {
              try {
                await api("/jobs/" + resumeJob.id + "/resume", {
                  destination: resumeDest,
                });
                setResumeJob(null);
                await poll();
              } catch (e) {
                report(e);
              }
            }}
          >
            Resume checkpoint
          </Button>
        </Modal>
      )}
      {help && (
        <Modal
          title="Your file-based research workbench"
          close={() => setHelp(false)}
        >
          <p>
            Start with any tool. Upload a CSV/JSON file or attach a research
            folder in the explorer, then choose the input, settings, and output
            destination for that tool.
          </p>
          <p>
            Each workspace keeps its own settings. Jobs run one at a time in a
            separate process, and continue when you switch tabs. Use the Jobs
            panel to cancel, inspect checkpoints, resume interrupted jobs, or
            retry failed rows.
          </p>
          <p>
            Preview datasets without changing them. Text and JSON configuration
            files have Save and Save As. Drag the panel dividers, or focus them
            and use arrow keys to resize.
          </p>
          <p>
            NewsAPI and OpenAI process data through their respective services.
            Hugging Face model inference runs locally after downloading weights.
          </p>
          <p>
            Your research folder is <code>{boot.locations.research}</code>.
            Settings, jobs, and checkpoints are kept in{" "}
            <code>{boot.locations.data}</code>, and downloaded models in{" "}
            <code>{boot.locations.models}</code>. Upgrading the application does
            not change any of them.
          </p>
          <Button variant="outline" onClick={() => setFirstRun(true)}>
            Open the setup guide again
          </Button>
        </Modal>
      )}
      {example && (
        <Modal
          title="Optional synthetic example"
          description="This creates explicitly labeled fictional article data. It does not simulate model results."
          close={() => setExample(false)}
        >
          <Destination
            value={{ ...exampleDest, root: exampleDest.root || roots[0].id }}
            set={setExampleDest}
            roots={roots}
            folders={entries.filter((e) => e.kind === "folder")}
          />
          <Button
            onClick={async () => {
              try {
                const ref = await api("/examples", {
                  destination: {
                    ...exampleDest,
                    root: exampleDest.root || roots[0].id,
                  },
                });
                await refresh();
                open(ref);
                setExample(false);
              } catch (e) {
                report(e);
              }
            }}
          >
            Create synthetic dataset
          </Button>
        </Modal>
      )}
    </div>
  );
}
