"use client";

import Link from "next/link";
import { PIPELINE, STEP_TITLES, type StepId } from "@/lib/steps";
import type { StepView } from "@/lib/timeline";

type RowStatus = StepView["status"] | "waiting" | "not-run";

type Props = {
  steps: StepView[];
  finished: boolean;
  connected: boolean;
  notFound: boolean;
};

const STATUS_LABEL: Record<RowStatus, string> = {
  running: "Working",
  done: "Done",
  skipped: "Skipped",
  error: "Failed",
  waiting: "Waiting",
  "not-run": "Not run",
};

const clock = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
};

function duration(start: string, end?: string) {
  if (!end) return null;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return ms < 1000 ? "<1 s" : ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}

function Node({ status }: { status: RowStatus }) {
  const base = "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full";
  switch (status) {
    case "running":
      return (
        <span className={`${base} pulse-ring bg-run`} aria-hidden>
          <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        </span>
      );
    case "done":
      return (
        <span className={`${base} bg-gold text-ground`} aria-hidden>
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
        </span>
      );
    case "skipped":
      return (
        <span className={`${base} border-2 border-gold/60 bg-ground text-gold`} aria-hidden>
          <span className="h-0.5 w-2.5 rounded bg-current" />
        </span>
      );
    case "error":
      return (
        <span className={`${base} bg-fail text-ground`} aria-hidden>
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </span>
      );
    default:
      return <span className={`${base} border-2 border-line bg-ground`} aria-hidden />;
  }
}

const titleTone: Record<RowStatus, string> = {
  running: "text-ink",
  done: "text-ink",
  skipped: "text-mute",
  error: "text-fail",
  waiting: "text-mute",
  "not-run": "text-mute/60",
};

type Row = { step: StepId; title: string; status: RowStatus; view?: StepView };

function buildRows(steps: StepView[], finished: boolean): Row[] {
  const seen = new Map(steps.map((s) => [s.step, s]));
  const rows: Row[] = PIPELINE.map((step) => {
    const view = seen.get(step);
    if (view) return { step, title: view.title, status: view.status, view };
    return { step, title: STEP_TITLES[step], status: finished ? "not-run" : "waiting" };
  });
  // Any non-terminal step the server sends that the UI doesn't know yet still shows.
  for (const s of steps) {
    if (s.step !== "done" && s.step !== "error" && !PIPELINE.includes(s.step)) {
      rows.push({ step: s.step, title: s.title, status: s.status, view: s });
    }
  }
  return rows;
}

/** The live, step-by-step record of one agent run. */
export function Timeline({ steps, finished, connected, notFound }: Props) {
  if (notFound) {
    return (
      <div className="rounded-lg border border-line bg-panel px-6 py-8">
        <h2 className="font-display text-2xl font-semibold">Run not found</h2>
        <p className="mt-2 text-sm text-mute">
          This run ID doesn’t exist on this server. It may have been started on another deployment.
        </p>
        <Link href="/" className="mt-5 inline-block text-sm font-semibold text-gold hover:underline">
          Start a new run
        </Link>
      </div>
    );
  }

  const rows = buildRows(steps, finished);
  const doneEvent = steps.find((s) => s.step === "done" && s.status === "done");
  const failure = steps.find((s) => s.step === "error");
  const reconnecting = !finished && !connected && steps.length > 0;

  return (
    <div className="space-y-8">
      <p className="text-sm text-mute" aria-live="polite">
        {doneEvent
          ? "Finished."
          : failure
            ? "Stopped with an error."
            : reconnecting
              ? "Connection dropped. Reconnecting…"
              : connected
                ? "Following the agent live."
                : "Connecting…"}
      </p>

      <ol className="relative">
        {rows.map((row, i) => {
          const last = i === rows.length - 1;
          const complete = row.status === "done" || row.status === "skipped";
          const view = row.view;
          const took = view ? duration(view.startedAt, view.endedAt) : null;
          return (
            <li key={row.step} className="relative flex gap-4 pb-7 last:pb-0">
              {!last && (
                <span
                  aria-hidden
                  className={`absolute left-[13px] top-7 bottom-0 w-0.5 transition-colors duration-500 ${
                    complete ? "bg-gold" : "bg-line"
                  }`}
                />
              )}
              <Node status={row.status} />
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <h3 className={`font-display text-lg font-semibold leading-6 ${titleTone[row.status]}`}>
                    {row.title}
                  </h3>
                  <span className="text-xs tabular-nums text-mute">
                    {view && clock(view.startedAt)}
                    {took && <span className="text-mute/80"> · {took}</span>}
                  </span>
                </div>
                <p className="mt-0.5 text-sm">
                  <span className={row.status === "running" ? "text-run" : row.status === "error" ? "text-fail" : "text-mute"}>
                    {STATUS_LABEL[row.status]}
                  </span>
                </p>
                {view?.detail && <p className="mt-1 break-words text-sm text-ink/80">{view.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>

      {doneEvent && (
        <section className="rounded-lg border border-gold/50 bg-panel px-6 py-6">
          <h2 className="font-display text-2xl font-semibold text-gold">{doneEvent.title}</h2>
          <p className="mt-2 max-w-prose text-sm text-ink/85">
            Draft saved — review in Studio and set <code className="rounded bg-ground px-1 py-0.5 text-gold">isPublished</code> to publish.
          </p>
          {doneEvent.url && (
            <a
              href={doneEvent.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-block rounded-md bg-gold px-5 py-2.5 text-sm font-semibold text-ground transition-colors hover:bg-gold/85"
            >
              Open draft in Studio
            </a>
          )}
        </section>
      )}

      {failure && (
        <section role="alert" className="rounded-lg border border-fail/50 bg-fail/10 px-6 py-6">
          <h2 className="font-display text-2xl font-semibold text-fail">{failure.title}</h2>
          {failure.detail && <p className="mt-2 max-w-prose break-words text-sm text-ink/85">{failure.detail}</p>}
          <p className="mt-2 text-sm text-mute">Fix the issue above, then start a new run.</p>
          <Link href="/" className="mt-4 inline-block text-sm font-semibold text-gold hover:underline">
            Start a new run
          </Link>
        </section>
      )}
    </div>
  );
}
