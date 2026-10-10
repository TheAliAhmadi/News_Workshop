"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Download, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { api, formatBytes } from "@/lib/api";

/**
 * Download the default classifier ahead of time, with progress. Running it
 * again reuses whatever is already cached, so it is safe to offer anywhere.
 */
export function ModelPreparation({
  report,
  children,
}: {
  report: (e: unknown) => void;
  /** Extra buttons shown next to the main action, such as "Skip". */
  children?: (state: string | undefined) => React.ReactNode;
}) {
  const [preparation, setPreparation] = useState<any>(null);

  // A download started earlier keeps running on the backend; pick it up.
  useEffect(() => {
    api("/models/prepare")
      .then((status) => status.state !== "idle" && setPreparation(status))
      .catch(() => {});
  }, []);

  // Poll only while a download is actually running.
  useEffect(() => {
    if (preparation?.state !== "running") return;
    const timer = setInterval(async () => {
      try {
        setPreparation(await api("/models/prepare"));
      } catch (e) {
        report(e);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [preparation?.state, report]);

  const prepare = async () => {
    try {
      setPreparation(await api("/models/prepare", {}));
    } catch (e) {
      report(e);
    }
  };

  const share =
    preparation?.total > 0
      ? Math.min(
          100,
          Math.round((preparation.downloaded / preparation.total) * 100),
        )
      : 0;
  const state = preparation?.state;

  return (
    <div className="prepare">
      {preparation && (
        <div className="prepare-progress" role="status">
          <progress
            aria-label="Classifier download progress"
            value={
              state === "completed"
                ? 1
                : preparation.total
                  ? preparation.downloaded
                  : undefined
            }
            max={state === "completed" ? 1 : preparation.total || 1}
          />
          <span>
            {state === "running" && <Loader2 className="spin" size={14} />}
            {state === "completed" && <CheckCircle2 size={14} />}
            {preparation.phase}
            {preparation.total && state === "running"
              ? ` · ${formatBytes(preparation.downloaded)} of ${formatBytes(preparation.total)} (${share}%)`
              : ""}
          </span>
          {preparation.error && (
            <span className="inline-error">{preparation.error}</span>
          )}
        </div>
      )}
      <div className="row wrap">
        {state !== "completed" && (
          <Button onClick={prepare} disabled={state === "running"}>
            <Download size={15} />
            {state === "failed" || state === "cancelled"
              ? "Try again"
              : state === "running"
                ? "Downloading…"
                : "Prepare FinBERT for class"}
          </Button>
        )}
        {children?.(state)}
      </div>
    </div>
  );
}
