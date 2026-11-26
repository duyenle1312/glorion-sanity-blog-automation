# Blog Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Next.js app in `agent-automation/` that turns an uploaded `.docx` into a Sanity draft `blog` post via a durable Workflow SDK run whose steps stream live to the browser; plus the Studio v6 upgrade (native tables) and the glorion-website changes (visibility filter, cover fallback, table renderer).

**Architecture:** `POST /api/runs` validates the upload and calls `start(blogAgentWorkflow, [input])`. Each agent step is a `"use step"` function that writes `TimelineEvent`s to `getWritable()`. The browser reads `GET /api/runs/[runId]/stream?from=N` (NDJSON from `getRun(runId).getReadable({startIndex: N})`) and reconnects with the count it already has. Body conversion is deterministic (mammoth → HTML → `@portabletext/block-tools`); Gemini only produces metadata, validated by a zod schema through the AI SDK.

**Tech Stack:** Next.js 16 (App Router, TS, Tailwind), `workflow` 5.x (+ `workflow/next`), `ai` 7.x + `@ai-sdk/google` 4.x, `zod` 4, `mammoth`, `@portabletext/block-tools` 6 + `@sanity/schema` 6 + `jsdom`, `@sanity/client` 8, Vitest (+ `@workflow/vitest`). Studio: `sanity` 6.x. Website: `next-sanity` (existing).

**Spec:** `docs/superpowers/specs/2026-11-26-blog-agent-design.md` (read it). Background: `docs/sanity-docx-to-portable-text.md`.

## Global Constraints

- App root: `studio-glorion-media/agent-automation/` (its own `package.json`; Studio stays at repo root). Sample: `agent-automation/sample-blog/NFL_Sentiment_Blog.docx`.
- Sanity: projectId `b57pzymc`, dataset `production`, document type `blog`, apiVersion `2026-05-15`.
- Agent documents: `_id` = `drafts.<uuid>`, `isPublished: false`. Never publish from the agent.
- LLM: `@ai-sdk/google` with `GEMINI_API_KEY`; model from `GEMINI_MODEL`, default `gemini-3.5-flash-lite`. **No Vercel AI Gateway.** LLM never rewrites the body.
- LLM output via `generateText({ output: Output.object({ schema }) })` — no manual JSON parsing.
- `description` ≤ 160 chars. Keywords: 12–14 from LLM, joined `", "`, last item `GLORION Media` (append if missing, no duplicate).
- Summary heading match: text trimmed, case-insensitive, optional trailing `:`, equals `summary`; heading of any level or a paragraph whose only content is bold text.
- Cover: `imageURL` = provided URL, else uploaded asset URL; `image` set only when a file was uploaded.
- Upload limits: `.docx` only, ≤ 4 MB (Vercel request body limit is 4.5 MB); cover file `image/*` ≤ 2 MB.
- Secrets server-side only; `.env.local` gitignored; `.env.example` committed and documents every variable and where to get it.
- Any `proxy.ts` matcher must exclude `.well-known/workflow/`.
- Deploying Studio/schema (`sanity deploy`, `sanity schema deploy`) and pushing glorion-website require explicit user confirmation.

## Review Focus

- **Reload / reconnect mid-run** → timeline resumes with no duplicated or missing events (Task 8 test: client resumes from `from=count`; Task 9 reducer test: duplicate `running` events from step retries collapse by `step`).
- **Bad file** (`.doc`, renamed `.txt`, corrupt zip, > 4 MB) → immediate 400 with a clear message, or a `FatalError` with an `error` event and no retries (Task 8 route tests, Task 3 corrupt-docx test).
- **Gemini failure / schema mismatch** → step retries; if it finally fails, an `error` event is shown and **no Sanity document is written** (Task 7 integration test).
- **Docx without H1 and without Summary** → title from cleaned filename, LLM summary inserted as `h2 Summary` at top (Task 3 + Task 7 tests).
- **Slug collision** with an existing post → `-2`, `-3` suffix (Task 4 test).

---

## File Structure (agent-automation/)

