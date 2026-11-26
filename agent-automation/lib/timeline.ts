// Pure, client-safe timeline helpers. Only *types* come from ./events
// (that module imports "workflow", which must stay out of client bundles).
import type { TimelineEvent } from "./events";
import type { StepId } from "./steps";

export type StepView = {
  step: StepId;
  title: string;
  status: TimelineEvent["status"];
  detail?: string;
  url?: string;
  /** First `running` timestamp (or the first event seen for this step). */
  startedAt: string;
  /** Last terminal (`done` / `skipped` / `error`) timestamp. */
  endedAt?: string;
};

/**
 * Fold one event into the timeline: one row per step, latest status wins.
 * A run-level `error` event marks any row still `running` as `error`.
 */
export function reduceTimeline(state: StepView[], ev: TimelineEvent): StepView[] {
  const terminal = ev.status !== "running";
  const index = state.findIndex((row) => row.step === ev.step);
  const prev = index === -1 ? undefined : state[index];

  const row: StepView = {
    step: ev.step,
    title: ev.title || prev?.title || ev.step,
    status: ev.status,
    startedAt: prev?.startedAt ?? ev.timestamp,
  };
  const detail = ev.detail ?? prev?.detail;
  const url = ev.url ?? prev?.url;
  if (detail !== undefined) row.detail = detail;
  if (url !== undefined) row.url = url;
  if (terminal) row.endedAt = ev.timestamp;

  let next = index === -1 ? [...state, row] : state.map((r, i) => (i === index ? row : r));

  if (ev.step === "error") {
    next = next.map((r) =>
      r.status === "running" ? { ...r, status: "error" as const, endedAt: ev.timestamp } : r,
    );
  }
  return next;
}

/** Split an NDJSON buffer into complete non-blank lines plus the trailing partial line. */
export function splitNdjson(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts.map((l) => l.trim()).filter(Boolean), rest };
}

/** Run statuses after which no further events will be produced by the workflow. */
export const ENDED_RUN_STATUSES = ["completed", "failed", "cancelled"];

/**
 * What to do when one stream response ends. An unterminated tail is never
 * consumed: it may be a cut-off event, and not counting it means the
 * reconnect's `from=` asks the server to resend it whole. A run that ended
 * (per the `x-run-status` header) without a terminal event will never produce
 * one, so reconnecting is pointless.
 */
export function streamEndAction(state: {
  finished: boolean;
  aborted: boolean;
  runStatus?: string | null;
}): { reconnect: boolean } {
  const ended = state.runStatus != null && ENDED_RUN_STATUSES.includes(state.runStatus);
  return { reconnect: !state.finished && !state.aborted && !ended };
}

/** True when the run is over but the stream never delivered a done/error event. */
export function endedUnexpectedly(state: { finished: boolean; aborted: boolean; runStatus?: string | null }): boolean {
  return (
    !state.finished &&
    !state.aborted &&
    state.runStatus != null &&
    ENDED_RUN_STATUSES.includes(state.runStatus)
  );
}
