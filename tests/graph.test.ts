import { describe, expect, it } from "vitest";
import { parseYesNo } from "@/lib/answer";
import { exportFlow, freePosition, importFlow, sampleFlow, toGraph } from "@/lib/flow";
import {
  findStartNodes,
  nextEdge,
  validateGraph,
  wouldCreateCycle,
  type WorkflowGraph,
} from "@/lib/graph";
import { stubDecision } from "@/lib/llm";
import { deriveRunView } from "@/lib/run-view";
import type { RunRecord } from "@/lib/run-types";

const node = (id: string, prompt = "Is it?") => ({ id, label: id, prompt });
const edge = (source: string, target: string, branch: "yes" | "no") => ({
  id: `${source}-${branch}`,
  source,
  target,
  branch,
});

const tree: WorkflowGraph = {
  nodes: [node("a"), node("b"), node("c")],
  edges: [edge("a", "b", "yes"), edge("a", "c", "no")],
};

describe("parseYesNo", () => {
  it.each([
    ["YES", "YES"],
    ["no", "NO"],
    ["  Yes.\n", "YES"],
    ['"NO"', "NO"],
    ["**YES**", "YES"],
    ["<think>hmm, maybe</think>\nNO", "NO"],
  ])("accepts %j", (raw, expected) => expect(parseYesNo(raw)).toBe(expected));

  it.each(["", "Maybe", "Yes, because it is", "YES NO", "It depends", "Nope"])(
    "rejects %j",
    (raw) => expect(parseYesNo(raw)).toBeNull(),
  );
});

describe("traversal", () => {
  it("finds the single start node", () => {
    expect(findStartNodes(tree).map((n) => n.id)).toEqual(["a"]);
  });

  it("follows the edge matching the answer", () => {
    expect(nextEdge(tree, "a", "YES")?.target).toBe("b");
    expect(nextEdge(tree, "a", "NO")?.target).toBe("c");
  });

  it("returns nothing when no edge is drawn for that answer", () => {
    expect(nextEdge(tree, "b", "YES")).toBeUndefined();
  });
});

describe("validateGraph", () => {
  it("accepts a well-formed tree", () => expect(validateGraph(tree)).toEqual([]));

  it("accepts a lone node", () =>
    expect(validateGraph({ nodes: [node("a")], edges: [] })).toEqual([]));

  it("rejects two start nodes", () => {
    const g = { nodes: [node("a"), node("b")], edges: [] };
    expect(validateGraph(g).join()).toMatch(/exactly one start/);
  });

  it("rejects two edges on the same branch", () => {
    const g = { ...tree, edges: [...tree.edges, { ...edge("a", "c", "yes"), id: "dup" }] };
    expect(validateGraph(g).join()).toMatch(/same YES\/NO branch/);
  });

  it("rejects empty prompts", () => {
    const g = { ...tree, nodes: [node("a", "  "), node("b"), node("c")] };
    expect(validateGraph(g).join()).toMatch(/Empty prompt/);
  });

  it("rejects loops", () => {
    const g = { ...tree, edges: [...tree.edges, edge("b", "a", "yes")] };
    expect(validateGraph(g).join()).toMatch(/loop/);
  });

  it("rejects edges to missing nodes", () => {
    const g = { ...tree, edges: [...tree.edges, edge("b", "ghost", "no")] };
    expect(validateGraph(g).join()).toMatch(/missing nodes/);
  });
});

describe("wouldCreateCycle", () => {
  it("detects self loops and back edges, allows forward edges", () => {
    expect(wouldCreateCycle(tree.edges, "a", "a")).toBe(true);
    expect(wouldCreateCycle(tree.edges, "b", "a")).toBe(true);
    expect(wouldCreateCycle(tree.edges, "b", "c")).toBe(false);
  });
});

describe("export / import", () => {
  it("round-trips the sample flow", () => {
    const { nodes, edges } = sampleFlow();
    const result = importFlow(exportFlow(nodes, edges, "hello"));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input).toBe("hello");
    expect(toGraph(result.nodes, result.edges)).toEqual(toGraph(nodes, edges));
    expect(result.nodes.map((n) => n.position)).toEqual(nodes.map((n) => n.position));
  });

  it("explains bad input instead of throwing", () => {
    expect(importFlow("not json")).toMatchObject({ ok: false });
    expect(importFlow('{"version":2}')).toMatchObject({ ok: false });
    const { nodes, edges } = sampleFlow();
    const broken = JSON.parse(exportFlow(nodes, edges, ""));
    broken.edges[0].target = "ghost";
    expect(importFlow(JSON.stringify(broken))).toMatchObject({ ok: false });
  });
});

describe("stub model", () => {
  it("answers YES when question and input share a word, otherwise NO", () => {
    expect(stubDecision("Is this about billing?", "my billing is wrong").answer).toBe("YES");
    expect(stubDecision("Is this about billing?", "what a lovely day").answer).toBe("NO");
  });
});

describe("deriveRunView", () => {
  const step = (index: number, nodeId: string, status: "done" | "running", answer?: "YES" | "NO") => ({
    index,
    nodeId,
    label: nodeId,
    prompt: "?",
    status,
    answer,
    attempts: 1,
    startedAt: "2026-01-01T00:00:00.000Z",
  });
  const run = (status: RunRecord["status"], steps: RunRecord["steps"]): RunRecord => ({
    id: "r",
    status,
    input: "x",
    createdAt: "2026-01-01T00:00:00.000Z",
    steps,
  });

  it("marks the taken edge active while the next node is in flight, skipped for the other", () => {
    const v = deriveRunView(run("running", [step(0, "a", "done", "YES")]), tree.edges);
    expect(v.edges.get("a-yes")).toBe("active");
    expect(v.edges.get("a-no")).toBe("skipped");
    expect(v.dimUnvisited).toBe(false);
  });

  it("settles to taken and dims unvisited nodes once finished", () => {
    const v = deriveRunView(
      run("completed", [step(0, "a", "done", "YES"), step(1, "b", "done", "NO")]),
      tree.edges,
    );
    expect(v.edges.get("a-yes")).toBe("taken");
    expect(v.nodes.get("b")?.answer).toBe("NO");
    expect(v.nodes.has("c")).toBe(false);
    expect(v.dimUnvisited).toBe(true);
  });
});

describe("freePosition", () => {
  it("keeps a free spot as is", () => {
    expect(freePosition(sampleFlow().nodes, { x: 900, y: 900 })).toEqual({ x: 900, y: 900 });
  });

  it("moves a new node off an occupied spot", () => {
    const { nodes } = sampleFlow();
    const taken = nodes[0].position;
    const pos = freePosition(nodes, { x: taken.x + 10, y: taken.y + 10 });
    expect(pos.y).toBeGreaterThan(taken.y + 100);
    const clash = nodes.some(
      (n) => Math.abs(n.position.x - pos.x) < 240 && Math.abs(n.position.y - pos.y) < 130,
    );
    expect(clash).toBe(false);
  });
});
