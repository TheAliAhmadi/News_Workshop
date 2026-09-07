# Architecture

## Runtime

`Launch Workshop.command` starts `python -m workbench`, binding Uvicorn to `127.0.0.1:8765`. FastAPI serves both `/api` and the Next.js static export in `frontend/out`. The browser has no filesystem or provider credentials. The project has no required Node.js runtime, hosted services, sequential run controller, or executable student-code interface.

`frontend/components/workbench.tsx` manages persistent tool/file tabs, explorer state, connections, and polling. Tool components retain independent form configurations. `explorer.tsx` implements the tree, previews, and configuration editing. `fields.tsx` supplies file/column/destination controls; `schema-builder.tsx` maintains the same JSON representation used by the schema editor. Radix/shadcn components supply buttons and accessible dialogs.

## Files and jobs

`workbench/files.py` owns attached roots, path confinement, dataset serialization, hashing, and atomic output publication. Hidden paths, code/dependency folders, unsupported file types, and links outside the attached root are excluded. Directory symlinks are omitted from the tree to avoid traversal cycles. Local API mutations require the bootstrap session token, and the service rejects foreign hosts/origins.

`workbench/jobs.py` snapshots the exact input bytes and complete validated request into `.workbench/jobs/<id>/`. A scheduler runs one spawned worker process at a time. `status.json` supplies queue state/progress; `checkpoint.json` is a downloadable array of records, updated atomically after a classification batch, extraction row, or news page. Restarted queued/running jobs are marked interrupted. Resume is explicit and keeps successful rows. FinBERT resumes use the already resolved model revision. News rows carry their retrieval page so checkpoint/status write timing cannot skip a fetched page.

Outputs are published atomically and source columns are retained for classification/extraction. New targets use exclusive publication; replacement checks the approved file hash. Destination paths are resolved again after processing. Output write failures retain checkpoints for recovery. Job keys are copied into worker memory, never serialized in requests or checkpoints.

## Processing

`configuration.py` validates combined queries, domain filters, ordered text selection, independent mappings, and the supported strict schema subset. `processors.py` implements independent NewsAPI, compatible Transformers classification, schema-constrained OpenAI Responses extraction, cleaning, and aggregation. It imports the existing tested normalization, serialization, ESG evidence validation, and mention-count logic from `pipeline/` and `schemas/`.

The LLM processor validates returned JSON against the exact submitted schema and records schema hash, requested/actual model, response ID, usage, actual text, and truncation information. ESG semantic/evidence checks are enabled only by that preset. Transient provider failures have bounded retries; the job panel can retry failed rows while retaining successful results. HF records native labels/all scores, requested/resolved model revision, word/token counts, effective tokenized text, and row status.

Human review is a direct independent API operation with an input hash, deterministic sampling, saved labels, and agreement metrics. Aggregation uses independent input mappings and retains publication-month mention definitions.

## API groups

| Interface | Purpose |
| --- | --- |
| `/api/bootstrap`, `/api/connections`, `/api/health` | Session token, defaults/templates, connection state, worker health |
| `/api/roots`, `/api/roots/detach`, `/api/tree` | Attach/detach and browse research folders |
| `/api/folders`, `/api/upload`, `/api/rename`, `/api/preview`, `/api/text`, `/api/download` | Student file operations |
| `/api/sources`, `/api/models/hf`, `/api/models/hf/validate`, `/api/models/openai`, `/api/devices` | Provider discovery and compatibility |
| `/api/schema/validate`, `/api/input-preview` | Validate configuration and preview exact input/prompt |
| `/api/jobs` and `/api/jobs/{id}` | Submit independent requests; inspect persisted jobs |
| `/api/jobs/{id}/cancel`, `/resume`, `/checkpoint` | Stop, recover/retry, and download saved rows |
| `/api/review/sample`, `/api/review/save`, `/api/examples` | Independent human review and opt-in labeled synthetic examples |

## Project directories

- `research_workspace/`: default student-visible data root; additional directories stay in place.
- `.workbench/`: private current root registry, requests, input snapshots, statuses, and checkpoints.
- `.cache/huggingface/`: local model downloads; preserved across launches.
- `.recovery/`: archived previous-installation state and verification history.
- `frontend/out/`: distributable static frontend; rebuild after frontend source changes.
- `tests/`, `frontend/e2e/`: backend regressions and browser acceptance flows.

The original project location is not a runtime dependency. The launcher ignores inherited workbench path overrides from older installations. `.venv` and `frontend/node_modules` are installed in this project; rebuild the virtual environment if distributing to a different machine.

## Conversational extraction designer

`POST /api/extraction-design` is an independent, synchronous FastAPI endpoint executed in the API thread pool, outside the dataset job queue. The typed request contains `model`, `message`, `mode` (`new` or `refine`), `history` (user/assistant messages), and nullable `current_design`. Unknown top-level fields are rejected; only instructions, enums, and schema from the current design are forwarded, and only for refinement. No dataset reference is accepted.

`workbench/designer.py` sends a fixed strict Responses envelope with `kind`, `message`, and a nullable design. Provider-facing named enums are an array of name/value-list objects; the generated JSON Schema is a JSON string inside that envelope. The service parses it, applies the existing schema-subset validator, verifies categorical enum/list consistency, and returns a normal design object with `instructions`, `enums`, `schema`, and `preset: custom`. Invalid generated output gets one repair attempt; provider failures, incomplete responses, and refusals do not trigger repair. Calls use `store: false`, a bounded timeout, and no automatic SDK retries.

`frontend/components/extraction-designer.tsx` owns a versioned local conversation store keyed by the default workspace ID. It is separate from extraction configuration and presets. An AbortController plus request sequence and design-snapshot checks prevent cancelled or stale replies from applying. Valid results update the editor configuration atomically; Undo holds its previous complete design. Existing custom drafts survive the migration to ESG as the default for fresh configurations.
