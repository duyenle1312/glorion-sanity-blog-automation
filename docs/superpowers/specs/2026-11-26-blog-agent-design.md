# Blog Agent (Next.js + Workflow SDK → Sanity) — Design

Date: 2026-11-26

## Intent

Port the existing BlogAgent (Python/FastAPI) + BlogAgentFE (Vite/React) pair into **one Next.js
project** that uploads blog posts to **Sanity** (project `b57pzymc`, dataset `production`, document
type `blog`) instead of Notion. An editor drops in a `.docx`, an AI agent enriches it (slug, SEO
keywords, summary), the post lands in Sanity as a **draft for review**, and the editor watches every
agent step happen live in the browser — the reason the old app used WebSockets.

Sample input: `agent-automation/sample-blog/NFL_Sentiment_Blog.docx` (headings, paragraphs, numbered
headings, a 2-column table, quotes, FAQ section, an existing "Summary" section; no images).

## Goals

- One Next.js (App Router, TypeScript, Tailwind) app at `agent-automation/` in this repo.
- Upload a `.docx` (+ optional cover image) → a Sanity **draft** `blog` document (`_id: drafts.*`).
  The public site (glorion-website) only sees published documents, so pressing Publish in Studio is
  the review gate.
- Live step-by-step timeline of the agent's work, surviving page refresh / reconnect.
- History tab listing past runs and their timelines, shared across devices.
- Optional email notification (Brevo) when a draft is ready, with a link to it in Studio.
- Runs locally with no Vercel account; deployable to Vercel Hobby (free) later.

## Non-goals

- Notion integration (replaced by Sanity).
- Auto-publishing. A human publishes in Studio.
- Editing posts in the agent UI (Studio does that).
- PDF / Google Docs / Markdown input (only `.docx` for now).
- Inline images inside the body (body schema has no image member; see "Images").

## Anti-goals

- The AI must **not rewrite the article body**. The old flow had Gemini return the whole HTML back,
  which can silently alter or truncate content. Body conversion is deterministic; the LLM only
  produces metadata.
- No invented cover image URLs (the old flow had Gemini make up `cover_imgUrl`).
- No silent content loss: anything the converter drops (e.g. images) is reported as a timeline event.

## Constraints

- Vercel Hobby plan: Workflow SDK included (50k events / 1 GB data written per month). One run ≈ 25–30
  events, so cost is effectively zero.
- **No Vercel AI Gateway.** Use the user's existing `GEMINI_API_KEY` directly via AI SDK's
  `@ai-sdk/google` provider. Default model `gemini-3.5-flash-lite` (configurable via `GEMINI_MODEL`).
- Sanity writes need a token with Editor rights (`SANITY_API_WRITE_TOKEN`), server-side only.
- Existing Studio lives in the repo root (Sanity v5). Schema changes are made there.

## Approaches considered

| Approach | Trade-off | Verdict |
|---|---|---|
| **A. Workflow SDK** (`workflow` + `workflow/next`): each agent step is a `"use step"`, steps write timeline events to `getWritable()`, client reads `run.getReadable({startIndex})` | Durable, resumable stream; per-step retries; run history + inspector for free. Adds a dependency and a storage "world" (automatic locally and on Vercel). | **Picked by the user** |
| B. Single streaming route handler (NDJSON/SSE) | Simplest; but live view lost on refresh, no retries, no history | Rejected |
| C. Custom Node server with real WebSockets | Closest to the old app; doesn't run on Vercel, loses normal Next.js deploy | Rejected |

## Design

### Flow

```
Browser                         Next.js                              Workflow run
  │ POST /api/runs (multipart: docx, cover?)                          
  │──────────────────────────────▶ validate → start(blogAgentWorkflow, [input]) ─▶ steps…
  │◀──────────── { runId } ───────                                    
  │ GET /api/runs/{runId}/stream?from=N                               
  │──────────────────────────────▶ getRun(runId).getReadable({startIndex:N})
  │◀═════ NDJSON timeline events (live, replayable) ══════════════════ getWritable().write(event)
```

The client tracks how many events it has received; on reconnect (refresh, network blip) it reopens
the stream with `from=<count>`. Opening `/runs/{runId}` cold replays from 0.

### Timeline event (kept compatible with the old UI)

