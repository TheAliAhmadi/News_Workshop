export type Ref = { root: string; path: string };
export type Entry = Ref & { name: string; kind: "file" | "folder" };
export type Root = { id: string; name: string; path: string };
let token = "";
export function setToken(value: string) {
  token = value;
}
export async function api<T = any>(
  path: string,
  body?: any,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch("/api" + path, {
    signal,
    method: body === undefined ? "GET" : "POST",
    headers:
      body instanceof FormData
        ? { "x-workbench-token": token }
        : { "Content-Type": "application/json", "x-workbench-token": token },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(
      typeof value.detail === "string"
        ? value.detail
        : JSON.stringify(value.detail),
    );
  return value;
}
export const query = (ref: Ref) => new URLSearchParams(ref).toString();
export const keyOf = (ref: Ref) => ref.root + ":" + ref.path;
export const pretty = (value: any) => JSON.stringify(value, null, 2);
export const formatBytes = (bytes: number) =>
  bytes >= 1024 ** 3
    ? (bytes / 1024 ** 3).toFixed(1) + " GB"
    : Math.round(bytes / 1024 ** 2) + " MB";
