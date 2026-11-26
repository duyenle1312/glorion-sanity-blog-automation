import { docxToHtml } from "@/lib/convert/docx-to-html";
import { analyzeArticle } from "@/lib/analyze";
import { createDraft, slugExists, uploadCover } from "@/lib/sanity";
import { sendDraftEmail } from "@/lib/email";

/** External collaborators used by the blog agent's workflow steps. */
export type AgentDeps = {
  docxToHtml: typeof docxToHtml;
  analyzeArticle: typeof analyzeArticle;
  slugExists: typeof slugExists;
  uploadCover: typeof uploadCover;
  createDraft: typeof createDraft;
  sendDraftEmail: typeof sendDraftEmail;
};

const defaults: AgentDeps = {
  docxToHtml,
  analyzeArticle,
  slugExists,
  uploadCover,
  createDraft,
  sendDraftEmail,
};

/*
 * Workflow step code runs from bundles built by the Workflow SDK, which inline
 * their own copy of project-local modules. A plain module-level variable here
 * would therefore not be shared with test code, so overrides live on
 * globalThis under a registered symbol.
 */
const OVERRIDES = Symbol.for("glorion.blog-agent.deps-overrides");
type Holder = { [OVERRIDES]?: Partial<AgentDeps> };

export function getDeps(): AgentDeps {
  return { ...defaults, ...((globalThis as Holder)[OVERRIDES] ?? {}) };
}

/** Test-only: replace collaborators for workflow integration tests. Pass null to reset. */
export function setDepsForTesting(overrides: Partial<AgentDeps> | null): void {
  if (overrides) (globalThis as Holder)[OVERRIDES] = overrides;
  else delete (globalThis as Holder)[OVERRIDES];
}
