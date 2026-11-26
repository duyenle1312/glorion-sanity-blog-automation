import { DEFAULT_TARGET_ID, findTarget } from "@/lib/targets";

/**
 * Split the "received" event detail ("file.docx → Site") into its parts.
 * Runs started before multi-project support have no "→ Site" and always
 * wrote to the default target.
 */
export function parseReceivedDetail(detail: string): { filename: string; project: string } {
  const i = detail.lastIndexOf(" → ");
  if (i === -1) {
    return { filename: detail, project: findTarget(DEFAULT_TARGET_ID)?.label ?? DEFAULT_TARGET_ID };
  }
  return { filename: detail.slice(0, i), project: detail.slice(i + 3) };
}
