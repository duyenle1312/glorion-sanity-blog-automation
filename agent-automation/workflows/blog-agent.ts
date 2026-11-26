import { FatalError, getStepMetadata } from "workflow";
import { closeTimeline, emit, STEP_TITLES, writeEvent } from "@/lib/events";
import { getDeps } from "@/lib/deps";
import { InvalidDocxError } from "@/lib/convert/docx-to-html";
import { htmlToBody } from "@/lib/convert/html-to-blocks";
import {
  blocksToPlainText,
  extractTitle,
  findSummary,
  insertSummary,
} from "@/lib/convert/structure";
import type { BodyItem } from "@/lib/convert/body-schema";
import { slugify, uniqueSlug } from "@/lib/slug";
import { draftIdFromKey } from "@/lib/sanity";
import { DEFAULT_TARGET_ID, findTarget } from "@/lib/targets";

export type BlogAgentInput = {
  filename: string;
  docx: Uint8Array;
  coverUrl?: string;
  coverFile?: { bytes: Uint8Array; filename: string; contentType: string };
  /** Sanity target id from lib/targets.ts; defaults to Glorion Media. */
  target?: string;
};

export type BlogAgentResult = { title: string; draftId: string; studioUrl: string };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

type Converted = { title: string; blocks: BodyItem[]; summary: string | null };

async function convertStep(filename: string, docx: Uint8Array): Promise<Converted> {
  "use step";
  await writeEvent({ step: "convert", status: "running", title: STEP_TITLES.convert });
  let html: string;
  let warnings: string[];
  try {
    ({ html, warnings } = await getDeps().docxToHtml(docx));
  } catch (err) {
    // A broken file will not fix itself: fail the run without retrying.
    // The name check covers an InvalidDocxError created by another copy of the
    // module (step bundles inline their own copy, so instanceof can miss).
    if (err instanceof InvalidDocxError || (err instanceof Error && err.name === "InvalidDocxError")) {
      throw new FatalError(err.message);
    }
    throw err;
  }
  const { blocks: raw, droppedImages } = htmlToBody(html);
  const { title, blocks } = extractTitle(raw, filename);
  const summary = findSummary(blocks)?.text ?? null;

  const tables = blocks.filter((b) => b._type === "table").length;
  let detail = `${plural(blocks.length, "block")}, ${plural(tables, "table")}`;
  if (droppedImages > 0) detail += `, ${plural(droppedImages, "image")} dropped`;
  if (warnings.length > 0) detail += `, ${plural(warnings.length, "conversion warning")}`;
  await writeEvent({ step: "convert", status: "done", title: STEP_TITLES.convert, detail });
  return { title, blocks, summary };
}

type Analyzed = { body: BodyItem[]; description: string; keywords: string };

async function analyzeStep(doc: Converted): Promise<Analyzed> {
  "use step";
  await writeEvent({ step: "analyze", status: "running", title: STEP_TITLES.analyze });
  const result = await getDeps().analyzeArticle({
    title: doc.title,
    plainText: blocksToPlainText(doc.blocks),
    existingSummary: doc.summary,
  });
  let body = doc.blocks;
  let detail = "Using existing Summary section";
  if (doc.summary === null) {
    if (!result.summary) throw new Error("Gemini did not return a summary");
    body = insertSummary(doc.blocks, result.summary);
    detail = "Generated summary";
  }
  await writeEvent({ step: "analyze", status: "done", title: STEP_TITLES.analyze, detail });
  return { body, description: result.description, keywords: result.keywords };
}

type Cover = { imageURL?: string; imageAssetId?: string };

analyzeStep.maxRetries = 2;

async function coverStep(
  coverUrl: string | undefined,
  coverFile: BlogAgentInput["coverFile"],
  target: string,
): Promise<Cover> {
  "use step";
  const title = STEP_TITLES.cover;
  await writeEvent({ step: "cover", status: "running", title });
  if (!coverUrl && !coverFile) {
    await writeEvent({ step: "cover", status: "skipped", title, detail: "No cover image" });
    return {};
  }
  if (!coverFile) {
    await writeEvent({ step: "cover", status: "done", title, detail: "Using cover URL" });
    return { imageURL: coverUrl };
  }
  const uploaded = await getDeps().uploadCover(coverFile, target);
  await writeEvent({ step: "cover", status: "done", title, detail: `Uploaded ${coverFile.filename}` });
  // A provided URL wins for imageURL; the uploaded asset is still attached as `image`.
  return { imageURL: coverUrl ?? uploaded.url, imageAssetId: uploaded.assetId };
}

async function sanityStep(
  title: string,
  analyzed: Analyzed,
  cover: Cover,
  target: string,
): Promise<{ id: string; studioUrl: string }> {
  "use step";
  await writeEvent({ step: "sanity", status: "running", title: STEP_TITLES.sanity });
  const deps = getDeps();
  // stepId is stable across retries, so a retry after a write that landed but
  // whose response was lost replaces the same document instead of adding a
  // second one, and the slug check ignores that earlier attempt.
  const id = draftIdFromKey(getStepMetadata().stepId);
  const slug = await uniqueSlug(slugify(title), (s) => deps.slugExists(s, id, target));
  const draft = await deps.createDraft(id, {
    title,
    slug,
    description: analyzed.description,
    keywords: analyzed.keywords,
    ...(cover.imageURL ? { imageURL: cover.imageURL } : {}),
    ...(cover.imageAssetId ? { imageAssetId: cover.imageAssetId } : {}),
    body: analyzed.body,
  }, target);
  await writeEvent({
    step: "sanity",
    status: "done",
    title: STEP_TITLES.sanity,
    detail: `Draft saved as /${slug}`,
    url: draft.studioUrl,
  });
  return draft;
}

async function emailStep(title: string, studioUrl: string, site: string): Promise<void> {
  "use step";
  await writeEvent({ step: "email", status: "running", title: STEP_TITLES.email });
  const outcome = await getDeps().sendDraftEmail({ title, studioUrl, site });
  await writeEvent(
    outcome === "sent"
      ? { step: "email", status: "done", title: STEP_TITLES.email, detail: "Notification sent" }
      : { step: "email", status: "skipped", title: STEP_TITLES.email, detail: "Email not configured" },
  );
}
emailStep.maxRetries = 2;

export async function blogAgentWorkflow(input: BlogAgentInput): Promise<BlogAgentResult> {
  "use workflow";

  let title: string;
  let draft: { id: string; studioUrl: string };
  const target = input.target ?? DEFAULT_TARGET_ID;
  const site = findTarget(target)?.label ?? target;
  try {
    await emit({
      step: "received",
      status: "done",
      title: STEP_TITLES.received,
      detail: `${input.filename} → ${site}`,
    });
    const converted = await convertStep(input.filename, input.docx);
    title = converted.title;
    const analyzed = await analyzeStep(converted);
    const cover = await coverStep(input.coverUrl, input.coverFile, target);
    draft = await sanityStep(title, analyzed, cover, target);
  } catch (err) {
    await emit({ step: "error", status: "error", title: STEP_TITLES.error, detail: message(err) });
    await closeTimeline();
    throw err;
  }

  try {
    await emailStep(title, draft.studioUrl, site);
  } catch (err) {
    // The draft exists; a failed notification must not fail the run.
    await emit({ step: "email", status: "error", title: STEP_TITLES.email, detail: message(err) });
  }

  await emit({ step: "done", status: "done", title: STEP_TITLES.done, url: draft.studioUrl });
  await closeTimeline();
  return { title, draftId: draft.id, studioUrl: draft.studioUrl };
}
