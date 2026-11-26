import { generateText, Output, type LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { getEnv } from "@/lib/env";

export type AnalyzeInput = {
  title: string;
  plainText: string;
  existingSummary: string | null;
};

export type AnalyzeResult = {
  description: string;
  keywords: string;
  summary: string | null;
};

const BRAND = "GLORION Media";

export const SYSTEM_PROMPT = `You are an SEO editor for GLORION Media, a media and content studio.
You analyze a finished blog article and produce metadata for it. You never rewrite or edit the article itself.

Produce:
- description: ONE sentence, at most 155 characters, condensed from the article summary (the provided one, or the one you write). It must read naturally in search results.
- keywords: between 12 and 14 high-ranking search phrases that people would actually search for to find this article. Do not include the brand name.
- summary (only when asked for): one interesting, informative paragraph (at least 200 characters) that summarizes the article.`;

export function normalizeKeywords(list: string[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const k = raw.trim();
    const key = k.toLowerCase();
    if (!k || key === BRAND.toLowerCase() || seen.has(key)) continue;
    seen.add(key);
    out.push(k);
  }
  out.push(BRAND);
  return out.join(", ");
}

function buildSchema(needsSummary: boolean) {
  const base = {
    description: z.string().max(160),
    keywords: z.array(z.string().min(2)).min(12).max(14),
  };
  return needsSummary
    ? z.object({ ...base, summary: z.string().min(200) })
    : z.object(base);
}

export async function analyzeArticle(
  input: AnalyzeInput,
  model?: LanguageModel,
): Promise<AnalyzeResult> {
  const needsSummary = input.existingSummary === null;
  const resolved =
    model ??
    createGoogleGenerativeAI({ apiKey: getEnv().GEMINI_API_KEY })(
      getEnv().GEMINI_MODEL,
    );

  const task = needsSummary
    ? "The article has no summary. Write one informative paragraph as `summary`, then condense it into `description`."
    : `The article already has this summary. Condense it into \`description\` (do not return a summary):\n\n${input.existingSummary}`;

  const { output } = await generateText({
    model: resolved,
    system: SYSTEM_PROMPT,
    prompt: `Title: ${input.title}\n\n${task}\n\nArticle:\n${input.plainText}`,
    output: Output.object({ schema: buildSchema(needsSummary) }),
  });

  const parsed = output as {
    description: string;
    keywords: string[];
    summary?: string;
  };
  return {
    description: parsed.description,
    keywords: normalizeKeywords(parsed.keywords),
    summary: needsSummary ? (parsed.summary ?? null) : null,
  };
}
