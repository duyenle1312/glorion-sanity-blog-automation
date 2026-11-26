import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { analyzeArticle, normalizeKeywords } from "@/lib/analyze";

const keywords = Array.from({ length: 12 }, (_, i) => `keyword ${i + 1}`);

function mockModel(json: unknown) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify(json) }],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 20, text: 20, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

describe("normalizeKeywords", () => {
  it("trims, dedupes case-insensitively and appends GLORION Media", () => {
    expect(normalizeKeywords(["a", "A", " b ", "Glorion Media"])).toBe(
      "a, b, GLORION Media",
    );
  });
});

describe("analyzeArticle", () => {
  it("uses the existing summary and returns summary null", async () => {
    const model = mockModel({ description: "Short description.", keywords });
    const result = await analyzeArticle(
      { title: "T", plainText: "Body text", existingSummary: "My existing summary text" },
      model,
    );
    expect(result.summary).toBeNull();
    expect(result.description).toBe("Short description.");
    expect(result.keywords.endsWith(", GLORION Media")).toBe(true);
    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).toContain(
      "My existing summary text",
    );
  });

  it("returns the generated summary when none exists", async () => {
    const summary = "s".repeat(220);
    const model = mockModel({ description: "d", keywords, summary });
    const result = await analyzeArticle(
      { title: "T", plainText: "Body", existingSummary: null },
      model,
    );
    expect(result.summary).toBe(summary);
  });

  it("rejects when summary is required but missing", async () => {
    const model = mockModel({ description: "d", keywords });
    await expect(
      analyzeArticle({ title: "T", plainText: "Body", existingSummary: null }, model),
    ).rejects.toThrow();
  });

  it("rejects a description over 160 chars", async () => {
    const model = mockModel({ description: "x".repeat(161), keywords });
    await expect(
      analyzeArticle({ title: "T", plainText: "B", existingSummary: "s" }, model),
    ).rejects.toThrow();
  });
});
