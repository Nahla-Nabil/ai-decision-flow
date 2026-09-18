import { z } from "zod";

export const BRANCHES = ["yes", "no"] as const;
export type Branch = (typeof BRANCHES)[number];
export type Answer = "YES" | "NO";

export const MAX_NODES = 50;

export const nodeSpecSchema = z.object({
  id: z.string().min(1),
  label: z.string().max(80),
  prompt: z.string().max(2000),
});

export const edgeSpecSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  branch: z.enum(BRANCHES),
});

/** The part of a flow that matters for execution: no positions, no styling. */
export const workflowGraphSchema = z.object({
  nodes: z.array(nodeSpecSchema).min(1).max(MAX_NODES),
  edges: z.array(edgeSpecSchema).max(MAX_NODES * 2),
});

export type NodeSpec = z.infer<typeof nodeSpecSchema>;
export type EdgeSpec = z.infer<typeof edgeSpecSchema>;
export type WorkflowGraph = z.infer<typeof workflowGraphSchema>;

export const answerToBranch = (answer: Answer): Branch =>
  answer === "YES" ? "yes" : "no";

/** Nodes nobody points at. A runnable flow has exactly one. */
export function findStartNodes(graph: WorkflowGraph): NodeSpec[] {
  const targets = new Set(graph.edges.map((e) => e.target));
  return graph.nodes.filter((n) => !targets.has(n.id));
}

/** The edge to follow after `nodeId` answered `answer`, if the user drew one. */
export function nextEdge(
  graph: WorkflowGraph,
  nodeId: string,
  answer: Answer,
): EdgeSpec | undefined {
  const branch = answerToBranch(answer);
  return graph.edges.find((e) => e.source === nodeId && e.branch === branch);
}

/** True if following edges from `from` can reach `to`. */
function reaches(edges: EdgeSpec[], from: string, to: string): boolean {
  const seen = new Set<string>();
  const stack = [from];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of edges) if (e.source === id) stack.push(e.target);
  }
  return false;
}

/** Would adding source -> target close a loop? (Self-loops count.) */
export function wouldCreateCycle(
  edges: EdgeSpec[],
  source: string,
  target: string,
): boolean {
  return reaches(edges, target, source);
}

/**
 * Everything that would stop this flow from running, as human-readable
 * sentences. Empty array = runnable. Used by the UI (to disable Run) and by
 * the API (never trust the client).
 */
export function validateGraph(graph: WorkflowGraph): string[] {
  const problems: string[] = [];
  const ids = new Set(graph.nodes.map((n) => n.id));

  if (graph.nodes.length === 0) return ["Add at least one node."];

  const dangling = graph.edges.filter(
    (e) => !ids.has(e.source) || !ids.has(e.target),
  );
  if (dangling.length) problems.push("Some connections point at missing nodes.");

  const seenBranches = new Set<string>();
  for (const e of graph.edges) {
    const key = `${e.source}:${e.branch}`;
    if (seenBranches.has(key)) {
      problems.push("A node has two connections on the same YES/NO branch.");
      break;
    }
    seenBranches.add(key);
  }

  const empty = graph.nodes.filter((n) => !n.prompt.trim());
  if (empty.length) {
    problems.push(
      `Empty prompt: ${empty.map((n) => `"${n.label || n.id}"`).join(", ")}.`,
    );
  }

  const starts = findStartNodes(graph);
  if (starts.length === 0) {
    problems.push("No start node: every node has an incoming connection (a loop).");
  } else if (starts.length > 1) {
    problems.push(
      `${starts.length} nodes have no incoming connection (${starts
        .map((n) => `"${n.label || n.id}"`)
        .join(", ")}). A flow needs exactly one start node.`,
    );
  }

  const hasLoop = graph.edges.some((e) =>
    reaches(
      graph.edges.filter((x) => x.id !== e.id),
      e.target,
      e.source,
    ),
  );
  if (hasLoop) problems.push("The flow contains a loop.");

  return problems;
}
