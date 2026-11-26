import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDraft,
  setSanityClient,
  slugExists,
  studioDraftUrl,
  uploadCover,
} from "@/lib/sanity";

const base = { title: "T", slug: "t", description: "d", keywords: "k", body: [] };

function fake() {
  return {
    create: vi.fn(async (doc: Record<string, unknown>) => doc),
    fetch: vi.fn(async () => true),
    assets: {
      upload: vi.fn(async () => ({ _id: "image-abc", url: "https://cdn/x.png" })),
    },
  };
}

describe("sanity", () => {
  let c: ReturnType<typeof fake>;
  beforeEach(() => {
    c = fake();
    setSanityClient(c as never);
    vi.stubEnv("SANITY_API_WRITE_TOKEN", "tok");
    vi.stubEnv("SANITY_STUDIO_URL", "https://studio.example");
    vi.stubEnv("GEMINI_API_KEY", "g");
  });
  afterEach(() => {
    setSanityClient(null);
    vi.unstubAllEnvs();
  });

  it("creates draft without image", async () => {
    const r = await createDraft(base);
    const doc = c.create.mock.calls[0][0];
    expect(String(doc._id).startsWith("drafts.")).toBe(true);
    expect(doc.isPublished).toBe(false);
    expect(doc._type).toBe("blog");
    expect("image" in doc).toBe(false);
    expect(doc.slug).toEqual({ _type: "slug", current: "t" });
    expect(r.studioUrl).toBe(
      `https://studio.example/structure/blog;${r.id.replace("drafts.", "")}`,
    );
    expect(r.id).toBe(doc._id);
  });

  it("sets image when asset id given", async () => {
    await createDraft({ ...base, imageAssetId: "image-abc", imageURL: "u" });
    const doc = c.create.mock.calls[0][0] as { image: { asset: { _ref: string } }; imageURL: string };
    expect(doc.image.asset._ref).toBe("image-abc");
    expect(doc.imageURL).toBe("u");
  });

  it("slugExists uses groq", async () => {
    expect(await slugExists("t")).toBe(true);
    expect(c.fetch).toHaveBeenCalledWith(
      'count(*[_type=="blog" && slug.current==$slug]) > 0',
      { slug: "t" },
      { perspective: "raw" },
    );
  });

  it("uploadCover", async () => {
    const r = await uploadCover({
      bytes: new Uint8Array([1]),
      filename: "a.png",
      contentType: "image/png",
    });
    expect(r).toEqual({ assetId: "image-abc", url: "https://cdn/x.png" });
  });

  it("studioDraftUrl strips drafts prefix", () => {
    expect(studioDraftUrl("drafts.x")).toBe("https://studio.example/structure/blog;x");
  });
});
