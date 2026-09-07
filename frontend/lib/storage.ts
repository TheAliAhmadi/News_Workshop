import { api } from "./api";

// Settings used to live in browser storage, which is scoped to the address of
// the page. A different local port therefore looked like data loss. They now
// live with the backend; these keys exist only to adopt what a student already
// had, once.
export const LEGACY_CONFIG_KEY = "research-workbench-config-v2";
export const LEGACY_DESIGNER_PREFIX = "research-workbench-designer-v1:";

export type BrowserState = {
  tools: Record<string, unknown>;
  designer: Record<string, unknown>;
};

function parse(value: string | null): unknown {
  try {
    return JSON.parse(value || "null");
  } catch {
    return null;
  }
}

export function readBrowserState(): BrowserState {
  const state: BrowserState = { tools: {}, designer: {} };
  if (typeof localStorage === "undefined") return state;
  try {
    const tools = parse(localStorage.getItem(LEGACY_CONFIG_KEY));
    if (tools && typeof tools === "object")
      state.tools = tools as Record<string, unknown>;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(LEGACY_DESIGNER_PREFIX)) continue;
      const session = parse(localStorage.getItem(key));
      if (session && typeof session === "object")
        state.designer[key.slice(LEGACY_DESIGNER_PREFIX.length)] = session;
    }
  } catch {
    // Storage can be unavailable or full. An import that cannot read is simply skipped.
  }
  return state;
}

/**
 * Load tool preferences from the backend, adopting any existing browser
 * settings the first time. Custom schemas and drafts are preserved.
 */
export async function loadPreferences(): Promise<Record<string, any>> {
  let stored = await api<{
    tools: Record<string, any>;
    imported_browser_settings: boolean;
  }>("/preferences");
  const empty = !stored.tools || !Object.keys(stored.tools).length;
  if (empty && !stored.imported_browser_settings) {
    const browser = readBrowserState();
    if (
      Object.keys(browser.tools).length ||
      Object.keys(browser.designer).length
    ) {
      await api("/preferences/import", browser);
      stored = await api("/preferences");
    }
  }
  return stored.tools || {};
}

export async function savePreferences(tools: Record<string, unknown>) {
  await api("/preferences", { tools });
}

export const designerSessionPath = (workspace: string) =>
  "/designer-sessions/" + encodeURIComponent(workspace);
