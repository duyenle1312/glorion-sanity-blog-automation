import { getWritable } from "workflow";

export type StepId =
  | "received"
  | "convert"
  | "analyze"
  | "cover"
  | "sanity"
  | "email"
  | "done"
  | "error";

export type TimelineEvent = {
  step: StepId;
  status: "running" | "done" | "skipped" | "error";
  title: string;
  detail?: string;
  url?: string;
  timestamp: string;
};

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

/** Stamp an event with an ISO timestamp, dropping undefined optional fields. */
export function timelineEvent(
  event: Omit<TimelineEvent, "timestamp">,
  now: Date = new Date(),
): TimelineEvent {
  const out: TimelineEvent = {
    step: event.step,
    status: event.status,
    title: event.title,
    timestamp: now.toISOString(),
  };
  if (event.detail !== undefined) out.detail = event.detail;
  if (event.url !== undefined) out.url = event.url;
  return out;
}

/** Write one event to the run's default stream. */
export async function emit(event: Omit<TimelineEvent, "timestamp">): Promise<void> {
  "use step";
  await writeEvent(event);
}

/**
 * Write an event from inside an already-running step (no extra step boundary).
 * Must only be called from step code.
 */
export async function writeEvent(event: Omit<TimelineEvent, "timestamp">): Promise<void> {
  const writer = getWritable<TimelineEvent>().getWriter();
  try {
    await writer.write(timelineEvent(event));
  } finally {
    writer.releaseLock();
  }
}

/** Close the run's default stream so consumers see the end. */
export async function closeTimeline(): Promise<void> {
  "use step";
  await getWritable<TimelineEvent>().close();
}
