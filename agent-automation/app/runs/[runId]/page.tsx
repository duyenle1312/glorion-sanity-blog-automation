import { Suspense } from "react";
import { RunView } from "@/app/components/RunView";

async function RunFromParams({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  // key: a different run gets a fresh stream state
  return <RunView key={runId} runId={runId} />;
}

export default function RunPage({ params }: PageProps<"/runs/[runId]">) {
  return (
    <Suspense fallback={<p className="text-sm text-mute">Loading run…</p>}>
      <RunFromParams params={params} />
    </Suspense>
  );
}
