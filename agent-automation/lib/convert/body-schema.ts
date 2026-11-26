import { Schema } from "@sanity/schema";
import type { PortableTextBlock, htmlToBlocks } from "@portabletext/block-tools";

/** The compiled array schema type accepted by `htmlToBlocks`. */
type ArraySchemaType = Extract<Parameters<typeof htmlToBlocks>[1], { jsonType: "array" }>;
type Field = { name: string; type: unknown };
type ObjectSchemaType = { fields: Field[] };

/** Mirrors schemaTypes/tableType.ts in the Studio (repo root). */
const tableType = {
  type: "object",
  name: "table",
  fields: [
    { type: "number", name: "headerRows" },
    {
      type: "array",
      name: "rows",
      of: [
        {
          type: "object",
          name: "row",
          fields: [
            {
              type: "array",
              name: "cells",
              of: [
                {
                  type: "object",
                  name: "cell",
                  fields: [{ type: "array", name: "value", of: [{ type: "block" }] }],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

/** Only the `body` field of the Studio's `blog` document is mirrored here. */
const schema = Schema.compile({
  name: "agent",
  types: [
    tableType,
    {
      type: "document",
      name: "blog",
      fields: [{ name: "body", type: "array", of: [{ type: "block" }, { type: "table" }] }],
    },
  ],
});

const blogType = schema.get("blog") as ObjectSchemaType;

/** Compiled `blog.body` array type: default block (styles/lists/decorators/link) + table. */
export const bodyType = blogType.fields.find((f) => f.name === "body")!.type as ArraySchemaType;

/** Compiled array type for a table cell's `value` (blocks only). */
export const cellValueType = (() => {
  const table = schema.get("table") as ObjectSchemaType;
  const rows = table.fields.find((f) => f.name === "rows")!.type as ArraySchemaType;
  const row = rows.of[0] as ObjectSchemaType;
  const cells = row.fields.find((f) => f.name === "cells")!.type as ArraySchemaType;
  const cell = cells.of[0] as ObjectSchemaType;
  return cell.fields.find((f) => f.name === "value")!.type as ArraySchemaType;
})();

export interface TableCell {
  _type: "cell";
  _key: string;
  value: PortableTextBlock[];
}

export interface TableRow {
  _type: "row";
  _key: string;
  cells: TableCell[];
}

export interface TableBlock {
  _type: "table";
  _key: string;
  headerRows: number;
  rows: TableRow[];
}

export type BodyItem = PortableTextBlock | TableBlock;
