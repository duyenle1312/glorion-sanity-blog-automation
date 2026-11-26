import { getRun } from "workflow/api";

export const maxDuration = 300;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const raw = Number.parseInt(new URL(request.url).searchParams.get("from") ?? "0", 10);
  const startIndex = Number.isFinite(raw) && raw >= 0 ? raw : 0;

  const run = getRun(runId);
  try {
    await run.status; // rejects for an unknown run; getReadable alone is lazy
  } catch {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const readable = run.getReadable({ startIndex });
  const encoder = new TextEncoder();
  const body = readable.pipeThrough(
    new TransformStream({
      transform(event, controller) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      },
    }),
  );
  return new Response(body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
