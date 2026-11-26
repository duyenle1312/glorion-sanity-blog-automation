# Blog agent

A Next.js app that turns an uploaded `.docx` into a Sanity blog **draft**. It runs as a
durable [Workflow SDK](https://workflow-sdk.dev) workflow and streams each step's progress
to the browser live.

## Setup

```bash
cd agent-automation
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

Inspect workflow runs (local world) with:

```bash
npx workflow web
```

Tests: `npm test` (unit) and `npm run test:integration` (workflow, in-process).

## Environment variables

Defined and validated in `lib/env.ts` (parsed lazily, so `next build` and tests work without secrets).

- **Gemini (required):** `GEMINI_API_KEY`, and optionally `GEMINI_MODEL` (default `gemini-3.5-flash-lite`).
  Create a key at https://aistudio.google.com/apikey.
- **Sanity (required):** `SANITY_PROJECT_ID` (default `b57pzymc`), `SANITY_DATASET` (default `production`),
  `SANITY_API_WRITE_TOKEN` (Editor role; create it under sanity.io/manage → project → API → Tokens, or run
  `npx sanity tokens add "blog-agent" --role=editor` from the repo root), and `SANITY_STUDIO_URL`
  (base URL for "Open draft in Studio" links, e.g. `https://<name>.sanity.studio` or `http://localhost:3333`).
- **Brevo email (optional):** `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` (must be a verified Brevo sender) and
  `EMAIL_TO` (comma-separated). If unset, the email step is skipped.

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
