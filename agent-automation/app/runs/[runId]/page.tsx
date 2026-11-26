import { Suspense } from "react";
import { RunView } from "@/app/components/RunView";
import { postTitleFor } from "@/lib/run-title";

async function RunFromParams({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const title = await postTitleFor(runId);
  // key: a different run gets a fresh stream state
  return <RunView key={runId} runId={runId} title={title} />;
}

export default function RunPage({ params }: PageProps<"/runs/[runId]">) {
  return (
    <Suspense fallback={<p className="text-sm text-mute">Loading run…</p>}>
      <RunFromParams params={params} />
    </Suspense>
  );
}
