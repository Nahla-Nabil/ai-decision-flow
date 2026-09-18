import type { EdgeVisual, ExecState } from "./flow";
import { answerToBranch, type EdgeSpec } from "./graph";
import { isTerminal, type RunRecord } from "./run-types";

export interface RunView {
  nodes: Map<string, ExecState>;
  edges: Map<string, EdgeVisual>;
  /** Once a run has finished, nodes it never reached fade out. */
  dimUnvisited: boolean;
}

/**
 * Turns a server-side run record into what the canvas should show:
 * a colour per visited node, and which edges were taken / are being walked.
 */
export function deriveRunView(run: RunRecord | null, edges: EdgeSpec[]): RunView {
  const view: RunView = { nodes: new Map(), edges: new Map(), dimUnvisited: false };
  if (!run) return view;

  const finished = isTerminal(run.status);
  const visited = new Map(run.steps.map((s) => [s.nodeId, s]));

  for (const s of run.steps) {
    view.nodes.set(s.nodeId, {
      status: s.status,
      answer: s.answer,
      step: s.index + 1,
      attempts: s.attempts,
    });
  }

  for (const s of run.steps) {
    if (s.status !== "done" || !s.answer) continue;
    const branch = answerToBranch(s.answer);
    for (const e of edges.filter((x) => x.source === s.nodeId)) {
      if (e.branch !== branch) {
        view.edges.set(e.id, "skipped");
        continue;
      }
      const target = visited.get(e.target);
      const inFlight = !finished && (!target || target.status === "running");
      view.edges.set(e.id, inFlight ? "active" : "taken");
    }
  }

  view.dimUnvisited = finished;
  return view;
}
