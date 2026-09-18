import { NonRetriableError } from "inngest";
import { z } from "zod";
import { findStartNodes, nextEdge, workflowGraphSchema } from "@/lib/graph";
import { decide, isPermanentLLMError } from "@/lib/llm";
import * as runStore from "@/lib/run-store";
import { inngest, RUN_REQUESTED } from "./client";

const payloadSchema = z.object({
  runId: z.string().min(1),
  graph: workflowGraphSchema,
  input: z.string().min(1),
});

/** Belt and braces: the editor already rejects loops, imports might not. */
const MAX_STEPS = 25;

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Walks the graph one node at a time. Every node is its own Inngest step, so
 * each LLM call is retried, memoised and shown in the Inngest dashboard
 * independently: if node 3 fails, nodes 1 and 2 are not asked again.
 *
 * Inngest re-invokes this function from the top after every step and skips
 * the steps that already finished, so anything with a side effect (talking to
 * the model, updating the run store) lives *inside* step.run.
 */
export const runWorkflow = inngest.createFunction(
  {
    id: "run-workflow",
    triggers: [{ event: RUN_REQUESTED }],
    retries: 3,
    onFailure: async ({ event, error }) => {
      const runId = event.data.event?.data?.runId;
      if (typeof runId === "string") runStore.failRun(runId, error.message);
    },
  },
  async ({ event, step, attempt }) => {
    const { runId, graph, input } = payloadSchema.parse(event.data);

    const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
    const [start] = findStartNodes(graph);
    if (!start) throw new NonRetriableError("Flow has no start node.");

    await step.run("start-run", () => runStore.startRun(runId));

    const path: { nodeId: string; label: string; answer: string }[] = [];
    const visited = new Set<string>();
    let current = start;

    for (let index = 0; ; index++) {
      if (visited.has(current.id) || index >= MAX_STEPS) {
        throw new NonRetriableError(
          `Stopped at "${current.label || current.id}": the flow loops or is longer than ${MAX_STEPS} steps.`,
        );
      }
      visited.add(current.id);
      const node = current;

      const result = await step.run(`node-${index}-${node.id}`, async () => {
        runStore.startStep(
          runId,
          { index, nodeId: node.id, label: node.label, prompt: node.prompt },
          attempt + 1,
        );
        try {
          const decision = await decide(node.prompt, input);
          runStore.finishStep(runId, index, decision);
          return decision;
        } catch (err) {
          const message = messageOf(err);
          runStore.noteStepError(runId, index, message, attempt + 1);
          if (isPermanentLLMError(err)) throw new NonRetriableError(message, { cause: err });
          throw err;
        }
      });

      path.push({ nodeId: node.id, label: node.label, answer: result.answer });

      const edge = nextEdge(graph, node.id, result.answer);
      const next = edge && nodes.get(edge.target);
      if (!next) break; // no edge drawn for this answer: the flow ends here
      current = next;
    }

    await step.run("finish-run", () => runStore.completeRun(runId));
    return { runId, path };
  },
);
