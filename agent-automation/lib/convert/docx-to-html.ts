import mammoth from "mammoth";

export class InvalidDocxError extends Error {
  constructor(message = "File is not a valid .docx document", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "InvalidDocxError";
  }
}

/**
 * Word paragraph styles mammoth does not map by default.
 * "List Bullet" is applied without numbering in some docx exports and would otherwise become a <p>.
 */
const STYLE_MAP = ["p[style-name='List Bullet'] => ul > li:fresh"];

const isZip = (bytes: Uint8Array) =>
  bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

export async function docxToHtml(
  bytes: Uint8Array,
): Promise<{ html: string; warnings: string[] }> {
  if (!isZip(bytes)) throw new InvalidDocxError("File is not a valid .docx document (not a zip archive)");
  try {
    const result = await mammoth.convertToHtml(
      { buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) },
      { styleMap: STYLE_MAP },
    );
    return {
      html: result.value,
      warnings: result.messages.map((m) => m.message),
    };
  } catch (cause) {
    throw new InvalidDocxError("File is not a valid .docx document", { cause });
  }
}