```
agent-automation/
  .env.example            all env vars + where to find them
  README.md               setup, run, env instructions
  next.config.ts          withWorkflow(...)
  proxy.ts                Basic Auth gate (excludes .well-known/workflow)
  vitest.config.ts        unit tests
  vitest.integration.config.ts   @workflow/vitest
  lib/
    env.ts                typed env access (zod)
    events.ts             TimelineEvent type + emit() step helper
    convert/docx-to-html.ts
    convert/body-schema.ts       compiled Sanity schema for blog.body (block + table)
    convert/html-to-blocks.ts    htmlToBlocks + table rule + keys
    convert/structure.ts         extractTitle, findSummary, insertSummary, blocksToPlainText
    analyze.ts            Gemini metadata (zod schema), normalizeKeywords
    slug.ts               slugify, uniqueSlug
    sanity.ts             client, uploadCover, createDraft, studioDraftUrl, slugExists
    email.ts              Brevo REST
  workflows/blog-agent.ts blogAgentWorkflow + steps
  app/
    api/runs/route.ts                POST start, GET history
    api/runs/[runId]/stream/route.ts GET NDJSON stream
    api/health/route.ts
    page.tsx                         upload + live timeline + history tab
    runs/[runId]/page.tsx            replayable run view
    components/{UploadForm,Timeline,HistoryList}.tsx
    hooks/useRunStream.ts            reconnecting NDJSON reader + reducer
  tests/…                            mirrors lib/ and workflows/
```

---

### Task 1: Scaffold the Next.js app, env docs, and test harness

**Files:**
- Create: `agent-automation/` Next.js app (create in a temp dir with `npx create-next-app@latest --ts --tailwind --app --eslint --no-src-dir --use-npm`, then move into `agent-automation/` keeping `sample-blog/`)
- Create: `agent-automation/.env.example`, `agent-automation/README.md`, `agent-automation/lib/env.ts`, `vitest.config.ts`, `vitest.integration.config.ts`
- Modify: `agent-automation/next.config.ts` (wrap with `withWorkflow`), `tsconfig.json` (`plugins: [{name: "workflow"}]`), root `.gitignore` (add `agent-automation/.env*.local`, `agent-automation/.next`, `agent-automation/.workflow-data` or whatever the local world writes)
- Test: `agent-automation/tests/env.test.ts`

