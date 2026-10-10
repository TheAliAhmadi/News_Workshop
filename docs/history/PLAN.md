# File-Based Research Workbench

## 1. Platform and interaction model

Replace Streamlit with **Next.js, React, TypeScript, and shadcn/ui**, backed by **FastAPI and the existing Python processing modules**.

Use a light, desktop-style research interface with a persistent folder explorer, tabbed workspaces, resizable panels, and a bottom job-status panel. Students work through forms, file previews, and configuration editors.

**Every tool is independent.** Each selects its own inputs, settings, and output destination. Opening the LLM tool never requires running collection or FinBERT first. Changing one tool’s settings does not invalidate another tool’s saved results.

Build the frontend as a static export served by FastAPI, so the classroom launcher starts one local service. Node.js is needed for frontend development/builds, not ordinary classroom use. [Next.js static export documentation](https://nextjs.org/docs/app/guides/static-exports).

## 2. Persistent folder explorer

The explorer is the primary navigation element and remains visible across all tools.

- **Open Folder / Add Folder:** attach local research directories through an in-app directory browser or an absolute-path field.
- **Tree view:** expandable folders, file icons, filename search, refresh, and a resizable sidebar.
- **File actions:** upload, create folder, rename, download, and open in a preview tab.
- **Dataset previews:** paginated CSV/JSON tables with column names, row counts, and individual-record inspection.
- **Configuration files:** view and edit text instructions, enum definitions, and output schemas; provide Save and Save As.
- **Context actions:** “Use in Hugging Face,” “Use in LLM,” “Clean,” and “Review” populate the corresponding tool’s input selector.
- **Output destinations:** every processing tool has a folder picker, filename field, and format selector. Existing files require explicit replacement or a new filename.
- Application code, credentials, dependency folders, and internal job metadata stay outside the student explorer.

Default to a dedicated research workspace. Students can attach additional directories and select inputs or destinations within them. Source datasets remain read-only in previews; processing produces new output files.

## 3. Independent tools

### News API

Use NewsAPI.org’s **Everything** endpoint.

The main form contains:

- **Company name:** one company per search.
- **Query:** unrestricted topic/search expression, without ESG-only vocabulary.
- A live combined-query preview:
  ```text
  Company name: Microsoft
  Query: layoffs OR hiring

  API query: "Microsoft" AND (layoffs OR hiring)
  ```
- A searchable, multi-select source dropdown.
- Dates, language, sort order, article fields to search, maximum results, and output destination.

Preserve operators and quoted phrases in the Query field. Validate the combined expression’s length and required inputs before submission.

Provide a “Suggested business sources” group containing Reuters, Bloomberg, Financial Times, The Wall Street Journal, CNBC, The Economist, Fortune, Business Insider, and MarketWatch. Search the NewsAPI source directory for additional publishers. Normalize selections to publisher-domain filters for Everything requests, avoiding accidental intersections between separate source-ID and domain filters. Coverage remains dependent on NewsAPI; unavailable results are reported honestly. [NewsAPI search parameters](https://newsapi.org/docs/endpoints/everything), [source directory](https://newsapi.org/docs/endpoints/sources).

Show retrieval progress, returned counts, partial failures, and a result preview. Save raw results without automatically cleaning or classifying them. Explain that available article content may be truncated.

### Hugging Face classification

Label the workspace **“Hugging Face / FinBERT.”**

Students choose:

- An input CSV/JSON file from the explorer or an upload.
- The article sections to process: headline, description/lead, content, or mapped text columns.
- Multiple selected sections and their concatenation order.
- Word limit, batch size, and available execution device.
- A searchable Hugging Face text-classification model, or a pasted repository ID.
- Model revision, output-column prefix, output folder, filename, and format.

Default model: `yiyanghkust/finbert-esg`. Default input: headline → lead → content, capped at 150 words.

Validate model compatibility before processing. Support compatible Transformers text classifiers and preserve their native labels and scores. ESG, sentiment, and other classifiers must not share a forced E/S/G label mapping.

Show separate loading/download and inference progress, processed/total rows, elapsed time, cancellation, and row-level failures. Save original columns plus classification results, actual input text, model revision, and truncation metadata.

### LLM structured extraction

Students independently select:

- An input CSV/JSON file and text/context columns.
- **Custom instructions:** write directly, upload `.txt`/`.md`, or open an existing workspace file.
- **Enums:** create named lists visually, edit their JSON representation, or upload JSON.
- **Structured output:** use a visual field builder or edit/upload JSON Schema.
- An OpenAI model from an account-backed selector, with manual model-ID entry.
- Text budget, row limit, supported generation settings, output prefix, destination, and format.

The field builder supports strings, numbers, integers, booleans, enums, nullable values, arrays, and nested objects. Visual and JSON editing operate on the same validated configuration. Unsupported schema features produce an actionable validation error rather than being silently changed.

Ship **ESG starter** and **Blank custom schema** templates. ESG fields and semantic rules apply only when that preset is selected. Other schemas must not inherit hidden ESG requirements.

Process all selected rows by default. An optional filter can include/exclude values from any existing column, including FinBERT labels. There is no mandatory FinBERT gate.

Provide input/prompt preview, schema validation, a one-row test action, progress, cancellation, failed-row retry, and saved instruction/schema presets. Use schema-constrained Responses API output and validate results against the submitted schema. [Structured Outputs documentation](https://developers.openai.com/api/docs/guides/structured-outputs).

### Additional tools

Keep these accessible as independent workspaces:

- **Clean:** choose input, normalization options, duplicate keys, and output file.
- **Human validation:** choose a coded dataset and categorical fields to assess; retain the five-row ESG exercise as a preset.
- **Aggregate/export:** choose input and map firm, date, relevance, dimension, relationship, and theme columns. Preserve the existing mention-count definitions.

Missing required columns produce mapping guidance, not a demand to run earlier stages.

## 4. Backend, jobs, and migration

- Replace the sequential run controller with independent job requests containing tool type, input-file reference, complete configuration, and output destination.
- Add FastAPI interfaces for workspace browsing, uploads/previews, configuration validation, NewsAPI sources, model discovery, and job creation/status/cancellation/resume.
- Run processing in a separate worker process. Default to one active processing job with a queue; the interface remains usable throughout.
- Report real completed/total counts through status polling. Use indeterminate progress when model-download or retrieval totals are unknown.
- Snapshot input identity and configuration at submission. Editing a file or switching tabs cannot change a running job.
- Preserve checkpoints, successful rows, sanitized errors, model/schema versions, and input hashes. Restarted jobs become interrupted and resume only through an explicit user action.
- Preserve source columns; append results using the chosen prefix. Nested LLM values remain structured in JSON and serialize within CSV cells.
- Keep filesystem access within attached workspace roots and API credentials in the local backend.
- Reuse tested cleaning, serialization, evidence-checking, and aggregation logic. Generalize classification and extraction instead of wrapping their current fixed assumptions.
- Preserve existing datasets and model caches. Replace the launcher and Streamlit UI tests, remove the Streamlit dependency, and update the documentation.

Implement in this order: **explorer and file previews → independent job system → News API → Hugging Face → configurable LLM → remaining tools → migration and verification**.

## 5. Acceptance tests and defaults

The redesign is accepted when:

1. The explorer stays available across all tools; files open, upload, rename, and save to selected folders.
2. Hugging Face processes an uploaded dataset without collection history.
3. LLM extraction processes an uploaded dataset without FinBERT columns.
4. Company and Query produce the displayed AND expression; source selections produce the intended domain filters.
5. Changing selected article sections changes the exact model input.
6. ESG and sentiment classifiers retain their own labels.
7. Instructions, enums, and nested schemas round-trip between forms, JSON editors, and saved files.
8. Invalid schemas fail before a batch starts; incompatible models produce clear errors.
9. Progress, cancellation, retries, refresh recovery, and output-file handling work without losing completed rows.
10. Human validation and aggregation operate through independently selected files and column mappings.
11. Keyboard navigation, panel resizing, dataset previews, and the complete browser workflow pass verification.

**Confirmed defaults:** local browser application; light workbench; text-classification models; independent LLM processing with optional filtering; visual schema builder plus JSON; cleaning, validation, and aggregation retained.

**Additional defaults:** OpenAI remains the LLM provider; CSV/JSON are the initial dataset formats; no hosted deployment or executable student code; synthetic examples remain optional and explicitly labeled.
