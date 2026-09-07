import { test, expect, Page } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { basename, join } from "node:path";
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
const active = (page: Page) => page.locator(".tool-container:not([hidden])");
test("explorer, independent tools, nested presets and real worker output", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "News API", exact: true }),
  ).toBeVisible();
  const testFolder = mkdtempSync(join(tmpdir(), "workbench-browser-"));
  await page.getByRole("button", { name: "Open folder", exact: true }).click();
  await page.getByLabel("Absolute folder path").fill(testFolder);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page
    .getByRole("button", { name: basename(testFolder), exact: true })
    .click();
  const suffix = Date.now().toString();
  const filename = `browser_${suffix}.csv`;
  await page.getByLabel("Company name", { exact: true }).fill("Microsoft");
  await page
    .getByLabel("Query", { exact: true })
    .fill('layoffs OR "new hiring"');
  await expect(page.locator(".query-preview code")).toHaveText(
    '"Microsoft" AND (layoffs OR "new hiring")',
  );
  await page.getByRole("checkbox", { name: "Reuters reuters.com" }).check();
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
    .getByRole("button", { name: "Use in Hugging Face", exact: true })
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
  await page.getByRole("button", { name: "Use in LLM", exact: true }).click();
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
  await active(page)
    .getByLabel("Output JSON Schema")
    .fill(JSON.stringify({ ...nested, additionalProperties: true }));
  await active(page)
    .getByRole("button", { name: "Process dataset", exact: true })
    .click();
  await expect(page.locator(".alert-bar")).toContainText(
    "additionalProperties",
  );
  await page.getByRole("button", { name: "Dismiss error" }).click();
  await active(page)
    .getByLabel("Output JSON Schema")
    .fill(JSON.stringify(nested));
  await active(page)
    .getByLabel("Workspace", { exact: true })
    .selectOption({ label: basename(testFolder) });
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
  await page.getByRole("tab", { name: "LLM extraction", exact: true }).click();
  const presetSelect = active(page).getByLabel("Open saved preset");
  const optionValue = await presetSelect
    .locator("option")
    .filter({ hasText: preset })
    .getAttribute("value");
  await presetSelect.selectOption(optionValue!);
  await expect(active(page).getByLabel("Custom instructions")).toHaveValue(
    "Updated custom instructions",
  );
  await page.getByRole("button", { name: `Actions for ${renamed}` }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Clean", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Clean a dataset", exact: true }),
  ).toBeVisible();
  await active(page)
    .getByLabel("Workspace", { exact: true })
    .selectOption({ label: basename(testFolder) });
  await active(page)
    .getByLabel("Filename", { exact: true })
    .fill(`clean_${suffix}.json`);
  await active(page).getByLabel("Format", { exact: true }).selectOption("json");
  await active(page)
    .getByRole("button", { name: "Process dataset", exact: true })
    .click();
  const job = page
    .locator(".job-row")
    .filter({ hasText: `clean_${suffix}.json` });
  await expect(job).toContainText("completed", { timeout: 30000 });
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
  await expect(separator).toHaveAttribute("aria-valuenow", "280");
  await page.reload();
  await expect(
    page.locator(".job-row").filter({ hasText: `clean_${suffix}.json` }),
  ).toContainText("completed");
  await page.getByRole("tab", { name: "News API", exact: true }).click();
  await expect(page.getByLabel("Company name", { exact: true })).toHaveValue(
    "Microsoft",
  );
  expect(errors).toEqual([]);
});

test("human assessment and mapped aggregation use independent files", async ({
  page,
  request,
}) => {
  const suffix = Date.now().toString();
  const boot = await (await request.get("/api/bootstrap")).json();
  const testFolder = mkdtempSync(join(tmpdir(), "workbench-review-"));
  const attached = await (
    await request.post("/api/roots", {
      headers: { "x-workbench-token": boot.token },
      data: { path: testFolder },
    })
  ).json();
  const coded = [
    {
      firm: "Fictional Acme",
      date: "2026-09-01",
      relevant: true,
      dimension: "environmental",
      relationship: "firm_action",
      theme: "emissions",
    },
    {
      firm: "Fictional Acme",
      date: "2026-09-02",
      relevant: true,
      dimension: "social",
      relationship: "firm_response",
      theme: "labor",
    },
    {
      firm: "Fictional Acme",
      date: "invalid",
      relevant: false,
      dimension: "none",
      relationship: "other",
      theme: "other_theme",
    },
  ];
  const response = await request.post("/api/upload", {
    headers: { "x-workbench-token": boot.token },
    multipart: {
      root: attached.id,
      file: {
        name: `coded_${suffix}.json`,
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(coded)),
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const ref = await response.json();
  await page.goto("/");
  await page
    .getByRole("tab", { name: "Human validation", exact: true })
    .click();
  await active(page)
    .getByLabel("Input dataset")
    .selectOption(JSON.stringify(ref));
  await active(page)
    .getByRole("checkbox", { name: "dimension", exact: true })
    .check();
  await active(page)
    .getByRole("button", { name: "Load review sample" })
    .click();
  await expect(active(page).locator(".review-record")).toHaveCount(3);
  for (let i = 0; i < 3; i++)
    await active(page)
      .locator(".review-record")
      .nth(i)
      .getByLabel("dimension", { exact: true })
      .fill(coded[i].dimension);
  await active(page)
    .getByLabel("Workspace", { exact: true })
    .selectOption(attached.id);
  await active(page)
    .getByLabel("Filename", { exact: true })
    .fill(`human_${suffix}.csv`);
  await active(page)
    .getByRole("button", { name: "Save human labels & assess" })
    .click();
  await expect(active(page).locator("pre.notice")).toContainText(
    '"agreement": 1',
  );
  await page
    .getByRole("tab", { name: "Aggregate / export", exact: true })
    .click();
  await active(page)
    .getByLabel("Input dataset")
    .selectOption(JSON.stringify(ref));
  for (const [label, column] of Object.entries({
    Firm: "firm",
    Date: "date",
    Relevance: "relevant",
    Dimension: "dimension",
    Relationship: "relationship",
    Theme: "theme",
  }))
    await active(page).getByLabel(label, { exact: true }).selectOption(column);
  await active(page)
    .getByLabel("Workspace", { exact: true })
    .selectOption(attached.id);
  await active(page)
    .getByLabel("Filename", { exact: true })
    .fill(`aggregate_${suffix}.json`);
  await active(page).getByLabel("Format", { exact: true }).selectOption("json");
  await active(page)
    .getByRole("button", { name: "Aggregate & export" })
    .click();
  const job = page
    .locator(".job-row")
    .filter({ hasText: `aggregate_${suffix}.json` });
  await expect(job).toContainText("completed", { timeout: 30000 });
  await job.locator(".job-name").click();
  await expect(page.getByRole("dialog")).toContainText(
    '"invalid_publication_dates": 1',
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await job.getByRole("button", { name: "Open result", exact: true }).click();
  await expect(
    page.locator(".file-container:not([hidden]) .dataset-summary"),
  ).toContainText("1 rows");
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
  await page.getByRole("tab", { name: "LLM extraction", exact: true }).click();
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
  await page.getByRole("tab", { name: "News API", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "News API", exact: true }),
  ).toBeVisible();
});
