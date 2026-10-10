"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  FileSpreadsheet,
  FlaskConical,
  FolderOpen,
  HelpCircle,
  KeyRound,
  LoaderCircle,
  Play,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Explorer, Modal, Preview } from "./explorer";
import { FirstRunGuide } from "./first-run";
import { FolderPicker } from "./folder-picker";
import { Connections } from "./connections";
import { KEY_NAMES, NEXT_STEP, STEPS, stepOf } from "./steps";
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
import { loadPreferences, savePreferences, useAutosave } from "@/lib/storage";

const ACTIVE_STATES = ["queued", "running"];
const JOBS_COLLAPSED = 44;

export default function Workbench() {
  const [boot, setBoot] = useState<any>(null);
  const [roots, setRoots] = useState<Root[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [folder, setFolder] = useState<Ref>({ root: "", path: "" });
  // The selected workflow step, and whether it or an open file is showing.
  const [step, setStep] = useState("news");
  const [view, setView] = useState("step");
  const [tabs, setTabs] = useState<Ref[]>([]);
  const [configs, setConfigs] = useState<any>(defaults);
  const [jobs, setJobs] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [connections, setConnections] = useState(false);
  const [firstRun, setFirstRun] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [jobsOpen, setJobsOpen] = useState(false);
  const [jobsHeight, setJobsHeight] = useState(200);
  const [jobDetail, setJobDetail] = useState<any>(null);
  const [help, setHelp] = useState(false);
  const [example, setExample] = useState(false);
  const [exampleDest, setExampleDest] = useState<any>({
    filename: "synthetic_example.csv",
    path: "",
    format: "csv",
  });
  const [clearing, setClearing] = useState(false);
  const [changeFolder, setChangeFolder] = useState(false);
  const [resumeJob, setResumeJob] = useState<any>(null);
  const [resumeDest, setResumeDest] = useState<any>(null);
  const savedSignature = useRef("");
  const report = useCallback((e: unknown) => {
    setMessage("");
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
  useAutosave(configs, savePreferences, { enabled: !!boot, onError: report });
  // Confirmations clear themselves; errors stay until dismissed.
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 6000);
    return () => clearTimeout(timer);
  }, [message]);
  const poll = useCallback(async () => {
    try {
      const list = await api("/jobs");
      setJobs((previous) => {
        // Show existing jobs when the page opens, e.g. after a reload.
        if (!previous.length && list.length) setJobsOpen(true);
        return list;
      });
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
  const goTo = (id: string) => {
    setStep(id);
    setView("step");
  };
  const open = (f: Ref) => {
    const ref = { root: f.root, path: f.path };
    setTabs((prev) =>
      prev.some((p) => keyOf(p) === keyOf(ref)) ? prev : [...prev, ref],
    );
    setView(keyOf(ref));
  };
  const closeTab = (f: Ref) => {
    setTabs((prev) => prev.filter((t) => keyOf(t) !== keyOf(f)));
    if (view === keyOf(f)) setView("step");
  };
  const useFile = async (tool: string, file: Ref) => {
    try {
      const data = await api("/preview?" + query(file) + "&limit=1");
      if (data.kind !== "dataset")
        throw new Error("Choose a CSV or JSON dataset for this step.");
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
      goTo(tool);
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
          Math.max(220, Math.min(480, initial + e.clientX - start)),
        );
      else
        setJobsHeight(
          Math.max(120, Math.min(560, initial - e.clientY + start)),
        );
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
  /** Newest saved result of the steps that feed `tool`, offered as its input. */
  const suggestionFor = (tool: string) => {
    const feeds = Object.keys(NEXT_STEP).filter((t) =>
      tool === "llm" ? true : NEXT_STEP[t] === tool,
    );
    const job = jobs.find((j) => j.saved && feeds.includes(j.tool));
    return job && { file: job.output, from: stepOf(job.tool).title };
  };
  const activeCount = jobs.filter((j) =>
    ACTIVE_STATES.includes(j.state),
  ).length;
  const failedCount = jobs.filter((j) => j.state === "failed").length;
  if (!boot)
    return (
      <main className="loading-screen">
        <span className="brand-mark large">
          <BrainCircuit size={26} />
        </span>
        <h1>Research Workbench</h1>
        <p>{error || "Opening your workspace…"}</p>
        {error && (
          <>
            <p className="hint">
              Make sure the start window is still open, then try again.
            </p>
            <Button onClick={() => location.reload()}>Try again</Button>
          </>
        )}
      </main>
    );
  const current = stepOf(step);
  return (
    <div className="workbench">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <BrainCircuit size={18} />
          </span>
          <strong>Research Workbench</strong>
        </div>
        <div className="header-actions">
          <button
            className="connections-button"
            onClick={() => setConnections(true)}
          >
            <KeyRound size={15} />
            <span className="connections-label">Connections</span>
            {(["news", "openai"] as const).map((name) => (
              <span
                key={name}
                className={
                  "key-status " + (boot.connections[name] ? "ok" : "missing")
                }
              >
                <span className="status-dot" />
                {KEY_NAMES[name]}
                <span className="sr-only">
                  {boot.connections[name] ? " connected" : " key not set"}
                </span>
              </span>
            ))}
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Help"
            title="Help"
            onClick={() => setHelp(true)}
          >
            <HelpCircle size={18} />
          </Button>
        </div>
      </header>
      <div className="shell">
        <aside className="sidebar" style={{ width: sidebarWidth }}>
          <nav className="steps-nav" aria-label="Workflow steps">
            <div className="sidebar-title">Workflow</div>
            <ol>
              {STEPS.map((s, i) => {
                const running = jobs.some(
                  (j) => j.tool === s.id && ACTIVE_STATES.includes(j.state),
                );
                const missingKey = s.needs && !boot.connections[s.needs];
                const selected = view === "step" && step === s.id;
                return (
                  <li key={s.id}>
                    <button
                      className={"step-item" + (selected ? " active" : "")}
                      aria-current={selected ? "page" : undefined}
                      onClick={() => goTo(s.id)}
                    >
                      <span className="step-index">{i + 1}</span>
                      <span className="step-text">
                        <strong>{s.title}</strong>
                        <small>{s.detail}</small>
                      </span>
                      {running ? (
                        <LoaderCircle
                          className="spin step-flag"
                          size={15}
                          aria-label="Running"
                        />
                      ) : missingKey ? (
                        <KeyRound
                          className="step-flag warning"
                          size={14}
                          aria-label={KEY_NAMES[s.needs!] + " key needed"}
                        />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
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
            createExample={() => setExample(true)}
            deleted={(f) => closeTab(f)}
          />
        </aside>
        <div
          className="resize-handle vertical"
          role="separator"
          aria-label="Resize explorer"
          aria-orientation="vertical"
          aria-valuenow={sidebarWidth}
          aria-valuemin={220}
          aria-valuemax={480}
          tabIndex={0}
          onPointerDown={(e) => drag("x", e)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight")
              setSidebarWidth(Math.min(480, sidebarWidth + 20));
            if (e.key === "ArrowLeft")
              setSidebarWidth(Math.max(220, sidebarWidth - 20));
          }}
        />
        <main className="main-workspace">
          {tabs.length > 0 && (
            <div
              className="workspace-tabs"
              role="tablist"
              aria-label="Open pages"
            >
              <button
                role="tab"
                aria-selected={view === "step"}
                className={view === "step" ? "active" : ""}
                onClick={() => setView("step")}
              >
                <current.icon size={14} />
                {current.heading}
              </button>
              {tabs.map((f) => (
                <div
                  className={"file-tab " + (view === keyOf(f) ? "active" : "")}
                  key={keyOf(f)}
                >
                  <button
                    role="tab"
                    aria-selected={view === keyOf(f)}
                    title={f.path}
                    onClick={() => setView(keyOf(f))}
                  >
                    <FileSpreadsheet size={13} />
                    {f.path.split("/").pop()}
                  </button>
                  <button
                    aria-label={"Close " + f.path}
                    title={"Close " + f.path}
                    onClick={() => closeTab(f)}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
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
              <CheckCircle2 size={16} />
              <span>{message}</span>
              <button
                aria-label="Dismiss message"
                onClick={() => setMessage("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          <div className="workspace-content">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                hidden={view !== "step" || step !== s.id}
                className="tool-container"
                role="region"
                aria-label={s.heading}
              >
                <Tool
                  visible={view === "step" && step === s.id}
                  tool={s.id}
                  number={i + 1}
                  config={configs[s.id]}
                  set={(c) =>
                    setConfigs((prev: any) => ({ ...prev, [s.id]: c }))
                  }
                  roots={roots}
                  entries={entries}
                  bootstrap={boot}
                  upload={upload}
                  refresh={refresh}
                  report={report}
                  openConnections={() => setConnections(true)}
                  suggestion={suggestionFor(s.id)}
                  submitted={(job) => {
                    setError("");
                    setMessage(
                      "Started " +
                        job.filename +
                        ". Follow its progress under Jobs; you can keep working.",
                    );
                    setJobsOpen(true);
                    poll();
                  }}
                />
              </div>
            ))}
            {tabs.map((f) => (
              <div
                key={keyOf(f)}
                hidden={view !== keyOf(f)}
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
          {jobsOpen && (
            <div
              className="resize-handle horizontal"
              role="separator"
              aria-label="Resize jobs panel"
              aria-orientation="horizontal"
              aria-valuenow={jobsHeight}
              aria-valuemin={120}
              aria-valuemax={560}
              tabIndex={0}
              onPointerDown={(e) => drag("y", e)}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp")
                  setJobsHeight(Math.min(560, jobsHeight + 20));
                if (e.key === "ArrowDown")
                  setJobsHeight(Math.max(120, jobsHeight - 20));
              }}
            />
          )}
          <section
            className="jobs-panel"
            aria-label="Job status"
            style={{ maxHeight: jobsOpen ? jobsHeight : JOBS_COLLAPSED }}
          >
            <div className="jobs-heading">
              <button
                className="jobs-toggle"
                aria-expanded={jobsOpen}
                onClick={() => setJobsOpen(!jobsOpen)}
              >
                <strong>Jobs</strong>
                {activeCount > 0 && (
                  <span className="count-badge running">
                    <LoaderCircle className="spin" size={12} />
                    {activeCount} running
                  </span>
                )}
                {failedCount > 0 && (
                  <span className="count-badge failed">
                    {failedCount} failed
                  </span>
                )}
                <span className="hint">
                  {jobs.length
                    ? `${jobs.length} total · one runs at a time`
                    : "Nothing running yet"}
                </span>
                <span className="spacer" />
                {jobsOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
              {jobsOpen &&
                jobs.some((j) => !ACTIVE_STATES.includes(j.state)) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setClearing(true)}
                  >
                    <Trash2 size={14} /> Clear history
                  </Button>
                )}
            </div>
            {jobsOpen && (
              <div className="jobs-list">
                {!jobs.length && (
                  <div className="jobs-empty">
                    Run any step and its progress appears here. Jobs keep
                    running while you work in other steps.
                  </div>
                )}
                {jobs.map((j) => (
                  <JobRow
                    key={j.id}
                    job={j}
                    inspect={async () => {
                      try {
                        setJobDetail(await api("/jobs/" + j.id));
                      } catch (e) {
                        report(e);
                      }
                    }}
                    act={(action) => jobAction(j, action)}
                    next={
                      NEXT_STEP[j.tool]
                        ? () => useFile(NEXT_STEP[j.tool], j.output)
                        : undefined
                    }
                    openResult={() => open(j.output)}
                    resumeElsewhere={() => {
                      setResumeJob(j);
                      setResumeDest({
                        root: j.output.root,
                        path: j.output.path
                          .slice(0, j.output.path.lastIndexOf("/") + 1)
                          .replace(/\/$/, ""),
                        filename: "resumed_" + j.filename,
                        format: j.filename.endsWith(".json") ? "json" : "csv",
                      });
                    }}
                  />
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
      {connections && (
        <Connections
          boot={boot}
          update={(status) => setBoot((prev: any) => ({ ...prev, ...status }))}
          close={() => setConnections(false)}
        />
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
          title="Job details"
          description="The exact settings this job used, and its first saved rows. Successful rows are kept when retrying."
          close={() => setJobDetail(null)}
        >
          {jobDetail.status.error && (
            <p className="inline-error">{jobDetail.status.error}</p>
          )}
          <a
            className="button-link"
            href={"/api/jobs/" + jobDetail.status.id + "/checkpoint"}
            download
          >
            Download all saved rows (JSON)
          </a>
          <pre className="record-inspector">{pretty(jobDetail)}</pre>
        </Modal>
      )}
      {clearing && (
        <Modal
          title="Clear job history?"
          description="Removes finished jobs from this list, with the copies kept for resuming them."
          close={() => setClearing(false)}
        >
          <p>
            Your result files are <strong>not</strong> deleted; they stay in
            Files. Running jobs are kept.
          </p>
          <div className="row wrap">
            <Button
              onClick={async () => {
                try {
                  const result = await api("/jobs/clear", {});
                  setJobs(result.jobs);
                  setClearing(false);
                  setMessage(
                    `Cleared ${result.removed} finished job${result.removed === 1 ? "" : "s"}.`,
                  );
                } catch (e) {
                  report(e);
                }
              }}
            >
              <Trash2 size={15} /> Clear history
            </Button>
            <Button variant="outline" onClick={() => setClearing(false)}>
              Cancel
            </Button>
          </div>
        </Modal>
      )}
      {changeFolder && (
        <FolderPicker
          title="Choose your research folder"
          description="Your main folder: new results are saved here, and it opens first in Files."
          confirm="Use this folder"
          start={boot.locations.research}
          close={() => setChangeFolder(false)}
          onPick={async (path) => {
            const result = await api("/research-folder", { path });
            setRoots(result.roots);
            setFolder({ root: result.roots[0].id, path: "" });
            setBoot((prev: any) => ({
              ...prev,
              roots: result.roots,
              locations: result.locations,
            }));
            setChangeFolder(false);
            setMessage("Your research folder is now " + path);
            await refresh();
          }}
        />
      )}
      {resumeJob && (
        <Modal
          title="Resume to a new file"
          description="Continue this job and save the result under a different name."
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
            Resume job
          </Button>
        </Modal>
      )}
      {help && (
        <Modal
          title="How the workbench works"
          description="A short guide. The student guide on GitHub has screenshots."
          close={() => setHelp(false)}
        >
          <ol className="help-steps">
            {STEPS.map((s) => (
              <li key={s.id}>
                <strong>{s.title}.</strong> {s.intro}
              </li>
            ))}
          </ol>
          <p>
            Each step works on its own: pick any CSV or JSON file as its input,
            and it saves a <em>new</em> file, so your originals never change.
            Every step has a <strong>Show the Python code</strong> button with a
            script you can run yourself. Jobs run one at a time and keep going
            while you switch steps. If a job stops, its finished rows are kept,
            and <strong>Resume</strong> continues from there.
          </p>
          <p>
            NewsAPI and OpenAI receive the text you send them. FinBERT
            classification runs entirely on this computer.
          </p>
          <div className="row wrap">
            <Button
              variant="outline"
              onClick={() => {
                setHelp(false);
                setExample(true);
              }}
            >
              <FlaskConical size={15} /> Create practice data
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setHelp(false);
                setFirstRun(true);
              }}
            >
              Open the setup guide again
            </Button>
          </div>
          <dl className="locations">
            <dt>Research folder</dt>
            <dd>
              <code>{boot.locations.research}</code>{" "}
              <button
                className="link-button"
                onClick={() => {
                  setHelp(false);
                  setChangeFolder(true);
                }}
              >
                Change…
              </button>
            </dd>
            <dt>Settings and jobs</dt>
            <dd>
              <code>{boot.locations.data}</code>
            </dd>
            <dt>Downloaded models</dt>
            <dd>
              <code>{boot.locations.models}</code>
            </dd>
            <dt>Version</dt>
            <dd>
              {boot.build.display_name} {boot.build.version} ·{" "}
              {boot.build.platform}
            </dd>
          </dl>
        </Modal>
      )}
      {example && (
        <Modal
          title="Create practice data"
          description="Creates clearly labelled fictional articles for practising the steps. It does not contain model results."
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
            Create practice dataset
          </Button>
        </Modal>
      )}
    </div>
  );
}

const STATE_LABELS: Record<string, string> = {
  queued: "Waiting",
  running: "Running",
  completed: "Done",
  failed: "Failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};

function JobRow({
  job: j,
  inspect,
  act,
  openResult,
  resumeElsewhere,
  next,
}: {
  job: any;
  inspect: () => void;
  act: (action: string) => void;
  openResult: () => void;
  resumeElsewhere: () => void;
  /** Send the result to the following step. */
  next?: () => void;
}) {
  const active = ACTIVE_STATES.includes(j.state);
  const resumable =
    ["interrupted", "cancelled", "failed"].includes(j.state) || j.failed > 0;
  const seconds = j.started_at
    ? Math.max(
        0,
        Math.round((j.finished_at || Date.now() / 1000) - j.started_at),
      )
    : null;
  return (
    <div className={"job-row " + j.state}>
      <div className={"job-icon " + j.state}>
        {j.state === "running" ? (
          <LoaderCircle className="spin" size={18} />
        ) : j.state === "completed" ? (
          <CheckCircle2 size={18} />
        ) : ["failed", "interrupted"].includes(j.state) ? (
          <CircleAlert size={18} />
        ) : (
          <span className="tiny-dot" />
        )}
      </div>
      <div className="job-main">
        <button className="job-name" onClick={inspect} title="Show details">
          <strong>{j.filename}</strong>
          <span>
            {stepOf(j.tool)?.title ?? j.tool} · {j.phase}
            {seconds != null ? ` · ${seconds}s` : ""}
          </span>
        </button>
        {j.error && <p className="job-error">{j.error}</p>}
        {j.plan_limit_reached && (
          <p className="job-note">
            Stopped at your NewsAPI plan&apos;s result limit; the articles found
            were saved.
          </p>
        )}
      </div>
      <div className="job-progress">
        <span>
          {j.completed}
          {j.total != null ? " / " + j.total : ""}{" "}
          {j.tool === "news" ? "articles" : "rows"}
        </span>
        <progress
          aria-label={"Progress for " + j.filename}
          value={j.total ? j.completed : active ? undefined : j.saved ? 1 : 0}
          max={j.total || 1}
        />
      </div>
      <span className={"state-tag " + j.state}>
        {STATE_LABELS[j.state] ?? j.state}
        {j.failed > 0 ? " · " + j.failed + " rows failed" : ""}
      </span>
      <div className="job-actions">
        {active && (
          <Button variant="outline" size="sm" onClick={() => act("cancel")}>
            <Square size={12} /> Stop
          </Button>
        )}
        {!active && resumable && (
          <>
            <Button
              variant="outline"
              size="sm"
              title="Resume / retry failed rows"
              onClick={() => act("resume")}
            >
              <Play size={13} /> Resume
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Resume to a different file"
              title="Resume to a different file"
              onClick={resumeElsewhere}
            >
              <FolderOpen size={15} />
            </Button>
          </>
        )}
        {j.saved && (
          <Button variant="outline" size="sm" onClick={openResult}>
            <FileSpreadsheet size={14} /> Open result
          </Button>
        )}
        {j.saved && j.state === "completed" && next && (
          <Button size="sm" onClick={next}>
            {j.tool === "news" ? "Classify these" : "Extract from these"}
            <ArrowRight size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}
