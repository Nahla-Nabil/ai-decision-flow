"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { BRANCH_COLOR, type BranchEdge } from "@/lib/flow";
import type { Branch } from "@/lib/graph";

function BranchEdgeView({
  branch,
  ...props
}: EdgeProps<BranchEdge> & { branch: Branch }) {
  const { id, data, selected, markerEnd } = props;
  const [path, labelX, labelY] = getBezierPath(props);
  const color = BRANCH_COLOR[branch];
  const visual = data?.visual;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: color,
          strokeWidth: visual === "taken" || visual === "active" || selected ? 3.5 : 2,
          opacity: visual === "skipped" ? 0.25 : 1,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-none absolute rounded-full px-1.5 py-px text-[10px] font-bold text-white"
          style={{
            background: color,
            opacity: visual === "skipped" ? 0.35 : 1,
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
        >
          {branch === "yes" ? "YES" : "NO"}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

// Defined once at module scope: React Flow re-mounts every edge if this
// object's identity changes between renders.
export const edgeTypes = {
  yes: (props: EdgeProps<BranchEdge>) => <BranchEdgeView {...props} branch="yes" />,
  no: (props: EdgeProps<BranchEdge>) => <BranchEdgeView {...props} branch="no" />,
};
