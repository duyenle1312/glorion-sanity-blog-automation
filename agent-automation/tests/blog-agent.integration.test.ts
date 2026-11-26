import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { start } from "workflow/api";
import { FatalError } from "workflow";
import { blogAgentWorkflow } from "@/workflows/blog-agent";
import type { TimelineEvent } from "@/lib/events";
import { setDepsForTesting, type AgentDeps } from "@/lib/deps";
import { docxToHtml } from "@/lib/convert/docx-to-html";

const sample = new Uint8Array(
  readFileSync(
    fileURLToPath(new URL("../sample-blog/NFL_Sentiment_Blog.docx", import.meta.url)),
  ),
);

const STUDIO_URL = "https://studio.example/structure/blog;abc";

function makeDeps() {
  return {
    docxToHtml: vi.fn(docxToHtml),
    analyzeArticle: vi.fn<AgentDeps["analyzeArticle"]>(async () => ({
      description: "A short description.",
      keywords: "nfl, sentiment, GLORION Media",
      summary: null,
    })),
    slugExists: vi.fn<AgentDeps["slugExists"]>(async () => false),
    uploadCover: vi.fn<AgentDeps["uploadCover"]>(async () => ({
      assetId: "image-1",
      url: "https://cdn.example/x.png",
    })),
    createDraft: vi.fn<AgentDeps["createDraft"]>(async () => ({
      id: "drafts.abc",
      studioUrl: STUDIO_URL,
    })),
    sendDraftEmail: vi.fn<AgentDeps["sendDraftEmail"]>(async () => "sent" as const),
  };
}

