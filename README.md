# Blog Studio

![Home](./docs/images/home.png)

![Timeline](./docs/images/timeline.png)

Blog Studio turns a Word document into a ready-to-review blog draft. An editor uploads a `.docx` (plus an optional cover image) in the **Blog agent** web app, picks the target site, and a durable AI workflow converts the document, writes the SEO description and summary with Google Gemini, and saves an unpublished draft to that site's Sanity project. Editors then review the draft in Sanity Studio and set `isPublished` to put it live on the website.

The repo holds two apps:

| Folder | What it is |
| --- | --- |
| `/` (root) | Sanity Studio (v6) with the `blog` schema and a table editor (`schemaTypes/`) |
| `agent-automation/` | Next.js app + Vercel Workflow SDK agent that creates the drafts (see its [README](./agent-automation/README.md)) |

## Architecture

![Diagram](./docs/images/mermaid-diagram.png)

```mermaid
flowchart LR
    Editor([Editor])

    subgraph App["agent-automation · Next.js on Vercel"]
        UI["Upload form & run history<br/>(React, Tailwind)"]
        API["API routes<br/>/api/runs · /api/runs/[id]/stream"]
        subgraph WF["Blog agent workflow · Vercel Workflow SDK"]
            S1["1. Convert<br/>mammoth: .docx → HTML<br/>jsdom + block-tools: HTML → Portable Text"]
            S2["2. Analyze<br/>AI SDK + Gemini:<br/>description, keywords, summary"]
            S3["3. Cover image<br/>URL or uploaded asset"]
            S4["4. Save draft<br/>unique slug + draft document"]
            S5["5. Notify<br/>email (non-fatal)"]
            S1 --> S2 --> S3 --> S4 --> S5
        end
    end

    Gemini[["Google Gemini<br/>(@ai-sdk/google)"]]
    subgraph Sanity["Sanity Content Lake"]
        P1[("Glorion Media")]
        P2[("Tsvetta Website")]
        P3[("Money Signal Podcast")]
    end
    Brevo[["Brevo<br/>transactional email"]]
    Studio["Sanity Studio<br/>(this repo, root)"]
    Site["Websites<br/>(Next.js, show isPublished posts)"]

    Editor -->|".docx + cover"| UI
    UI --> API
    API -->|"start(workflow)"| WF
    WF -.->|"live timeline events (stream)"| API
    S2 <--> Gemini
    S3 -->|"asset upload"| Sanity
    S4 -->|"@sanity/client"| Sanity
    S5 --> Brevo
    Brevo -->|"draft ready + Studio link"| Editor
    Editor -->|"review & set isPublished"| Studio
    Studio <--> Sanity
    Sanity --> Site
```

### Integrations

- **Vercel Workflow SDK** (`workflow`): durable, retryable steps with a streamed timeline of events for the run page
- **mammoth**: converts `.docx` to HTML
- **jsdom + `@portabletext/block-tools`**: turn that HTML into Sanity Portable Text, including tables
- **Google Gemini via the Vercel AI SDK** (`ai`, `@ai-sdk/google`): writes the structured description, keywords and summary (default model `gemini-3.5-flash-lite`)
- **Sanity** (`@sanity/client`): creates draft documents and uploads cover assets, with one write token per project
- **Brevo**: emails editors when a draft is ready (skipped if not configured)
- **Vercel**: hosts the Next.js app and the workflow runs

## Development

```bash
# Sanity Studio (root)
npm install && npm run dev

# Blog agent
cd agent-automation && npm install && npm run dev
```
