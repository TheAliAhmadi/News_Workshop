"use client";
import { useEffect, useRef, useState } from "react";
import {
  Play,
  Search,
  CheckCircle2,
  FlaskConical,
  Eye,
  Save,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  Field,
  Section,
  FileSelect,
  ColumnPicker,
  Destination,
  Check,
  ImportText,
} from "./fields";
import { ExtractionDesigner } from "./extraction-designer";
import { SchemaBuilder, EnumBuilder } from "./schema-builder";
import { Modal } from "./explorer";
import { api, Entry, Ref, Root, pretty, query } from "@/lib/api";
export type ToolProps = {
  visible?: boolean;
  tool: string;
  config: any;
  set: (c: any) => void;
  roots: Root[];
  entries: Entry[];
  bootstrap: any;
  upload: (f: File) => Promise<Ref>;
  refresh: () => Promise<void>;
  report: (e: unknown) => void;
  submitted: (job: any) => void;
};
const descriptions: Record<string, [string, string, string]> = {
  news: [
    "COLLECT",
    "News API",
    "Search a company and any topic. Save the articles you want to research.",
  ],
  hf: [
    "CLASSIFY",
    "Hugging Face / FinBERT",
    "Choose your dataset, assemble the text, and run a text classifier.",
  ],
  llm: [
    "EXTRACT",
    "LLM structured extraction",
    "Turn article text into your own structured research variables.",
  ],
  clean: [
    "PREPARE",
    "Clean a dataset",
    "Normalize selected columns and remove duplicates in a new file.",
  ],
  review: [
    "ASSESS",
    "Human validation",
    "Compare your judgments with any categorical fields in a coded dataset.",
  ],
  aggregate: [
    "SUMMARIZE",
    "Aggregate / export",
    "Map your columns to publication-month mention measures.",
  ],
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
  clean: {
    columns: [],
    duplicate_keys: [],
    normalize: true,
    drop_empty: false,
    lowercase: false,
    destination: { filename: "cleaned.csv", format: "csv", path: "" },
  },
  review: {
    fields: [],
    count: 5,
    seed: 42,
    destination: { filename: "human_labels.csv", format: "csv", path: "" },
  },
  aggregate: {
    mapping: {},
    destination: { filename: "firm_month.csv", format: "csv", path: "" },
  },
};
export function Tool({
  visible = true,
  tool,
  config: c,
  set,
  roots,
  entries,
  bootstrap,
  upload,
  refresh,
  report,
  submitted,
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
  const [sample, setSample] = useState<any>(null);
  const [labels, setLabels] = useState<Record<number, Record<string, string>>>(
    {},
  );
  const [metrics, setMetrics] = useState<any>(null);
  const [presetName, setPresetName] = useState("extraction_preset.json");
  const [savePreset, setSavePreset] = useState(false);
  const [showDesigner, setShowDesigner] = useState(false);
  const [designBusy, setDesignBusy] = useState(false);
  const latestConfig = useRef(c);
  latestConfig.current = c;
  const patch = (value: any) => set({ ...latestConfig.current, ...value });
  const files = entries.filter((e) => e.kind === "file");
  const folders = entries.filter((e) => e.kind === "folder");
  const destination = {
    ...c.destination,
    root: c.destination?.root || roots[0]?.id,
  };
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
        throw new Error("Choose a CSV or JSON array of records.");
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
        fields: [],
        mapping: {},
        filter: { column: "", mode: "include", values: [] },
      });
      setSample(null);
    } catch (e) {
      report(e);
    }
  };
  const processingConfig = () => {
    const { input, destination, schemaText, enumsText, ...config } = c;
    return tool === "llm"
      ? {
          ...config,
          schema: JSON.parse(schemaText),
          enums: JSON.parse(enumsText),
        }
      : config;
  };
  const start = (test = false) =>
    perform(async () => {
      const config = processingConfig();
      const dest = test
        ? {
            ...destination,
            filename: "test_" + destination.filename,
            overwrite: false,
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
  const loadTemplate = (name: string) => {
    const t = bootstrap.templates[name];
    patch({ ...t, schemaText: pretty(t.schema), enumsText: pretty(t.enums) });
  };
  const importPreset = (text: string) => {
    try {
      const p = JSON.parse(text);
      if (!p.schema || typeof p.instructions !== "string")
        throw new Error("Preset needs instructions, enums and schema.");
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
  const title = descriptions[tool];
  return (
    <div className="tool-page">
      <header className="tool-heading">
        <div className="eyebrow">
          {title[0]} <span>/ INDEPENDENT TOOL</span>
        </div>
        <h1>{title[1]}</h1>
        <p>{title[2]}</p>
      </header>
      {tool !== "news" && (
        <Section
          number="01"
          title="Input dataset"
          detail="Choose any CSV or JSON file. No earlier tool run is required."
        >
          <FileSelect
            value={c.input}
            set={chooseInput}
            files={files}
            upload={upload}
          />
          {c.input && (
            <div className="input-meta">
              <FileBadge /> {c.input.path}
              <span>
                {rowCount.toLocaleString()} rows · {columns.length} columns
              </span>
            </div>
          )}
        </Section>
      )}
      {tool === "news" && (
        <>
          <Section
            number="01"
            title="Company & search"
            detail="Search NewsAPI’s Everything endpoint with your own topic expression."
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
                hint="Use AND, OR, NOT, parentheses, or quoted phrases."
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
                <span>API QUERY</span>
                <span>
                  {('"' + c.company + '" AND (' + c.query + ")").length} / 500
                  characters
                </span>
              </div>
              <code>
                {c.company && c.query
                  ? '"' + c.company + '" AND (' + c.query + ")"
                  : "Enter a company and query to preview your request."}
              </code>
            </div>
          </Section>
          <Section
            number="02"
            title="Publishers & coverage"
            detail="Selected publishers become domain filters. With none selected, search all available coverage."
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
            <details className="source-dropdown" open>
              <summary>
                {c.domains.length
                  ? c.domains.length + " publishers selected"
                  : "Choose publishers"}{" "}
                <span>Suggested business sources</span>
              </summary>
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
                          ? "Suggested business sources"
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
            </details>
            <p className="hint">
              NewsAPI coverage varies by publisher and plan. Suggested
              publishers do not guarantee matching articles. The directory lists
              a subset of available sources.
            </p>
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
              <Field label="Language">
                <select
                  value={c.language}
                  onChange={(e) => patch({ language: e.target.value })}
                >
                  <option value="">All languages</option>
                  {[
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
                  ].map((l) => (
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
              <Field label="Maximum results">
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
              <Field label="Article fields to search">
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
          </Section>
        </>
      )}
      {["hf", "llm"].includes(tool) && (
        <Section
          number="02"
          title="Text to process"
          detail="Columns are combined in the displayed order, then capped at your word budget."
        >
          <ColumnPicker
            columns={columns}
            value={c.columns}
            set={(columns) => patch({ columns })}
          />
          <div className="grid3">
            <Field label="Word budget">
              <input
                type="number"
                min={1}
                max={100000}
                value={c.word_limit}
                onChange={(e) => patch({ word_limit: Number(e.target.value) })}
              />
            </Field>
            {tool === "hf" ? (
              <>
                <Field label="Batch size">
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
                <Field label="Execution device">
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
              </>
            ) : (
              <Field label="Row limit" hint="0 processes all selected rows.">
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
            <>
              <Field label="Context columns (optional)">
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
                            : c.context_columns.filter(
                                (x: string) => x !== col,
                              ),
                        })
                      }
                    />
                  ))}
                </div>
              </Field>
              <details className="advanced">
                <summary>Optional row filter</summary>
                <div className="grid3">
                  <Field label="Filter column">
                    <select
                      value={c.filter.column}
                      onChange={(e) =>
                        patch({
                          filter: { ...c.filter, column: e.target.value },
                        })
                      }
                    >
                      <option value="">No filter — all rows</option>
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
                      <option value="include">Include values</option>
                      <option value="exclude">Exclude values</option>
                    </select>
                  </Field>
                  <Field label="Values (comma separated)">
                    <input
                      value={c.filter.values.join(", ")}
                      onChange={(e) =>
                        patch({
                          filter: {
                            ...c.filter,
                            values: e.target.value
                              .split(",")
                              .map((v) => v.trim()),
                          },
                        })
                      }
                    />
                  </Field>
                </div>
              </details>
            </>
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
      )}
      {tool === "hf" && (
        <Section
          number="03"
          title="Classifier"
          detail="Compatible Hugging Face text classifiers keep their own labels and scores."
        >
          <div className="row">
            <input
              aria-label="Search Hugging Face models"
              placeholder="Search text-classification models…"
              value={modelQuery}
              onChange={(e) => setModelQuery(e.target.value)}
            />
            <Button
              variant="outline"
              onClick={() =>
                perform(async () =>
                  setModels(
                    await api("/models/hf?q=" + encodeURIComponent(modelQuery)),
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
          <div className="grid2">
            <Field label="Hugging Face repository ID">
              <input
                value={c.model}
                onChange={(e) => patch({ model: e.target.value })}
              />
            </Field>
            <Field
              label="Revision"
              hint="Branch, tag, or commit. The resolved revision is recorded."
            >
              <input
                value={c.revision}
                onChange={(e) => patch({ revision: e.target.value })}
              />
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
            <CheckCircle2 size={14} /> Validate compatibility
          </Button>
          <p className="hint">
            The first run downloads model weights. Loading is shown separately
            from row inference. No repository code is executed.
          </p>
        </Section>
      )}
      {tool === "llm" && (
        <>
          <Section
            number="03"
            title="Instructions & output design"
            detail="Define your research task and the exact shape of every result."
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
                  ? "ESG evidence checks enabled"
                  : "Custom · no ESG requirements"}
              </span>
            </div>
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
              <div className="row">
                <ImportText
                  accept=".txt,.md"
                  onText={(instructions) => patch({ instructions })}
                  label="Upload instructions"
                />
                {configFiles("instructions", "Open workspace instructions")}
              </div>
              <div className="editor-heading">
                <h3>Named enums</h3>
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
              <div className="row">
                <ImportText
                  accept=".json"
                  label="Upload enums"
                  onText={(enumsText) => patch({ enumsText })}
                />
                {configFiles("enumsText", "Open workspace enums")}
              </div>
              <div className="editor-heading">
                <h3>Structured output</h3>
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
              <div className="row">
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
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      await api("/schema/validate", {
                        schema: JSON.parse(c.schemaText),
                        enums: JSON.parse(c.enumsText),
                      });
                      setValidMessage("Schema and enum definitions are valid.");
                    })
                  }
                >
                  <CheckCircle2 size={14} /> Validate schema
                </Button>
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
            </fieldset>
          </Section>
          <Section
            number="04"
            title="OpenAI model"
            detail="Use an account-accessible model that supports Responses structured outputs."
          >
            <div className="row">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  perform(async () => setModels(await api("/models/openai")))
                }
              >
                Load account models
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
              hint="Manual entry is available. A one-row test verifies access and supported settings."
            >
              <input
                placeholder="Enter your OpenAI model ID"
                value={c.model}
                onChange={(e) => patch({ model: e.target.value })}
              />
            </Field>
            <details className="advanced">
              <summary>Generation settings</summary>
              <p className="hint">
                Settings are omitted unless supplied. Support varies by model;
                unsupported parameters produce a provider error in the one-row
                test.
              </p>
              <div className="grid3">
                <Field label="Temperature (optional)">
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
                <Field label="Reasoning effort">
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
                <Field label="Maximum output tokens">
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
            </details>
          </Section>
        </>
      )}
      {tool === "clean" && (
        <Section
          number="02"
          title="Cleaning options"
          detail="Source values outside the selected columns are preserved."
        >
          <Field label="Columns to normalize">
            <div className="checkbox-grid">
              {columns.map((col) => (
                <Check
                  key={col}
                  label={col}
                  value={c.columns.includes(col)}
                  set={(v) =>
                    patch({
                      columns: v
                        ? [...c.columns, col]
                        : c.columns.filter((x: string) => x !== col),
                    })
                  }
                />
              ))}
            </div>
          </Field>
          <div className="row wrap">
            <Check
              label="Normalize whitespace"
              value={c.normalize}
              set={(normalize) => patch({ normalize })}
            />
            <Check
              label="Lowercase selected columns"
              value={c.lowercase}
              set={(lowercase) => patch({ lowercase })}
            />
            <Check
              label="Drop rows with all selected fields empty"
              value={c.drop_empty}
              set={(drop_empty) => patch({ drop_empty })}
            />
          </div>
          <Field
            label="Duplicate keys"
            hint="Rows matching all selected keys are deduplicated; the first row is retained."
          >
            <ColumnPicker
              columns={columns}
              value={c.duplicate_keys}
              set={(duplicate_keys) => patch({ duplicate_keys })}
            />
          </Field>
        </Section>
      )}
      {tool === "aggregate" && (
        <Section
          number="02"
          title="Map research variables"
          detail="Choose equivalent columns from any coded input. No earlier workshop stages are required."
        >
          <div className="grid2">
            {[
              "firm",
              "date",
              "relevance",
              "dimension",
              "relationship",
              "theme",
              "status",
            ].map((name) => (
              <Field
                key={name}
                label={
                  name === "status"
                    ? "Processing status (optional)"
                    : name[0].toUpperCase() + name.slice(1)
                }
              >
                <select
                  value={c.mapping[name] || ""}
                  onChange={(e) =>
                    patch({ mapping: { ...c.mapping, [name]: e.target.value } })
                  }
                >
                  <option value="">
                    {name === "status"
                      ? "Treat all rows as successfully coded"
                      : "Choose a column…"}
                  </option>
                  {columns.map((col) => (
                    <option key={col}>{col}</option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
          <div className="notice">
            Counts represent observed article–firm mentions, not unique events.
            Shares use successfully coded, relevant mentions; themes exclude
            “other_theme”. Invalid publication dates are excluded and reported.
          </div>
          <details className="advanced">
            <summary>Expected categorical values</summary>
            <p>
              Relevance: true / 1 / yes. Dimension: environmental, social,
              governance, multiple, none. Relationship: firm_action,
              accusation_against_firm, firm_response,
              external_esg_event_affecting_firm, other. Status: ok, failed,
              pending, skipped_finbert_none, not_processed_limit.
            </p>
          </details>
        </Section>
      )}
      {tool === "review" && (
        <Section number="02" title="Human coding exercise">
          <div className="row">
            <Button
              variant="outline"
              onClick={() =>
                patch({
                  count: 5,
                  seed: 42,
                  fields: [
                    "esg_dimension",
                    "event_relationship",
                    "theme_primary",
                  ]
                    .map((f) => columns.find((c) => c.endsWith(f)))
                    .filter(Boolean),
                })
              }
            >
              Five-row ESG preset
            </Button>
          </div>
          <Field label="Categorical fields to assess">
            <div className="checkbox-grid">
              {columns.map((col) => (
                <Check
                  key={col}
                  label={col}
                  value={c.fields.includes(col)}
                  set={(v) => {
                    patch({
                      fields: v
                        ? [...c.fields, col]
                        : c.fields.filter((x: string) => x !== col),
                    });
                    setSample(null);
                  }}
                />
              ))}
            </div>
          </Field>
          <div className="grid2">
            <Field label="Sample rows">
              <input
                type="number"
                min={1}
                max={500}
                value={c.count}
                onChange={(e) => patch({ count: Number(e.target.value) })}
              />
            </Field>
            <Field label="Random seed">
              <input
                type="number"
                value={c.seed}
                onChange={(e) => patch({ seed: Number(e.target.value) })}
              />
            </Field>
          </div>
          <Button
            disabled={!c.input || !c.fields.length || busy}
            onClick={() =>
              perform(async () => {
                setSample(await api("/review/sample", c));
                setLabels({});
                setMetrics(null);
              })
            }
          >
            Load review sample
          </Button>
          {sample &&
            sample.rows.map((item: any) => (
              <div className="review-record" key={item.index}>
                <h3>Record {item.index + 1}</h3>
                <details>
                  <summary>Read complete record</summary>
                  <pre>{pretty(item.record)}</pre>
                </details>
                {c.fields.map((field: string) => (
                  <Field
                    key={field}
                    label={field}
                    hint={"Model value: " + String(item.record[field])}
                  >
                    <input
                      list={"values-" + field}
                      value={labels[item.index]?.[field] || ""}
                      onChange={(e) =>
                        setLabels({
                          ...labels,
                          [item.index]: {
                            ...labels[item.index],
                            [field]: e.target.value,
                          },
                        })
                      }
                      placeholder="Your judgment…"
                    />
                    <datalist id={"values-" + field}>
                      {sample.values[field].map((v: string) => (
                        <option key={v} value={v} />
                      ))}
                    </datalist>
                  </Field>
                ))}
              </div>
            ))}
          {metrics && <pre className="notice">{pretty(metrics)}</pre>}
        </Section>
      )}
      <Section
        number={
          tool === "news"
            ? "03"
            : tool === "llm"
              ? "05"
              : tool === "hf"
                ? "04"
                : "03"
        }
        title="Save output"
        detail="Choose a destination for this tool’s results."
      >
        {["hf", "llm"].includes(tool) && (
          <Field
            label="Output-column prefix"
            hint={
              tool === "llm"
                ? "Results also remain nested under <prefix>result. Individual fields use <prefix>field_<name>."
                : "Original columns are preserved. Choose a prefix that does not overlap them."
            }
          >
            <input
              value={c.prefix}
              onChange={(e) => patch({ prefix: e.target.value })}
            />
          </Field>
        )}
        <Destination
          value={destination}
          set={(destination) => patch({ destination })}
          roots={roots}
          folders={folders}
        />
        {tool === "news" && (
          <div className="notice">
            Article content from NewsAPI may be truncated. Raw results are saved
            as returned, with search metadata. Cleaning and classification are
            separate tools.
          </div>
        )}
        {validMessage && (
          <div role="status" className="success-message">
            <CheckCircle2 size={16} />
            {validMessage}
          </div>
        )}
        <div className="run-row">
          {tool === "review" ? (
            <Button
              disabled={!sample || busy}
              onClick={() =>
                perform(async () => {
                  const result = await api("/review/save", {
                    ...c,
                    hash: sample.hash,
                    labels: sample.rows.map((r: any) => ({
                      index: r.index,
                      values: labels[r.index] || {},
                    })),
                    destination,
                  });
                  setMetrics(result.metrics);
                  await refresh();
                })
              }
            >
              <Save size={15} /> Save human labels & assess
            </Button>
          ) : (
            <>
              <Button
                disabled={busy || (tool !== "news" && !c.input)}
                onClick={() => start()}
              >
                <Play size={14} />
                {busy
                  ? "Submitting…"
                  : tool === "news"
                    ? "Retrieve articles"
                    : tool === "aggregate"
                      ? "Aggregate & export"
                      : "Process dataset"}
              </Button>
              {tool === "llm" && (
                <Button
                  variant="outline"
                  disabled={busy || !c.input}
                  onClick={() => start(true)}
                >
                  <FlaskConical size={15} /> Test one row
                </Button>
              )}
              <span className="hint">
                Progress appears in the Jobs panel below.
              </span>
            </>
          )}
        </div>
      </Section>
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
      {savePreset && (
        <Modal
          title="Save extraction preset"
          close={() => setSavePreset(false)}
          description="Save instructions, enums, schema, and preset type together in the selected output folder."
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
function FileBadge() {
  return <span className="tiny-dot" />;
}
