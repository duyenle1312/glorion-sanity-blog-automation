import type { BlogAgentInput } from "@/workflows/blog-agent";

import {
  COVER_TOO_LARGE,
  DOCX_TOO_LARGE,
  MAX_COVER_BYTES,
  MAX_DOCX_BYTES,
  MAX_TOTAL_BYTES,
  TOTAL_TOO_LARGE,
} from "@/lib/upload-limits";

export { MAX_COVER_BYTES, MAX_DOCX_BYTES, MAX_TOTAL_BYTES };

export type UploadResult =
  | { ok: true; input: BlogAgentInput }
  | { ok: false; error: string };

const fail = (error: string): UploadResult => ({ ok: false, error });
const isFile = (v: unknown): v is File => typeof v === "object" && v !== null && "arrayBuffer" in v;

/** Validates the multipart upload (async: it reads the file bytes to check the zip header). */
export async function validateUpload(form: FormData): Promise<UploadResult> {
  const file = form.get("file");
  if (!isFile(file) || file.size === 0) return fail("A .docx file is required.");
  if (!file.name.toLowerCase().endsWith(".docx")) return fail("Only .docx files are supported.");
  if (file.size > MAX_DOCX_BYTES) return fail(DOCX_TOO_LARGE);

  const docx = new Uint8Array(await file.arrayBuffer());
  const isZip = docx[0] === 0x50 && docx[1] === 0x4b && docx[2] === 0x03 && docx[3] === 0x04;
  if (!isZip) return fail("The file is not a valid .docx document.");

  const input: BlogAgentInput = { filename: file.name, docx };

  const rawUrl = form.get("coverUrl");
  if (typeof rawUrl === "string" && rawUrl.trim() !== "") {
    let url: URL;
    try {
      url = new URL(rawUrl.trim());
    } catch {
      return fail("coverUrl must be a valid URL.");
    }
    if (url.protocol !== "https:") return fail("coverUrl must use https.");
    input.coverUrl = url.toString();
  }

  const cover = form.get("cover");
  if (isFile(cover) && cover.size > 0) {
    if (!cover.type.startsWith("image/")) return fail("The cover file must be an image.");
    if (cover.type === "image/svg+xml") return fail("SVG covers are not supported. Use PNG, JPG or WebP.");
    if (cover.size > MAX_COVER_BYTES) return fail(COVER_TOO_LARGE);
    if (file.size + cover.size > MAX_TOTAL_BYTES) return fail(TOTAL_TOO_LARGE);
    input.coverFile = {
      bytes: new Uint8Array(await cover.arrayBuffer()),
      filename: cover.name,
      contentType: cover.type,
    };
  }
  return { ok: true, input };
}
