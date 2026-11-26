"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type RunSummary = {
  runId: string;
  status: string;
  createdAt: string;
  /** Post title; null until the run completes. */
  title: string | null;
  filename: string | null;
  project: string | null;
};

const STATUS: Record<string, { label: string; tone: string }> = {
  pending: { label: "Queued", tone: "text-muted-foreground" },
  running: { label: "Running", tone: "text-primary" },
  completed: { label: "Completed", tone: "text-gold" },
  failed: { label: "Failed", tone: "text-destructive" },
  cancelled: { label: "Cancelled", tone: "text-muted-foreground" },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** Recent runs from /api/runs, newest first. */
export function HistoryList() {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/runs", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`The server responded with ${r.status}.`);
        return (await r.json()) as { runs: RunSummary[] };
      })
      .then((body) => alive && setRuns(body.runs))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : "Could not load runs."));
    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return <p role="alert" className="text-sm text-destructive">Couldn’t load run history. {error}</p>;
  }
  if (!runs) return <p className="text-sm text-muted-foreground">Loading runs…</p>;
  if (runs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No runs yet. <Link href="/" className="font-semibold text-gold hover:underline">Upload a document</Link> to start one.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border border-y border-border">
      {runs.map((run) => {
        const s = STATUS[run.status] ?? { label: run.status, tone: "text-muted-foreground" };
        return (
          <li key={run.runId}>
            <Link
              href={`/runs/${run.runId}`}
              className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-1 py-3.5 hover:bg-card"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold uppercase tracking-wide text-gold">
                  {run.project ?? "Unknown project"}
                </span>
                <span className="block truncate font-medium text-foreground">
                  {run.title ?? run.filename ?? run.runId.slice(0, 12)}
                </span>
              </span>
              <span className={`text-sm ${s.tone}`}>{s.label}</span>
              <time dateTime={run.createdAt} className="w-28 text-right text-xs tabular-nums text-muted-foreground">
                {when(run.createdAt)}
              </time>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
