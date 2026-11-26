import { describe, it, expect } from "vitest";
import { getEnv } from "@/lib/env";

const required = {
  GEMINI_API_KEY: "g-key",
  SANITY_API_WRITE_TOKEN: "s-token",
  SANITY_STUDIO_URL: "http://localhost:3333",
};

describe("getEnv", () => {
  it("applies defaults when only required vars are set", () => {
    const env = getEnv(required);
    expect(env.GEMINI_MODEL).toBe("gemini-3.5-flash-lite");
    expect(env.SANITY_PROJECT_ID).toBe("b57pzymc");
    expect(env.SANITY_DATASET).toBe("production");
    expect(env.BREVO_API_KEY).toBeUndefined();
    expect(env.AGENT_BASIC_AUTH).toBeUndefined();
  });

  it("throws naming the missing SANITY_API_WRITE_TOKEN", () => {
    const rest: Record<string, string | undefined> = { ...required };
    delete rest.SANITY_API_WRITE_TOKEN;
    expect(() => getEnv(rest)).toThrow(/SANITY_API_WRITE_TOKEN/);
  });

  it("treats empty strings as unset", () => {
    const env = getEnv({ ...required, GEMINI_MODEL: "", BREVO_API_KEY: "" });
    expect(env.GEMINI_MODEL).toBe("gemini-3.5-flash-lite");
    expect(env.BREVO_API_KEY).toBeUndefined();
  });
});
