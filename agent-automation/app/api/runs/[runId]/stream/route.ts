import { getRun } from "workflow/api";

export const maxDuration = 300;

const RUN_ID = /^wrun_[A-Za-z0-9]+$/;
// A cancelled/failed run never closes its stream; once the backlog is drained
// the response must end instead of hanging.
const IDLE_CLOSE_MS = 2000;

function closeWhenIdle<T>(source: ReadableStream<T>, idleMs: number): ReadableStream<T> {
  const reader = source.getReader();
  return new ReadableStream<T>({
    async pull(controller) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const idle = new Promise<"idle">((resolve) => {
        timer = setTimeout(() => resolve("idle"), idleMs);
      });
      try {
        const result = await Promise.race([reader.read(), idle]);
        if (result === "idle" || result.done) {
          controller.close();
          if (result === "idle") void reader.cancel().catch(() => {});
        } else {
          controller.enqueue(result.value);
        }
      } finally {
        clearTimeout(timer);
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  if (!RUN_ID.test(runId)) {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }
  const raw = Number.parseInt(new URL(request.url).searchParams.get("from") ?? "0", 10);
  const startIndex = Number.isFinite(raw) && raw >= 0 ? raw : 0;

  const run = getRun(runId);
  let status: string;
  try {
    status = String(await run.status); // rejects for an unknown run; getReadable alone is lazy
  } catch {
    return Response.json({ error: "Run not found" }, { status: 404 });
  }

  const source = run.getReadable({ startIndex });
  const readable: ReadableStream<unknown> =
    status === "cancelled" || status === "failed" ? closeWhenIdle(source, IDLE_CLOSE_MS) : source;
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
      "x-run-status": status,
    },
  });
}
