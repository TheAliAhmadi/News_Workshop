"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Code2,
  Eye,
  FlaskConical,
  KeyRound,
  Play,
  Save,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  Check,
  ColumnPicker,
  Destination,
  Field,
  FileSelect,
  ImportText,
  More,
  Section,
} from "./fields";
import { CodeViewer, TeachingCode } from "./code-viewer";
import { ExtractionDesigner } from "./extraction-designer";
import { EnumGuide, ExtractExample, FieldTypeGuide } from "./extract-help";
import { Flowchart, flowFor } from "./flow";
import { SchemaBuilder, EnumBuilder } from "./schema-builder";
import { Modal } from "./explorer";
import { ModelPreparation } from "./model-preparation";
import { KEY_NAMES, STEPS, stepOf } from "./steps";
import { api, Entry, Ref, Root, pretty, query } from "@/lib/api";

export type ToolProps = {
  visible?: boolean;
  tool: string;
  /** Position in the workflow, shown as "Step n of 3". */
  number: number;
  config: any;
  set: (c: any) => void;
  roots: Root[];
  entries: Entry[];
  bootstrap: any;
  upload: (f: File) => Promise<Ref>;
  refresh: () => Promise<void>;
  report: (e: unknown) => void;
  submitted: (job: any) => void;
  openConnections: () => void;
  /** The latest result of the previous step, offered as this step's input. */
  suggestion?: { file: Ref; from: string };
};

export const defaults: Record<string, any> = {
  news: {
    company: "",
    query: "",
    domains: [],
    search_in: ["title", "description", "content"],
    language: "en",
    sort: "publishedAt",
    max_results: 100,
    destination: { filename: "news_articles.csv", format: "csv", path: "" },
  },
  hf: {
    columns: [],
    word_limit: 150,
    batch_size: 8,
    device: "cpu",
    model: "yiyanghkust/finbert-esg",
    revision: "main",
    prefix: "hf_",
    destination: { filename: "classified.csv", format: "csv", path: "" },
  },
  llm: {
    columns: [],
    context_columns: [],
    word_limit: 150,
    row_limit: 0,
    model: "",
    prefix: "llm_",
    preset: "custom",
    schemaText: "",
    enumsText: "{}",
    instructions: "",
    filter: { column: "", mode: "include", values: [] },
    destination: { filename: "extracted.csv", format: "csv", path: "" },
  },
};

/** Well-known classifiers students can pick with one click. */
const SUGGESTED_MODELS = [
  {
    id: "yiyanghkust/finbert-esg",
    name: "FinBERT-ESG",
    labels: "Environmental, Social, Governance, or None",
  },
  {
    id: "yiyanghkust/finbert-tone",
    name: "FinBERT tone",
    labels: "Positive, Negative, or Neutral",
  },
  {
    id: "ProsusAI/finbert",
    name: "FinBERT sentiment",
    labels: "positive, negative, or neutral",
  },
];

const LANGUAGES = [
  "en",
  "fr",
  "de",
  "es",
  "it",
  "pt",
  "ar",
  "zh",
  "ru",
  "nl",
  "no",
  "sv",
  "he",
  "ud",
];

