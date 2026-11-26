import { htmlToBlocks, type DeserializerRule } from "@portabletext/block-tools";
import { JSDOM } from "jsdom";
import { nanoid } from "nanoid";
import { bodyType, cellValueType, type BodyItem, type TableBlock, type TableCell } from "./body-schema";

const keyGenerator = () => nanoid(12);
const parseHtml = (html: string) => new JSDOM(html).window.document;

function cellToBlocks(cell: HTMLTableCellElement): TableCell["value"] {
  const blocks = htmlToBlocks(cell.innerHTML, cellValueType, { parseHtml, keyGenerator });
  if (blocks.length > 0) return blocks;
  return [
    {
      _type: "block",
      _key: keyGenerator(),
      style: "normal",
      markDefs: [],
      children: [{ _type: "span", _key: keyGenerator(), text: (cell.textContent ?? "").trim(), marks: [] }],
    },
  ];
}

const isHeaderRow = (row: HTMLTableRowElement) =>
  row.parentElement?.nodeName === "THEAD" ||
  (row.cells.length > 0 && Array.from(row.cells).every((c) => c.nodeName === "TH"));

/**
 * Leading <thead>/all-<th> rows. Word tables exported by mammoth carry no header markup,
 * so a multi-row table without one is treated as having a single header row.
 */
function countHeaderRows(rows: HTMLTableRowElement[]): number {
  let n = 0;
  while (n < rows.length && isHeaderRow(rows[n])) n++;
  if (n === 0 && rows.length > 1) return 1;
  return n;
}

function tableToBlock(table: HTMLTableElement): TableBlock {
  const rows = Array.from(table.rows);
  return {
    _type: "table",
    _key: keyGenerator(),
    headerRows: countHeaderRows(rows),
    rows: rows.map((row) => ({
      _type: "row",
      _key: keyGenerator(),
      cells: Array.from(row.cells).map((cell) => ({
        _type: "cell",
        _key: keyGenerator(),
        value: cellToBlocks(cell),
      })),
    })),
  };
}

const tableRule: DeserializerRule = {
  deserialize(el) {
    if (el.nodeName !== "TABLE") return undefined;
    return tableToBlock(el as HTMLTableElement);
  },
};

/** Recursively ensure every object inside an array has a `_key` (Sanity requires it). */
function ensureKeys(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const obj = item as { _key?: unknown };
        if (typeof obj._key !== "string" || obj._key === "") obj._key = keyGenerator();
      }
      ensureKeys(item);
    }
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) ensureKeys(v);
  }
}

export function htmlToBody(html: string): { blocks: BodyItem[]; droppedImages: number } {
  const document = parseHtml(html);
  const images = Array.from(document.querySelectorAll("img"));
  for (const img of images) img.remove();

  const blocks = htmlToBlocks(document.body.innerHTML, bodyType, {
    parseHtml,
    keyGenerator,
    rules: [tableRule],
  }) as BodyItem[];
  ensureKeys(blocks);
  return { blocks, droppedImages: images.length };
}
