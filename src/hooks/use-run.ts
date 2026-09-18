"use client";

import { useEffect, useState } from "react";
import { isTerminal, type RunRecord } from "@/lib/run-types";

const POLL_MS = 600;
const STALLED_AFTER_MS = 8000;

/**
 * Follows one run by polling the server until it finishes. Polling (rather
 * than a socket) keeps the app to plain route handlers; the run record is
 * tiny and the interval is short, so it feels live.
 */
export function useRun(runId: string | null) {
  const [run, setRun] = useState<RunRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;

    const tick = async () => {
      try {
        const res = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { run: next } = (await res.json()) as { run: RunRecord };
        if (cancelled) return;
        failures = 0;
        setError(null);
        setRun(next);
        setStalled(
          next.status === "queued" &&
            Date.now() - Date.parse(next.createdAt) > STALLED_AFTER_MS,
        );
        if (isTerminal(next.status)) return;
      } catch (err) {
        if (cancelled) return;
        if (++failures >= 5) {
          setError(`Lost contact with the server (${err instanceof Error ? err.message : err}).`);
          return;
        }
      }
      timer = setTimeout(tick, POLL_MS);
    };

    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runId]);

  // Ignore a record left over from a previously selected run.
  return { run: run && run.id === runId ? run : null, error, stalled };
}
