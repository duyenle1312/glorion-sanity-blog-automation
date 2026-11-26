"use client";

import { useEffect, useReducer, useState } from "react";
import type { TimelineEvent } from "@/lib/events";
import { reduceTimeline, splitNdjson, streamEndAction, type StepView } from "@/lib/timeline";

const RECONNECT_MS = 1000;

type RunStream = {
  steps: StepView[];
  finished: boolean;
  connected: boolean;
  notFound: boolean;
};

const isTerminal = (ev: TimelineEvent) =>
  ev.step === "error" || (ev.step === "done" && ev.status !== "running");

/**
 * Follow a run's NDJSON timeline. If the stream ends before a `done`/`error`
 * event, reconnect after 1 s resuming from the number of raw events received.
 */
export function useRunStream(runId: string | null): RunStream {
  const [steps, dispatch] = useReducer(reduceTimeline, []);
  const [finished, setFinished] = useState(false);
  const [connected, setConnected] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!runId) return;
    const controller = new AbortController();
    const { signal } = controller;
    let count = 0;
    let done = false;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        if (signal.aborted) return resolve();
        const t = setTimeout(resolve, ms);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(t);
            resolve();
          },
          { once: true },
        );
      });

    const handleLine = (line: string) => {
      count += 1; // count raw events so `from` stays aligned with the server index
      let ev: TimelineEvent;
      try {
        ev = JSON.parse(line) as TimelineEvent;
      } catch {
        return;
      }
      dispatch(ev);
      if (isTerminal(ev)) {
        done = true;
        setFinished(true);
      }
    };

    async function follow() {
      while (!signal.aborted && !done) {
        let tail = ""; // unterminated bytes of the current response; never counted
        try {
          const res = await fetch(
            `/api/runs/${encodeURIComponent(runId!)}/stream?from=${count}`,
            { signal, cache: "no-store" },
          );
          if (res.status === 404) {
            setNotFound(true);
            return;
          }
          if (!res.ok || !res.body) throw new Error(`Stream responded ${res.status}`);
          setConnected(true);

          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
          for (;;) {
            const { value, done: streamDone } = await reader.read();
            if (streamDone) break;
            const { lines, rest } = splitNdjson(tail + value);
            tail = rest;
            lines.forEach(handleLine);
          }
        } catch {
          // network error: fall through to the end-of-stream decision
        }
        if (!signal.aborted) setConnected(false);
        const end = streamEndAction({ finished: done, aborted: signal.aborted, tail });
        end.lines.forEach(handleLine);
        if (!end.reconnect) return;
        await sleep(RECONNECT_MS);
      }
    }

    void follow();
    return () => controller.abort();
  }, [runId]);

  return { steps, finished, connected, notFound };
}
