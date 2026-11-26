import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { docxToHtml } from "@/lib/convert/docx-to-html";
import { htmlToBody } from "@/lib/convert/html-to-blocks";
import { extractTitle, findSummary } from "@/lib/convert/structure";
import type { BodyItem, TableBlock } from "@/lib/convert/body-schema";

const samplePath = fileURLToPath(
  new URL("../../sample-blog/NFL_Sentiment_Blog.docx", import.meta.url),
);

type Span = { _type: string; _key?: string; text?: string; marks?: string[] };
type TextBlock = { _type: "block"; _key: string; style?: string; children: Span[] };

const textOf = (b: TextBlock) => b.children.map((c) => c.text ?? "").join("");
const cellText = (cell: TableBlock["rows"][number]["cells"][number]) =>
  (cell.value as unknown as TextBlock[]).map(textOf).join("\n");

let blocks: BodyItem[];
let title: string;

beforeAll(async () => {
  const bytes = new Uint8Array(await readFile(samplePath));
  const { html } = await docxToHtml(bytes);
  const body = htmlToBody(html);
  ({ title, blocks } = extractTitle(body.blocks, "NFL_Sentiment_Blog.docx"));
});

describe("sample docx conversion", () => {
  it("extracts the H1 as the title and removes it from the body", () => {
    expect(title).toBe("NFL Fans Paid for Streaming and Still Missed Their Teams");
    expect(blocks.some((b) => (b as TextBlock).style === "h1")).toBe(false);
  });

  it("finds the Summary section", () => {
    const summary = findSummary(blocks);
    expect(summary).not.toBeNull();
    expect(summary!.text.startsWith(
      "NFL streaming conversation in the United States centered on cost and access",
    )).toBe(true);
  });

  it("converts the one table to the canonical table shape", () => {
    const tables = blocks.filter((b): b is TableBlock => b._type === "table");
    expect(tables).toHaveLength(1);
    const [table] = tables;
    expect(table.headerRows).toBe(1);
    const rows = table.rows.map((r) => r.cells.map(cellText));
    expect(rows).toEqual([
      ["Sentiment", "Share"],
      ["Positive", "3%"],
      ["Negative", "12%"],
    ]);
    expect(table.rows[0]._type).toBe("row");
    expect(table.rows[0].cells[0]._type).toBe("cell");
  });

  it("maps docx headings to h2/h3", () => {
    const heading = blocks.find(
      (b) => b._type === "block" && textOf(b as TextBlock) === "Sentiment: The Numbers",
    ) as TextBlock | undefined;
    expect(heading).toBeDefined();
    expect(["h2", "h3"]).toContain(heading!.style);
  });

  it("gives every item, row, cell, nested block and span a unique non-empty _key", () => {
    const keys: string[] = [];
    const visitBlock = (b: TextBlock) => {
      keys.push(b._key);
      for (const s of b.children) keys.push(s._key ?? "");
    };
    for (const item of blocks) {
      if (item._type === "table") {
        const t = item as TableBlock;
        keys.push(t._key);
        for (const row of t.rows) {
          keys.push(row._key);
          for (const cell of row.cells) {
            keys.push(cell._key);
            for (const b of cell.value as unknown as TextBlock[]) visitBlock(b);
          }
        }
      } else {
        visitBlock(item as TextBlock);
      }
    }
    expect(keys.every((k) => typeof k === "string" && k.length > 0)).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
