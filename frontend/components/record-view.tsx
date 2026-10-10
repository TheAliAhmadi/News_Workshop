"use client";
import { useEffect, useState } from "react";
import {
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Sparkles,
} from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./explorer";
import { pretty } from "@/lib/api";

type Row = Record<string, any>;

/** CSV cells hold nested values as JSON text; read them back when possible. */
function parsed(value: any) {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!/^[[{]/.test(text)) return value;
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

const first = (row: Row, names: string[]) => {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && String(value).trim() !== "")
      return value;
  }
  return undefined;
};

const text = (value: any) =>
  value === undefined || value === null ? "" : String(value);

const readable = (name: string) =>
  name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

const safeUrl = (value: any) =>
  typeof value === "string" && /^https?:\/\//i.test(value) ? value : "";

/** The fields of a news article, whatever the dataset calls them. */
function article(row: Row) {
  const source = parsed(row.source);
  const content = text(first(row, ["content", "body", "text", "article_text"]));
  // NewsAPI ends shortened text with "… [+1234 chars]".
  const truncated = content.match(/\s*\[\+(\d+) chars\]\s*$/);
  return {
    title: text(first(row, ["title", "headline"])),
    description: text(first(row, ["description", "lead", "summary"])),
    content: truncated ? content.slice(0, truncated.index) : content,
    hidden: truncated ? Number(truncated[1]) : 0,
    url: safeUrl(first(row, ["url", "link"])),
    image: safeUrl(first(row, ["urlToImage", "image", "image_url"])),
    source:
      text(
        (source && typeof source === "object" ? source.name : source) ??
          first(row, ["source.name", "publisher"]),
      ) || "",
    author: text(first(row, ["author", "byline"])),
    date: text(first(row, ["publishedAt", "published_at", "date"])),
    company: text(first(row, ["focal_firm", "company"])),
  };
}

/** Results added by the Classify and Extract steps, found by column name. */
function results(row: Row) {
  const labels: { prefix: string; label: string; score?: number }[] = [];
  const fields: { name: string; value: any }[] = [];
  for (const key of Object.keys(row)) {
    const label = key.match(/^(.*)label$/);
    if (label && label[1] && row[key] !== "" && row[key] != null) {
      const score = Number(row[label[1] + "score"]);
      labels.push({
        prefix: label[1],
        label: String(row[key]),
        score: Number.isFinite(score) ? score : undefined,
      });
    }
    const field = key.match(/^.*_field_(.+)$/);
    if (field) fields.push({ name: field[1], value: parsed(row[key]) });
  }
  return { labels, fields };
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
}

function Value({ value }: { value: any }) {
  if (value === null || value === undefined || value === "")
    return <span className="empty-value">empty</span>;
  if (typeof value === "object")
    return <pre className="inline-json">{pretty(value)}</pre>;
  return <>{String(value)}</>;
}

/** One record of a dataset: as an article, as fields, or as raw JSON. */
export function RecordView({
  rows,
  index,
  offset,
  close,
}: {
  rows: Row[];
  index: number;
  /** Row number of the first row on this page, for "Row n". */
  offset: number;
  close: () => void;
}) {
  const [current, setCurrent] = useState(index);
  const row = rows[current];
  const a = article(row);
  const found = results(row);
  const isArticle = !!(a.title && (a.content || a.description));
  const [tab, setTab] = useState<"article" | "fields" | "json">(
    isArticle ? "article" : "fields",
  );
  useEffect(() => {
    if (!isArticle && tab === "article") setTab("fields");
  }, [isArticle, tab]);
  return (
    <Modal
      title={`Row ${offset + current + 1}`}
      description={
        isArticle
          ? "Read the article, or switch to see every saved field."
          : "Every saved field of this row."
      }
      close={close}
      wide
    >
      <div className="code-toolbar">
        <div className="segmented" role="tablist" aria-label="View">
          {(
            [
              ["article", "Article"],
              ["fields", "All fields"],
              ["json", "Raw JSON"],
            ] as const
          )
            .filter(([id]) => id !== "article" || isArticle)
            .map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
        </div>
        <span className="spacer" />
        <Button
          variant="outline"
          size="sm"
          disabled={current === 0}
          onClick={() => setCurrent(current - 1)}
        >
          <ChevronLeft size={15} /> Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={current === rows.length - 1}
          onClick={() => setCurrent(current + 1)}
        >
          Next <ChevronRight size={15} />
        </Button>
      </div>
      {tab === "article" && (
        <article className="article-view">
          {(found.labels.length > 0 || found.fields.length > 0) && (
            <aside className="article-results">
              {found.labels.map((l) => (
                <span key={l.prefix} className="result-chip">
                  <BrainCircuit size={14} /> Classified as{" "}
                  <strong>{l.label}</strong>
                  {l.score !== undefined &&
                    ` · ${Math.round(l.score * 100)}% confident`}
                </span>
              ))}
              {found.fields.length > 0 && (
                <div className="extracted">
                  <h4>
                    <Sparkles size={14} /> Extracted by AI
                  </h4>
                  <dl>
                    {found.fields.map((f) => (
                      <div key={f.name}>
                        <dt>{readable(f.name)}</dt>
                        <dd>
                          <Value value={f.value} />
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </aside>
          )}
          <p className="article-meta">
            {[a.source, a.author, a.date && formatDate(a.date)]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <h2>{a.title}</h2>
          {a.description && <p className="article-lead">{a.description}</p>}
          {a.image && (
            <img
              src={a.image}
              alt=""
              referrerPolicy="no-referrer"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          )}
          {a.content && <p className="article-body">{a.content}</p>}
          {a.hidden > 0 && (
            <p className="article-note">
              NewsAPI only provides the beginning of each article; about{" "}
              {a.hidden.toLocaleString()} more characters are on the
              publisher&apos;s site.
            </p>
          )}
          {a.url && (
            <a
              className="button-link"
              href={a.url}
              target="_blank"
              rel="noreferrer"
            >
              Read the full article on {a.source || "the publisher's site"}{" "}
              <ExternalLink size={13} />
            </a>
          )}
          {a.company && (
            <p className="hint">Collected for the company: {a.company}</p>
          )}
        </article>
      )}
      {tab === "fields" && (
        <dl className="field-list">
          {Object.entries(row).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>
                <Value value={parsed(value)} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {tab === "json" && (
        <pre className="record-inspector">
          {pretty(
            Object.fromEntries(
              Object.entries(row).map(([k, v]) => [k, parsed(v)]),
            ),
          )}
        </pre>
      )}
    </Modal>
  );
}
