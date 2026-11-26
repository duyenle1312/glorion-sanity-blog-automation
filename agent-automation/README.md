# Blog agent

A Next.js app that turns an uploaded `.docx` into a Sanity blog **draft**. It runs as a durable [Workflow SDK](https://workflow-sdk.dev) workflow and streams each step's progress to the browser live.

## Setup

```bash
cd agent-automation
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

### Inspecting workflow runs

Run the dashboard **from inside `agent-automation/`**. It opens at http://localhost:3456:

```bash
cd agent-automation
npx workflow web                 # local runs (from `npm run dev`)
npx workflow inspect runs        # same data, in the terminal
npx workflow web --backend vercel   # deployed runs on Vercel (needs `vc login`)
```

> **Empty dashboard?** You probably started it from the repo root. Local runs are saved in `agent-automation/.next/workflow-data/world.db`, and the dashboard looks for that file starting from the folder it was launched in. From any other folder it finds nothing and shows an empty list. Stop it and run it again from `agent-automation/`. (`.workflow-data/` holds older test data. The dashboard doesn't show it.)

Tests: `npm test` (unit) and `npm run test:integration` (workflow, in-process).

## Environment variables

Defined and validated in `lib/env.ts` (parsed lazily, so `next build` and tests work without secrets).

- **Gemini (required):** `GEMINI_API_KEY`, and optionally `GEMINI_MODEL` (default `gemini-3.5-flash-lite`).
  Create a key at https://aistudio.google.com/apikey.
- **Sanity (at least one site required):** see [Sanity destinations](#sanity-destinations) below.
- **Brevo email (optional):** `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` (must be a verified Brevo sender) and `EMAIL_TO` (comma-separated). If unset, the email step is skipped.

## Sanity destinations

The upload form has a **Publish to** dropdown, so one agent can write drafts to several Sanity projects.
All of them use the same `blog` schema. Destinations are listed in `lib/targets.ts`:

| Site | Project ID | Dataset | Token env var | Studio URL env var |
|------|-----------|---------|---------------|--------------------|
| Glorion Media | `b57pzymc` | `production` | `SANITY_API_WRITE_TOKEN` | `SANITY_STUDIO_URL` |
| Tsvetta Website | `1r7t0jlt` | `production` | `SANITY_TSVETTA_WRITE_TOKEN` | `SANITY_TSVETTA_STUDIO_URL` |
| Money Signal Podcast (other org) | `aissyerx` | `production` | `SANITY_MONEY_SIGNAL_WRITE_TOKEN` | `SANITY_MONEY_SIGNAL_STUDIO_URL` |

- **A site appears in the dropdown only when both of its env vars are set.** Leave a site's vars empty to hide it.
- **Tokens are per project.** Sanity API tokens belong to a single project, so each site needs its own Editor-role
  token: sanity.io/manage → pick the project → API → Tokens → "Add API token" → permissions "Editor".
  Or run `npx sanity tokens add "blog-agent" --role=editor` from that project's Studio folder.
- **Studio URL** is the base for "Open draft in Studio" links, e.g. `https://<name>.sanity.studio`
  (find it under sanity.io/manage → project → Studios), or `http://localhost:3333` for a local Studio.
- The chosen site is shown on the run page ("File received" step), in the run history and in the email subject.
- `GET /api/health` lists the configured site IDs under `sanity`.
- API callers can send a `target` form field (`glorion`, `tsvetta`, `money-signal`). If it's missing, the agent uses `glorion`.
- Tables: the Glorion and Tsvetta Studios have a table editor. If a Studio's schema has no `table` type, tables in the
  draft show up there as unknown blocks.

**Adding another site:** add an entry to `SANITY_TARGETS` in `lib/targets.ts` (id, label, projectId, dataset and
two new env var names), set those env vars locally and on Vercel, and restart. The site's `blog` schema must match.

## Deploying to Vercel

Set the same variables in Project → Settings → Environment Variables.
**There is no access gate:** anyone with the deployment URL can create Sanity drafts and spend Gemini quota.
Turn on Vercel Deployment Protection (Project → Settings → Deployment Protection) if the URL may leak.
The Workflow SDK selects the Vercel World automatically on Vercel; the local `.workflow-data/` directory
is only used in local development.

### Deployment notes

- **Run history** is per-machine locally (it lives in `.workflow-data/`); once deployed on Vercel it is shared by everyone using the deployment.
- `vercel.json` sets `supportsCancellation` for the stream route, so a closed browser tab cancels the streaming function instead of leaving it running.
- Vercel **Hobby** is for non-commercial use only; a business deployment likely needs **Pro**.
- Large uploads count toward Workflow "data written": the .docx is stored in the run's event log, so a 4 MB upload costs about 4 MB of Workflow data.
