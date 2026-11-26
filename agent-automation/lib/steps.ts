// Client-safe step vocabulary (no server imports). Re-exported by ./events.

export type StepId =
  | "received"
  | "convert"
  | "analyze"
  | "cover"
  | "sanity"
  | "email"
  | "done"
  | "error";

export const STEP_TITLES: Record<StepId, string> = {
  received: "File received",
  convert: "Convert document",
  analyze: "Analyze with Gemini",
  cover: "Cover image",
  sanity: "Create Sanity draft",
  email: "Email notification",
  done: "Draft ready",
  error: "Agent failed",
};

/** The working steps of a run, in order (excludes the terminal `done` / `error`). */
export const PIPELINE: StepId[] = ["received", "convert", "analyze", "cover", "sanity", "email"];
