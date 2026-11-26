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
- **Access gate (`AGENT_BASIC_AUTH`):** `username:password`. Optional locally, **required when deployed**,
  because the app writes to production Sanity. Generate a password with `openssl rand -base64 18`.

## Deploying to Vercel

Set the same variables in Project → Settings → Environment Variables (and set `AGENT_BASIC_AUTH`).
The Workflow SDK selects the Vercel World automatically on Vercel; the local `.workflow-data/` directory
is only used in local development.
