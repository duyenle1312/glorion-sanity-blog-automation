/**
 * Sanity projects the agent can write drafts to. All share the same `blog`
 * schema. Non-secret settings live here; each target's write token and Studio
 * URL come from its own env vars (Sanity tokens are scoped to one project).
 *
 * A target is offered in the UI only when both of its env vars are set.
 */
export type SanityTarget = {
  id: string;
  label: string;
  projectId: string;
  dataset: string;
  /** Env var holding an Editor-role write token for this project. */
  tokenEnv: string;
  /** Env var holding the Studio base URL used for "Open draft" links. */
  studioUrlEnv: string;
};

export const SANITY_TARGETS: readonly SanityTarget[] = [
  {
    id: "glorion",
    label: "Glorion Media",
    projectId: "b57pzymc",
    dataset: "production",
    tokenEnv: "SANITY_API_WRITE_TOKEN",
    studioUrlEnv: "SANITY_STUDIO_URL",
  },
  {
    id: "tsvetta",
    label: "Tsvetta Website",
    projectId: "1r7t0jlt",
    dataset: "production",
    tokenEnv: "SANITY_TSVETTA_WRITE_TOKEN",
    studioUrlEnv: "SANITY_TSVETTA_STUDIO_URL",
  },
  {
    id: "money-signal",
    label: "Money Signal Podcast",
    projectId: "aissyerx",
    dataset: "production",
    tokenEnv: "SANITY_MONEY_SIGNAL_WRITE_TOKEN",
    studioUrlEnv: "SANITY_MONEY_SIGNAL_STUDIO_URL",
  },
];

/** Used when a run does not name a target (older runs, API callers). */
export const DEFAULT_TARGET_ID = "glorion";

export type TargetOption = { id: string; label: string };

const present = (env: Record<string, string | undefined>, name: string) =>
  Boolean(env[name]?.trim());

export function findTarget(id: string): SanityTarget | undefined {
  return SANITY_TARGETS.find((t) => t.id === id);
}

/** Server-only: targets whose token and Studio URL are both configured. */
export function configuredTargets(
  env: Record<string, string | undefined> = process.env,
): TargetOption[] {
  return SANITY_TARGETS.filter(
    (t) => present(env, t.tokenEnv) && present(env, t.studioUrlEnv),
  ).map(({ id, label }) => ({ id, label }));
}

/** Server-only: full connection settings for a target, or a clear error. */
export function resolveTarget(
  id: string,
  env: Record<string, string | undefined> = process.env,
): SanityTarget & { token: string; studioUrl: string } {
  const target = findTarget(id);
  if (!target) throw new Error(`Unknown Sanity target "${id}"`);
  const token = env[target.tokenEnv]?.trim();
  const studioUrl = env[target.studioUrlEnv]?.trim();
  if (!token || !studioUrl) {
    const missing = [!token && target.tokenEnv, !studioUrl && target.studioUrlEnv].filter(Boolean);
    throw new Error(`${target.label} is not configured: set ${missing.join(" and ")}`);
  }
  return { ...target, token, studioUrl };
}
