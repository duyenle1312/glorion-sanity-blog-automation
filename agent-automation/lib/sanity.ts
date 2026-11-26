import { createClient, type SanityClient } from "@sanity/client";
import { getEnv } from "@/lib/env";
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

let client: SanityClient | null = null;

/** Inject a fake client in tests; pass null to reset. */
export function setSanityClient(c: SanityClient | null): void {
  client = c;
}

export function getSanityClient(): SanityClient {
  if (!client) {
    const env = getEnv();
    client = createClient({
      projectId: env.SANITY_PROJECT_ID,
      dataset: env.SANITY_DATASET,
      token: env.SANITY_API_WRITE_TOKEN,
      apiVersion: "2026-05-15",
      useCdn: false,
      perspective: "raw",
    });
  }
  return client;
}

export async function slugExists(slug: string): Promise<boolean> {
  return getSanityClient().fetch<boolean>(
    'count(*[_type=="blog" && slug.current==$slug]) > 0',
    { slug },
    { perspective: "raw" },
  );
}

export async function uploadCover(file: {
  bytes: Uint8Array;
  filename: string;
  contentType: string;
}): Promise<{ assetId: string; url: string }> {
  const asset = await getSanityClient().assets.upload(
    "image",
    Buffer.from(file.bytes),
    { filename: file.filename, contentType: file.contentType },
  );
  return { assetId: asset._id, url: asset.url };
}

export function studioDraftUrl(id: string): string {
  const base = getEnv().SANITY_STUDIO_URL.replace(/\/+$/, "");
  return `${base}/structure/blog;${id.replace(/^drafts\./, "")}`;
}

export async function createDraft(
  doc: BlogDraftInput,
): Promise<{ id: string; studioUrl: string }> {
  const _id = `drafts.${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await getSanityClient().create({
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
  return { id: _id, studioUrl: studioDraftUrl(_id) };
}
