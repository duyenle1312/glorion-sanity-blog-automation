import { connection, NextResponse } from "next/server";
import { getRun, start } from "workflow/api";
import { getWorld } from "workflow/runtime";
import { blogAgentWorkflow, type BlogAgentResult } from "@/workflows/blog-agent";
import { validateUpload } from "@/lib/validate-upload";
import type { TimelineEvent } from "@/lib/events";
import { parseReceivedDetail } from "@/lib/run-summary";

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

/** Resolve `promise`, or null after `ms` (so one slow run can't stall the list). */
async function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<null>((r) => (timer = setTimeout(() => r(null), ms)))]);
  } finally {
    clearTimeout(timer);
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

/** Post title of a completed run (its return value); null otherwise. */
async function titleFor(runId: string, status: string): Promise<string | null> {
  if (status !== "completed") return null;
  try {
    const result = await within(getRun<BlogAgentResult>(runId).returnValue, 1500);
    return result?.title?.trim() || null;
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
      const [received, title] = await Promise.all([receivedFor(r.runId), titleFor(r.runId, r.status)]);
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
