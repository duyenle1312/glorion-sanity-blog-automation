import { describe, it, expect } from "vitest";
import { getEnv } from "@/lib/env";

const required = {
  GEMINI_API_KEY: "g-key",
};

describe("getEnv", () => {
  it("applies defaults when only required vars are set", () => {
    const env = getEnv(required);
    expect(env.GEMINI_MODEL).toBe("gemini-3.5-flash-lite");
    expect(env.BREVO_API_KEY).toBeUndefined();
  });

  it("throws naming the missing GEMINI_API_KEY", () => {
    expect(() => getEnv({})).toThrow(/GEMINI_API_KEY/);
  });

  it("treats empty strings as unset", () => {
    const env = getEnv({ ...required, GEMINI_MODEL: "", BREVO_API_KEY: "" });
    expect(env.GEMINI_MODEL).toBe("gemini-3.5-flash-lite");
    expect(env.BREVO_API_KEY).toBeUndefined();
  });
});
