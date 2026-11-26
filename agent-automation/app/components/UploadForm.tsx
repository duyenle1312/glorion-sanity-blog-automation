"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type DragEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  COVER_TOO_LARGE,
  DOCX_TOO_LARGE,
  MAX_COVER_BYTES,
  MAX_DOCX_BYTES,
  MAX_TOTAL_BYTES,
  TOTAL_TOO_LARGE,
} from "@/lib/upload-limits";
import type { TargetOption } from "@/lib/targets";

const TARGET_KEY = "blog-agent:target";
const noopSubscribe = () => () => {};
const readSavedTarget = () => {
  try {
    return localStorage.getItem(TARGET_KEY);
  } catch {
    return null;
  }
};

const MB = 1024 * 1024;
const formatSize = (bytes: number) =>
  bytes < MB ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / MB).toFixed(1)} MB`;

const inputClass =
  "w-full rounded-md border border-border bg-black px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none";

/** Upload a .docx (+ optional cover) and hand off to the live run page. */
export function UploadForm({ targets }: { targets: TargetOption[] }) {
  const router = useRouter();
  // Last destination used on this browser (null during SSR), unless picked now.
  const saved = useSyncExternalStore(noopSubscribe, readSavedTarget, () => null);
  const [chosen, setChosen] = useState<string | null>(null);
  const preferred = chosen ?? saved;
  const target = targets.some((t) => t.id === preferred) ? preferred! : (targets[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function chooseTarget(id: string) {
    setChosen(id);
    try {
      localStorage.setItem(TARGET_KEY, id);
    } catch {}
  }

  function pick(next: File | null | undefined) {
    setError(null);
    if (!next) return;
    if (!next.name.toLowerCase().endsWith(".docx")) {
      setFile(null);
      setError(`“${next.name}” is not a .docx file. Save it from Word as .docx and try again.`);
      return;
    }
    if (next.size > MAX_DOCX_BYTES) {
      setFile(null);
      setError(DOCX_TOO_LARGE);
      return;
    }
    if (cover && next.size + cover.size > MAX_TOTAL_BYTES) {
      setFile(null);
      setError(TOTAL_TOO_LARGE);
      return;
    }
    setFile(next);
  }

  function pickCover(input: HTMLInputElement) {
    setError(null);
    const next = input.files?.[0] ?? null;
    if (next && next.size > MAX_COVER_BYTES) {
      input.value = "";
      setCover(null);
      setError(COVER_TOO_LARGE);
      return;
    }
    if (next && file && file.size + next.size > MAX_TOTAL_BYTES) {
      input.value = "";
      setCover(null);
      setError(TOTAL_TOO_LARGE);
      return;
    }
    setCover(next);
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files[0]);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) {
      setError("Choose a .docx file to run the agent.");
      return;
    }
    if (!target) {
      setError("No Sanity project is configured. Add a write token and Studio URL (see README).");
      return;
    }
    const form = new FormData(e.currentTarget);
    form.set("file", file); // a dropped file is not in the input's FileList
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { runId?: string; error?: string };
      if (res.status === 201 && body.runId) {
        router.push(`/runs/${body.runId}`);
        return;
      }
      setError(body.error ?? `The server responded with ${res.status}. Try again.`);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    }
    setSubmitting(false);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <div className="space-y-1.5">
        <label htmlFor="target" className="block text-sm text-foreground">Select Project:</label>
        {targets.length > 0 ? (
          <select
            id="target"
            name="target"
            value={target}
            onChange={(e) => chooseTarget(e.target.value)}
            className={inputClass}
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        ) : (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            No Sanity project is configured. Set a write token and Studio URL for at least one site.
          </p>
        )}
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl text-center border border-dashed px-6 py-10 transition-colors ${
          dragging ? "border-primary bg-primary/10" : file ? "border-gold/60 bg-card" : "border-border bg-card hover:border-muted-foreground"
        }`}
      >
        <input
          type="file"
          name="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        {file ? (
          <>
            <span className="font-geist-sans text-xl font-semibold text-foreground">{file.name}</span>
            <span className="text-sm text-muted-foreground">
              {formatSize(file.size)} · <span className="text-gold underline-offset-2 hover:underline">Choose another file</span>
            </span>
          </>
        ) : (
          <>
            <span className="font-geist-sans text-xl font-semibold text-foreground">Drop a Word document here</span>
            <span className="text-sm text-muted-foreground">or click to browse. .docx only, up to 4 MB.</span>
          </>
        )}
      </label>

      <fieldset>
        <legend className="mb-3 text-sm text-muted-foreground">Cover image (optional)</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="coverUrl" className="block text-sm text-foreground">Cover image URL</label>
            <input
              id="coverUrl"
              name="coverUrl"
              type="url"
              inputMode="url"
              placeholder="https://…"
              className={inputClass}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="cover" className="block text-sm text-foreground">Or upload a cover file</label>
            <input
              id="cover"
              name="cover"
              type="file"
              accept="image/*"
              onChange={(e) => pickCover(e.target)}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-sm file:text-foreground hover:file:border-muted-foreground"
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Image up to 2 MB. If both are given, the URL is used.</p>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-center">
        <Button
          type="submit"
          disabled={submitting || targets.length === 0}
          className="h-auto rounded-full px-10 py-3.5 font-poppins text-base font-semibold disabled:cursor-wait"
        >
          {submitting ? "Starting agent…" : "Run agent"}
        </Button>
      </div>
    </form>
  );
}
