import { connection } from "next/server";
import { Suspense } from "react";
import { configuredTargets } from "@/lib/targets";
import { HomeTabs } from "./components/HomeTabs";

// Reads env at request time so adding a target's token needs no rebuild.
async function HomeContent() {
  await connection();
  return <HomeTabs targets={configuredTargets()} />;
}

export default function Home() {
  return (
    <Suspense fallback={<p className="text-sm text-mute">Loading…</p>}>
      <HomeContent />
    </Suspense>
  );
}
