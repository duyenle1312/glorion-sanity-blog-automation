import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateUpload } from "@/lib/validate-upload";

const PK = [0x50, 0x4b, 0x03, 0x04];
const zipLike = (extra = 16) => new Uint8Array([...PK, ...new Array(extra).fill(1)]);

function form(entries: Record<string, string | File>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}
const docx = (name = "post.docx", bytes: Uint8Array = zipLike()) =>
  new File([bytes as BlobPart], name);

describe("validateUpload", () => {
  it("accepts the sample docx", async () => {
    const bytes = readFileSync("sample-blog/NFL_Sentiment_Blog.docx");
    const r = await validateUpload(form({ file: new File([bytes], "NFL_Sentiment_Blog.docx") }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.filename).toBe("NFL_Sentiment_Blog.docx");
      expect(r.input.docx.byteLength).toBe(bytes.byteLength);
    }
  });
  it("rejects a missing file", async () => {
    expect((await validateUpload(form({}))).ok).toBe(false);
  });
  it("rejects .doc", async () => {
    expect((await validateUpload(form({ file: docx("a.doc") }))).ok).toBe(false);
  });
  it("rejects a .docx without a zip header", async () => {
    const r = await validateUpload(form({ file: docx("a.docx", new TextEncoder().encode("hello world")) }));
    expect(r.ok).toBe(false);
  });
  it("rejects files over 4 MB", async () => {
    const big = new Uint8Array(5 * 1024 * 1024);
    big.set(PK);
    expect((await validateUpload(form({ file: docx("a.docx", big) }))).ok).toBe(false);
  });
  it("rejects non-https coverUrl", async () => {
    const r = await validateUpload(form({ file: docx(), coverUrl: "http://x.com/a.png" }));
    expect(r.ok).toBe(false);
  });
  it("rejects an unparseable coverUrl", async () => {
    expect((await validateUpload(form({ file: docx(), coverUrl: "nope" }))).ok).toBe(false);
  });
  it("accepts an https coverUrl", async () => {
    const r = await validateUpload(form({ file: docx(), coverUrl: "https://x.com/a.png" }));
    expect(r.ok && r.input.coverUrl).toBe("https://x.com/a.png");
  });
  it("rejects a non-image cover and an oversized cover", async () => {
    const txt = new File(["x"], "c.txt", { type: "text/plain" });
    expect((await validateUpload(form({ file: docx(), cover: txt }))).ok).toBe(false);
    const big = new File([new Uint8Array(3 * 1024 * 1024)], "c.png", { type: "image/png" });
    expect((await validateUpload(form({ file: docx(), cover: big }))).ok).toBe(false);
  });
  it("accepts a small image cover", async () => {
    const img = new File([new Uint8Array(10)], "c.png", { type: "image/png" });
    const r = await validateUpload(form({ file: docx(), cover: img }));
    expect(r.ok && r.input.coverFile?.contentType).toBe("image/png");
  });
});
