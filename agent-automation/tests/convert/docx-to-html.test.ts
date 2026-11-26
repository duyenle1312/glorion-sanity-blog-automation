import { describe, it, expect } from "vitest";
import { docxToHtml, InvalidDocxError } from "@/lib/convert/docx-to-html";

describe("docxToHtml", () => {
  it("rejects non-zip input with InvalidDocxError", async () => {
    await expect(docxToHtml(new TextEncoder().encode("not a zip"))).rejects.toBeInstanceOf(
      InvalidDocxError,
    );
  });
});
