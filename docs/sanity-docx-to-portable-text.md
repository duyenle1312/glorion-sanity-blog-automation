# Getting a .docx into a Sanity rich-text field

Researched 2026-11-26 against Sanity docs (via the Sanity MCP `search_docs`/`read_docs`) and npm.

## TL;DR

Sanity has **no endpoint that accepts a .docx (or HTML, or Markdown)**. Every way of writing content —
the HTTP Mutations API, `@sanity/client`, and the Sanity MCP server — takes **JSON documents**, and
a rich-text field like `blog.body` must be sent as **Portable Text** (an array of typed JSON blocks).
So, as with Notion, a conversion step is required. The difference from Notion: Notion needed HTML
because it takes its own block JSON one append at a time; Sanity takes the whole Portable Text array
in a single write, and Sanity ships the HTML → Portable Text converter itself.

Recommended pipeline (what the blog agent uses):

```
.docx ──mammoth──▶ semantic HTML ──@portabletext/block-tools htmlToBlocks──▶ Portable Text ──@sanity/client──▶ draft document
       (Word styles → <h2>, <ul>,   (HTML → blocks validated against        (one createOrReplace
        <strong>, <table>…)          the body field's schema)                mutation)
```

HTML stays as the intermediate format because it's the richest lossless bridge: `mammoth` maps Word
paragraph styles (Heading 1/2/3, lists, bold/italic, links, tables) to clean semantic HTML, and
Sanity's official converter consumes HTML.

## What Portable Text looks like

```json
[
  {
    "_type": "block", "_key": "a1", "style": "h2", "markDefs": [],
    "children": [{"_type": "span", "_key": "a1s0", "text": "Sentiment: The Numbers", "marks": []}]
  },
  {
    "_type": "block", "_key": "b2", "style": "normal", "markDefs": [],
    "children": [
      {"_type": "span", "_key": "b2s0", "text": "Price was the ", "marks": []},
      {"_type": "span", "_key": "b2s1", "text": "dominant", "marks": ["strong"]},
      {"_type": "span", "_key": "b2s2", "text": " concern.", "marks": []}
    ]
  },
  {
    "_type": "block", "_key": "c3", "style": "normal", "listItem": "number", "level": 1, "markDefs": [],
    "children": [{"_type": "span", "_key": "c3s0", "text": "Price (31% of posts)", "marks": []}]
  }
]
```

- Paragraph style → `style` (`normal`, `h1`–`h6`, `blockquote`).
- Bold/italic/etc. → **decorators** in `marks` (`strong`, `em`, `code`, `underline`, `strike-through`).
- Links → **annotations**: an entry in `markDefs` (`{_key, _type: "link", href}`) whose `_key` is
  listed in the span's `marks`.
- Lists → `listItem` (`bullet`/`number`) + `level` on the block (lists are flat, not nested arrays).
- Non-text content (images, tables) → custom objects in the same array, each with `_type` and `_key`.

## Converter: `@portabletext/block-tools`