export function Tool({
  visible = true,
  tool,
  number,
  config: c,
  set,
  roots,
  entries,
  bootstrap,
  upload,
  refresh,
  report,
  submitted,
  openConnections,
  suggestion,
}: ToolProps) {
  const [columns, setColumns] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [sourceQuery, setSourceQuery] = useState("");
  const [sources, setSources] = useState<any[]>(bootstrap.sources || []);
  const [modelQuery, setModelQuery] = useState("");
  const [models, setModels] = useState<any[]>([]);
  const [devices, setDevices] = useState(["cpu"]);
  const [preview, setPreview] = useState<any>(null);
  const [validMessage, setValidMessage] = useState("");
  const [schemaMode, setSchemaMode] = useState("visual");
  const [enumMode, setEnumMode] = useState("visual");
  const [presetName, setPresetName] = useState("extraction_preset.json");
  const [savePreset, setSavePreset] = useState(false);
  const [showDesigner, setShowDesigner] = useState(false);
  const [designBusy, setDesignBusy] = useState(false);
  const [code, setCode] = useState<TeachingCode | null>(null);
  const latestConfig = useRef(c);
  latestConfig.current = c;
  const patch = (value: any) => set({ ...latestConfig.current, ...value });
  const files = entries.filter((e) => e.kind === "file");
  const folders = entries.filter((e) => e.kind === "folder");
  const destination = {
    ...c.destination,
    root: c.destination?.root || roots[0]?.id,
  };
  const destinationRoot = roots.find((r) => r.id === destination.root);
  const perform = async (fn: () => Promise<void>) => {
    setBusy(true);
    setValidMessage("");
    try {
      await fn();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let cancelled = false;
    if (!visible) return;
    if (c.input)
      api("/preview?" + query(c.input) + "&limit=1")
        .then((d) => {
          if (cancelled) return;
          if (d.kind !== "dataset")
            throw new Error("Choose a dataset, not a configuration file.");
          setColumns(d.columns);
          setRowCount(d.total);
        })
        .catch(report);
    else {
      setColumns([]);
      setRowCount(0);
    }
    return () => {
      cancelled = true;
    };
  }, [c.input?.root, c.input?.path, visible]);
  const chooseInput = async (input: Ref) => {
    try {
      const d = await api("/preview?" + query(input) + "&limit=1");
      if (d.kind !== "dataset")
        throw new Error("Choose a CSV or JSON table of records.");
      const preferred = [
        "headline",
        "title",
        "lead",
        "description",
        "content",
      ].filter((k) => d.columns.includes(k));
      patch({
        input,
        columns: preferred.length ? preferred : d.columns.slice(0, 1),
        context_columns: [],
        filter: { column: "", mode: "include", values: [] },
      });
    } catch (e) {
      report(e);
    }
  };
  const processingConfig = () => {
    const { input, destination, schemaText, enumsText, ...config } = c;
    if (tool !== "llm") return config;
    let schema, enums;
    try {
      schema = JSON.parse(schemaText);
      enums = JSON.parse(enumsText);
    } catch {
      throw new Error(
        "The fields or allowed-values JSON has a typing mistake. Fix it in the editor, or switch back to the field builder.",
      );
    }
    return {
      ...config,
      filter: config.filter && {
        ...config.filter,
        values: config.filter.values.filter(Boolean),
      },
      schema,
      enums,
    };
  };
  const start = (test = false) =>
    perform(async () => {
      const config = processingConfig();
      const dest = test
        ? {
            ...destination,
            filename: "test_" + destination.filename,
            overwrite: true,
          }
        : destination;
      const job = await api("/jobs", {
        tool,
        input: c.input,
        config: test ? { ...config, row_limit: 1 } : config,
        destination: dest,
      });
      submitted(job);
    });
  const inputPreview = () =>
    perform(async () =>
      setPreview(
        await api("/input-preview", {
          tool,
          input: c.input,
          config: processingConfig(),
        }),
      ),
    );
  const showCode = () =>
    perform(async () =>
      setCode(
        await api("/code", {
          tool,
          config: processingConfig(),
          input: c.input,
          destination,
        }),
      ),
    );
  const loadTemplate = (name: string) => {
    const t = bootstrap.templates[name];
    patch({ ...t, schemaText: pretty(t.schema), enumsText: pretty(t.enums) });
  };
  const importPreset = (text: string) => {
    try {
      const p = JSON.parse(text);
      if (!p.schema || typeof p.instructions !== "string")
        throw new Error("A preset needs instructions, enums and a schema.");
      patch({
        instructions: p.instructions,
        schemaText: pretty(p.schema),
        enumsText: pretty(p.enums || {}),
        preset: p.preset || "custom",
      });
    } catch (e) {
      report(e);
    }
  };
  const workspaceText = async (pathValue: string, kind: string) => {
    if (!pathValue) return;
    try {
      const ref = JSON.parse(pathValue);
      const d = await api("/preview?" + query(ref));
      if (d.kind !== "text") throw new Error("Choose a configuration file.");
      if (kind === "preset") importPreset(d.content);
      else
        patch({
          [kind]: d.content,
          ...(kind === "schemaText" ? { preset: "custom" } : {}),
        });
    } catch (e) {
      report(e);
    }
  };
  const configFiles = (kind: string, label: string) => (
    <select
      aria-label={label}
      value=""
      onChange={(e) => workspaceText(e.target.value, kind)}
    >
      <option value="">{label}…</option>
      {files
        .filter((f) => /\.(txt|md|json)$/.test(f.path))
        .map((f) => (
          <option
            key={f.root + f.path}
            value={JSON.stringify({ root: f.root, path: f.path })}
          >
            {f.path}
          </option>
        ))}
    </select>
  );
  const step = stepOf(tool);
  const missingKey = step.needs && !bootstrap.connections[step.needs];
  const combinedQuery = '"' + c.company + '" AND (' + c.query + ")";
  const id = (part: string) => `${tool}-${part}`;
  const suggestionDiffers =
    suggestion &&
    (suggestion.file.root !== c.input?.root ||
      suggestion.file.path !== c.input?.path);

  const inputSection = (
    <Section
      id={id("input")}
      title="Choose your data"
      detail="Any CSV or JSON table works, for example the file a previous step saved."
    >
      {suggestionDiffers && (
        <div className="suggestion">
          <ArrowRight size={16} />
          <span>
            Continue with <strong>{suggestion!.file.path}</strong>, the newest
            result from {suggestion!.from}.
          </span>
          <Button size="sm" onClick={() => chooseInput(suggestion!.file)}>
            Use this file
          </Button>
        </div>
      )}
      <FileSelect
        value={c.input}
        set={chooseInput}
        files={files}
        upload={upload}
      />
      {c.input && (
        <div className="input-meta">
          <span className="tiny-dot" /> {c.input.path}
          <span>
            {rowCount.toLocaleString()} rows · {columns.length} columns
          </span>
        </div>
      )}
    </Section>
  );

  const textSection = (
    <Section
      id={id("text")}
      title="Which text to use"
      detail="The chosen columns are joined in this order for each row, then cut to the word limit. Use the arrows to reorder."
    >
      <ColumnPicker
        columns={columns}
        value={c.columns}
        set={(columns) => patch({ columns })}
      />
      <div className="grid3">
        <Field
          label="Word limit"
          hint="Longer text takes more time (and costs more with OpenAI)."
        >
          <input
            type="number"
            min={1}
            max={100000}
            value={c.word_limit}
            onChange={(e) => patch({ word_limit: Number(e.target.value) })}
          />
        </Field>
        {tool === "llm" && (
          <Field label="Rows to process" hint="0 means every row.">
            <input
              type="number"
              min={0}
              value={c.row_limit}
              onChange={(e) => patch({ row_limit: Number(e.target.value) })}
            />
          </Field>
        )}
      </div>
      {tool === "llm" && (
        <More label="More text options: extra context and row filter">
          <Field
            label="Context columns (optional)"
            hint="Sent alongside the text, e.g. the company name or date."
          >
            <div className="checkbox-grid">
              {columns.map((col) => (
                <Check
                  key={col}
                  label={col}
                  value={c.context_columns.includes(col)}
                  set={(v) =>
                    patch({
                      context_columns: v
                        ? [...c.context_columns, col]
                        : c.context_columns.filter((x: string) => x !== col),
                    })
                  }
                />
              ))}
            </div>
          </Field>
          <div className="grid3">
            <Field label="Only rows where column">
              <select
                value={c.filter.column}
                onChange={(e) =>
                  patch({ filter: { ...c.filter, column: e.target.value } })
                }
              >
                <option value="">No filter: all rows</option>
                {columns.map((col) => (
                  <option key={col}>{col}</option>
                ))}
              </select>
            </Field>
            <Field label="Mode">
              <select
                value={c.filter.mode}
                onChange={(e) =>
                  patch({ filter: { ...c.filter, mode: e.target.value } })
                }
              >
                <option value="include">is one of</option>
                <option value="exclude">is not one of</option>
              </select>
            </Field>
            <Field label="Values (comma separated)">
              <input
                value={c.filter.values.join(", ")}
                onChange={(e) =>
                  patch({
                    filter: {
                      ...c.filter,
                      values: e.target.value.split(",").map((v) => v.trim()),
                    },
                  })
                }
              />
            </Field>
          </div>
        </More>
      )}
      <Button
        variant="outline"
        disabled={!c.input || busy}
        onClick={inputPreview}
      >
        <Eye size={14} /> Preview exact input
        {tool === "llm" ? " & prompt" : ""}
      </Button>
    </Section>
  );

  const outputSection = (
    <Section
      id={id("output")}
      title="Save the results"
      detail={
        tool === "news"
          ? "Articles are saved as a new table, one row per article."
          : "Your original columns are kept, with the new results added next to them."
      }
    >
      <div className="grid2">
        <Field label="Filename">
          <input
            value={destination.filename || ""}
            onChange={(e) =>
              patch({
                destination: { ...destination, filename: e.target.value },
              })
            }
            placeholder="my_results.csv"
          />
        </Field>
        <div className="save-location">
          Saved in <strong>{destinationRoot?.name}</strong>
          {destination.path ? " / " + destination.path : ""}
        </div>
      </div>
      <More label="More save options: folder, format, column names">
        <Destination
          value={destination}
          set={(destination) => patch({ destination })}
          roots={roots}
          folders={folders}
          hideFilename
        />
        {tool !== "news" && (
          <Field
            label="Name new columns starting with"
            hint={
              tool === "llm"
                ? "Each extracted field becomes a column such as llm_field_<name>."
                : "For example hf_label and hf_score. Must not match existing column names."
            }
          >
            <input
              value={c.prefix}
              onChange={(e) => patch({ prefix: e.target.value })}
            />
          </Field>
        )}
      </More>
      {validMessage && (
        <div role="status" className="success-message">
          <CheckCircle2 size={16} />
          {validMessage}
        </div>
      )}
      <div className="run-row">
        <Button
          size="lg"
          disabled={busy || !!missingKey || (tool !== "news" && !c.input)}
          onClick={() => start()}
        >
          <Play size={15} />
          {busy
            ? "Starting…"
            : tool === "news"
              ? "Collect articles"
              : tool === "hf"
                ? "Classify all rows"
                : "Extract from all rows"}
        </Button>
        {tool === "llm" && (
          <Button
            variant="outline"
            size="lg"
            disabled={busy || !!missingKey || !c.input}
            onClick={() => start(true)}
          >
            <FlaskConical size={15} /> Test one row first
          </Button>
        )}
        <span className="hint">
          {missingKey
            ? `Add your ${KEY_NAMES[step.needs!]} key first.`
            : tool !== "news" && !c.input
              ? "Choose your data first."
              : "Progress appears under Jobs at the bottom."}
        </span>
      </div>
    </Section>
  );

  return (
    <div className="tool-page">
      <header className="tool-heading">
        <div className="tool-heading-row">
          <div>
            <div className="eyebrow">
              Step {number} of {STEPS.length}
            </div>
            <h1>{step.heading}</h1>
          </div>
          <Button variant="outline" onClick={showCode} disabled={busy}>
            <Code2 size={16} /> Show the Python code
          </Button>
        </div>
        <p>{step.intro}</p>
      </header>
      <Flowchart tool={tool} nodes={flowFor(tool, c, bootstrap)} />
      {missingKey && (
        <div className="callout warning" role="note">
          <KeyRound size={18} />
          <div>
            <strong>This step needs your {KEY_NAMES[step.needs!]} key.</strong>
            <p>Add it once under Connections; it stays on this computer.</p>
          </div>
          <Button size="sm" onClick={openConnections}>
            Add key
          </Button>
        </div>
      )}

      {tool === "news" && (
        <>
          <Section
            id={id("search")}
            title="What to search for"
            detail="Articles must mention the company and match the topic."
          >
            <div className="grid2">
              <Field label="Company name" hint="One company per search.">
                <input
                  placeholder="e.g. Microsoft"
                  value={c.company}
                  onChange={(e) => patch({ company: e.target.value })}
                />
              </Field>
              <Field
                label="Query"
                hint="Topic words. Use OR for alternatives, quotes for exact phrases."
              >
                <input
                  placeholder="e.g. layoffs OR hiring"
                  value={c.query}
                  onChange={(e) => patch({ query: e.target.value })}
                />
              </Field>
            </div>
            <div className="query-preview">
              <div>
                <span>Search sent to NewsAPI</span>
                {c.company && c.query && (
                  <span
                    className={combinedQuery.length > 500 ? "over-limit" : ""}
                  >
                    {combinedQuery.length} / 500 characters
                  </span>
                )}
              </div>
              <code>
                {c.company && c.query
                  ? combinedQuery
                  : "Enter a company and query to preview your search."}
              </code>
            </div>
            <div className="grid3">
              <Field label="From">
                <input
                  type="date"
                  value={c.from || ""}
                  onChange={(e) => patch({ from: e.target.value })}
                />
              </Field>
              <Field label="To">
                <input
                  type="date"
                  value={c.to || ""}
                  onChange={(e) => patch({ to: e.target.value })}
                />
              </Field>
              <Field
                label="Maximum results"
                hint="The free NewsAPI plan returns up to 100."
              >
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={c.max_results}
                  onChange={(e) =>
                    patch({ max_results: Number(e.target.value) })
                  }
                />
              </Field>
            </div>
            <p className="hint">
              The free plan only searches about the last month, so leave the
              dates empty or keep them recent.
            </p>
            <More
              label={
                "More search options: publishers, language, sorting" +
                (c.domains.length ? ` (${c.domains.length} publishers)` : "")
              }
            >
              <div className="row">
                <div className="search-input">
                  <Search size={15} />
                  <input
                    aria-label="Search publishers"
                    placeholder="Search publishers…"
                    value={sourceQuery}
                    onChange={(e) => setSourceQuery(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      const extra = await api("/sources");
                      setSources([
                        ...bootstrap.sources,
                        ...extra.filter(
                          (s: any) =>
                            !bootstrap.sources.some(
                              (b: any) => b.domain === s.domain,
                            ),
                        ),
                      ]);
                    })
                  }
                >
                  Search NewsAPI directory
                </Button>
              </div>
              <div
                className="source-options"
                role="group"
                aria-label="Publisher selection"
              >
                {[true, false].map((suggested) => (
                  <div key={String(suggested)}>
                    {sources.some(
                      (s) =>
                        s.suggested === suggested &&
                        (s.name + s.domain)
                          .toLowerCase()
                          .includes(sourceQuery.toLowerCase()),
                    ) && (
                      <div className="source-group-label">
                        {suggested
                          ? "Suggested business publishers"
                          : "NewsAPI source directory"}
                      </div>
                    )}
                    {sources
                      .filter(
                        (s) =>
                          s.suggested === suggested &&
                          (s.name + s.domain)
                            .toLowerCase()
                            .includes(sourceQuery.toLowerCase()),
                      )
                      .map((s) => (
                        <label key={s.domain} className="source-option">
                          <input
                            type="checkbox"
                            checked={c.domains.includes(s.domain)}
                            onChange={(e) =>
                              patch({
                                domains: e.target.checked
                                  ? [...c.domains, s.domain]
                                  : c.domains.filter(
                                      (d: string) => d !== s.domain,
                                    ),
                              })
                            }
                          />
                          <span>
                            {s.name}
                            <small>{s.domain}</small>
                          </span>
                        </label>
                      ))}
                  </div>
                ))}
              </div>
              <p className="hint">
                With no publishers selected, every source NewsAPI covers is
                searched.
              </p>
              <div className="grid3">
                <Field label="Language">
                  <select
                    value={c.language}
                    onChange={(e) => patch({ language: e.target.value })}
                  >
                    <option value="">All languages</option>
                    {LANGUAGES.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Sort by">
                  <select
                    value={c.sort}
                    onChange={(e) => patch({ sort: e.target.value })}
                  >
                    <option value="publishedAt">Newest first</option>
                    <option value="relevancy">Relevance</option>
                    <option value="popularity">Popularity</option>
                  </select>
                </Field>
                <Field label="Search in">
                  <div className="row wrap">
                    {["title", "description", "content"].map((f) => (
                      <Check
                        key={f}
                        label={f}
                        value={c.search_in.includes(f)}
                        set={(v) =>
                          patch({
                            search_in: v
                              ? [...c.search_in, f]
                              : c.search_in.filter((x: string) => x !== f),
                          })
                        }
                      />
                    ))}
                  </div>
                </Field>
              </div>
            </More>
          </Section>
          {outputSection}
        </>
      )}

      {tool === "hf" && (
        <>
          {inputSection}
          {textSection}
          <Section
            id={id("model")}
            title="Choose a model"
            detail="A Hugging Face text classifier reads each row and picks one of its labels. It runs on this computer."
          >
            <div className="model-choices" role="radiogroup">
              {SUGGESTED_MODELS.map((m) => (
                <button
                  key={m.id}
                  role="radio"
                  aria-checked={c.model === m.id}
                  className={
                    "model-choice" + (c.model === m.id ? " selected" : "")
                  }
                  onClick={() => patch({ model: m.id, revision: "main" })}
                >
                  <strong>{m.name}</strong>
                  <span>{m.labels}</span>
                  <code>{m.id}</code>
                </button>
              ))}
            </div>
            <Field
              label="Hugging Face model ID"
              hint="Or paste the ID of any text-classification model from huggingface.co."
            >
              <input
                value={c.model}
                onChange={(e) => patch({ model: e.target.value })}
              />
            </Field>
            {c.model === bootstrap.default_classifier && (
              <div className="prepare-box">
                <p>
                  FinBERT-ESG (about 440 MB) downloads the first time. Download
                  it before class so the first run starts right away.
                </p>
                <ModelPreparation report={report} />
              </div>
            )}
            <More label="More model options: search, version, speed">
              <div className="row">
                <input
                  aria-label="Search Hugging Face models"
                  placeholder="Search text-classification models…"
                  value={modelQuery}
                  onChange={(e) => setModelQuery(e.target.value)}
                />
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    perform(async () =>
                      setModels(
                        await api(
                          "/models/hf?q=" + encodeURIComponent(modelQuery),
                        ),
                      ),
                    )
                  }
                >
                  <Search size={14} /> Search Hub
                </Button>
              </div>
              {models.length > 0 && (
                <select
                  aria-label="Hugging Face search results"
                  value=""
                  onChange={(e) => patch({ model: e.target.value })}
                >
                  <option value="">Select a search result…</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                    </option>
                  ))}
                </select>
              )}
              <div className="grid3">
                <Field
                  label="Revision"
                  hint="Branch, tag, or commit. The exact one used is recorded."
                >
                  <input
                    value={c.revision}
                    onChange={(e) => patch({ revision: e.target.value })}
                  />
                </Field>
                <Field label="Batch size" hint="Rows classified together.">
                  <input
                    type="number"
                    min={1}
                    max={128}
                    value={c.batch_size}
                    onChange={(e) =>
                      patch({ batch_size: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Run on">
                  <div className="row">
                    <select
                      value={c.device}
                      onChange={(e) => patch({ device: e.target.value })}
                    >
                      {devices.map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        perform(async () => setDevices(await api("/devices")))
                      }
                    >
                      Detect
                    </Button>
                  </div>
                </Field>
              </div>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  perform(async () => {
                    const r = await api("/models/hf/validate", c);
                    setValidMessage(
                      "Compatible classifier · labels: " +
                        Object.values(r.labels).join(", "),
                    );
                  })
                }
              >
                <CheckCircle2 size={14} /> Check this model works
              </Button>
            </More>
          </Section>
          {outputSection}
        </>
      )}

      {tool === "llm" && (
        <>
          {inputSection}
          {textSection}
          <Section
            id={id("design")}
            title="What to extract"
            detail="Instructions tell the model what to do; the fields define the exact answer it must give for every row."
          >
            <div className="row wrap">
              <Button
                variant={showDesigner ? "default" : "outline"}
                disabled={designBusy}
                aria-expanded={showDesigner}
                onClick={() => setShowDesigner(!showDesigner)}
              >
                <Sparkles size={15} /> Design with AI
              </Button>
              <Button
                variant="outline"
                disabled={designBusy}
                onClick={() => loadTemplate("esg")}
              >
                <Sparkles size={14} /> ESG starter
              </Button>
              <Button
                variant="outline"
                disabled={designBusy}
                onClick={() => loadTemplate("blank")}
              >
                Blank custom schema
              </Button>
              <span className="tag">
                {c.preset === "esg"
                  ? "ESG evidence checks on"
                  : "Custom design"}
              </span>
            </div>
            <More
              label="How it works: instructions, fields, and allowed values (example)"
              open
            >
              <ExtractExample />
            </More>
            {showDesigner && (
              <ExtractionDesigner
                design={{
                  instructions: c.instructions,
                  enumsText: c.enumsText,
                  schemaText: c.schemaText,
                  preset: c.preset,
                }}
                extractionModel={c.model || ""}
                workspace={bootstrap.roots[0].id}
                apply={(design) => {
                  patch(design);
                  setValidMessage("");
                }}
                onBusy={setDesignBusy}
              />
            )}
            <fieldset
              disabled={designBusy}
              className="design-editors"
              aria-label="Instructions and output editors"
            >
              <Field label="Custom instructions">
                <textarea
                  rows={6}
                  value={c.instructions}
                  onChange={(e) => patch({ instructions: e.target.value })}
                />
              </Field>
              <div className="editor-heading">
                <h3>Fields to extract</h3>
                <div className="segmented">
                  <button
                    className={schemaMode === "visual" ? "active" : ""}
                    onClick={() => setSchemaMode("visual")}
                  >
                    Field builder
                  </button>
                  <button
                    className={schemaMode === "json" ? "active" : ""}
                    onClick={() => setSchemaMode("json")}
                  >
                    JSON Schema
                  </button>
                </div>
              </div>
              <More label="What do the field types mean?">
                <FieldTypeGuide />
              </More>
              {schemaMode === "visual" ? (
                <SchemaBuilder
                  text={c.schemaText}
                  enumsText={c.enumsText}
                  set={(schemaText) => patch({ schemaText, preset: "custom" })}
                />
              ) : (
                <textarea
                  aria-label="Output JSON Schema"
                  className="code-editor"
                  rows={13}
                  value={c.schemaText}
                  onChange={(e) =>
                    patch({ schemaText: e.target.value, preset: "custom" })
                  }
                />
              )}
              <More label="Allowed-value lists (enums): fixed choices for a field">
                <EnumGuide />
                <div className="editor-heading flush">
                  <span className="label">Your lists</span>
                  <div className="segmented">
                    <button
                      className={enumMode === "visual" ? "active" : ""}
                      onClick={() => setEnumMode("visual")}
                    >
                      Lists
                    </button>
                    <button
                      className={enumMode === "json" ? "active" : ""}
                      onClick={() => setEnumMode("json")}
                    >
                      JSON
                    </button>
                  </div>
                </div>
                {enumMode === "visual" ? (
                  <EnumBuilder
                    text={c.enumsText}
                    set={(enumsText) => patch({ enumsText })}
                  />
                ) : (
                  <textarea
                    aria-label="Enums JSON"
                    className="code-editor"
                    rows={7}
                    value={c.enumsText}
                    onChange={(e) => patch({ enumsText: e.target.value })}
                  />
                )}
              </More>
              <More label="Load or save: instructions, fields, presets">
                <div className="row wrap">
                  <ImportText
                    accept=".txt,.md"
                    onText={(instructions) => patch({ instructions })}
                    label="Upload instructions"
                  />
                  {configFiles("instructions", "Open workspace instructions")}
                </div>
                <div className="row wrap">
                  <ImportText
                    accept=".json"
                    label="Upload schema"
                    onText={(schemaText) =>
                      patch({ schemaText, preset: "custom" })
                    }
                  />
                  {configFiles("schemaText", "Open workspace schema")}
                </div>
                <div className="row wrap">
                  <ImportText
                    accept=".json"
                    label="Upload enums"
                    onText={(enumsText) => patch({ enumsText })}
                  />
                  {configFiles("enumsText", "Open workspace enums")}
                </div>
                <div className="row wrap">
                  <Button variant="outline" onClick={() => setSavePreset(true)}>
                    <Save size={14} /> Save preset
                  </Button>
                  <ImportText
                    accept=".json"
                    onText={importPreset}
                    label="Upload preset"
                  />
                  {configFiles("preset", "Open saved preset")}
                </div>
              </More>
              <div className="row wrap">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      const { schema, enums } = processingConfig();
                      await api("/schema/validate", { schema, enums });
                      setValidMessage("Schema and enum definitions are valid.");
                    })
                  }
                >
                  <CheckCircle2 size={14} /> Validate schema
                </Button>
              </div>
            </fieldset>
          </Section>
          <Section
            id={id("model")}
            title="Choose a model"
            detail="An OpenAI model that supports structured outputs. Each row is one paid request to your account."
          >
            <div className="row">
              <Button
                variant="outline"
                disabled={busy || !!missingKey}
                onClick={() =>
                  perform(async () => setModels(await api("/models/openai")))
                }
              >
                Load my account&apos;s models
              </Button>
              {models.length > 0 && (
                <select
                  aria-label="Account models"
                  value=""
                  onChange={(e) => patch({ model: e.target.value })}
                >
                  <option value="">Choose a model…</option>
                  {models.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              )}
            </div>
            <Field
              label="Model ID"
              hint="Or type a model ID. Use “Test one row first” to check it works before a big run."
            >
              <input
                placeholder="Enter your OpenAI model ID"
                value={c.model}
                onChange={(e) => patch({ model: e.target.value })}
              />
            </Field>
            <More label="Generation settings (optional): temperature, reasoning, length">
              <p className="hint">
                Leave these empty unless you need them: each model has sensible
                defaults. Not every model supports every setting; if one is not
                supported, “Test one row first” shows an error.
              </p>
              <div className="grid3">
                <Field
                  label="Temperature"
                  hint="How varied the answers are, 0 to 2. 0 gives the most consistent answers, best for research. Many newer models ignore it."
                >
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={c.temperature ?? ""}
                    onChange={(e) =>
                      patch({
                        temperature:
                          e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field
                  label="Reasoning effort"
                  hint="For reasoning models: how long the model thinks before answering. Higher is more careful, but slower and more expensive."
                >
                  <select
                    value={c.reasoning_effort || ""}
                    onChange={(e) =>
                      patch({ reasoning_effort: e.target.value })
                    }
                  >
                    <option value="">Model default</option>
                    {["none", "minimal", "low", "medium", "high", "xhigh"].map(
                      (v) => (
                        <option key={v}>{v}</option>
                      ),
                    )}
                  </select>
                </Field>
                <Field
                  label="Maximum answer length (tokens)"
                  hint="A token is about ¾ of a word. Too low cuts answers off and the row fails; leave empty for the model's default."
                >
                  <input
                    type="number"
                    min={1}
                    value={c.max_output_tokens || ""}
                    onChange={(e) =>
                      patch({
                        max_output_tokens: Number(e.target.value) || null,
                      })
                    }
                  />
                </Field>
              </div>
            </More>
          </Section>
          {outputSection}
        </>
      )}

      {preview && (
        <Modal
          title="Exact input preview"
          close={() => setPreview(null)}
          description={`${preview.selected_rows} selected rows · ${preview.words_used} / ${preview.words_available} words in the first selected record`}
        >
          <pre className="record-inspector">
            {preview.instructions
              ? "INSTRUCTIONS\n" + preview.instructions + "\n\nPROMPT\n"
              : ""}
            {preview.prompt || preview.text}
          </pre>
        </Modal>
      )}
      {code && (
        <CodeViewer
          title={step.heading}
          code={code}
          close={() => setCode(null)}
        />
      )}
      {savePreset && (
        <Modal
          title="Save extraction preset"
          close={() => setSavePreset(false)}
          description="Saves the instructions, allowed values, and fields together, in the folder chosen under Save the results."
        >
          <Field label="Preset filename">
            <input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
            />
          </Field>
          <Button
            onClick={() =>
              perform(async () => {
                const p = processingConfig();
                await api("/text", {
                  file: {
                    root: destination.root,
                    path: [destination.path, presetName]
                      .filter(Boolean)
                      .join("/"),
                  },
                  content: pretty({
                    instructions: p.instructions,
                    schema: p.schema,
                    enums: p.enums,
                    preset: p.preset,
                  }),
                  overwrite: false,
                });
                setSavePreset(false);
                await refresh();
              })
            }
          >
            Save preset
          </Button>
        </Modal>
      )}
    </div>
  );
}
