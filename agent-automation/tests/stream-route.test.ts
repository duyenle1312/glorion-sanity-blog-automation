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

const call = (qs = "") =>
  GET(new Request(`http://x/api/runs/r1/stream${qs}`), {
    params: Promise.resolve({ runId: "r1" }),
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
});
