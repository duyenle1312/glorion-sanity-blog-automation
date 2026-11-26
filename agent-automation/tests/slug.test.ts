import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "@/lib/slug";

describe("slugify", () => {
  it("folds punctuation and dashes", () => {
    expect(slugify("NFL Fans Paid for Streaming — and Still Missed!")).toBe(
      "nfl-fans-paid-for-streaming-and-still-missed",
    );
  });
  it("ascii-folds accents", () => {
    expect(slugify("Café Déjà Vu")).toBe("cafe-deja-vu");
  });
  it("caps at 96 chars without trailing dash", () => {
    const s = slugify("word ".repeat(40));
    expect(s.length).toBeLessThanOrEqual(96);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("uniqueSlug", () => {
  it("returns base when free", async () => {
    expect(await uniqueSlug("a", () => Promise.resolve(false))).toBe("a");
  });
  it("falls back to post for empty base", async () => {
    expect(await uniqueSlug(slugify("日本語"), (s) => Promise.resolve(s === "post"))).toBe("post-2");
  });
  it("suffixes on collision", async () => {
    expect(
      await uniqueSlug("a", (s) => Promise.resolve(["a", "a-2"].includes(s))),
    ).toBe("a-3");
  });
});
