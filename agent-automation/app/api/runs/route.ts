import { connection, NextResponse } from "next/server";
import { getRun, start } from "workflow/api";
import { getWorld } from "workflow/runtime";
import { blogAgentWorkflow } from "@/workflows/blog-agent";
import { validateUpload } from "@/lib/validate-upload";
import type { TimelineEvent } from "@/lib/events";

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

async function labelFor(runId: string): Promise<string> {
  const fallback = runId.slice(0, 12);
  try {
    const reader = getRun(runId).getReadable<TimelineEvent>({ startIndex: 0 }).getReader();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const first = await Promise.race([
        reader.read(),
        new Promise<null>((resolve) => {
          timer = setTimeout(() => resolve(null), 1500);
        }),
      ]);
      return (first && !first.done && first.value?.detail) || fallback;
    } finally {
      clearTimeout(timer);
      await reader.cancel().catch(() => {});
    }
  } catch {
    return fallback;
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
    data.slice(0, 25).map(async (r) => ({
      runId: r.runId,
      status: r.status,
      createdAt: new Date(r.createdAt).toISOString(),
      label: await labelFor(r.runId),
    })),
  );
  return NextResponse.json({ runs });
}
