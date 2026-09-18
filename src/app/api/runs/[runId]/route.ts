import * as runStore from "@/lib/run-store";

export async function GET(_req: Request, ctx: RouteContext<"/api/runs/[runId]">) {
  const { runId } = await ctx.params;
  const run = runStore.getRun(runId);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });
  return Response.json({ run });
}
