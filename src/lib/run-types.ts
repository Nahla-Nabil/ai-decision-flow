import type { Answer } from "./graph";

export type StepStatus = "running" | "done" | "failed";
export type RunStatus = "queued" | "running" | "completed" | "failed";

/** One executed node, in execution order. */
export interface StepRecord {
  index: number;
  nodeId: string;
  label: string;
  prompt: string;
  status: StepStatus;
  answer?: Answer;
  /** Exactly what the model said, before parsing. */
  raw?: string;
  model?: string;
  /** Inngest attempt number of the latest try (1 = first try). */
  attempts: number;
  /** Latest error, kept even while Inngest is still retrying. */
  error?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
}

export interface RunRecord {
  id: string;
  status: RunStatus;
  input: string;
  createdAt: string;
  finishedAt?: string;
  error?: string;
  steps: StepRecord[];
}

export const isTerminal = (s: RunStatus) => s === "completed" || s === "failed";
