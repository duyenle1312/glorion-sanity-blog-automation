import { nanoid } from "nanoid";
import type { PortableTextBlock } from "@portabletext/block-tools";
import type { BodyItem, TableBlock } from "./body-schema";

type Span = { _type: string; text?: string; marks?: string[] };
type TextBlock = {
  _type: "block";
  _key: string;
  style?: string;
  listItem?: string;
  children: Span[];
  markDefs?: unknown[];
};

const isTextBlock = (b: BodyItem): b is BodyItem & TextBlock =>
  b._type === "block" && Array.isArray((b as Partial<TextBlock>).children);
const isTable = (b: BodyItem): b is TableBlock => b._type === "table";
const isHeading = (b: BodyItem) => isTextBlock(b) && /^h[1-6]$/.test(b.style ?? "");
const blockText = (b: TextBlock) => b.children.map((c) => c.text ?? "").join("");

const isSummaryText = (text: string) => /^summary:?$/i.test(text.trim());

/** A paragraph whose only non-whitespace content is bold text. */
const isBoldOnly = (b: TextBlock) => {
  const nonEmpty = b.children.filter((c) => (c.text ?? "").trim() !== "");
  return nonEmpty.length > 0 && nonEmpty.every((c) => c.marks?.includes("strong"));
};

const isSummaryHeading = (b: BodyItem) =>
  isTextBlock(b) && isSummaryText(blockText(b)) && (isHeading(b) || isBoldOnly(b));

export function extractTitle(
  blocks: BodyItem[],
  filename: string,
): { title: string; blocks: BodyItem[] } {
  const index = blocks.findIndex((b) => isTextBlock(b) && b.style === "h1");
  if (index !== -1) {
    const title = blockText(blocks[index] as TextBlock).trim();
    if (title) return { title, blocks: blocks.filter((_, i) => i !== index) };
  }
  const title = filename
    .replace(/\.[^.]*$/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return { title, blocks };
}

export function findSummary(blocks: BodyItem[]): { text: string } | null {
  const start = blocks.findIndex(isSummaryHeading);
  if (start === -1) return null;
  const paragraphs: string[] = [];
  for (const b of blocks.slice(start + 1)) {
    if (isHeading(b) || isSummaryHeading(b)) break;
    if (!isTextBlock(b)) continue;
    const text = blockText(b).trim();
    if (text) paragraphs.push(text);
  }
  return { text: paragraphs.join("\n\n") };
}

const textBlock = (style: string, text: string): PortableTextBlock => ({
  _type: "block",
  _key: nanoid(12),
  style,
  markDefs: [],
  children: [{ _type: "span", _key: nanoid(12), text, marks: [] }],
});

export function insertSummary(blocks: BodyItem[], summary: string): BodyItem[] {
  return [textBlock("h2", "Summary"), textBlock("normal", summary), ...blocks];
}

const cellText = (cell: TableBlock["rows"][number]["cells"][number]) =>
  cell.value
    .filter((b) => isTextBlock(b))
    .map((b) => blockText(b as TextBlock).trim())
    .join(" ");

export function blocksToPlainText(blocks: BodyItem[]): string {
  const parts: string[] = [];
  for (const b of blocks) {
    if (isTable(b)) {
      parts.push(b.rows.map((r) => r.cells.map(cellText).join(" | ")).join("\n"));
    } else if (isTextBlock(b)) {
      const text = blockText(b).trim();
      if (text) parts.push(text);
    }
  }
  return parts.join("\n\n");
}
