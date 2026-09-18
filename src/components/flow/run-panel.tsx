"use client";

import { CircleAlert, CircleCheck, LoaderCircle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isTerminal, type RunRecord, type StepRecord } from "@/lib/run-types";
import { cn } from "@/lib/utils";

interface Props {
  input: string;
  onInput: (value: string) => void;
  problems: string[];
  busy: boolean;
  onRun: () => void;
  /** Error from starting the run (e.g. Inngest not reachable). */
  startError: string | null;
  run: RunRecord | null;
  pollError: string | null;
  stalled: boolean;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour12: false });

function StepLog({ step }: { step: StepRecord }) {
  const retrying = step.status === "running" && step.error;
  return (
    <li className="rounded-md border bg-card px-2.5 py-2 text-xs">
      <div className="flex items-center gap-1.5">
        {step.status === "running" && <LoaderCircle className="size-3.5 animate-spin text-amber-600" />}
        {step.status === "failed" && <CircleAlert className="size-3.5 text-red-600" />}
        {step.status === "done" && <CircleCheck className="size-3.5 text-muted-foreground" />}
        <span className="font-semibold">
          #{step.index + 1} {step.label || step.nodeId}
        </span>
        {step.answer && (
          <span
            className={cn(
              "ml-auto rounded-full px-2 py-px font-bold",
              step.answer === "YES" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800",
            )}
          >
            {step.answer}
          </span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
        <span>{time(step.startedAt)}</span>
        {step.durationMs != null && <span>{(step.durationMs / 1000).toFixed(1)}s</span>}
        {step.model && <span>{step.model}</span>}
        {step.attempts > 1 && <span>try {step.attempts}</span>}
      </div>
      {step.error && (
        <p className={cn("mt-1 break-words", retrying ? "text-amber-700" : "text-red-700")}>
          {retrying ? `Will retry — ${step.error}` : step.error}
        </p>
      )}
    </li>
  );
}

export function RunPanel({ input, onInput, problems, busy, onRun, startError, run, pollError, stalled }: Props) {
  const outcome = run && run.status === "completed" ? run.steps.at(-1) : undefined;

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="run-input">Input for the flow to judge</Label>
        <Textarea
          id="run-input"
          rows={4}
          maxLength={4000}
          value={input}
          onChange={(e) => onInput(e.target.value)}
          placeholder="e.g. A customer message, ticket or email…"
        />
      </div>

      {problems.length > 0 && (
        <ul className="space-y-1 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
          {problems.map((p) => (
            <li key={p}>• {p}</li>
          ))}
        </ul>
      )}

      <Button className="w-full" onClick={onRun} disabled={busy || problems.length > 0 || !input.trim()}>
        {busy ? <LoaderCircle className="animate-spin" /> : <Play />}
        {busy ? "Running…" : "Run flow"}
      </Button>

      {startError && (
        <p className="rounded-md border border-red-300 bg-red-50 p-2.5 text-xs break-words text-red-800">
          {startError}
        </p>
      )}

      {run && (
        <section className="space-y-2" aria-label="Execution log">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Execution log</h3>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                run.status === "completed" && "bg-emerald-100 text-emerald-800",
                run.status === "failed" && "bg-red-100 text-red-800",
                !isTerminal(run.status) && "bg-amber-100 text-amber-800",
              )}
            >
              {run.status}
            </span>
          </div>

          {stalled && (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
              Still queued after 8s. Is the Inngest dev server running (<code>npm run inngest</code>)
              and pointed at <code>http://localhost:3000/api/inngest</code>?
            </p>
          )}

          <ol className="space-y-1.5">
            {run.steps.map((s) => (
              <StepLog key={s.index} step={s} />
            ))}
          </ol>

          {run.status === "completed" && (
            <p className="rounded-md bg-emerald-50 p-2.5 text-xs text-emerald-900">
              Done in {run.steps.length} step{run.steps.length === 1 ? "" : "s"}. Final decision:{" "}
              <b>
                {outcome?.label || outcome?.nodeId} → {outcome?.answer}
              </b>
            </p>
          )}
          {run.status === "failed" && (
            <p className="rounded-md bg-red-50 p-2.5 text-xs break-words text-red-900">
              Run failed: {run.error}
            </p>
          )}
          {pollError && <p className="text-xs text-red-700">{pollError}</p>}
        </section>
      )}
    </div>
  );
}
