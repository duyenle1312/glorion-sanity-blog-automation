import { describe, expect, it } from "vitest";
import type { TimelineEvent } from "@/lib/events";
import { endedUnexpectedly, reduceTimeline, splitNdjson, streamEndAction, type StepView } from "@/lib/timeline";

const ev = (
  step: TimelineEvent["step"],
  status: TimelineEvent["status"],
  timestamp: string,
  extra: Partial<TimelineEvent> = {},
): TimelineEvent => ({ step, status, title: `T:${step}`, timestamp, ...extra });

const run = (events: TimelineEvent[]) => events.reduce<StepView[]>(reduceTimeline, []);

describe("reduceTimeline", () => {
  it("collapses retried running events into one row; latest status wins", () => {
    const rows = run([
      ev("analyze", "running", "t1"),
      ev("analyze", "running", "t2"),
      ev("analyze", "done", "t3", { detail: "12 keywords" }),
    ]);
    expect(rows).toEqual([
      { step: "analyze", title: "T:analyze", status: "done", detail: "12 keywords", startedAt: "t1", endedAt: "t3" },
    ]);
  });

  it("marks a still-running step as error when the error event arrives", () => {
    const rows = run([
      ev("convert", "running", "t1"),
      ev("error", "error", "t2", { detail: "Corrupt file" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ step: "convert", status: "error", endedAt: "t2" });
    expect(rows[1]).toMatchObject({ step: "error", status: "error", detail: "Corrupt file" });
  });

  it("does not touch finished rows when the error event arrives", () => {
    const rows = run([
      ev("convert", "running", "t1"),
      ev("convert", "done", "t2"),
      ev("error", "error", "t3"),
    ]);
    expect(rows[0]).toMatchObject({ status: "done", endedAt: "t2" });
  });

  it("creates a row for a lone terminal event", () => {
    const rows = run([ev("cover", "skipped", "t5", { detail: "No cover" })]);
    expect(rows).toEqual([
      { step: "cover", title: "T:cover", status: "skipped", detail: "No cover", startedAt: "t5", endedAt: "t5" },
    ]);
  });

  it("keeps url from the done event and preserves row order", () => {
    const rows = run([
      ev("received", "running", "t1"),
      ev("received", "done", "t2"),
      ev("done", "done", "t3", { url: "https://studio/x" }),
    ]);
    expect(rows.map((r) => r.step)).toEqual(["received", "done"]);
    expect(rows[1].url).toBe("https://studio/x");
  });

  it("does not mutate the previous state", () => {
    const first = run([ev("convert", "running", "t1")]);
    const snapshot = structuredClone(first);
    reduceTimeline(first, ev("convert", "done", "t2"));
    expect(first).toEqual(snapshot);
  });
});

describe("splitNdjson", () => {
  it("returns complete lines and keeps the partial remainder", () => {
    expect(splitNdjson('{"a":1}\n{"b":2}\n{"c"')).toEqual({ lines: ['{"a":1}', '{"b":2}'], rest: '{"c"' });
  });

  it("drops blank lines", () => {
    expect(splitNdjson("\n{\"a\":1}\n\n")).toEqual({ lines: ['{"a":1}'], rest: "" });
  });
});

describe("streamEndAction", () => {
  it("stops once the run reached done/error", () => {
    expect(streamEndAction({ finished: true, aborted: false })).toEqual({ reconnect: false });
  });

  it("stops when the consumer aborted", () => {
    expect(streamEndAction({ finished: false, aborted: true })).toEqual({ reconnect: false });
  });

  it("reconnects otherwise (an unterminated tail is never consumed, so from= resends it)", () => {
    expect(streamEndAction({ finished: false, aborted: false })).toEqual({ reconnect: true });
    expect(streamEndAction({ finished: false, aborted: false, runStatus: "running" })).toEqual({ reconnect: true });
  });

  it("does not reconnect once the run itself has ended", () => {
    for (const runStatus of ["cancelled", "failed", "completed"]) {
      expect(streamEndAction({ finished: false, aborted: false, runStatus })).toEqual({ reconnect: false });
    }
  });
});

describe("endedUnexpectedly", () => {
  it("is true only when the run ended without a terminal event", () => {
    expect(endedUnexpectedly({ finished: false, aborted: false, runStatus: "cancelled" })).toBe(true);
    expect(endedUnexpectedly({ finished: true, aborted: false, runStatus: "failed" })).toBe(false);
    expect(endedUnexpectedly({ finished: false, aborted: true, runStatus: "failed" })).toBe(false);
    expect(endedUnexpectedly({ finished: false, aborted: false, runStatus: "running" })).toBe(false);
    expect(endedUnexpectedly({ finished: false, aborted: false, runStatus: null })).toBe(false);
  });
});
