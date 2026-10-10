import { test, expect, Page } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const csv =
  "title,description,content,company,published_at\nFictional clean energy news,Fictional software test,Acme reduces emissions.,Acme,2026-09-01\nFictional board news,Fictional software test,Acme appoints a director.,Acme,2026-09-02\n";
const nested = {
  type: "object",
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: ["string", "null"] },
          count: { type: "integer" },
          confirmed: { type: "boolean" },
          score: { type: "number" },
          category: { type: "string", enum: ["a", "b"] },
        },
        required: ["name", "count", "confirmed", "score", "category"],
        additionalProperties: false,
      },
    },
  },
  required: ["events"],
  additionalProperties: false,
};
const step = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Workflow steps" })
    .getByRole("button", { name: new RegExp("^\\d\\s*" + name) });
const active = (page: Page) => page.locator(".tool-container:not([hidden])");
/** Open a folded "More …" section on the current step if it is closed. */
const more = async (page: Page, label: string) => {
  const details = active(page)
    .locator("details.more")
    .filter({ has: page.locator("summary", { hasText: label }) });
  if ((await details.getAttribute("open")) === null)
    await details.locator("summary").click();
};
test("explorer, independent tools, nested presets and real worker output", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Collect news", exact: true }),
  ).toBeVisible();
  // The test server's home folder is a temporary directory (see e2e.sh).
  const folderName = `workbench-browser-${Date.now()}`;
  await page.getByRole("button", { name: "Open folder", exact: true }).click();
  const picker = page.getByRole("dialog", { name: "Open a folder" });
  await picker.getByRole("button", { name: "New folder here" }).click();
  await picker.getByLabel("New folder name").fill(folderName);
  await picker.getByRole("button", { name: "Create", exact: true }).click();
  await expect(picker.locator(".picker-path")).toContainText(folderName);
  await picker
    .getByRole("button", { name: `Open: ${folderName}`, exact: true })
    .click();
  await expect(picker).toBeHidden();
  await page.getByRole("button", { name: folderName, exact: true }).click();
  const suffix = Date.now().toString();
  const filename = `browser_${suffix}.csv`;
  await page.getByLabel("Company name", { exact: true }).fill("Microsoft");
  await page
    .getByLabel("Query", { exact: true })
    .fill('layoffs OR "new hiring"');
  await expect(page.locator(".query-preview code")).toHaveText(
    '"Microsoft" AND (layoffs OR "new hiring")',
  );
  await more(page, "More search options");
  await page.getByRole("checkbox", { name: "Reuters reuters.com" }).check();
  // The Python behind this step uses the settings on the page.
  await active(page)
    .getByRole("button", { name: "Show the Python code" })
    .click();
  const code = page.getByRole("dialog");
  await expect(code).toContainText("company = 'Microsoft'");
  await expect(code).toContainText("'domains': 'reuters.com'");
  await expect(
    code.getByRole("button", { name: "Download collect_news.py" }),
  ).toBeVisible();
  await code.getByRole("tab", { name: "Inside the workbench" }).click();
  await expect(code).toContainText("def news_process(ctx, config):");
  await page.keyboard.press("Escape");
  await page.locator(".icon-upload input").setInputFiles({
    name: filename,
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: filename, exact: true }).click();
  await expect(page.locator(".dataset-summary")).toContainText("2 rows");
  await page.locator("tbody tr").first().press("Enter");
  await expect(page.getByRole("dialog")).toContainText(
    "Fictional clean energy news",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: `Actions for ${filename}` }).click();
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  const renamed = `renamed_${suffix}.csv`;
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(renamed);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page.getByRole("button", { name: `Actions for ${renamed}` }).click();
  await page
    .getByRole("button", { name: "Use in Classify", exact: true })
    .click();
  await expect(active(page).getByLabel("Input dataset")).toContainText(renamed);
  await active(page).getByRole("button", { name: "Move content up" }).click();
  await active(page)
    .getByRole("button", { name: "Preview exact input", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Fictional clean energy news Acme reduces emissions. Fictional software test",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: `Actions for ${renamed}` }).click();
  await page
    .getByRole("button", { name: "Use in Extract", exact: true })
    .click();
  await active(page)
    .getByRole("button", { name: "Blank custom schema", exact: true })
    .click();
  await active(page)
    .getByLabel("Model ID", { exact: true })
    .fill("manual-model-for-validation");
  await active(page)
    .getByRole("button", { name: "JSON Schema", exact: true })
    .click();
  await active(page)
    .getByLabel("Output JSON Schema")
    .fill(JSON.stringify(nested));
  await active(page)
    .getByRole("button", { name: "Field builder", exact: true })
    .click();
  await expect(active(page).getByLabel("Field name").first()).toHaveValue(
    "events",
  );
  await active(page)
    .getByRole("button", { name: "JSON Schema", exact: true })
    .click();
  expect(
    JSON.parse(
      await active(page).getByLabel("Output JSON Schema").inputValue(),
    ),
  ).toEqual(nested);
  await more(page, "Allowed-value lists");
  await active(page).getByRole("button", { name: "JSON", exact: true }).click();
  await active(page).getByLabel("Enums JSON").fill('{"category":["a","b"]}');
  await active(page)
    .getByRole("button", { name: "Lists", exact: true })
    .click();
  await expect(active(page).getByLabel("Enum name")).toHaveValue("category");
  await active(page)
    .getByRole("button", { name: "Validate schema", exact: true })
    .click();
  await expect(active(page).locator(".success-message")).toContainText("valid");
  await active(page)
    .getByRole("button", { name: "Preview exact input & prompt" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Article text");
  await expect(page.getByRole("dialog")).not.toContainText("FinBERT");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  // Extraction needs a key before it can run; a session-only placeholder is
  // enough to reach the backend's schema validation.
  await active(page).getByRole("button", { name: "Add key" }).click();
  await page
    .getByRole("dialog")
    .getByLabel(/^OpenAI key/)
    .fill("sk-placeholder-for-tests");
  await page.getByRole("button", { name: "Save connections" }).click();
  await expect(active(page).locator(".callout")).toHaveCount(0);
  await active(page)
    .getByLabel("Output JSON Schema")
    .fill(JSON.stringify({ ...nested, additionalProperties: true }));
  await active(page)
    .getByRole("button", { name: "Extract from all rows", exact: true })
    .click();
  await expect(page.locator(".alert-bar")).toContainText(
    "additionalProperties",
  );
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await active(page)
    .getByLabel("Output JSON Schema")
    .fill(JSON.stringify(nested));
  await more(page, "More save options");
  await active(page)
    .getByLabel("Workspace", { exact: true })
    .selectOption({ label: folderName });
  await more(page, "Load or save");
  await active(page)
    .getByRole("button", { name: "Save preset", exact: true })
    .click();
  const preset = `preset_${suffix}.json`;
  await page.getByLabel("Preset filename").fill(preset);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save preset", exact: true })
    .click();
  await page.getByRole("button", { name: preset, exact: true }).click();
  await expect(page.getByLabel("Configuration file contents")).toHaveValue(
    /events/,
  );
  const original = JSON.parse(
    await page.getByLabel("Configuration file contents").inputValue(),
  );
  expect(original.schema).toEqual(nested);
  original.instructions = "Updated custom instructions";
  await page
    .getByLabel("Configuration file contents")
    .fill(JSON.stringify(original));
  await page
    .locator(".file-container:not([hidden])")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await step(page, "Extract").click();
  const presetSelect = active(page).getByLabel("Open saved preset");
  const optionValue = await presetSelect
    .locator("option")
    .filter({ hasText: preset })
    .getAttribute("value");
  await presetSelect.selectOption(optionValue!);
  await expect(active(page).getByLabel("Custom instructions")).toHaveValue(
    "Updated custom instructions",
  );
  // A real worker job. The Clean step has no screen any more, but the job
  // system still runs it, which needs no network or model download.
  const boot = await (await request.get("/api/bootstrap")).json();
  const roots = await (await request.get("/api/roots")).json();
  const root = roots.find((r: any) => r.name === folderName);
  const submitted = await request.post("/api/jobs", {
    headers: { "x-workbench-token": boot.token },
    data: {
      tool: "clean",
      input: { root: root.id, path: renamed },
      config: {},
      destination: {
        root: root.id,
        path: "",
        filename: `clean_${suffix}.json`,
        format: "json",
      },
    },
  });
  expect(submitted.ok()).toBeTruthy();
  const job = page
    .locator(".job-row")
    .filter({ hasText: `clean_${suffix}.json` });
  await expect(job).toContainText("Done", { timeout: 30000 });
  await job.getByRole("button", { name: "Open result", exact: true }).click();
  await expect(
    page.locator(".file-container:not([hidden]) .dataset-summary"),
  ).toContainText("2 rows");
  const downloadPromise = page.waitForEvent("download");
  await page
    .locator(".file-container:not([hidden])")
    .getByRole("link", { name: "Download", exact: true })
    .click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    `clean_${suffix}.json`,
  );
  const separator = page.getByRole("separator", { name: "Resize explorer" });
  await separator.focus();
  await page.keyboard.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "300");
  await page.reload();
  await expect(
    page.locator(".job-row").filter({ hasText: `clean_${suffix}.json` }),
  ).toContainText("Done");
  await step(page, "Collect").click();
  await expect(page.getByLabel("Company name", { exact: true })).toHaveValue(
    "Microsoft",
  );
  await page.getByRole("button", { name: "Clear history" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Clear history" })
    .click();
  await expect(page.locator(".job-row")).toHaveCount(0);
  await page.getByRole("button", { name: `Actions for ${renamed}` }).click();
  await page.getByRole("button", { name: "Delete…" }).click();
  await page
    .getByRole("dialog", { name: `Delete ${renamed}?` })
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: renamed, exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("configuration Save As chooses a folder and duplicate visual names keep both fields", async ({
  page,
  request,
}) => {
  const sourceName = `instructions_${Date.now()}.md`;
  const boot = await (await request.get("/api/bootstrap")).json();
  const headers = { "x-workbench-token": boot.token };
  const folder = mkdtempSync(join(tmpdir(), "workbench-config-"));
  const root = await (
    await request.post("/api/roots", { headers, data: { path: folder } })
  ).json();
  await request.post("/api/folders", {
    headers,
    data: { root: root.id, path: "presets" },
  });
  await request.post("/api/text", {
    headers,
    data: {
      file: { root: root.id, path: sourceName },
      content: "Original instructions",
    },
  });
  await page.goto("/");
  await page.getByRole("button", { name: sourceName, exact: true }).click();
  await page.getByLabel("Configuration file contents").fill("Independent copy");
  await page.getByRole("button", { name: "Save As…", exact: true }).click();
  await page.getByLabel("Save As workspace").selectOption(root.id);
  await page.getByLabel("Save As folder").selectOption("presets");
  await page.getByLabel("New filename").fill("copied.md");
  await page
    .getByRole("button", { name: "Save new file", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Save configuration as" }),
  ).toBeHidden();
  const copy = await request.get("/api/download", {
    params: { root: root.id, path: "presets/copied.md" },
  });
  expect(await copy.text()).toBe("Independent copy");
  const original = await request.get("/api/download", {
    params: { root: root.id, path: sourceName },
  });
  expect(await original.text()).toBe("Original instructions");
  await step(page, "Extract").click();
  await active(page)
    .getByRole("button", { name: "JSON Schema", exact: true })
    .click();
  const schema = {
    type: "object",
    properties: { first: { type: "string" }, second: { type: "string" } },
    required: ["first", "second"],
    additionalProperties: false,
  };
  await active(page)
    .getByLabel("Output JSON Schema")
    .fill(JSON.stringify(schema));
  await active(page)
    .getByRole("button", { name: "Field builder", exact: true })
    .click();
  await active(page).getByLabel("Field name").nth(1).fill("first");
  await expect(active(page).getByLabel("Field name")).toHaveCount(2);
  await active(page)
    .getByRole("button", { name: "JSON Schema", exact: true })
    .click();
  expect(
    JSON.parse(
      await active(page).getByLabel("Output JSON Schema").inputValue(),
    ),
  ).toEqual(schema);
  await active(page).getByLabel("Output JSON Schema").fill("null");
  await active(page)
    .getByRole("button", { name: "Field builder", exact: true })
    .click();
  await expect(active(page).locator(".inline-error")).toContainText(
    "Fix invalid JSON",
  );
  await step(page, "Collect").click();
  await expect(
    page.getByRole("heading", { name: "Collect news", exact: true }),
  ).toBeVisible();
});
