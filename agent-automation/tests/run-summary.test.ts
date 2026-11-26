import { describe, expect, it } from "vitest";
import { parseReceivedDetail } from "@/lib/run-summary";

describe("parseReceivedDetail", () => {
  it("splits file name and project", () => {
    expect(parseReceivedDetail("NFL draft.docx → Tsvetta Website")).toEqual({
      filename: "NFL draft.docx",
      project: "Tsvetta Website",
    });
  });

  it("treats older runs without a project as Glorion Media", () => {
    expect(parseReceivedDetail("old.docx")).toEqual({ filename: "old.docx", project: "Glorion Media" });
  });
});
