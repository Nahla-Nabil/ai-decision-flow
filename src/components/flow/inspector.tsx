"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BranchEdge, DecisionNode } from "@/lib/flow";

interface Props {
  node: DecisionNode | undefined;
  nodes: DecisionNode[];
  edges: BranchEdge[];
  onChange: (id: string, patch: { label?: string; prompt?: string }) => void;
  onDelete: (id: string) => void;
}

function Exit({
  branch,
  node,
  nodes,
  edges,
}: {
  branch: "yes" | "no";
  node: DecisionNode;
  nodes: DecisionNode[];
  edges: BranchEdge[];
}) {
  const edge = edges.find((e) => e.source === node.id && e.type === branch);
  const target = edge && nodes.find((n) => n.id === edge.target);
  const yes = branch === "yes";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className={`w-9 rounded-full py-0.5 text-center font-bold text-white ${yes ? "bg-emerald-600" : "bg-rose-600"}`}
      >
        {yes ? "YES" : "NO"}
      </span>
      {target ? (
        <span className="truncate">→ {target.data.label || target.id}</span>
      ) : (
        <span className="text-muted-foreground">not connected — the flow ends here</span>
      )}
    </div>
  );
}

export function Inspector({ node, nodes, edges, onChange, onDelete }: Props) {
  if (!node) {
    return (
      <div className="space-y-3 p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">No node selected</p>
        <p>Click a node to edit its label and prompt.</p>
        <ul className="list-disc space-y-1 pl-4">
          <li>
            <b>Add node</b> in the top bar creates a new decision step.
          </li>
          <li>
            Drag from a node&apos;s green <b>YES</b> or red <b>NO</b> dot onto another node to
            connect them.
          </li>
          <li>Select a node or a connection and press Delete to remove it.</li>
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="space-y-1.5">
        <Label htmlFor="node-label">Label</Label>
        <Input
          id="node-label"
          value={node.data.label}
          maxLength={80}
          onChange={(e) => onChange(node.id, { label: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="node-prompt">Prompt (a question the model answers YES or NO)</Label>
        <Textarea
          id="node-prompt"
          rows={6}
          maxLength={2000}
          placeholder="Is this a support request?"
          value={node.data.prompt}
          onChange={(e) => onChange(node.id, { prompt: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          The run input is sent alongside this prompt. Write it as a yes/no question.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Exits</Label>
        <Exit branch="yes" node={node} nodes={nodes} edges={edges} />
        <Exit branch="no" node={node} nodes={nodes} edges={edges} />
      </div>

      <Button variant="destructive" size="sm" onClick={() => onDelete(node.id)}>
        <Trash2 /> Delete node
      </Button>
    </div>
  );
}
