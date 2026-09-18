import {
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from "@xyflow/react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  makeEdge,
  newNodeId,
  sampleFlow,
  SAMPLE_INPUT,
  toEdgeSpecs,
  type BranchEdge,
  type DecisionNode,
  type DecisionNodeData,
} from "./flow";
import { wouldCreateCycle, type Branch } from "./graph";

interface FlowState {
  nodes: DecisionNode[];
  edges: BranchEdge[];
  /** The text the flow will judge when you press Run. */
  input: string;

  onNodesChange: (changes: NodeChange<DecisionNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<BranchEdge>[]) => void;
  connect: (connection: Connection) => void;
  addNode: (position: XYPosition) => string;
  updateNode: (id: string, patch: Partial<Pick<DecisionNodeData, "label" | "prompt">>) => void;
  removeNode: (id: string) => void;
  setInput: (input: string) => void;
  load: (flow: { nodes: DecisionNode[]; edges: BranchEdge[]; input?: string }) => void;
  reset: () => void;
}

const asBranch = (handle: string | null | undefined): Branch | null =>
  handle === "yes" || handle === "no" ? handle : null;

/** Same rules the editor enforces while you drag, so store and canvas agree. */
export function canConnect(
  edges: BranchEdge[],
  c: { source: string; target: string; sourceHandle?: string | null },
): boolean {
  if (!asBranch(c.sourceHandle)) return false;
  return !wouldCreateCycle(toEdgeSpecs(edges), c.source, c.target);
}

export const useFlowStore = create<FlowState>()(
  persist(
    (set, get) => ({
      ...sampleFlow(),
      input: SAMPLE_INPUT,

      onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
      onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),

      connect: (c) => {
        const branch = asBranch(c.sourceHandle);
        if (!branch || !canConnect(get().edges, c)) return;
        // Each node has one YES exit and one NO exit: a new one replaces the old.
        const kept = get().edges.filter((e) => !(e.source === c.source && e.type === branch));
        set({ edges: [...kept, makeEdge(c.source, c.target, branch)] });
      },

      addNode: (position) => {
        const id = newNodeId();
        const node: DecisionNode = {
          id,
          type: "decision",
          position,
          selected: true,
          data: { label: `Step ${get().nodes.length + 1}`, prompt: "" },
        };
        set({ nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), node] });
        return id;
      },

      updateNode: (id, patch) =>
        set({
          nodes: get().nodes.map((n) =>
            n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
          ),
        }),

      removeNode: (id) =>
        set({
          nodes: get().nodes.filter((n) => n.id !== id),
          edges: get().edges.filter((e) => e.source !== id && e.target !== id),
        }),

      setInput: (input) => set({ input }),

      load: ({ nodes, edges, input }) =>
        set({ nodes, edges, input: input ?? get().input }),

      reset: () => set({ ...sampleFlow(), input: SAMPLE_INPUT }),
    }),
    {
      name: "ai-decision-flow:v1",
      version: 1,
      // The page renders on the server first; hydrating from localStorage is
      // done by hand after mount so the two renders agree.
      skipHydration: true,
      partialize: (s) => ({
        // Selection is transient UI state, not part of the saved flow.
        nodes: s.nodes.map((n) => ({ ...n, selected: false, dragging: false })),
        edges: s.edges.map((e) => ({ ...e, selected: false })),
        input: s.input,
      }),
    },
  ),
);