- Package: `@portabletext/block-tools` (v6.x). `@sanity/block-tools` is **deprecated/renamed**.
- `htmlToBlocks(html, blockContentSchema, { parseHtml, rules })`
  - `blockContentSchema` — the compiled schema of the array field (styles/lists/decorators/annotations
    allowed), so output only contains what the field accepts.
  - `parseHtml` — server-side needs a DOM: `(html) => new JSDOM(html).window.document`.
  - `rules` — custom deserializers for elements it doesn't handle by default. Default rules cover
    paragraphs, headings, lists, blockquote, strong/em/code/underline/strike, and links. **Tables need
    a custom rule** (see below). The official guide
    ["Converting Inline Styles to Sanity Block Decorators"](https://www.sanity.io/docs/developer-guides/converting-inline-styles-to-sanity-block-decorators)
    shows the rule format.
- Output blocks may lack `_key`s; add them (e.g. `nanoid`) before writing — the API requires `_key`
  on array members of a document.

Alternatives considered:
- `@portabletext/markdown` (Markdown ↔ PT). Would need DOCX → Markdown first; mammoth's Markdown
  output is deprecated and Markdown has no table/underline fidelity. Not used.
- Asking an LLM to emit Portable Text. Non-deterministic, can alter wording. Not used.

## Tables

Sanity Studio has **built-in table editing from v6.6.0** (`@portabletext/plugin-table`, off by
default). Canonical shape:

```json
{
  "_type": "table", "_key": "t1", "headerRows": 1,
  "rows": [
    {"_type": "row", "_key": "r0", "cells": [
      {"_type": "cell", "_key": "c0", "value": [ /* blocks */ ]},
      {"_type": "cell", "_key": "c1", "value": [ /* blocks */ ]}
    ]}
  ]
}
```

Schema: a `table` object type with `headerRows: number` and `rows[] → row{cells[] → cell{value: block[]}}`,
added to `body.of`; enable with `form.components.portableText.plugins` → `table: {enabled: true}`.

**This Studio is on v5.31.2 and will be upgraded to v6.6+** so the native table editor can be
enabled (decided 2026-11-26).

## Writing the document: `@sanity/client` (what the app uses)

```ts
import {createClient} from '@sanity/client'

const client = createClient({
  projectId: 'b57pzymc', dataset: 'production',
  apiVersion: '2026-05-15', useCdn: false,
  token: process.env.SANITY_API_WRITE_TOKEN, // Editor role, server-side only
})

// A document whose _id starts with "drafts." is a draft: visible in Studio, invisible to the
// public site (its client has no token, so it only sees published docs).
await client.createOrReplace({
  _id: `drafts.${crypto.randomUUID()}`,
  _type: 'blog',
  title, slug: {_type: 'slug', current: slug},
  publishedAt: now, lastEditedAt: now, isPublished: false, // a human flips it after review
  description, keywords,
  imageURL: coverUrl ?? asset?.url,                                       // default cover field
  image: asset ? {_type: 'image', asset: {_type: 'reference', _ref: asset._id}} : undefined, // only if a file was uploaded
  body, // Portable Text array
})

// Cover image upload → asset document
const asset = await client.assets.upload('image', buffer, {filename})
```

Under the hood this is one POST to `/v{apiVersion}/data/mutate/{dataset}` with a `createOrReplace`
mutation — a single atomic write, no per-block appends as with Notion.

## The Sanity MCP server — what it's for and why the app doesn't use it

The Sanity MCP server is a **tool interface for AI assistants** (e.g. Claude Code in this repo), not
an SDK for apps. Relevant tools:

| Tool | Does |
|---|---|
| `create_documents` | Create documents from structured JSON you provide (`{type, content}`); creates **drafts** (`drafts.*`) unless the type is liveEdit or a `releaseId` is given. Whole request ≤ **100 kB**. Assets must already exist and be referenced by asset ID. |
| `patch_documents` | `set` / `setIfMissing` / `unset` / `insert` / `inc` / `dec` / `diffMatchPatch` on drafts or release versions (never directly on published). ≤ 25 docs, ≤ 100 kB per call. |
| `get_schema` / `query_documents` / `get_document` | Inspect schema and content (GROQ). |
| `publish_documents` / `discard_drafts` | Publish or throw away drafts. |
| `media_library_upload_from_file`, `dataset_assets_upload_from_url` | Upload assets. |

So the MCP also expects Portable Text JSON for `body` — it doesn't accept .docx/HTML either. It's
useful for an assistant to inspect or fix content interactively, but for an automated pipeline
`@sanity/client` is the right layer: no 100 kB cap, no MCP session, server-side token, typed errors.

## Sources

- https://www.sanity.io/docs/studio/portable-text-editor-configuration (PT structure, table editing, v6.6.0)
- https://www.sanity.io/docs/developer-guides/converting-inline-styles-to-sanity-block-decorators (`htmlToBlocks` rules)
- https://www.sanity.io/docs/developer-guides/beginners-guide-to-portable-text
- npm: `@portabletext/block-tools` 6.0.8, `@portabletext/markdown` 2.9.6, `@sanity/block-tools` (deprecated)
