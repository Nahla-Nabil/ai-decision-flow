import { MarkerType, type Edge, type Node } from "@xyflow/react";
import { z } from "zod";
import {
  edgeSpecSchema,
  MAX_NODES,
  nodeSpecSchema,
  type Answer,
  type Branch,
  type EdgeSpec,
  type WorkflowGraph,
} from "./graph";

/** How a node looks while (or after) a run. Derived, never persisted. */
export type ExecState = {
  status: "running" | "done" | "failed";
  answer?: Answer;
  /** 1-based position in execution order. */
  step: number;
  attempts: number;
};

export type DecisionNodeData = {
  label: string;
  prompt: string;
  exec?: ExecState;
  /** A finished run never reached this node. */
  dimmed?: boolean;
};

export type EdgeVisual = "taken" | "active" | "skipped";
export type BranchEdgeData = { visual?: EdgeVisual };

export type DecisionNode = Node<DecisionNodeData, "decision">;
/** The edge `type` *is* the branch: "yes" or "no". */
export type BranchEdge = Edge<BranchEdgeData, Branch>;

export const BRANCH_COLOR: Record<Branch, string> = {
  yes: "#059669",
  no: "#e11d48",
};

export const makeEdge = (source: string, target: string, branch: Branch): BranchEdge => ({
  // One edge per (node, branch), so the id is stable and reconnecting replaces.
  id: `e_${source}_${branch}`,
  source,
  target,
  sourceHandle: branch,
  type: branch,
  markerEnd: { type: MarkerType.ArrowClosed, color: BRANCH_COLOR[branch] },
});

export const newNodeId = () => `n_${Math.random().toString(36).slice(2, 8)}`;

export const NODE_WIDTH = 240;
const NODE_HEIGHT_ESTIMATE = 130;

/** Nudge `wanted` downwards until a new node wouldn't sit on top of another. */
export function freePosition(
  nodes: DecisionNode[],
  wanted: { x: number; y: number },
): { x: number; y: number } {
  const pos = { ...wanted };
  const overlaps = () =>
    nodes.some(
      (n) =>
        Math.abs(n.position.x - pos.x) < NODE_WIDTH + 16 &&
        Math.abs(n.position.y - pos.y) < NODE_HEIGHT_ESTIMATE + 16,
    );
  for (let i = 0; i < 30 && overlaps(); i++) pos.y += NODE_HEIGHT_ESTIMATE + 24;
  return pos;
}

export const toEdgeSpecs = (edges: BranchEdge[]): EdgeSpec[] =>
  edges.flatMap((e) =>
    e.type === "yes" || e.type === "no"
      ? [{ id: e.id, source: e.source, target: e.target, branch: e.type }]
      : [],
  );

export function toGraph(nodes: DecisionNode[], edges: BranchEdge[]): WorkflowGraph {
  return {
    nodes: nodes.map((n) => ({ id: n.id, label: n.data.label, prompt: n.data.prompt })),
    edges: toEdgeSpecs(edges),
  };
}

/* ---------- sample flow: the assignment's support/sales example ---------- */

export const SAMPLE_INPUT = "Hi, I can't log in to my account and the reset email never arrives.";

export function sampleFlow(): { nodes: DecisionNode[]; edges: BranchEdge[] } {
  const node = (id: string, x: number, y: number, label: string, prompt: string): DecisionNode => ({
    id,
    type: "decision",
    position: { x, y },
    data: { label, prompt },
  });
  return {
    nodes: [
      node(
        "n_start",
        260,
        20,
        "Support request?",
        "Is this message a customer support request (a problem, complaint or question about an existing account or product)?",
      ),
      node(
        "n_support",
        20,
        300,
        "Support: urgent?",
        "Is the customer blocked or reporting an outage, data loss or a billing error?",
      ),
      node(
        "n_sales",
        500,
        300,
        "Sales: buying?",
        "Is the sender asking about pricing, plans, a demo or buying the product?",
      ),
    ],
    edges: [makeEdge("n_start", "n_support", "yes"), makeEdge("n_start", "n_sales", "no")],
  };
}

/* ---------- JSON export / import ---------- */

const flowFileSchema = z.object({
  version: z.literal(1),
  input: z.string().max(4000).optional(),
  nodes: z
    .array(nodeSpecSchema.extend({ position: z.object({ x: z.number(), y: z.number() }) }))
    .min(1)
    .max(MAX_NODES),
  edges: z.array(edgeSpecSchema).max(MAX_NODES * 2),
});

export function exportFlow(nodes: DecisionNode[], edges: BranchEdge[], input: string): string {
  const graph = toGraph(nodes, edges);
  const file: z.infer<typeof flowFileSchema> = {
    version: 1,
    input,
    nodes: graph.nodes.map((n, i) => ({ ...n, position: nodes[i].position })),
    edges: graph.edges,
  };
  return JSON.stringify(file, null, 2);
}

export type ImportResult =
  | { ok: true; nodes: DecisionNode[]; edges: BranchEdge[]; input?: string }
  | { ok: false; error: string };

export function importFlow(text: string): ImportResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  const parsed = flowFileSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? ` (at ${issue.path.join(".")})` : "";
    return { ok: false, error: `Not a decision-flow file: ${issue?.message ?? "invalid"}${where}.` };
  }

  const { nodes, edges, input } = parsed.data;
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) return { ok: false, error: "Node ids must be unique." };
  if (edges.some((e) => !ids.has(e.source) || !ids.has(e.target))) {
    return { ok: false, error: "A connection points at a node that isn't in the file." };
  }

  return {
    ok: true,
    input,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: "decision",
      position: n.position,
      data: { label: n.label, prompt: n.prompt },
    })),
    // Rebuild edges from (source, target, branch) so ids and styling are canonical.
    edges: edges.map((e) => makeEdge(e.source, e.target, e.branch)),
  };
}
