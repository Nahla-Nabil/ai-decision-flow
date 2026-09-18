"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type IsValidConnection,
} from "@xyflow/react";
import { Download, Plus, RotateCcw, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRun } from "@/hooks/use-run";
import {
  exportFlow,
  freePosition,
  importFlow,
  NODE_WIDTH,
  toGraph,
  type BranchEdge,
  type DecisionNode,
} from "@/lib/flow";
import { canConnect, useFlowStore } from "@/lib/flow-store";
import { validateGraph } from "@/lib/graph";
import { isTerminal } from "@/lib/run-types";
import { deriveRunView } from "@/lib/run-view";
import { edgeTypes } from "./branch-edge";
import { DecisionNodeView } from "./decision-node";
import { HistoryPanel } from "./history-panel";
import { Inspector } from "./inspector";
import { RunPanel } from "./run-panel";

const nodeTypes = { decision: DecisionNodeView };

type Tab = "node" | "run" | "history";

function Editor() {
  const {
    nodes,
    edges,
    input,
    onNodesChange,
    onEdgesChange,
    connect,
    addNode,
    updateNode,
    removeNode,
    setInput,
    load,
    reset,
  } = useFlowStore();
  const { screenToFlowPosition, fitView } = useReactFlow();

  const canvasRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<Tab>("node");
  const [runId, setRunId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Fingerprint of the flow as it was when the shown run started. The canvas
  // overlay only applies while the flow still matches; null = a past run
  // picked from history, matched to nodes by id.
  const [runSig, setRunSig] = useState<string | null>(null);

  const { run, error: pollError, stalled } = useRun(runId);

  const graph = useMemo(() => toGraph(nodes, edges), [nodes, edges]);
  const problems = useMemo(() => validateGraph(graph), [graph]);
  const sig = useMemo(() => JSON.stringify(graph), [graph]);
  const overlayRun = run && (runSig === null || runSig === sig) ? run : null;
  const view = useMemo(() => deriveRunView(overlayRun, graph.edges), [overlayRun, graph.edges]);

  // Overlay run state onto the stored flow without ever writing it back to it.
  const displayNodes = useMemo(
    () =>
      nodes.map((n): DecisionNode => {
        const exec = view.nodes.get(n.id);
        const dimmed = view.dimUnvisited && !exec;
        return exec || dimmed ? { ...n, data: { ...n.data, exec, dimmed } } : n;
      }),
    [nodes, view],
  );
  const displayEdges = useMemo(
    () =>
      edges.map((e): BranchEdge => {
        const visual = view.edges.get(e.id);
        return visual ? { ...e, animated: visual === "active", data: { visual } } : e;
      }),
    [edges, view],
  );

  const selectedNode = nodes.find((n) => n.selected);
  const waitingForFirstPoll = runId !== null && !run && !pollError;
  const busy = starting || waitingForFirstPoll || (run != null && !isTerminal(run.status));

  const isValidConnection: IsValidConnection<BranchEdge> = (c) =>
    canConnect(useFlowStore.getState().edges, c);

  function handleAddNode() {
    const rect = canvasRef.current?.getBoundingClientRect();
    const center = screenToFlowPosition({
      x: rect ? rect.left + rect.width / 2 : 400,
      y: rect ? rect.top + rect.height / 2 : 300,
    });
    addNode(freePosition(nodes, { x: center.x - NODE_WIDTH / 2, y: center.y - 40 }));
    setTab("node");
  }

  async function handleRun() {
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph, input }),
      });
      const body = (await res.json()) as { runId?: string; error?: string };
      if (!res.ok) setStartError(body.error ?? `Request failed (HTTP ${res.status}).`);
      if (body.runId) {
        setRunSig(sig);
        setRunId(body.runId);
      }
      setTab("run");
    } catch (err) {
      setStartError(`Couldn't reach the app server (${err instanceof Error ? err.message : err}).`);
    } finally {
      setStarting(false);
    }
  }

  function handleExport() {
    const blob = new Blob([exportFlow(nodes, edges, input)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "decision-flow.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(file: File) {
    const result = importFlow(await file.text());
    if (!result.ok) {
      setNotice(result.error);
      return;
    }
    load(result);
    setRunId(null);
    setStartError(null);
    setNotice(`Imported ${result.nodes.length} nodes from ${file.name}.`);
    requestAnimationFrame(() => fitView({ padding: 0.2 }));
  }

  function handleReset() {
    if (!window.confirm("Replace the current flow with the sample flow?")) return;
    reset();
    setRunId(null);
    setStartError(null);
    requestAnimationFrame(() => fitView({ padding: 0.2 }));
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
        <h1 className="mr-auto text-sm font-semibold">AI Decision Flow</h1>
        <Button size="sm" onClick={handleAddNode}>
          <Plus /> Add node
        </Button>
        <Button size="sm" variant="outline" onClick={handleExport}>
          <Download /> Export
        </Button>
        <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload /> Import
        </Button>
        <Button size="sm" variant="ghost" onClick={handleReset}>
          <RotateCcw /> Sample
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // let the same file be picked again
            if (file) void handleImport(file);
          }}
        />
      </header>

      {notice && (
        <div className="flex items-center gap-2 border-b bg-muted px-4 py-1.5 text-xs">
          <span className="mr-auto">{notice}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
            <X className="size-3.5" />
          </button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div ref={canvasRef} className="min-w-0 flex-1">
          <ReactFlow<DecisionNode, BranchEdge>
            nodes={displayNodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={connect}
            isValidConnection={isValidConnection}
            // Dropping a connection anywhere on a node snaps to its input dot,
            // so you don't have to hit the small handle exactly.
            connectionRadius={90}
            onNodeClick={() => setTab("node")}
            deleteKeyCode={["Backspace", "Delete"]}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.3}
          >
            <Background gap={20} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!hidden md:!block" />
          </ReactFlow>
        </div>

        <aside className="flex w-[380px] shrink-0 flex-col border-l bg-background max-md:hidden">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-0">
            <TabsList className="m-3 w-auto">
              <TabsTrigger value="node">Node</TabsTrigger>
              <TabsTrigger value="run">Run &amp; log</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "node" && (
              <Inspector
                node={selectedNode}
                nodes={nodes}
                edges={edges}
                onChange={updateNode}
                onDelete={removeNode}
              />
            )}
            {tab === "run" && (
              <RunPanel
                input={input}
                onInput={setInput}
                problems={problems}
                busy={busy}
                onRun={handleRun}
                startError={startError}
                run={run}
                pollError={pollError}
                stalled={stalled}
              />
            )}
            {tab === "history" && (
              <HistoryPanel
                activeRunId={runId}
                refreshKey={`${run?.id}:${run?.status}`}
                onSelect={(id) => {
                  setRunSig(null);
                  setRunId(id);
                  setStartError(null);
                  setTab("run");
                }}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function FlowApp() {
  const [ready, setReady] = useState(false);

  // Load the saved flow from localStorage after mount (see flow-store.ts).
  useEffect(() => {
    let alive = true;
    void Promise.resolve(useFlowStore.persist.rehydrate()).then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="grid h-screen place-items-center text-sm text-muted-foreground">
        Loading editor…
      </div>
    );
  }
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
