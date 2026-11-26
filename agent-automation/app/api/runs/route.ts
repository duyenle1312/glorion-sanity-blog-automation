import { connection, NextResponse } from "next/server";
import { getRun, start } from "workflow/api";
import { getWorld } from "workflow/runtime";
import { blogAgentWorkflow } from "@/workflows/blog-agent";
import { validateUpload } from "@/lib/validate-upload";
import type { TimelineEvent } from "@/lib/events";
import { parseReceivedDetail } from "@/lib/run-summary";
import { postTitleFor, within } from "@/lib/run-title";

export const maxDuration = 60;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
  }
  const result = await validateUpload(form);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  try {
    const run = await start(blogAgentWorkflow, [result.input]);
    return NextResponse.json({ runId: run.runId }, { status: 201 });
  } catch (err) {
    console.error("Failed to start blog agent run", err);
    return NextResponse.json({ error: "Could not start the agent" }, { status: 500 });
  }
}

/** File name and destination project, from the run's first timeline event. */
async function receivedFor(runId: string): Promise<{ filename: string; project: string } | null> {
  try {
    const reader = getRun(runId).getReadable<TimelineEvent>({ startIndex: 0 }).getReader();
    try {
      const first = await within(reader.read(), 1500);
      const detail = first && !first.done ? first.value?.detail : undefined;
      return detail ? parseReceivedDetail(detail) : null;
    } finally {
      await reader.cancel().catch(() => {});
    }
  } catch {
    return null;
  }
}

export async function GET() {
  await connection();
  const world = await getWorld();
  const { data } = await world.runs.list({
    pagination: { limit: 25, sortOrder: "desc" },
    resolveData: "none",
  });
  const runs = await Promise.all(
    data.slice(0, 25).map(async (r) => {
      const [received, title] = await Promise.all([receivedFor(r.runId), postTitleFor(r.runId, r.status)]);
      return {
        runId: r.runId,
        status: r.status,
        createdAt: new Date(r.createdAt).toISOString(),
        title,
        filename: received?.filename ?? null,
        project: received?.project ?? null,
      };
    }),
  );
  return NextResponse.json({ runs });
}