async function collect(stream: ReadableStream<TimelineEvent>): Promise<TimelineEvent[]> {
  const out: TimelineEvent[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

const terminalSteps = (events: TimelineEvent[]) =>
  events.filter((e) => e.status !== "running").map((e) => e.step);

describe("blogAgentWorkflow", () => {
  let deps: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    deps = makeDeps();
    setDepsForTesting(deps);
  });
  afterEach(() => setDepsForTesting(null));

  it("runs every step in order and creates one draft", async () => {
    const run = await start(blogAgentWorkflow, [
      { filename: "NFL_Sentiment_Blog.docx", docx: sample },
    ]);
    const result = await run.returnValue;
    const events = await collect(run.getReadable<TimelineEvent>());

    expect(result).toEqual({
      title: expect.any(String),
      draftId: "drafts.abc",
      studioUrl: STUDIO_URL,
    });
    expect(terminalSteps(events)).toEqual([
      "received",
      "convert",
      "analyze",
      "cover",
      "sanity",
      "email",
      "done",
    ]);
    expect(events[0]).toMatchObject({
      step: "received",
      status: "done",
      detail: "NFL_Sentiment_Blog.docx",
    });
    const analyzeDone = events.find((e) => e.step === "analyze" && e.status === "done");
    expect(analyzeDone?.detail).toBe("Using existing Summary section");
    expect(events.find((e) => e.step === "cover")?.status).toBe("skipped");
    expect(events.at(-1)).toMatchObject({ step: "done", status: "done", url: STUDIO_URL });
    for (const e of events) expect(typeof e.timestamp).toBe("string");

    expect(deps.createDraft).toHaveBeenCalledTimes(1);
    const draft = deps.createDraft.mock.calls[0][0];
    expect(draft).not.toHaveProperty("isPublished");
    expect(draft.keywords.endsWith("GLORION Media")).toBe(true);
    expect(draft.slug).toBe(draft.slug.toLowerCase());
    expect(draft.imageURL).toBeUndefined();
    expect(draft.imageAssetId).toBeUndefined();
    expect(deps.sendDraftEmail).toHaveBeenCalledWith({
      title: result.title,
      studioUrl: STUDIO_URL,
    });
  });

  it("stops before Sanity when analysis fails fatally", async () => {
    deps.analyzeArticle.mockRejectedValue(new FatalError("Gemini said no"));
    const run = await start(blogAgentWorkflow, [
      { filename: "NFL_Sentiment_Blog.docx", docx: sample },
    ]);
    await expect(run.returnValue).rejects.toThrow();
    const events = await collect(run.getReadable<TimelineEvent>());

    expect(events.at(-1)).toMatchObject({ step: "error", status: "error" });
    expect(events.at(-1)?.detail).toContain("Gemini said no");
    expect(deps.analyzeArticle).toHaveBeenCalledTimes(1);
    expect(deps.createDraft).not.toHaveBeenCalled();
    expect(deps.sendDraftEmail).not.toHaveBeenCalled();
  });

  it("completes when the email fails", async () => {
    deps.sendDraftEmail.mockRejectedValue(new Error("Brevo down"));
    const run = await start(blogAgentWorkflow, [
      { filename: "NFL_Sentiment_Blog.docx", docx: sample },
    ]);
    const result = await run.returnValue;
    const events = await collect(run.getReadable<TimelineEvent>());

    expect(result.draftId).toBe("drafts.abc");
    const email = events.filter((e) => e.step === "email" && e.status !== "running");
    expect(email).toHaveLength(1);
    expect(email[0]).toMatchObject({ status: "error" });
    expect(events.at(-1)).toMatchObject({ step: "done", status: "done" });
  });

  it("fails without retrying on a corrupt docx", async () => {
    const run = await start(blogAgentWorkflow, [
      { filename: "broken.docx", docx: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]) },
    ]);
    await expect(run.returnValue).rejects.toThrow();
    const events = await collect(run.getReadable<TimelineEvent>());

    expect(deps.docxToHtml).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({ step: "error", status: "error" });
    expect(events.at(-1)?.detail).toMatch(/not a valid \.docx/);
    expect(deps.analyzeArticle).not.toHaveBeenCalled();
  });

  it("uploads a cover file and uses its URL", async () => {
    const run = await start(blogAgentWorkflow, [
      {
        filename: "NFL_Sentiment_Blog.docx",
        docx: sample,
        coverFile: { bytes: new Uint8Array([1, 2, 3]), filename: "cover.png", contentType: "image/png" },
      },
    ]);
    await run.returnValue;
    const events = await collect(run.getReadable<TimelineEvent>());

    expect(events.find((e) => e.step === "cover" && e.status === "done")?.detail).toBe(
      "Uploaded cover.png",
    );
    expect(deps.createDraft.mock.calls[0][0]).toMatchObject({
      imageURL: "https://cdn.example/x.png",
      imageAssetId: "image-1",
    });
  });

  it("prefers a cover URL over the uploaded asset URL", async () => {
    const run = await start(blogAgentWorkflow, [
      {
        filename: "NFL_Sentiment_Blog.docx",
        docx: sample,
        coverUrl: "https://img.example/c.jpg",
        coverFile: { bytes: new Uint8Array([1]), filename: "c.png", contentType: "image/png" },
      },
    ]);
    await run.returnValue;
    expect(deps.createDraft.mock.calls[0][0]).toMatchObject({
      imageURL: "https://img.example/c.jpg",
      imageAssetId: "image-1",
    });
  });

  it("inserts the generated summary when the docx has none and picks a free slug", async () => {
    const html = "<h2>Intro</h2><p>Hello world body text.</p>";
    deps.docxToHtml.mockResolvedValue({ html, warnings: [] });
    deps.analyzeArticle.mockResolvedValue({
      description: "d",
      keywords: "a, GLORION Media",
      summary: "Generated summary paragraph.",
    });
    deps.slugExists.mockImplementation(async (s) => s === "my-post");
    const run = await start(blogAgentWorkflow, [{ filename: "my_post.docx", docx: sample }]);
    const result = await run.returnValue;
    const events = await collect(run.getReadable<TimelineEvent>());

    expect(result.title).toBe("my post");
    expect(events.find((e) => e.step === "analyze" && e.status === "done")?.detail).toBe(
      "Generated summary",
    );
    expect(deps.analyzeArticle.mock.calls[0][0]).toMatchObject({
      title: "my post",
      existingSummary: null,
    });
    const draft = deps.createDraft.mock.calls[0][0];
    expect(draft.slug).toBe("my-post-2");
    const [h, p] = draft.body as Array<{ style?: string; children?: Array<{ text: string }> }>;
    expect(h.style).toBe("h2");
    expect(h.children?.[0].text).toBe("Summary");
    expect(p.children?.[0].text).toBe("Generated summary paragraph.");
  });
});
