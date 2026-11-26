"use client";

import { useEffect, useState } from "react";

type Health = { ok: boolean; sanity: boolean; gemini: boolean };

function Dot({ label, ok }: { label: string; ok: boolean | undefined }) {
  const tone = ok === undefined ? "bg-line" : ok ? "bg-gold" : "bg-fail";
  const state = ok === undefined ? "checking" : ok ? "configured" : "missing configuration";
  return (
    <span className="flex items-center gap-1.5" title={`${label}: ${state}`}>
      <span className={`size-2 rounded-full ${tone}`} aria-hidden />
      <span>{label}</span>
      <span className="sr-only">{state}</span>
    </span>
  );
}

/** Header readout of /api/health: which integrations have their secrets set. */
export function HealthStatus() {
  const [health, setHealth] = useState<Health | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/health", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Health>) : Promise.reject(r.status)))
      .then((h) => alive && setHealth(h))
      .catch(() => alive && setDown(true));
    return () => {
      alive = false;
    };
  }, []);

  if (down) {
    return <span className="ml-auto text-xs text-fail">Server unreachable</span>;
  }
  return (
    <div className="ml-auto flex gap-4 text-xs text-mute" aria-label="Integration status">
      <Dot label="Sanity" ok={health?.sanity} />
      <Dot label="Gemini" ok={health?.gemini} />
    </div>
  );
}
