# Instructor and student guide

## Files first

The sidebar shows the three workflow steps (Collect news, Classify, Extract) above the **Files** list. Attach a research directory with **Open folder**, which browses folders by clicking. Select a folder in the tree before uploading or creating a subfolder. Choose a file to open its preview tab; the file list remains visible as you switch steps. Additional roots can be detached without deleting their files. The default research workspace stays attached.

CSV input is read as text to preserve identifiers and leading zeros. JSON datasets are arrays of objects; NewsAPI objects with an `articles` array also work. Configuration JSON is an object. File previews show pages of records; press Enter or Space on a record to inspect it. TXT, Markdown, and configuration JSON can be edited with Save or copied to a chosen folder with Save As. Invalid JSON drafts remain editable.

Use a file's **Use in** actions to send it to Classify or Extract, or use the **Classify these / Extract from these** button on a finished job. Alternatively choose an input in that step, or upload one. Each step retains its own settings across tabs and browser refreshes. The sidebar and job-panel dividers can be dragged or focused and adjusted with arrow keys.

## Collect news

Enter one company name and a topic expression. `Microsoft` and `layoffs OR hiring` become `"Microsoft" AND (layoffs OR hiring)`. Operators and quoted phrases in Query are preserved. The combined expression must fit NewsAPI's 500-character limit.

Select business publishers from the suggestions or search the live directory after configuring a NewsAPI key. Selections become a single domain filter, rather than an intersection of source IDs and domains. Choose dates, language, sorting, search fields, maximum count, and destination. Collection saves raw provider records plus retrieval metadata. It does not automatically clean or classify them. A failed later page retains earlier pages for checkpoint download or explicit resume.

## Classify independently

In **Classify**, choose an input file and order the selected text columns. The preview shows the exact joined, normalized, word-limited input. The default order recognizes headline/title, lead/description, and content; arbitrary text columns can be mapped.

Choose a model from search or paste a repository ID, optionally pin a revision, and validate compatibility. Set word limit, batch size, CPU or an available accelerator, output prefix, and destination. Processing first reports model loading/download, then inference counts. Native model labels are retained: a sentiment model returns its sentiment labels, while FinBERT ESG returns its own labels. Word and tokenizer limits are reported separately. Failed rows include an error and remain eligible for retry; successful rows are not classified again on resume.

## Extract with an LLM independently

Choose any input file, text columns, and optional context columns. All selected rows are processed by default. A zero row limit means all rows; optional include/exclude filters accept values from any existing column. FinBERT output is never required.

Start from **Blank custom schema** or **ESG starter**. Write instructions, upload TXT/Markdown, or open an existing configuration. Create named enum lists or edit/upload their JSON. Named lists are included in the prompt; copy a list into a schema field's enum to constrain allowed values.

The field builder and JSON Schema editor share one schema. Strings, numbers, integers, booleans, nullable values, arrays, and nested objects are supported. Every object uses `additionalProperties: false` and requires every declared property. Use a nullable type when a value can be unknown. Local `$defs` references and `anyOf` can be edited in JSON. Unsupported keywords fail validation with a field path and correction guidance; they are never silently discarded. The ESG preset alone applies its supplied semantic/evidence checks. Switch to Custom before changing the ESG schema.

Choose an OpenAI model from the account list or enter its ID. Access to a listed model does not guarantee that it supports structured Responses output or every generation option. Leave temperature and reasoning options unset unless supported; use **Test one row** before a large batch. This sends a real request and saves a one-row test output. Provider errors remain visible, with completed rows preserved.

Preview the exact input/prompt and validate the schema before processing. Save reusable presets containing instructions, enums, and schema to the selected output folder. Uploaded or workspace configuration files also remain accessible independently in the explorer. Nested values remain objects/arrays in JSON and are JSON-serialized within CSV cells. Original input columns are retained alongside the chosen output prefix.

## Teaching with the code view

Every step has **Show the Python code**. **Run it yourself** is a short, commented script generated from the settings currently on the page (search, columns, model, instructions, schema), so you can change a setting and show how the code changes. It reads keys from a `.env` file and never contains them; students run it from the `News_Workshop` folder with `.venv/bin/python <script>.py` (Windows: `.venv\Scripts\python`). **Inside the workbench** shows the backend functions that actually run, with file and line numbers, to point out what the workbench adds: checkpoints, retries, and validation of every result. The flowchart at the top of each step is a quick way to explain which parts run locally and which call an online service.

## Keeping work safe

Choose a fresh output filename for each experiment. Explicit replacement applies only to the output selected at submission; an unexpected later change refuses the write. Source inputs are copied into private job snapshots and cannot be overwritten by their own processing job.

A browser refresh reconnects to the queue. A service restart marks unfinished jobs Interrupted. Resume them explicitly after checking the destination and connections. Completed rows are recoverable from the job checkpoint even if the output write failed. Stop the service before moving the project or job-state files. Attach research folders again if their absolute paths change.

In the packaged app, keep API keys in **Connections** with **Remember on this computer** (macOS Keychain / Windows Credential Manager). For source-based development, Connections or a local `.env` both work. Keep `.env`, dependencies, application code, and internal state outside student research roots. Tool settings and designer conversations live in per-user application data so they survive port changes and upgrades. First-time models and live provider calls require internet access. Large input files are currently read into memory for validation/preview and processing; preview pages limit rendering, not total parsing memory.

Students follow the [student guide](student-guide.md): one line in Terminal or PowerShell, or fork the repository and double-click the start script. Their keys and research data stay on their own computers. The packaged installers on [GitHub Releases](https://github.com/TheAliAhmadi/News_Workshop/releases) remain optional; see [publisher signing](publisher-signing.md) before pointing a class at them.

## Design an extraction task by chatting

In **Extract → Instructions & output design**, select **Design with AI**. No input dataset is required. Fresh configurations begin with the ESG starter; existing saved custom work is preserved.

Choose **New design** to describe any extraction task without inheriting ESG fields, or **Refine current design** to work from the instructions, enums, and schema currently in the editors. For example:

> Extract product announcements: product name, launch date, target customer, price if stated, and announcement category.

Choose the design model. It initially follows the extraction model; typing a model ID or choosing an account model overrides it for the design conversation only. **Use extraction model** restores the shared choice. Configure the OpenAI key through Connections.

Click **Generate design** (or Command/Ctrl-Enter). The assistant proposes instructions, named categories, and a validated schema. All three editors update together, and the conversation explains the proposal and its assumptions. Follow up with requests such as “make launch date nullable” or “add a confidence score.” Subsequent turns use your current configuration, including manual edits, as the authoritative starting point. Generated designs run in Custom mode. Selecting ESG starter restores the original ESG configuration and checks.

Use **Undo last generated update** to restore the instructions, enums, and schema from before the latest generated change. **New conversation** clears the chat without clearing the editors. Conversation state is stored by the local backend (not only in the browser), so it survives a different local port or a refreshed tab; interrupted requests require an explicit retry. Only recent chat messages and, when refining, the current design are sent to OpenAI. Dataset rows are not sent by the designer.

Conflicting design controls are disabled during generation, but other tools remain usable. Cancel discards the pending response and preserves your request for retry; a provider request already in progress may still finish. Invalid designs receive at most one automatic repair attempt. Refusals, failed repairs, or connection errors leave the current design unchanged.

Inspect the populated visual/JSON editors, save the generated design with **Save preset**, and use **Test one row** when ready. Preset files contain the reusable instructions, enums, and schema; conversation history stays separate and is not included in dataset jobs. Schema generation itself never starts extraction.
