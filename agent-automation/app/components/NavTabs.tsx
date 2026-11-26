"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const tabClass = (active: boolean) =>
  `border-b-2 pb-1 transition-colors ${
    active ? "border-gold text-ink" : "border-transparent text-mute hover:text-ink"
  }`;

export function NavTabs() {
  const pathname = usePathname();
  const history = useSearchParams().get("tab") === "history";
  const home = pathname === "/";
  return (
    <nav className="flex gap-5 text-sm" aria-label="Main">
      <Link href="/" className={tabClass(home && !history)} aria-current={home && !history ? "page" : undefined}>
        New run
      </Link>
      <Link href="/?tab=history" className={tabClass(home && history)} aria-current={home && history ? "page" : undefined}>
        History
      </Link>
    </nav>
  );
}

/** Static stand-in rendered before search params are available. */
export function NavTabsFallback() {
  return (
    <nav className="flex gap-5 text-sm" aria-label="Main">
      <Link href="/" className={tabClass(false)}>New run</Link>
      <Link href="/?tab=history" className={tabClass(false)}>History</Link>
    </nav>
  );
}
