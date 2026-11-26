import { beforeEach, describe, expect, it, vi } from "vitest";

const getReadable = vi.fn();
const status = vi.fn();
vi.mock("workflow/api", () => ({
  getRun: () => ({ getReadable, get status() { return status(); } }),
  start: vi.fn(),
}));

import { GET } from "@/app/api/runs/[runId]/stream/route";

const events = [0, 1, 2].map((i) => ({ step: "convert", status: "done", title: `e${i}`, timestamp: "t" }));

beforeEach(() => {
  getReadable.mockReset();
  status.mockReset();
  status.mockResolvedValue("running");
  getReadable.mockImplementation(({ startIndex = 0 }: { startIndex?: number }) =>
    new ReadableStream({
      start(c) {
        events.slice(startIndex).forEach((e) => c.enqueue(e));
        c.close();
      },
    }),
  );
});

const call = (qs = "", runId = "wrun_ABC123") =>
  GET(new Request(`http://x/api/runs/r1/stream${qs}`), {
    params: Promise.resolve({ runId }),
  });

describe("stream route", () => {
  it("streams NDJSON from the given index", async () => {
    const res = await call("?from=1");
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const lines = (await res.text()).split("\n").filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).title).toBe("e1");
    expect(getReadable).toHaveBeenCalledWith({ startIndex: 1 });
  });
  it("defaults to index 0 and ignores bad from", async () => {
    const res = await call("?from=abc");
    expect((await res.text()).split("\n").filter(Boolean)).toHaveLength(3);
  });
  it("returns 404 for an unknown run without streaming", async () => {
    status.mockRejectedValue(new Error("not found"));
    const res = await call();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Run not found" });
    expect(getReadable).not.toHaveBeenCalled();
  });
  it("rejects a malformed runId with 404 before calling getRun", async () => {
    for (const id of ["r1", "wrun_", "wrun_a/../b", "../etc", "wrun_a b"]) {
      const res = await call("", id);
      expect(res.status).toBe(404);
    }
    expect(status).not.toHaveBeenCalled();
    expect(getReadable).not.toHaveBeenCalled();
  });
  it("reports the run status in x-run-status", async () => {
    expect((await call()).headers.get("x-run-status")).toBe("running");
  });
  it("ends the response for a cancelled run whose stream never closes", async () => {
    vi.useFakeTimers();
    try {
      status.mockResolvedValue("cancelled");
      getReadable.mockImplementation(
        () =>
          new ReadableStream({
            start(c) {
              c.enqueue(events[0]);
            }, // never closes
          }),
      );
      const res = await call();
      expect(res.headers.get("x-run-status")).toBe("cancelled");
      const text = res.text();
      await vi.advanceTimersByTimeAsync(5000);
      expect((await text).split("\n").filter(Boolean)).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
