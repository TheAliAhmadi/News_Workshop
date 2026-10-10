"use client";
import {
  ArrowRight,
  BrainCircuit,
  Braces,
  FileSpreadsheet,
  Globe,
  Laptop,
  MessageSquareText,
  Newspaper,
  Search,
  Sparkles,
  Tag,
  TextCursorInput,
  type LucideIcon,
} from "lucide-react";

export type FlowNode = {
  icon: LucideIcon;
  title: string;
  /** The student's current setting, or what to fill in. */
  detail: string;
  /** Where this part happens. */
  where: "computer" | "internet";
  /** Section of the page this box explains; clicking scrolls there. */
  target?: string;
  /** Shown as a reminder that the box still needs input. */
  missing?: boolean;
};

const short = (text: string, max = 46) =>
  text.length > max ? text.slice(0, max - 1) + "…" : text;
const fileName = (path?: string) => path?.split("/").pop() || "";

/** How data moves through each step, filled in with the current settings. */
export function flowFor(tool: string, c: any, bootstrap: any): FlowNode[] {
  const output = {
    icon: FileSpreadsheet,
    title: "New file",
    detail: c.destination?.filename || "Choose a filename",
    where: "computer" as const,
    target: "output",
  };
  const input = {
    icon: FileSpreadsheet,
    title: "Your data",
    detail: c.input ? fileName(c.input.path) : "Choose a CSV or JSON file",
    where: "computer" as const,
    target: "input",
    missing: !c.input,
  };
  const text = {
    icon: TextCursorInput,
    title: "Text of each row",
    detail: c.columns?.length
      ? `${c.columns.join(" + ")}, first ${c.word_limit} words`
      : "Choose the text columns",
    where: "computer" as const,
    target: "text",
    missing: !c.columns?.length,
  };
  if (tool === "news")
    return [
      {
        icon: Search,
        title: "Your search",
        detail:
          c.company && c.query
            ? short(`"${c.company}" AND (${c.query})`)
            : "Enter a company and a topic",
        where: "computer",
        target: "search",
        missing: !(c.company && c.query),
      },
      {
        icon: Globe,
        title: "NewsAPI",
        detail: "Searches thousands of news sites with your key",
        where: "internet",
        target: "search",
      },
      {
        icon: Newspaper,
        title: "Articles",
        detail: `Up to ${c.max_results} · title, summary, text, date, link`,
        where: "computer",
        target: "search",
      },
      output,
    ];
  if (tool === "hf")
    return [
      input,
      text,
      {
        icon: BrainCircuit,
        title: "Hugging Face model",
        detail: short(c.model || "Choose a model"),
        where: "computer",
        target: "model",
        missing: !c.model,
      },
      {
        icon: Tag,
        title: "Label + confidence",
        detail:
          c.model === bootstrap.default_classifier
            ? "e.g. Environmental · 0.94"
            : "The model's own labels and scores",
        where: "computer",
        target: "model",
      },
      output,
    ];
  let fields: string[] = [];
  try {
    fields = Object.keys(JSON.parse(c.schemaText).properties || {});
  } catch {
    // An unfinished schema still shows the rest of the flowchart.
  }
  return [
    input,
    {
      icon: MessageSquareText,
      title: "Prompt",
      detail: "Your instructions + each row's text",
      where: "computer",
      target: "design",
      missing: !c.instructions?.trim(),
    },
    {
      icon: Sparkles,
      title: "OpenAI model",
      detail: c.model || "Choose a model",
      where: "internet",
      target: "model",
      missing: !c.model,
    },
    {
      icon: Braces,
      title: "Answer in your fields",
      detail: fields.length
        ? short(`${fields.length} fields: ${fields.join(", ")}`)
        : "Design the fields to extract",
      where: "internet",
      target: "design",
      missing: !fields.length,
    },
    output,
  ];
}

export function Flowchart({
  tool,
  nodes,
}: {
  tool: string;
  nodes: FlowNode[];
}) {
  const jump = (target?: string) => {
    const section = target && document.getElementById(`${tool}-${target}`);
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    section.classList.add("flash");
    setTimeout(() => section.classList.remove("flash"), 1200);
  };
  return (
    <figure className="flowchart" aria-label="How this step works">
      <figcaption>
        How this step works
        <span className="legend">
          <span className="where computer">
            <Laptop size={12} /> On your computer
          </span>
          <span className="where internet">
            <Globe size={12} /> Over the internet
          </span>
        </span>
      </figcaption>
      <ol>
        {nodes.map((node, i) => (
          <li key={node.title}>
            {i > 0 && <ArrowRight className="flow-arrow" aria-hidden />}
            <button
              className={
                "flow-node " + node.where + (node.missing ? " missing" : "")
              }
              onClick={() => jump(node.target)}
              title="Show this part of the page"
            >
              <span className="flow-icon">
                <node.icon size={18} />
              </span>
              <strong>{node.title}</strong>
              <span className="flow-detail">{node.detail}</span>
            </button>
          </li>
        ))}
      </ol>
    </figure>
  );
}
