import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { Answer } from "./graph";
import type { RunRecord, StepRecord } from "./run-types";

/**
 * Where execution progress lives so the browser can watch it.
 *
 * The Inngest function runs inside this same Next.js server (Inngest calls
 * /api/inngest over HTTP), so a process-wide Map is visible to both the
 * function and the polling route. Every change is also written to
 * .data/runs/<id>.json so history survives a restart. This is a local-dev
 * store: for multiple server instances, swap it for a real database — the
 * functions below are the whole interface.
 */
const DIR = path.join(process.cwd(), ".data", "runs");
const MAX_HISTORY = 50;

type Globals = typeof globalThis & { __decisionFlowRuns?: Map<string, RunRecord> };

function runs(): Map<string, RunRecord> {
  const g = globalThis as Globals;
  if (g.__decisionFlowRuns) return g.__decisionFlowRuns;

  const map = new Map<string, RunRecord>();
  try {
    mkdirSync(DIR, { recursive: true });
    for (const file of readdirSync(DIR)) {
      if (!file.endsWith(".json")) continue;
      try {
        const run = JSON.parse(readFileSync(path.join(DIR, file), "utf8")) as RunRecord;
        map.set(run.id, run);
      } catch {
        // A half-written or hand-edited file shouldn't take the app down.
      }
    }
  } catch (err) {
    console.error("[run-store] could not read history:", err);
  }
  g.__decisionFlowRuns = map;
  return map;
}

// Serialise disk writes so two quick updates can't interleave in one file.
let writeChain: Promise<void> = Promise.resolve();
function persist(run: RunRecord) {
  const snapshot = JSON.stringify(run, null, 2);
  writeChain = writeChain
    .then(() => writeFile(path.join(DIR, `${run.id}.json`), snapshot))
    .catch((err) => console.error("[run-store] write failed:", err));
}

function mutate(id: string, fn: (run: RunRecord) => void) {
  const run = runs().get(id);
  if (!run) return;
  fn(run);
  persist(run);
}

export function createRun(id: string, input: string): RunRecord {
  const run: RunRecord = {
    id,
    status: "queued",
    input,
    createdAt: new Date().toISOString(),
    steps: [],
  };
  runs().set(id, run);
  persist(run);
  return run;
}

export const getRun = (id: string) => runs().get(id);

export function listRuns(): RunRecord[] {
  return [...runs().values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_HISTORY);
}

export function startRun(id: string) {
  mutate(id, (r) => {
    r.status = "running";
  });
}

/** Idempotent: an Inngest retry of the same node re-enters here. */
export function startStep(
  id: string,
  step: Pick<StepRecord, "index" | "nodeId" | "label" | "prompt">,
  attempt: number,
) {
  mutate(id, (r) => {
    const existing = r.steps.find((s) => s.index === step.index);
    if (existing) {
      existing.status = "running";
      existing.attempts = attempt;
      return;
    }
    r.steps.push({
      ...step,
      status: "running",
      attempts: attempt,
      startedAt: new Date().toISOString(),
    });
  });
}

export function finishStep(
  id: string,
  index: number,
  result: { answer: Answer; raw: string; model: string },
) {
  mutate(id, (r) => {
    const s = r.steps.find((x) => x.index === index);
    if (!s) return;
    const now = new Date();
    s.status = "done";
    s.answer = result.answer;
    s.raw = result.raw;
    s.model = result.model;
    s.error = undefined;
    s.finishedAt = now.toISOString();
    s.durationMs = now.getTime() - new Date(s.startedAt).getTime();
  });
}

/** Record an error on a step without giving up — Inngest may retry it. */
export function noteStepError(id: string, index: number, message: string, attempt: number) {
  mutate(id, (r) => {
    const s = r.steps.find((x) => x.index === index);
    if (!s) return;
    s.error = message;
    s.attempts = attempt;
  });
}

export function completeRun(id: string) {
  mutate(id, (r) => {
    r.status = "completed";
    r.finishedAt = new Date().toISOString();
  });
}

/** Terminal failure: retries exhausted, or a non-retriable error. */
export function failRun(id: string, message: string) {
  mutate(id, (r) => {
    const now = new Date().toISOString();
    r.status = "failed";
    r.error = message;
    r.finishedAt = now;
    for (const s of r.steps) {
      if (s.status === "running") {
        s.status = "failed";
        s.error ??= message;
        s.finishedAt = now;
      }
    }
  });
}
