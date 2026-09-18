import { z } from "zod";
import { inngest, RUN_REQUESTED } from "@/inngest/client";
import { validateGraph, workflowGraphSchema } from "@/lib/graph";
import * as runStore from "@/lib/run-store";

const bodySchema = z.object({
  graph: workflowGraphSchema,
  input: z.string().trim().min(1, "Enter some input for the flow to judge.").max(4000),
});

/** Start a run: validate, record it as queued, hand it to Inngest. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }
  const { graph, input } = parsed.data;

  const problems = validateGraph(graph);
  if (problems.length) {
    return Response.json({ error: problems[0], problems }, { status: 400 });
  }

  const runId = crypto.randomUUID();
  runStore.createRun(runId, input);

  try {
    await inngest.send({ name: RUN_REQUESTED, data: { runId, graph, input } });
  } catch (err) {
    const message =
      "Could not reach Inngest. Is the dev server running? (npm run inngest) — " +
      (err instanceof Error ? err.message : String(err));
    runStore.failRun(runId, message);
    return Response.json({ error: message, runId }, { status: 502 });
  }

  return Response.json({ runId }, { status: 202 });
}

export async function GET() {
  return Response.json({ runs: runStore.listRuns() });
}
