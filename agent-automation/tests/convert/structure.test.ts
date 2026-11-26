import { describe, it, expect } from "vitest";
import { htmlToBody } from "@/lib/convert/html-to-blocks";
import {
  extractTitle,
  findSummary,
  insertSummary,
  blocksToPlainText,
} from "@/lib/convert/structure";

const body = (html: string) => htmlToBody(html).blocks;

describe("findSummary", () => {
  it("matches a heading of any level with case and trailing colon variations", () => {
    expect(findSummary(body("<h3>SUMMARY:</h3><p>x</p>"))).toEqual({ text: "x" });
  });

  it("matches a paragraph whose only content is bold text", () => {
    expect(findSummary(body("<p><strong>Summary</strong></p><p>x</p>"))).toEqual({ text: "x" });
  });

  it("does not match a normal paragraph that merely starts with Summary", () => {
    expect(findSummary(body("<p>Summary of results is below</p><p>x</p>"))).toBeNull();
  });

  it("does not match a bold-only paragraph that merely starts with Summary", () => {
    expect(findSummary(body("<p><strong>Summary of results</strong></p><p>x</p>"))).toBeNull();
  });

  it("returns null when the Summary marker is directly followed by a heading", () => {
    expect(findSummary(body("<h2>Summary</h2><h2>Next</h2><p>c</p>"))).toBeNull();
  });

  it("returns null when there is no summary", () => {
    expect(findSummary(body("<h2>Intro</h2><p>x</p>"))).toBeNull();
  });

  it("joins paragraphs until the next heading with blank lines", () => {
    expect(
      findSummary(body("<h2>Summary</h2><p>a</p><p>b</p><h2>Next</h2><p>c</p>")),
    ).toEqual({ text: "a\n\nb" });
  });
});

describe("insertSummary", () => {
  it("prepends an h2 Summary heading and a normal paragraph", () => {
    const out = insertSummary(body("<p>existing</p>"), "the summary");
    expect(out).toHaveLength(3);
    const [h, p] = out as Array<{ style: string; _key: string; children: { text: string; _key: string }[] }>;
    expect(h.style).toBe("h2");
    expect(h.children.map((c) => c.text).join("")).toBe("Summary");
    expect(p.style).toBe("normal");
    expect(p.children.map((c) => c.text).join("")).toBe("the summary");
    expect(h._key).toBeTruthy();
    expect(p.children[0]._key).toBeTruthy();
  });
});

describe("extractTitle", () => {
  it("falls back to a cleaned filename when there is no h1", () => {
    expect(extractTitle([], "NFL_Sentiment Blog!.docx")).toEqual({
      title: "NFL Sentiment Blog",
      blocks: [],
    });
  });

  it("falls back to Untitled and removes empty h1 blocks", () => {
    const { title, blocks } = extractTitle(body("<h1> </h1><p>x</p>"), "!!!.docx");
    expect(title).toBe("Untitled");
    expect(blocks.some((b) => (b as { style?: string }).style === "h1")).toBe(false);
  });

  it("uses the first non-empty h1 and removes empty ones before it", () => {
    const blocks = insertSummary(body("<h1>Real</h1><p>x</p>"), "s");
    const withEmpty = [
      { _type: "block", _key: "e1", style: "h1", markDefs: [], children: [{ _type: "span", _key: "e1s", text: " ", marks: [] }] },
      ...blocks,
    ] as typeof blocks;
    const out = extractTitle(withEmpty, "f.docx");
    expect(out.title).toBe("Real");
    expect(out.blocks.some((b) => (b as { style?: string }).style === "h1")).toBe(false);
    expect(out.blocks).toHaveLength(3);
  });

  it("uses and removes the first h1", () => {
    const { title, blocks } = extractTitle(body("<h1>T</h1><p>x</p><h1>Second</h1>"), "f.docx");
    expect(title).toBe("T");
    expect(blocks).toHaveLength(2);
  });
});

describe("htmlToBody", () => {
  it("turns links into link markDefs with href", () => {
    const [block] = body('<p><a href="https://x.y">l</a></p>') as unknown as Array<{
      markDefs: { _type: string; _key: string; href: string }[];
      children: { marks: string[] }[];
    }>;
    expect(block.markDefs).toHaveLength(1);
    expect(block.markDefs[0]).toMatchObject({ _type: "link", href: "https://x.y" });
    expect(block.children[0].marks).toContain(block.markDefs[0]._key);
  });

  it("drops images and counts them", () => {
    const out = htmlToBody('<p>a</p><p><img src="data:image/png;base64,AA=="></p><img src="x.png">');
    expect(out.droppedImages).toBe(2);
    expect(JSON.stringify(out.blocks)).not.toContain("image");
  });

  it("defaults headerRows to 1 for a multi-row table without header markup, 0 for single-row", () => {
    const [multi] = body(
      "<table><tr><td>a</td></tr><tr><td>b</td></tr></table>",
    ) as unknown as Array<{ headerRows: number }>;
    expect(multi.headerRows).toBe(1);
    const [single] = body("<table><tr><td>a</td></tr></table>") as unknown as Array<{ headerRows: number }>;
    expect(single.headerRows).toBe(0);
  });

  it("uses thead rows for headerRows", () => {
    const [t] = body(
      "<table><thead><tr><th>A</th></tr><tr><th>B</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>",
    ) as Array<{ _type: string; headerRows: number; rows: unknown[] }>;
    expect(t._type).toBe("table");
    expect(t.headerRows).toBe(2);
    expect(t.rows).toHaveLength(3);
  });
});

describe("blocksToPlainText", () => {
  it("renders headings, paragraphs and table rows as a | b lines", () => {
    const text = blocksToPlainText(
      body("<h2>H</h2><p>para</p><table><tr><td>a</td><td>b</td></tr></table>"),
    );
    expect(text).toBe("H\n\npara\n\na | b");
  });
});