```ts
type TimelineEvent = {
  step: string            // "convert" | "analyze" | "cover" | "sanity" | "email" | "done" | "error"
  status: 'running' | 'done' | 'skipped' | 'error'
  title: string           // "Converting DOCX to rich text"
  detail?: string         // "42 blocks, 1 table" / Studio URL / error message
  timestamp: string       // ISO
}
```

### Workflow steps (`workflows/blog-agent.ts`)

1. **convert** — `mammoth` DOCX → HTML; HTML → Portable Text via `@portabletext/block-tools`
   `htmlToBlocks` (with `jsdom`), compiled against a schema mirroring the `blog.body` field, plus a
   custom rule for `<table>` (canonical table shape, see "Tables"). Title = the docx's single `h1`
   (removed from the body — the site renders the title itself), else cleaned filename. Reports
   block/table counts and any dropped content (images). Why HTML as the intermediate and not a
   direct upload: see `docs/sanity-docx-to-portable-text.md` — Sanity's API/MCP accept only
   Portable Text JSON.
2. **analyze** — first, **detect an existing summary**: a heading (any level, or a short bold-only
   paragraph) whose text is "Summary" (case-insensitive, trimmed, optional trailing colon). If found,
   the section stays in the body as written and the LLM is **not** asked to write a summary (event
   detail: "Using existing Summary section"). If not found, the LLM writes a one-paragraph summary
   and the converter inserts an `h2 "Summary"` + paragraph at the top of `body` (same as the old
   flow).
   `description` (card text + SEO meta) is always **condensed by the LLM to ≤ ~155 characters**,
   from the Summary section when present, matching the existing 85 posts (120–175 chars).
   Then Gemini via the AI SDK's **schema-validated structured output** (zod schema passed to the
   SDK: `generateText` + `Output.object({schema})`, or `generateObject` — whichever the installed
   AI SDK version recommends) → `{ keywords: string[] (3–10), summary?: string }`, where `summary`
   is required in the schema only when none was found. This replaces the old manual
   "strip ```json fences → json.loads → .get() defaults" code: the SDK validates the response
   against the schema and throws on mismatch (the step retries). Schema:
   `{ description: string (≤160), keywords: string[] (12–14), summary?: string }`. Input is the
   article's plain text, not HTML. Keywords follow house style: joined with ", " and ending with
   "GLORION Media" (appended in code if missing).
   **Slug is deterministic**, not from the LLM: slugify(title), de-duplicated against existing
   `blog` slugs (append `-2`, `-3`).
3. **cover** — `imageURL` is the default: the upload form has a "Cover image URL" field written to
   `imageURL`. Optionally a cover image *file* can be uploaded instead/as well; it becomes a Sanity
   image asset in `image`, and if no URL was given, `imageURL` is set to the asset's CDN URL so
   list cards still show it. Neither given → `skipped`.
4. **sanity** — `createOrReplace` a document `_id: "drafts.<uuid>"`, `_type: "blog"`, fields:
   `title, slug, publishedAt (now), lastEditedAt (now), isPublished: false, description, keywords,
   imageURL, image (only when a file was uploaded), body`. A human reviews and sets `isPublished`
   to true in Studio. `publishedAt` is "now" at draft time; the editor adjusts it in
   Studio if review takes days. Detail = Studio deep link to the draft.
5. **email** — Brevo transactional email (REST `fetch`, no SDK) to `EMAIL_TO` with title + Studio
   link; `skipped` if Brevo env vars absent. Failure here does **not** fail the run (warn event).
6. **done** — final event; stream closed.

Any step throwing → `error` event with the message, then rethrow (`FatalError` for bad input such as
a non-docx; LLM/Sanity network errors use default retries). Each step writes its own `running` and
`done` events.

### Tables (Studio schema + website renderer) — decided by the user: real tables

