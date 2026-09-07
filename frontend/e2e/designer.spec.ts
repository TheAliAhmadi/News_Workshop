import { test, expect, Page } from "@playwright/test";
const active = (page: Page) => page.locator(".tool-container:not([hidden])");
const design = {
  instructions: "Extract products from the record. Use null for unknown names.",
  enums: { category: ["hardware", "software"] },
  schema: {
    type: "object",
    properties: {
      product_name: { type: ["string", "null"] },
      category: { type: "string", enum: ["hardware", "software"] },
      features: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" } },
          required: ["name"],
          additionalProperties: false,
        },
      },
    },
    required: ["product_name", "category", "features"],
    additionalProperties: false,
  },
  preset: "custom",
};
async function openDesigner(page: Page) {
  await page.goto("/");
  await page.getByRole("tab", { name: "LLM extraction", exact: true }).click();
  await active(page)
    .getByRole("button", { name: "Design with AI", exact: true })
    .click();
  await expect(page.getByLabel("Describe your extraction task")).toBeEnabled();
}
test("independent generation, refinements, manual edits, undo, model override and preset round trip", async ({
  page,
  request,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const bodies: any[] = [];
  await page.route("**/api/models/openai", (route) =>
    route.fulfill({ json: ["design-model", "extraction-model"] }),
  );
  await page.route("**/api/extraction-design", async (route) => {
    const body = route.request().postDataJSON();
    bodies.push(body);
    const value =
      bodies.length === 1
        ? design
        : {
            ...body.current_design,
            instructions:
              body.current_design.instructions + " Include confidence.",
            schema: {
              ...body.current_design.schema,
              properties: {
                ...body.current_design.schema.properties,
                confidence: { type: ["number", "null"] },
              },
              required: [...body.current_design.schema.required, "confidence"],
            },
          };
    await route.fulfill({
      json: {
        kind: "design",
        message: "Product fields and categories are ready.",
        design: value,
      },
    });
  });
  await openDesigner(page);
  await expect(active(page)).toContainText("ESG evidence checks enabled");
  await expect(active(page).getByLabel("Input dataset")).toHaveValue("");
  await active(page)
    .getByLabel("Model ID", { exact: true })
    .fill("extraction-model");
  await expect(page.getByLabel("Design model", { exact: true })).toHaveValue(
    "extraction-model",
  );
  await page.getByRole("button", { name: "Load design models" }).click();
  await page.getByLabel("Design account models").selectOption("design-model");
  await page.getByRole("button", { name: "Use product example" }).click();
  await page
    .getByRole("button", { name: "Generate design", exact: true })
    .click();
  await expect(active(page).getByLabel("Custom instructions")).toHaveValue(
    design.instructions,
  );
  await expect(active(page)).toContainText("Custom · no ESG requirements");
  expect(bodies[0].current_design).toBeNull();
  expect(bodies[0].mode).toBe("new");
  expect(bodies[0].model).toBe("design-model");
  expect(bodies[0]).not.toHaveProperty("input");
  await active(page)
    .getByRole("button", { name: "JSON Schema", exact: true })
    .click();
  expect(
    JSON.parse(
      await active(page).getByLabel("Output JSON Schema").inputValue(),
    ),
  ).toEqual(design.schema);
  await active(page)
    .getByLabel("Custom instructions")
    .fill("Manual instructions must survive.");
  await page
    .getByLabel("Describe your extraction task")
    .fill("Add nullable confidence.");
  await page.getByRole("button", { name: "Send refinement" }).click();
  await expect(active(page).getByLabel("Custom instructions")).toHaveValue(
    "Manual instructions must survive. Include confidence.",
  );
  expect(bodies[1].current_design.instructions).toBe(
    "Manual instructions must survive.",
  );
  expect(bodies[1].history).toHaveLength(2);
  await page
    .getByRole("button", { name: "Undo last generated update" })
    .click();
  await expect(active(page).getByLabel("Custom instructions")).toHaveValue(
    "Manual instructions must survive.",
  );
  expect(
    JSON.parse(
      await active(page).getByLabel("Output JSON Schema").inputValue(),
    ),
  ).toEqual(design.schema);
  await page.reload();
  await page.getByRole("tab", { name: "LLM extraction", exact: true }).click();
  await active(page)
    .getByRole("button", { name: "Design with AI", exact: true })
    .click();
  await expect(page.getByRole("log")).toContainText("Product fields");
  await expect(page.getByLabel("Design model", { exact: true })).toHaveValue(
    "design-model",
  );
  await expect(active(page).getByLabel("Custom instructions")).toHaveValue(
    "Manual instructions must survive.",
  );
  await page
    .getByRole("button", { name: "New conversation", exact: true })
    .click();
  await expect(page.getByRole("log")).not.toContainText("Product fields");
  await expect(active(page).getByLabel("Custom instructions")).toHaveValue(
    "Manual instructions must survive.",
  );
  await active(page)
    .getByRole("button", { name: "Save preset", exact: true })
    .click();
  const filename = `generated_preset_${Date.now()}.json`;
  await page.getByLabel("Preset filename").fill(filename);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save preset", exact: true })
    .click();
  const boot = await (await request.get("/api/bootstrap")).json();
  const saved = await (
    await request.get("/api/download", {
      params: { root: boot.roots[0].id, path: filename },
    })
  ).json();
  expect(saved.schema).toEqual(design.schema);
  expect(saved.enums).toEqual(design.enums);
  expect(saved.preset).toBe("custom");
  expect(saved).not.toHaveProperty("history");
  await active(page)
    .getByRole("button", { name: "ESG starter", exact: true })
    .click();
  await expect(active(page)).toContainText("ESG evidence checks enabled");
  const select = active(page).getByLabel("Open saved preset");
  const value = await select
    .locator("option")
    .filter({ hasText: filename })
    .getAttribute("value");
  await select.selectOption(value!);
  await expect(active(page)).toContainText("Custom · no ESG requirements");
  expect(errors).toEqual([]);
});
test("clarifications and failures preserve fields; cancelled and stale replies are discarded", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  let requested = 0;
  await page.route("**/api/extraction-design", async (route) => {
    requested++;
    if (requested === 1)
      return route.fulfill({
        json: {
          kind: "clarification",
          message: "Which information should be extracted?",
          design: null,
        },
      });
    if (requested === 2)
      return route.fulfill({
        status: 400,
        json: { detail: "Design failed validation after one repair attempt." },
      });
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route
      .fulfill({ json: { kind: "design", message: "Late response", design } })
      .catch(() => {});
  });
  await openDesigner(page);
  const original = await active(page)
    .getByLabel("Custom instructions")
    .inputValue();
  await page.getByLabel("Design model", { exact: true }).fill("design-model");
  await page.getByLabel("Describe your extraction task").fill("Help me design");
  await page
    .getByRole("button", { name: "Generate design", exact: true })
    .click();
  await expect(page.getByRole("log")).toContainText("Which information");
  await expect(active(page).getByLabel("Custom instructions")).toHaveValue(
    original,
  );
  await page
    .getByLabel("Describe your extraction task")
    .fill("Product announcements");
  await page.getByRole("button", { name: "Send refinement" }).click();
  await expect(
    page.locator('.extraction-designer [role="alert"]'),
  ).toContainText("repair attempt");
  await expect(active(page).getByLabel("Custom instructions")).toHaveValue(
    original,
  );
  await page.getByRole("button", { name: "Send refinement" }).click();
  await expect(active(page).getByLabel("Custom instructions")).toBeDisabled();
  await expect.poll(() => requested).toBe(3);
  await page.getByRole("tab", { name: "News API", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "News API", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "LLM extraction", exact: true }).click();
  await page.getByRole("button", { name: "Cancel generation" }).click();
  release!();
  await expect(active(page).getByLabel("Custom instructions")).toBeEnabled();
  await expect(active(page).getByLabel("Custom instructions")).toHaveValue(
    original,
  );
  await page.getByRole("button", { name: "Send refinement" }).click();
  await expect.poll(() => requested).toBe(4);
  // An earlier asynchronous preset import can finish during generation.
  await page
    .locator("fieldset.design-editors")
    .evaluate((node) => node.removeAttribute("disabled"));
  await active(page)
    .getByLabel("Custom instructions")
    .fill("Late manual import");
  release!();
  await expect(page.locator(".designer-notice")).toContainText("discarded");
  await expect(active(page).getByLabel("Custom instructions")).toHaveValue(
    "Late manual import",
  );
});
test("refresh recovery requires retry and preserves existing custom configurations", async ({
  page,
  request,
}) => {
  // Preferences and conversations are backend state, so the interrupted
  // condition is set up there rather than in browser storage.
  const boot = await (await request.get("/api/bootstrap")).json();
  const headers = { "x-workbench-token": boot.token };
  const root = boot.roots[0].id;
  await request.post("/api/preferences", {
    headers,
    data: {
      tools: {
        llm: {
          columns: [],
          context_columns: [],
          word_limit: 150,
          row_limit: 0,
          prefix: "llm_",
          model: "extraction-model",
          preset: "custom",
          schemaText: JSON.stringify(design.schema),
          enumsText: JSON.stringify(design.enums),
          instructions: "Existing custom work",
          destination: { filename: "output.json", format: "json", path: "" },
          filter: { column: "", mode: "include", values: [] },
        },
      },
    },
  });
  await request.post(`/api/designer-sessions/${root}`, {
    headers,
    data: {
      draft: "Request ready to retry",
      history: [],
      mode: "refine",
      followModel: true,
      model: "",
      pending: true,
      undo: null,
    },
  });
  let requests = 0;
  await page.route("**/api/extraction-design", (route) => {
    requests++;
    return route.fulfill({
      json: { kind: "design", message: "Recovered", design },
    });
  });
  await openDesigner(page);
  await expect(active(page).getByLabel("Custom instructions")).toHaveValue(
    "Existing custom work",
  );
  await expect(page.locator(".designer-notice")).toContainText("interrupted");
  await expect(page.getByLabel("Describe your extraction task")).toHaveValue(
    "Request ready to retry",
  );
  expect(requests).toBe(0);
  await page
    .getByRole("button", { name: "Generate design", exact: true })
    .click();
  await expect(active(page).getByLabel("Custom instructions")).toHaveValue(
    design.instructions,
  );
  expect(requests).toBe(1);
});
test("settings survive the application reopening on a different local port", async ({
  page,
  request,
}) => {
  // Browser storage is scoped to the address of the page, so a new port used to
  // look like data loss. Backend storage must be returned to either address.
  const boot = await (await request.get("/api/bootstrap")).json();
  await request.post("/api/preferences", {
    headers: { "x-workbench-token": boot.token },
    data: {
      tools: {
        llm: {
          ...design,
          columns: [],
          context_columns: [],
          word_limit: 150,
          row_limit: 0,
          prefix: "llm_",
          model: "extraction-model",
          schemaText: JSON.stringify(design.schema),
          enumsText: JSON.stringify(design.enums),
          instructions: "Kept across addresses",
          destination: { filename: "output.json", format: "json", path: "" },
          filter: { column: "", mode: "include", values: [] },
        },
      },
    },
  });
  await page.goto("/");
  await page.getByRole("tab", { name: "LLM extraction", exact: true }).click();
  await expect(active(page).getByLabel("Custom instructions")).toHaveValue(
    "Kept across addresses",
  );
  // A page with no browser storage at all still receives the same settings.
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("tab", { name: "LLM extraction", exact: true }).click();
  await expect(active(page).getByLabel("Custom instructions")).toHaveValue(
    "Kept across addresses",
  );
});
