"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DecisionNode } from "@/lib/flow";

function StatusChip({ exec }: { exec: NonNullable<DecisionNode["data"]["exec"]> }) {
  const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold";
  if (exec.status === "running") {
    return (
      <span className={cn(base, "bg-amber-100 text-amber-800")}>
        <LoaderCircle className="size-3 animate-spin" />
        {exec.attempts > 1 ? `Retrying (try ${exec.attempts})` : "Asking model"}
      </span>
    );
  }
  if (exec.status === "failed") {
    return (
      <span className={cn(base, "bg-red-100 text-red-800")}>
        <CircleAlert className="size-3" />
        Failed
      </span>
    );
  }
  return (
    <span
      className={cn(
        base,
        exec.answer === "YES" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800",
      )}
    >
      {exec.answer}
    </span>
  );
}

export function DecisionNodeView({ data, selected }: NodeProps<DecisionNode>) {
  const { exec } = data;

  return (
    <div
      className={cn(
        "w-60 rounded-xl border-2 bg-card px-3 pt-2.5 pb-7 text-card-foreground shadow-sm transition",
        "border-border",
        selected && "ring-2 ring-primary/70",
        exec?.status === "running" && "animate-pulse border-amber-500 ring-2 ring-amber-400/50",
        exec?.status === "failed" && "border-red-600 ring-2 ring-red-500/40",
        exec?.status === "done" &&
          (exec.answer === "YES" ? "border-emerald-600" : "border-rose-600"),
        data.dimmed && "opacity-40",
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-3 !border-2 !border-background !bg-slate-500"
      />

      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-sm leading-tight font-semibold">
          {data.label || <span className="text-muted-foreground italic">Untitled</span>}
        </div>
        {exec && (
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">#{exec.step}</span>
            <StatusChip exec={exec} />
          </div>
        )}
      </div>

      <p className="mt-1.5 line-clamp-3 text-xs leading-snug text-muted-foreground">
        {data.prompt || <span className="italic">No prompt yet — select this node to write one.</span>}
      </p>

      {/* Two exits. Which one fires is decided by the model's YES / NO. */}
      <Handle
        id="yes"
        type="source"
        position={Position.Bottom}
        style={{ left: "27%" }}
        className="!size-3.5 !border-2 !border-background !bg-emerald-600"
      />
      <span className="pointer-events-none absolute bottom-1 left-[27%] -translate-x-1/2 text-[10px] font-bold text-emerald-700">
        YES
      </span>
      <Handle
        id="no"
        type="source"
        position={Position.Bottom}
        style={{ left: "73%" }}
        className="!size-3.5 !border-2 !border-background !bg-rose-600"
      />
      <span className="pointer-events-none absolute bottom-1 left-[73%] -translate-x-1/2 text-[10px] font-bold text-rose-700">
        NO
      </span>
    </div>
  );
}
