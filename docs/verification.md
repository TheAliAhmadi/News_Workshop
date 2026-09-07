# Verification record

Verified in `/Users/aliahmadi/Code/News_Workshop` on September 6, 2026, on macOS Apple Silicon with Python 3.12.12, Next.js 16.3.4, and Chrome for Testing 152.

## Results

- **32 backend tests passed** (`.venv/bin/python -m pytest -q`). Two upstream test-client deprecation warnings; no test failures.
- **Production static build passed**, including TypeScript checking (`npm run build`). Output is in `frontend/out/`.
- **Three complete browser tests passed** (`npm run test:e2e` against the local FastAPI service). No browser runtime errors in the main acceptance story.
- **Real FinBERT worker job passed** with an independently uploaded two-row CSV. Loading, inference, completion, output publication, native labels, exact selected-column input, source columns, and resolved revision were checked. The two explicitly fictional records returned Environmental and Governance. Revision: `f79fefa034aa8a969379e23b755369a94c4cd0d3`. Repeat explicitly with `.venv/bin/python tests/live_hf_smoke.py` while the application runs.

## Acceptance coverage

| Requirement | Evidence |
| --- | --- |
| Persistent explorer, file actions, previews | Browser attach/upload/rename/open/download; keyboard record inspection; backend pagination and path confinement. |
| Independent Hugging Face input | Browser upload/context selection and exact ordered-text preview; real spawned FinBERT worker processed that input shape without collection history. |
| Independent LLM input | Browser custom schema/prompt preview without FinBERT columns; mocked Responses extraction validates and serializes results from independent records. |
| Company AND Query and domain filters | Browser exact combined expression; backend operator preservation, 500-character validation, normalized domains, domain-only request parameters. |
| Article section selection | Browser reordered columns change preview; real worker exact-input assertion; backend word/token truncation checks. |
| Native classifier labels | Backend controlled ESG and sentiment classifiers preserve their labels; live FinBERT confirms native ESG labels. |
| Configurations and nested schema round-trip | Browser visual/JSON arrays, nested objects, primitives, nullable values, enums; preset save/edit/reload; configuration Save As to a subfolder leaves source unchanged; duplicate field names preserve both fields. |
| Invalid input validation | Schema subset/type checks, prefix collisions, read-only dataset enforcement including uppercase file extensions, invalid JSON drafts remain editable. Model loader and explicit compatibility check require a sequence classifier. |
| Jobs/recovery/output handling | Real spawned queue; input snapshot unaffected by later file edits; cancellation before processing and after a successful LLM row; failed-row-only retry; restart interruption; changed output refusal; NewsAPI partial-page retention and stale-cursor recovery; browser refresh retains completed jobs and form settings. |
| Independent review and aggregation | Browser categorical review/save/agreement, mapped aggregation through real worker, invalid-date reporting; backend checks expected mention shares. |
| Complete browser workflow | Three stories cover form-to-API-to-output behavior, persistent tabs/explorer, keyboard divider resizing, dataset record inspection, downloads, and refreshed state. |

## Provider boundaries

NewsAPI and OpenAI keys were not configured during verification. Their request construction, partial failures, schema validation, row retry, cancellation, and serialization were exercised with controlled provider responses. No live NewsAPI retrieval or account-backed OpenAI extraction was claimed. Connect the intended accounts and use the one-row LLM test before a classroom batch; account access, quotas, and supported generation settings remain provider-dependent.

The default FinBERT model was downloaded and run locally. Arbitrary Hugging Face repositories were not exhaustively tested; the workbench rejects incompatible architectures and preserves native classifier output for compatible models.

## Preserved test evidence

Verification used clearly labeled fictional records in temporary attached directories. The test-time application state and copies of those files are archived under `.recovery/acceptance-state/` and `.recovery/verification-files/`. The final application starts with a fresh default `research_workspace/`, without test jobs or test folders in the explorer. Original previous-installation metadata remains separate in `.recovery/previous-state/`.

Browser test reruns intentionally create new temporary roots. Keep a separate state directory or detach their folders after rerunning tests if teaching with the same installation.

## Desktop packaging update — September 7, 2026

Release packaging for classroom installers is in place per `PLAN_release.md`:

- Tkinter launcher, PyInstaller one-folder builds, macOS DMG and Windows Inno Setup scripts under `packaging/`
- Per-user application data, keyring-backed **Remember on this computer**, first-run guide, backend-managed preferences and designer sessions
- GitHub Actions for tests and draft releases; Windows signing signs the executable before the installer is rebuilt
- Student guide, publisher signing instructions, and README download links for Mac and Windows

Backend suite: **81 passed** after these changes. Full packaged smoke tests and signed-artifact acceptance on clean Mac/Windows machines remain the gate before pointing students at a published release.
