import { describe, expect, it } from "vitest";
import { STEP_TITLES, timelineEvent } from "@/lib/events";

describe("timelineEvent", () => {
  it("adds an ISO timestamp", () => {
    const e = timelineEvent(
      { step: "convert", status: "done", title: "Convert", detail: "3 blocks" },
      new Date("2026-11-26T10:00:00.000Z"),
    );
    expect(e).toEqual({
      step: "convert",
      status: "done",
      title: "Convert",
      detail: "3 blocks",
      timestamp: "2026-11-26T10:00:00.000Z",
    });
  });

  it("defaults the timestamp to now", () => {
    const before = Date.now();
    const e = timelineEvent({ step: "received", status: "done", title: "Received" });
    expect(Date.parse(e.timestamp)).toBeGreaterThanOrEqual(before);
  });

  it("drops undefined optional fields so the stream payload stays clean", () => {
    const e = timelineEvent({ step: "cover", status: "skipped", title: "Cover", detail: undefined });
    expect(e).not.toHaveProperty("detail");
    expect(e).not.toHaveProperty("url");
  });
});

describe("STEP_TITLES", () => {
  it("has a title for every step", () => {
    expect(Object.keys(STEP_TITLES).sort()).toEqual(
      ["analyze", "convert", "cover", "done", "email", "error", "received", "sanity"].sort(),
    );
  });
});
