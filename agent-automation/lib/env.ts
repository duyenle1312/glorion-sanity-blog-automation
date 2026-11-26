import { z } from "zod";

// Empty strings (e.g. `KEY=` lines copied from .env.example) count as unset.
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);
const optional = z.preprocess(emptyToUndefined, z.string().optional());
const withDefault = (value: string) =>
  z.preprocess(emptyToUndefined, z.string().default(value));
const required = z.preprocess(emptyToUndefined, z.string());

const schema = z.object({
  GEMINI_API_KEY: required,
  GEMINI_MODEL: withDefault("gemini-3.5-flash-lite"),
  SANITY_PROJECT_ID: withDefault("b57pzymc"),
  SANITY_DATASET: withDefault("production"),
  SANITY_API_WRITE_TOKEN: required,
  SANITY_STUDIO_URL: required,
  BREVO_API_KEY: optional,
  BREVO_SENDER_EMAIL: optional,
  EMAIL_TO: optional,
  AGENT_BASIC_AUTH: optional,
});

export type Env = z.infer<typeof schema>;

/** Parsed lazily on each call so `next build` and tests work without secrets. */
export function getEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const names = result.error.issues
      .map((i) => i.path.join("."))
      .filter(Boolean);
    throw new Error(
      `Invalid or missing environment variables: ${[...new Set(names)].join(", ")}`,
    );
  }
  return result.data;
}
