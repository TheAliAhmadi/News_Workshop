"use client";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Check, Field, ImportText } from "./fields";
import { pretty } from "@/lib/api";
type Schema = Record<string, any>;
const object = () => ({
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
});
function NodeEditor({
  node,
  set,
  enums,
  depth = 0,
}: {
  node: Schema;
  set: (n: Schema) => void;
  enums: Schema;
  depth?: number;
}) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return (
      <p className="inline-error">
        This field needs a schema object. Correct it in the JSON editor.
      </p>
    );
  }
  const rawType = Array.isArray(node.type)
    ? node.type.find((t: string) => t !== "null")
    : node.type;
  const nullable = Array.isArray(node.type) && node.type.includes("null");
  const type = node.enum ? "enum" : rawType || "reference";
  const changeType = (t: string) => {
    let n: Schema = { type: t === "enum" ? "string" : t };
    if (t === "object") n = object();
    if (t === "array") n.items = { type: "string" };
    if (t === "enum") n.enum = ["value"];
    set(n);
  };
  if (node.$ref || node.anyOf)
    return (
      <div className="hint">
        Referenced or union field: <code>{node.$ref || "anyOf"}</code>. Edit its
        definition in JSON to preserve the exact schema.
      </div>
    );
  return (
    <div className="schema-node">
      <div className="schema-type">
        <select
          aria-label="Field type"
          value={type}
          onChange={(e) => changeType(e.target.value)}
        >
          {[
            "string",
            "number",
            "integer",
            "boolean",
            "enum",
            "array",
            "object",
          ].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <Check
          label="Nullable"
          value={nullable}
          set={(v) =>
            set({
              ...node,
              type: v ? [rawType, "null"] : rawType,
              ...(node.enum
                ? {
                    enum: v
                      ? [...node.enum.filter((x: any) => x !== null), null]
                      : node.enum.filter((x: any) => x !== null),
                  }
                : {}),
            })
          }
        />
        <input
          aria-label="Field description"
          placeholder="Description (optional)"
          value={node.description || ""}
          onChange={(e) => set({ ...node, description: e.target.value })}
        />
      </div>
      {type === "enum" && (
        <div className="grid2">
          <Field label="Allowed values (comma separated)">
            <input
              value={node.enum.filter((x: any) => x !== null).join(", ")}
              onChange={(e) =>
                set({
                  ...node,
                  enum: [
                    ...e.target.value.split(",").map((s) => s.trim()),
                    ...(nullable ? [null] : []),
                  ],
                })
              }
            />
          </Field>
          <Field label="Copy a named enum">
            <select
              value=""
              onChange={(e) =>
                e.target.value &&
                set({
                  ...node,
                  enum: [...enums[e.target.value], ...(nullable ? [null] : [])],
                })
              }
            >
              <option value="">Choose named list…</option>
              {Object.keys(enums).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {type === "array" && (
        <div className="schema-nested">
          <span className="label">Array items</span>
          <NodeEditor
            node={node.items || { type: "string" }}
            set={(items) => set({ ...node, items })}
            enums={enums}
            depth={depth + 1}
          />
        </div>
      )}
      {type === "object" && (
        <div className="schema-nested">
          {Object.entries(node.properties || {}).map(([name, child], idx) => (
            <div className="schema-property" key={idx}>
              <div className="property-name">
                <input
                  aria-label="Field name"
                  value={name}
                  onChange={(e) => {
                    const duplicate =
                      e.target.value !== name &&
                      e.target.value in node.properties;
                    e.target.setCustomValidity(
                      duplicate ? "A field with this name already exists." : "",
                    );
                    if (duplicate) {
                      e.target.reportValidity();
                      return;
                    }
                    const entries = Object.entries(node.properties).map(
                      ([k, v]) => [k === name ? e.target.value : k, v],
                    );
                    const properties = Object.fromEntries(entries);
                    set({
                      ...node,
                      properties,
                      required: Object.keys(properties),
                    });
                  }}
                />
                <button
                  aria-label={"Remove field " + name}
                  onClick={() => {
                    const properties = { ...node.properties };
                    delete properties[name];
                    set({
                      ...node,
                      properties,
                      required: Object.keys(properties),
                    });
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <NodeEditor
                node={child as Schema}
                set={(v) =>
                  set({
                    ...node,
                    properties: { ...node.properties, [name]: v },
                  })
                }
                enums={enums}
                depth={depth + 1}
              />
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              let name = "field";
              let n = 1;
              while (name in (node.properties || {})) name = "field_" + n++;
              const properties = {
                ...node.properties,
                [name]: { type: "string" },
              };
              set({
                ...node,
                properties,
                required: Object.keys(properties),
                additionalProperties: false,
              });
            }}
          >
            <Plus size={14} /> Add field
          </Button>
        </div>
      )}
    </div>
  );
}
export function SchemaBuilder({
  text,
  set,
  enumsText,
}: {
  text: string;
  set: (s: string) => void;
  enumsText: string;
}) {
  let schema, enums;
  try {
    schema = JSON.parse(text);
    enums = JSON.parse(enumsText);
    if (
      !schema ||
      typeof schema !== "object" ||
      Array.isArray(schema) ||
      !enums ||
      typeof enums !== "object" ||
      Array.isArray(enums)
    )
      throw Error();
  } catch {
    return (
      <p className="inline-error">
        Fix invalid JSON in the editors before using the field builder.
      </p>
    );
  }
  return <NodeEditor node={schema} set={(n) => set(pretty(n))} enums={enums} />;
}
export function EnumBuilder({
  text,
  set,
}: {
  text: string;
  set: (s: string) => void;
}) {
  let enums: Schema;
  try {
    enums = JSON.parse(text);
    if (Array.isArray(enums) || !enums || typeof enums !== "object")
      throw Error();
  } catch {
    return (
      <p className="inline-error">
        Enums must be a JSON object of named lists.
      </p>
    );
  }
  return (
    <div className="enum-builder">
      {Object.entries(enums).map(([name, values], idx) => (
        <div className="enum-row" key={idx}>
          <input
            aria-label="Enum name"
            value={name}
            onChange={(e) => {
              const duplicate =
                e.target.value !== name && e.target.value in enums;
              e.target.setCustomValidity(
                duplicate ? "A named list with this name already exists." : "",
              );
              if (duplicate) {
                e.target.reportValidity();
                return;
              }
              set(
                pretty(
                  Object.fromEntries(
                    Object.entries(enums).map(([k, v]) => [
                      k === name ? e.target.value : k,
                      v,
                    ]),
                  ),
                ),
              );
            }}
          />
          <input
            aria-label={"Values for " + name}
            value={Array.isArray(values) ? values.join(", ") : ""}
            placeholder="value one, value two"
            onChange={(e) =>
              set(
                pretty({
                  ...enums,
                  [name]: e.target.value.split(",").map((s) => s.trim()),
                }),
              )
            }
          />
          <button
            aria-label={"Remove enum " + name}
            onClick={() => {
              const next = { ...enums };
              delete next[name];
              set(pretty(next));
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          let name = "category";
          let i = 1;
          while (name in enums) name = "category_" + i++;
          set(pretty({ ...enums, [name]: ["value"] }));
        }}
      >
        <Plus size={14} /> Add named list
      </Button>
      <p className="hint">
        Named lists are included in the prompt. Copy a list into a field’s enum
        to constrain its allowed values.
      </p>
    </div>
  );
}
