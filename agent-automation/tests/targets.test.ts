import { describe, expect, it } from "vitest";
import { configuredTargets, findTarget, resolveTarget, SANITY_TARGETS } from "@/lib/targets";

const glorion = { SANITY_API_WRITE_TOKEN: "g-tok", SANITY_STUDIO_URL: "https://glorion.studio" };

describe("targets", () => {
  it("ids are unique", () => {
    const ids = SANITY_TARGETS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("offers only targets with both token and studio URL", () => {
    expect(configuredTargets({})).toEqual([]);
    expect(configuredTargets({ ...glorion, SANITY_TSVETTA_WRITE_TOKEN: "t" })).toEqual([
      { id: "glorion", label: "Glorion Media" },
    ]);
    expect(
      configuredTargets({
        ...glorion,
        SANITY_TSVETTA_WRITE_TOKEN: "t",
        SANITY_TSVETTA_STUDIO_URL: "https://t.studio",
      }).map((t) => t.id),
    ).toEqual(["glorion", "tsvetta"]);
  });

  it("treats blank values as unset", () => {
    expect(configuredTargets({ SANITY_API_WRITE_TOKEN: " ", SANITY_STUDIO_URL: "x" })).toEqual([]);
  });

  it("resolveTarget returns project settings and credentials", () => {
    const t = resolveTarget("glorion", glorion);
    expect(t).toMatchObject({ projectId: "b57pzymc", dataset: "production", token: "g-tok" });
    expect(t.studioUrl).toBe("https://glorion.studio");
  });

  it("resolveTarget names the missing env vars", () => {
    expect(() => resolveTarget("tsvetta", {})).toThrow(
      /SANITY_TSVETTA_WRITE_TOKEN and SANITY_TSVETTA_STUDIO_URL/,
    );
  });

  it("resolveTarget rejects unknown ids", () => {
    expect(() => resolveTarget("nope", glorion)).toThrow(/Unknown Sanity target/);
    expect(findTarget("nope")).toBeUndefined();
  });
});
