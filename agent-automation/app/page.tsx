import { Suspense } from "react";
import { HomeTabs } from "./components/HomeTabs";

export default function Home() {
  return (
    <Suspense fallback={<p className="text-sm text-mute">Loading…</p>}>
      <HomeTabs />
    </Suspense>
  );
}
