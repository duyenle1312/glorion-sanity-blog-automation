import { createHash } from "node:crypto";
import { createClient, type SanityClient } from "@sanity/client";
import { DEFAULT_TARGET_ID, resolveTarget } from "@/lib/targets";
import type { BodyItem } from "@/lib/convert/body-schema";

export type BlogDraftInput = {
  title: string;
  slug: string;
  description: string;
  keywords: string;
  imageURL?: string;
  imageAssetId?: string;
  body: BodyItem[];
};

const clients = new Map<string, SanityClient>();
let testClient: SanityClient | null = null;

/** Inject a fake client (used for every target) in tests; pass null to reset. */
export function setSanityClient(c: SanityClient | null): void {
  testClient = c;
  clients.clear();
}

export function getSanityClient(targetId: string = DEFAULT_TARGET_ID): SanityClient {
  if (testClient) return testClient;
  let client = clients.get(targetId);
  if (!client) {
    const target = resolveTarget(targetId);
    client = createClient({
      projectId: target.projectId,
      dataset: target.dataset,
      token: target.token,
      apiVersion: "2026-05-15",
      useCdn: false,
      perspective: "raw",
    });
    clients.set(targetId, client);
  }
  return client;
}

/**
 * True when a blog document (published or draft) already uses `slug`.
 * `excludeId` (a bare uuid) ignores that document's own draft and published
 * versions, so a retried write does not collide with its earlier attempt.
 */
export async function slugExists(
  slug: string,
  excludeId?: string,
  targetId: string = DEFAULT_TARGET_ID,
): Promise<boolean> {
  const client = getSanityClient(targetId);
  if (excludeId === undefined) {
    return client.fetch<boolean>(
      'count(*[_type=="blog" && slug.current==$slug]) > 0',
      { slug },
      { perspective: "raw" },
    );
  }
  return client.fetch<boolean>(
    'count(*[_type=="blog" && slug.current==$slug && !(_id in [$draftId, $publishedId])]) > 0',
    { slug, draftId: `drafts.${excludeId}`, publishedId: excludeId },
    { perspective: "raw" },
  );
}

/** Deterministic uuid (v4 layout) derived from an idempotency key, e.g. a workflow stepId. */
export function draftIdFromKey(key: string): string {
  const h = createHash("sha256").update(`blog-draft:${key}`).digest();
  h[6] = (h[6] & 0x0f) | 0x40;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function uploadCover(
  file: { bytes: Uint8Array; filename: string; contentType: string },
  targetId: string = DEFAULT_TARGET_ID,
): Promise<{ assetId: string; url: string }> {
  const asset = await getSanityClient(targetId).assets.upload(
    "image",
    Buffer.from(file.bytes),
    { filename: file.filename, contentType: file.contentType },
  );
  return { assetId: asset._id, url: asset.url };
}

export function studioDraftUrl(id: string, targetId: string = DEFAULT_TARGET_ID): string {
  const base = resolveTarget(targetId).studioUrl.replace(/\/+$/, "");
  return `${base}/structure/blog;${id.replace(/^drafts\./, "")}`;
}

/**
 * Write the draft `drafts.<id>`. Uses createOrReplace so a retry with the same
 * `id` (see draftIdFromKey) overwrites its earlier attempt instead of
 * creating a second document.
 */
export async function createDraft(
  id: string,
  doc: BlogDraftInput,
  targetId: string = DEFAULT_TARGET_ID,
): Promise<{ id: string; studioUrl: string }> {
  const _id = `drafts.${id}`;
  const now = new Date().toISOString();
  await getSanityClient(targetId).createOrReplace({
    _id,
    _type: "blog",
    title: doc.title,
    slug: { _type: "slug", current: doc.slug },
    description: doc.description,
    keywords: doc.keywords,
    publishedAt: now,
    lastEditedAt: now,
    isPublished: false,
    ...(doc.imageURL ? { imageURL: doc.imageURL } : {}),
    ...(doc.imageAssetId
      ? { image: { _type: "image", asset: { _type: "reference", _ref: doc.imageAssetId } } }
      : {}),
    body: doc.body,
  });
  return { id: _id, studioUrl: studioDraftUrl(_id, targetId) };
}