- **Studio:** add Sanity's canonical table type (`table{headerRows, rows[row{cells[cell{value:
  block[]}]}]}`) and `{type: 'table'}` to `blog.body.of`. No third-party plugin. **Upgrade Studio
  from v5.31.2 to the latest v6 (≥ 6.6)** (`sanity`, `@sanity/vision`, related deps; follow the v6
  migration notes) and enable native table editing (`portableText.plugins → table: {enabled:
  true}`). Verify `sanity dev` / `sanity build` before deploying; deploy schema/Studio only after
  confirming with the user.
- **Converter:** `<table>` → that shape; first `<tr>` with `<th>` (or first row) → `headerRows: 1`.
- **glorion-website:** `app/blog/[slug]/page.tsx` uses bare `<PortableText value={post.body} />`,
  which renders nothing for unknown types. Add a `components.types.table` renderer (~20 lines,
  styled for the dark `prose-invert` theme). The existing corpus uses only normal/h2/h3/strong;
  default next-sanity rendering already handles lists, links, blockquote, em.
- **glorion-website visibility filter:** add `&& isPublished == true` to the blog list query and
  the single-post query (and any sitemap/related query hitting `_type == "blog"`), so only posts a
  human has approved are live. Note: 1 existing post has `isPublished: false` and will disappear.
- **glorion-website cover image:** post page currently renders only `image`; change it to
  `imageURL` first, falling back to the `image` asset (list cards already use `imageURL`).

### UI (single page + run page)

- `/` — Upload card (drop zone for `.docx`, optional cover image, "Run agent" button) and, once
  started, the live timeline: vertical list of steps with spinner / check / skipped / error states,
  details, timestamps, and a final "Open draft in Studio" button.
- `/runs/[runId]` — same timeline view, replayable/shareable.
- History tab — list of past runs (`getWorld().runs.list`), status, start time, title; click → run page.
- Header shows backend health (replaces old "server online" pinging).

### Access control

The app writes to production Sanity, so it must not be open. Minimal gate: `proxy.ts`/middleware HTTP
Basic Auth using `AGENT_BASIC_AUTH` (`user:password`) env var; disabled if unset (local dev).

### Env vars (`agent-automation/.env.local`, gitignored; `.env.example` committed)

```
GEMINI_API_KEY=            GEMINI_MODEL=gemini-3.5-flash-lite
SANITY_PROJECT_ID=b57pzymc SANITY_DATASET=production   SANITY_API_WRITE_TOKEN=
SANITY_STUDIO_URL=         # for deep links, e.g. https://<name>.sanity.studio
BREVO_API_KEY=  BREVO_SENDER_EMAIL=  EMAIL_TO=          # optional
AGENT_BASIC_AUTH=                                       # optional, user:password
```

### Testing

- Unit: HTML→Portable Text converter against the sample docx (headings, lists, marks, links, table),
  slug normalization/dedup, event helpers.
- Integration: `@workflow/vitest` run of the workflow with the LLM, Sanity, and Brevo clients mocked
  at the leaf; asserts event sequence and the document written.
- Manual end-to-end against the real dataset with the sample docx; draft verified in Studio, then
  discarded.

## Decisions by the user

- Approach A (Workflow SDK) for the live step view.
- Posts land as drafts for review.
- Use the existing Gemini API key; no AI Gateway.
- If the docx already has a "Summary" heading, reuse it; only generate a summary when it's missing.
- LLM output is validated by the AI SDK's zod schema support, replacing the manual JSON parsing.
- Real tables: Studio schema + glorion-website renderer.
- `description` condensed by the LLM to ~155 chars; Summary section stays in the body.
- Upgrade Studio to v6.6+ for native table editing.
- `isPublished: false` on agent uploads; a human flips it to true; glorion-website filters on
  `isPublished == true`.
- Default model `gemini-3.5-flash-lite`.
- `.env.example` documents every variable and where to obtain it (Sanity token steps, Basic Auth).
- Cover: `imageURL` by default; `image` object only when a file is uploaded; website reads
  `imageURL` first, falls back to `image`.

## Calls made by the designer (correct if wrong)

- App lives at `agent-automation/` (Next.js root), sample docx stays in `agent-automation/sample-blog/`.
- LLM produces metadata only; body is converted deterministically.
- Canonical Sanity table type (no plugin); website gets a table renderer.
- docx `h1` stripped from body.
- Keywords follow house style (~13–15, ending "GLORION Media").
- Run history is per-machine locally; shared once deployed (Vercel). Note: Vercel Hobby is for
  non-commercial use — a business deployment may need Pro (still cheap at this volume).
- Cover image is an optional upload, not AI-generated.
- Brevo email kept, optional.
- Basic Auth gate via env var.

## Left to the builder

Component structure and styling details, exact NDJSON vs SSE wire format, test file layout, Next.js
and package versions (current stable), how health is checked.
