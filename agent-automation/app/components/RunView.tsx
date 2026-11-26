"use client";

import { useRunStream } from "@/app/hooks/useRunStream";
import { Timeline } from "./Timeline";

export function RunView({ runId }: { runId: string }) {
  const stream = useRunStream(runId);
  const received = stream.steps.find((s) => s.step === "received");
  return (
    <div className="space-y-6">
      {!stream.notFound && (
        <header>
          <h1 className="font-display text-3xl font-bold tracking-tight break-words">
            {received?.detail ?? "Blog agent run"}
          </h1>
          <p className="mt-1 text-xs text-mute">Run {runId}</p>
        </header>
      )}
      <Timeline {...stream} />
    </div>
  );
}
