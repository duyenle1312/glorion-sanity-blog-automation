import { getRun } from "workflow/api";
import type { BlogAgentResult } from "@/workflows/blog-agent";

/** Resolve `promise`, or null after `ms` (so one slow run can't stall a page). */
export async function within<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<null>((r) => (timer = setTimeout(() => r(null), ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Post title of a completed run (from its return value); null for runs that
 * are unknown, still going, or failed. Pass `status` when already known to
 * skip a lookup. Never awaits an unfinished run.
 */
export async function postTitleFor(runId: string, status?: string): Promise<string | null> {
  try {
    const run = getRun<BlogAgentResult>(runId);
    const s = status ?? (await within(run.status, 1500));
    if (s !== "completed") return null;
    const result = await within(run.returnValue, 1500);
    return result?.title?.trim() || null;
  } catch {
    return null;
  }
}
