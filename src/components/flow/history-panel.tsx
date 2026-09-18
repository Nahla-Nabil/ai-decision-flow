"use client";

import { useEffect, useState } from "react";
import type { RunRecord } from "@/lib/run-types";
import { cn } from "@/lib/utils";

interface Props {
  activeRunId: string | null;
  /** Changes whenever a run finishes, so the list refreshes. */
  refreshKey: string;
  onSelect: (runId: string) => void;
}

export function HistoryPanel({ activeRunId, refreshKey, onSelect }: Props) {
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/runs", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ runs: RunRecord[] }>;
      })
      .then((d) => !cancelled && (setRuns(d.runs), setError(null)))
      .catch((e) => !cancelled && setError(`Couldn't load history (${e.message}).`));
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (error) return <p className="p-4 text-sm text-red-700">{error}</p>;
  if (!runs) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  if (runs.length === 0) {
    return <p className="p-4 text-sm text-muted-foreground">No runs yet. Run the flow to see it here.</p>;
  }

  return (
    <ul className="space-y-1.5 p-3">
      {runs.map((r) => {
        const last = r.steps.at(-1);
        return (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onSelect(r.id)}
              className={cn(
                "w-full rounded-md border bg-card px-3 py-2 text-left text-xs transition hover:bg-muted",
                r.id === activeRunId && "border-primary ring-1 ring-primary/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-px font-semibold",
                    r.status === "completed" && "bg-emerald-100 text-emerald-800",
                    r.status === "failed" && "bg-red-100 text-red-800",
                    (r.status === "running" || r.status === "queued") && "bg-amber-100 text-amber-800",
                  )}
                >
                  {r.status}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 font-medium">{r.input}</p>
              <p className="mt-0.5 text-muted-foreground">
                {r.steps.length} step{r.steps.length === 1 ? "" : "s"}
                {r.status === "completed" && last ? ` · ended at ${last.label || last.nodeId} → ${last.answer}` : ""}
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