**Interfaces:**
- Produces: `env` object from `lib/env.ts` — `{ GEMINI_API_KEY: string; GEMINI_MODEL: string; SANITY_PROJECT_ID: string; SANITY_DATASET: string; SANITY_API_WRITE_TOKEN: string; SANITY_STUDIO_URL: string; BREVO_API_KEY?: string; BREVO_SENDER_EMAIL?: string; EMAIL_TO?: string; AGENT_BASIC_AUTH?: string }`, parsed lazily via `getEnv()` (so tests and build don't crash without secrets).

- [ ] **Step 1:** Scaffold, `npm i workflow ai @ai-sdk/google zod mammoth @portabletext/block-tools @sanity/schema @sanity/client jsdom nanoid` and `npm i -D vitest @workflow/vitest @types/jsdom`. Add scripts `test` (`vitest run`) and `test:integration` (`vitest run -c vitest.integration.config.ts`).
- [ ] **Step 2: Write failing test** `tests/env.test.ts`: `getEnv()` with only required vars set returns `GEMINI_MODEL === 'gemini-3.5-flash-lite'`, `SANITY_PROJECT_ID === 'b57pzymc'`, `SANITY_DATASET === 'production'` defaults; missing `SANITY_API_WRITE_TOKEN` throws an error whose message names the variable.
- [ ] **Step 3:** Run `npm test` → FAIL. Implement `lib/env.ts` with a zod schema. Run → PASS.
- [ ] **Step 4: Write `.env.example`** exactly with these sections and comments:

```bash
# ── Gemini (required) ───────────────────────────────────────────────
# Your existing key (same one BlogAgent used). New key: https://aistudio.google.com/apikey
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite

# ── Sanity (required) ───────────────────────────────────────────────
SANITY_PROJECT_ID=b57pzymc
SANITY_DATASET=production
# Write token (Editor role). Create it at:
#   https://www.sanity.io/manage → project "Glorion Media" (b57pzymc) → API → Tokens
#   → "Add API token" → name "blog-agent" → permissions "Editor" → Save → copy (shown once)
# or from the repo root:  npx sanity tokens add "blog-agent" --role=editor
SANITY_API_WRITE_TOKEN=
# Studio base URL used for "Open draft in Studio" links.
# Find it at sanity.io/manage → project → Studios (e.g. https://<name>.sanity.studio),
# or http://localhost:3333 when running `npm run dev` in the Studio.
SANITY_STUDIO_URL=

# ── Email notification via Brevo (optional; step is skipped if unset) ──
# Same values as BlogAgent/.env. Key: https://app.brevo.com → SMTP & API → API Keys
BREVO_API_KEY=
# Must be a verified sender in Brevo → Senders, Domains & Dedicated IPs
BREVO_SENDER_EMAIL=
# Comma-separated recipients
EMAIL_TO=

# ── Access gate (optional locally, REQUIRED when deployed) ────────────
# The app writes to production Sanity, so a deployed copy must not be public.
# Format "username:password" — you choose both; the browser asks for them once.
# Leave empty to disable (local dev only). Generate a password: openssl rand -base64 18
AGENT_BASIC_AUTH=
```

- [ ] **Step 5:** README: setup (`cp .env.example .env.local`, fill values), `npm run dev`, `npx workflow web` to inspect runs, the env section above in prose, and the Vercel note (set the same vars in Project → Settings → Environment Variables).
- [ ] **Step 6:** `npm run build` → succeeds. Commit `feat(agent): scaffold Next.js blog agent with workflow, env docs`.

---

### Task 2: Upgrade Studio to Sanity v6 with native tables

**Files:**
- Modify: `package.json` (root: `sanity`, `@sanity/vision` → `^6.25.0`, `@sanity/eslint-config-studio` to matching major; keep React 19.2+; check v6 migration notes via Sanity MCP `search_docs "studio v6 migration"` for removed deps like `styled-components`)
- Create: `schemaTypes/tableType.ts`
- Modify: `schemaTypes/blogType.ts` (`body.of` gets `{type: 'table'}`), `schemaTypes/index.ts`, `sanity.config.ts` (enable table plugin globally)

**Interfaces:**
- Produces: canonical table shape used by Task 3 and Task 11: `{_type:'table', _key, headerRows:number, rows:[{_type:'row', _key, cells:[{_type:'cell', _key, value: Block[]}]}]}`.

- [ ] **Step 1:** Upgrade deps, `npm install`. Run `npx sanity build` → succeeds with no schema errors.
- [ ] **Step 2:** Add `tableType.ts` exactly per the canonical schema in `docs/sanity-docx-to-portable-text.md` (incl. `headerRows`). Add to `body.of`. Enable `form.components.portableText.plugins → table: {enabled: true}` in `sanity.config.ts`.
- [ ] **Step 3:** `npx sanity build` → succeeds. `npx sanity dev`, open a blog post, insert a table in Body → table editor renders with header-row toggle. Existing posts still open without warnings.
- [ ] **Step 4:** Commit `feat(studio): upgrade to Sanity v6 and enable native tables`.
- [ ] **Step 5:** **Ask the user** before `npx sanity schema deploy` and `npx sanity deploy`. Run them only after a yes.

---

### Task 3: DOCX → Portable Text converter

**Files:**
- Create: `lib/convert/docx-to-html.ts`, `lib/convert/body-schema.ts`, `lib/convert/html-to-blocks.ts`, `lib/convert/structure.ts`
- Test: `tests/convert/*.test.ts` (use the sample docx; build tiny docx fixtures in tests by running mammoth on HTML is not possible — instead test `htmlToBody` with HTML strings and the sample for the end-to-end conversion)

**Interfaces:**
- Produces:
  - `docxToHtml(bytes: Uint8Array): Promise<{ html: string; warnings: string[] }>` — throws `InvalidDocxError` for non-zip / non-docx input.
  - `htmlToBody(html: string): { blocks: BodyItem[]; droppedImages: number }` — keys generated with `nanoid(12)`; tables via a custom rule.
  - `extractTitle(blocks: BodyItem[], filename: string): { title: string; blocks: BodyItem[] }` — removes the first `h1` block and uses its text; else filename without extension, non-alphanumerics → space, collapsed.
  - `findSummary(blocks: BodyItem[]): { text: string } | null` — per Global Constraints; text = paragraphs until next heading, joined with `\n\n`.
  - `insertSummary(blocks: BodyItem[], summary: string): BodyItem[]` — prepends `h2 "Summary"` + `normal` paragraph.
  - `blocksToPlainText(blocks: BodyItem[]): string` — headings and paragraphs, table cells as `a | b` lines.
  - `type BodyItem = PortableTextBlock | TableBlock` (exported from `body-schema.ts`).

- [ ] **Step 1: Failing tests** (`tests/convert/sample.test.ts`) on the sample docx:
  - `extractTitle` → title `"NFL Fans Paid for Streaming and Still Missed Their Teams"`, and no remaining block has `style === 'h1'`.
  - `findSummary` → text starts with `"NFL streaming conversation in the United States centered on cost and access"`.
  - exactly 1 `table` item; `headerRows === 1`; row 0 cell texts `["Sentiment","Share"]`; rows 1–2 `["Positive","3%"]`, `["Negative","12%"]`.
  - some block has a span with `marks` containing `strong` or the docx's headings map to `h2`/`h3` (assert `"Sentiment: The Numbers"` is a heading block).
  - every item and every span has a non-empty `_key`, keys unique.
- [ ] **Step 2: Failing tests** (`tests/convert/structure.test.ts`) with HTML strings: `findSummary` matches `<h3>SUMMARY:</h3><p>x</p>` and `<p><strong>Summary</strong></p><p>x</p>`, does **not** match `<p>Summary of results is below</p>`; returns `null` when absent; `insertSummary` puts `h2 Summary` at index 0; `extractTitle([], 'NFL_Sentiment Blog!.docx')` → `"NFL Sentiment Blog"`; `<a href="https://x.y">l</a>` becomes a `link` markDef with `href`.
- [ ] **Step 3: Failing test** `docxToHtml(new TextEncoder().encode('not a zip'))` rejects with `InvalidDocxError`.
- [ ] **Step 4:** Run `npm test` → FAIL. Implement. `body-schema.ts` compiles with `Schema.compile` a `blog` type whose `body` mirrors the Studio field (`block` with default styles/lists/decorators + `link` annotation, plus `table` from Task 2). Table rule: `deserialize(el)` for `TABLE` returns the canonical shape; cell `value` = `htmlToBlocks(cell.innerHTML, ...)` or a single normal block with the cell text. Images: count `<img>`, drop them.
- [ ] **Step 5:** `npm test` → PASS. Commit `feat(agent): docx to portable text conversion`.

---

### Task 4: Slug + Sanity client

**Files:**
- Create: `lib/slug.ts`, `lib/sanity.ts`
- Test: `tests/slug.test.ts`, `tests/sanity.test.ts`

**Interfaces:**
- Produces:
  - `slugify(title: string): string` — lowercase, ascii-fold, `[^a-z0-9]+` → `-`, trimmed, max 96 chars.
  - `uniqueSlug(base: string, exists: (s: string) => Promise<boolean>): Promise<string>` — `base`, `base-2`, `base-3`…
  - `slugExists(slug: string): Promise<boolean>` — GROQ `count(*[_type=="blog" && slug.current==$slug]) > 0` (covers drafts because the token sees drafts).
  - `uploadCover(file: { bytes: Uint8Array; filename: string; contentType: string }): Promise<{ assetId: string; url: string }>`
  - `createDraft(doc: BlogDraftInput): Promise<{ id: string; studioUrl: string }>` where `BlogDraftInput = { title; slug; description; keywords: string; imageURL?: string; imageAssetId?: string; body: BodyItem[] }`; sets `_id: drafts.<uuid>`, `_type: 'blog'`, `publishedAt`/`lastEditedAt` = now ISO, `isPublished: false`, `slug: {_type:'slug', current}`, `image` only if `imageAssetId`.
  - `studioDraftUrl(id: string): string` → `${SANITY_STUDIO_URL}/structure/blog;${id without "drafts."}`.

- [ ] **Step 1: Failing tests:** `slugify("NFL Fans Paid for Streaming — and Still Missed!")` → `"nfl-fans-paid-for-streaming-and-still-missed"`; `uniqueSlug('a', s => Promise.resolve(['a','a-2'].includes(s)))` → `'a-3'`. `createDraft` with a mocked client (inject via `setSanityClient(fake)`) receives a doc with `_id` starting `drafts.`, `isPublished === false`, no `image` key when `imageAssetId` absent, `image.asset._ref === 'image-abc'` when given.
- [ ] **Step 2:** FAIL → implement → PASS. Commit `feat(agent): sanity draft writer and slugs`.

---

### Task 5: Metadata analysis with schema-validated Gemini output

**Files:**
- Create: `lib/analyze.ts`
- Test: `tests/analyze.test.ts`

**Interfaces:**
- Produces:
  - `analyzeArticle(input: { title: string; plainText: string; existingSummary: string | null }, model?: LanguageModel): Promise<{ description: string; keywords: string; summary: string | null }>` — default model `google(env.GEMINI_MODEL)`.
  - zod schema: `description: z.string().max(160)`, `keywords: z.array(z.string().min(2)).min(12).max(14)`, `summary`: `z.string().min(200)` **only when** `existingSummary === null`, absent otherwise (build the schema conditionally).
  - `normalizeKeywords(list: string[]): string` — trim, dedupe case-insensitively, remove any existing "glorion media", append `GLORION Media`, join `", "`.
- Prompt intent (system): SEO editor for GLORION Media; description = one sentence ≤155 chars condensed from the summary (given or written); keywords = high-ranking search phrases for the article; summary (when asked) = one interesting, informative paragraph. Never rewrite the article.

- [ ] **Step 1: Failing tests** using `MockLanguageModelV4` (or current mock class in `ai/test`) returning JSON: with `existingSummary` set, result `summary === null` and the mock's received prompt contains the existing summary; with `existingSummary: null` and a response lacking `summary`, `analyzeArticle` rejects (schema validation); `normalizeKeywords(['a','A',' b ','Glorion Media'])` → `"a, b, GLORION Media"`.
- [ ] **Step 2:** FAIL → implement with `generateText({ model, system, prompt, output: Output.object({ schema }) })` → PASS. Commit `feat(agent): gemini metadata with zod-validated output`.

---

### Task 6: Brevo email

**Files:**
- Create: `lib/email.ts`
- Test: `tests/email.test.ts`

**Interfaces:**
- Produces: `sendDraftEmail(input: { title: string; studioUrl: string }): Promise<'sent' | 'skipped'>` — `'skipped'` if `BREVO_API_KEY`/`BREVO_SENDER_EMAIL`/`EMAIL_TO` missing; else `POST https://api.brevo.com/v3/smtp/email` with header `api-key`, sender `{name: 'GLORION Media AI Agent', email}`, subject `New blog draft ready for review: ${title}`, HTML adapted from BlogAgent's template (GLORION branding, "review in Sanity Studio and set isPublished"). Non-2xx → throws with status + body.

- [ ] **Step 1: Failing tests** with stubbed `fetch`: skipped when env missing (fetch not called); recipients split from `"a@x.com, b@y.com"` into two `to` entries; 400 response → rejects.
- [ ] **Step 2:** FAIL → implement → PASS. Commit `feat(agent): brevo draft notification`.

---

### Task 7: The workflow

**Files:**
- Create: `lib/events.ts`, `workflows/blog-agent.ts`
- Test: `tests/events.test.ts`, `tests/blog-agent.integration.test.ts`

**Interfaces:**
- Consumes: Tasks 3–6.
- Produces:
  - `type StepId = 'received'|'convert'|'analyze'|'cover'|'sanity'|'email'|'done'|'error'`
  - `type TimelineEvent = { step: StepId; status: 'running'|'done'|'skipped'|'error'; title: string; detail?: string; url?: string; timestamp: string }`
  - `emit(event: Omit<TimelineEvent,'timestamp'>): Promise<void>` — `"use step"`, writes to `getWritable<TimelineEvent>()` and releases the lock.
  - `type BlogAgentInput = { filename: string; docx: Uint8Array; coverUrl?: string; coverFile?: { bytes: Uint8Array; filename: string; contentType: string } }`
  - `blogAgentWorkflow(input: BlogAgentInput): Promise<{ title: string; draftId: string; studioUrl: string }>` — `"use workflow"`.
- Order and events (each step emits `running` then `done`/`skipped`, with `detail`):
  1. `received` done — detail = filename (first event; history uses it as the label).
  2. `convertStep` → title, blocks, summary; detail e.g. `"38 blocks, 1 table"` + `", 0 images dropped"` when > 0. `InvalidDocxError` → `FatalError`.
  3. `analyzeStep` → detail `"Using existing Summary section"` or `"Generated summary"`; then slug via `uniqueSlug`.
  4. `coverStep` → skipped / `"Uploaded <filename>"` / `"Using cover URL"`.
  5. `sanityStep` → done with `url` = studioUrl.
  6. `emailStep` → sent / skipped; an email failure emits `status:'error'` for `email` but does **not** fail the run.
  7. `done` done, `url` = studioUrl; then `getWritable().close()` in a step.
  - Workflow body wraps 2–5 in `try/catch`: on error → `emit({step:'error', status:'error', title:'Agent failed', detail: message})`, close stream, rethrow.

- [ ] **Step 1: Failing integration tests** (`@workflow/vitest`, mock `lib/analyze`, `lib/sanity`, `lib/email` at the leaf per the workflow testing notes):
  - sample docx → `run.returnValue` resolves; collected stream events' `step` sequence (ignoring `running`) equals `['received','convert','analyze','cover','sanity','email','done']`; `analyze` detail is `"Using existing Summary section"`; `createDraft` called once with `isPublished` not overridden and `keywords` ending `GLORION Media`.
  - analyze mock throws `FatalError` → run fails, last event `step === 'error'`, `createDraft` **not called**.
  - email mock throws → run still completes, `email` event status `error`.
  - corrupt docx bytes → run fails with error event, convert not retried (mock call count 1).
- [ ] **Step 2:** FAIL → implement → `npm run test:integration` PASS. Commit `feat(agent): durable blog agent workflow`.

---

### Task 8: API routes

**Files:**
- Create: `app/api/runs/route.ts`, `app/api/runs/[runId]/stream/route.ts`, `app/api/health/route.ts`, `lib/validate-upload.ts`
- Test: `tests/validate-upload.test.ts`, `tests/stream-route.test.ts`

**Interfaces:**
- Produces:
  - `POST /api/runs` (multipart: `file`, optional `coverUrl`, optional `cover`) → `201 { runId }` or `400 { error }`.
  - `GET /api/runs` → `{ runs: { runId: string; status: string; createdAt: string; label: string }[] }` (latest 25; `world.runs.list({ resolveData: 'none' })`; `label` = detail of stream chunk 0, read with `getReadable({startIndex:0})` then cancel; fallback runId prefix).
  - `GET /api/runs/[runId]/stream?from=N` → `application/x-ndjson`, one `TimelineEvent` JSON per line, from index N.
  - `GET /api/health` → `{ ok: true, sanity: boolean, gemini: boolean }` (env presence only).
  - `validateUpload(form: FormData): { ok: true; input: BlogAgentInput } | { ok: false; error: string }` — `.docx` extension **and** zip magic bytes `PK\x03\x04`; ≤ 4 MB; `coverUrl` must be `https:`; cover file `image/*` ≤ 2 MB.
- Add `vercel.json` `functions["app/api/runs/[runId]/stream/route.ts"].supportsCancellation = true`.

- [ ] **Step 1: Failing tests:** `validateUpload` rejects `.doc`, a `.docx` named text file (no PK header), 5 MB file, `coverUrl: 'http://x'`; accepts the sample. Stream route: given a fake run readable of 3 events and `from=1`, response body has 2 NDJSON lines.
- [ ] **Step 2:** FAIL → implement → PASS. Manual: `npm run dev`, `curl -F file=@sample-blog/NFL_Sentiment_Blog.docx localhost:3000/api/runs` → runId; `curl -N localhost:3000/api/runs/<id>/stream` prints events live. Commit `feat(agent): run and stream API routes`.

---

### Task 9: UI — upload, live timeline, run page, history

**Files:**
- Create: `app/hooks/useRunStream.ts`, `app/components/UploadForm.tsx`, `app/components/Timeline.tsx`, `app/components/HistoryList.tsx`, `app/runs/[runId]/page.tsx`
- Modify: `app/page.tsx`, `app/layout.tsx` (title "Blog Agent · GLORION Media")
- Test: `tests/timeline-reducer.test.ts`

**Interfaces:**
- Produces:
  - `reduceTimeline(state: StepView[], ev: TimelineEvent): StepView[]` — one row per `step`, latest status wins, keeps first `running` timestamp and last `done` timestamp. `StepView = { step; title; status; detail?; url?; startedAt; endedAt? }`.
  - `useRunStream(runId: string | null): { steps: StepView[]; finished: boolean; connected: boolean }` — fetches `/api/runs/${runId}/stream?from=${count}`, parses NDJSON lines, on network end without `done`/`error` reconnects after 1 s with the current count.
- UI behavior: Home tab = UploadForm (drop zone `.docx`, "Cover image URL" input, optional cover file, "Run agent") → on 201 navigate to `/runs/[runId]` (so refresh/share works). Run page shows Timeline: spinner/check/skip/error icon per row, title, detail, time; final "Open draft in Studio" button from the `done` event `url`. History tab lists `/api/runs`. Header shows `/api/health`. Follow the frontend-design skill for a clean, deliberate look; keep it to these screens.

- [ ] **Step 1: Failing reducer tests:** two `analyze running` + one `analyze done` → single row with status `done`; `convert running` then `error/error` → two rows, and `convert` row status becomes `error` (a step left `running` when an `error` event arrives is marked `error`).
- [ ] **Step 2:** FAIL → implement → PASS. Manual in browser: run the sample; reload mid-run → timeline continues without duplicates; open History → run listed with filename label. Commit `feat(agent): live timeline UI`.

---

### Task 10: Basic Auth gate

**Files:**
- Create: `agent-automation/proxy.ts`
- Test: `tests/proxy.test.ts`

**Interfaces:**
- Produces: `proxy(request: NextRequest)` — if `AGENT_BASIC_AUTH` unset → pass; else require `Authorization: Basic base64(user:pass)` matching it (constant-time compare), else `401` with `WWW-Authenticate: Basic realm="Blog Agent"`. `config.matcher`: `"/((?!_next/static|_next/image|favicon.ico|.well-known/workflow/).*)"`.

- [ ] **Step 1: Failing tests:** unset → `NextResponse.next()`; wrong creds → 401 with header; correct → next. Assert the matcher string excludes `.well-known/workflow/`.
- [ ] **Step 2:** FAIL → implement → PASS. Manual: with `AGENT_BASIC_AUTH=a:b`, a full run still completes (workflow internals not blocked). Commit `feat(agent): basic auth gate`.

---

### Task 11: glorion-website — visibility filter, cover fallback, tables

Separate repo: `/Users/lengomyduyen/Documents/NEW/glorion-website` (branch off `master`).

**Files:**
- Modify: `app/blog/page.tsx:7-10` (add `&& isPublished == true`), `app/blog/[slug]/page.tsx:7` (same), `:44-46` (cover: `post.imageURL ?? (post.image ? urlFor(post.image)…url() : null)`), `:89` (`<PortableText value={post.body} components={portableTextComponents} />`)
- Create: `components/blog/PortableTable.tsx` (`types.table` renderer: `<table>` with `headerRows` rows as `<thead>`/`<th>`, cells rendered with nested `<PortableText value={cell.value} />`; Tailwind styles readable on the dark `prose-invert` page; horizontally scrollable wrapper on mobile)
- Also grep for any other `_type == "blog"` query (sitemap, related posts) and add the filter.

- [ ] **Step 1:** Implement; `npm run build` in glorion-website → succeeds.
- [ ] **Step 2:** Manual: `npm run dev`; `/blog` lists only `isPublished == true` posts (the 1 known `false` post is gone); a post with only `imageURL` shows its cover on the post page.
- [ ] **Step 3:** Commit on a branch `feat/blog-agent-support`. **Ask the user** before pushing.

---

### Task 12: End-to-end verification

- [ ] **Step 1:** Fill `.env.local` (user supplies secrets). `npm run dev` in `agent-automation/`.
- [ ] **Step 2:** Upload the sample with a cover URL. Expect: timeline shows all steps live; `analyze` says "Using existing Summary section"; final link opens the draft in Studio with title, slug `nfl-fans-paid-for-streaming-and-still-missed-their-teams`, description ≤160 chars, keywords ending "GLORION Media", `isPublished` false, table rendered in the native table editor, no `h1` in body.
- [ ] **Step 3:** Verify the draft is **not** visible on glorion-website locally. Then discard the draft (Studio → Discard, or Sanity MCP `discard_drafts`) unless the user wants to keep it.
- [ ] **Step 4:** `npm test && npm run test:integration && npm run build` all green. Report results with output.
