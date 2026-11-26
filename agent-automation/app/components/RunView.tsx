"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useRunStream } from "@/app/hooks/useRunStream";
import { parseReceivedDetail } from "@/lib/run-summary";
import { Timeline } from "./Timeline";

/** `title` is the post title, known server-side once the run has completed. */
export function RunView({ runId, title }: { runId: string; title: string | null }) {
  const router = useRouter();
  const stream = useRunStream(runId);
  const received = stream.steps.find((s) => s.step === "received");
  const info = received?.detail ? parseReceivedDetail(received.detail) : null;
  const completed = stream.steps.some((s) => s.step === "done" && s.status === "done");

  // The run finished while we watched: re-render the server page to pick up its title.
  useEffect(() => {
    if (completed && !title) router.refresh();
  }, [completed, title, router]);

  return (
    <div className="space-y-6">
      {!stream.notFound && (
        <header>
          {info && (
            <p className="text-xs font-semibold uppercase tracking-wide text-gold">{info.project}</p>
          )}
          <h1 className="mt-1 font-geist-sans text-4xl font-semibold tracking-tight text-balance break-words text-white">
            {title ?? info?.filename ?? "Blog agent run"}
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">
            {info && <>{info.filename} · </>}Run {runId}
          </p>
        </header>
      )}
      <Timeline {...stream} />
    </div>
  );
}
