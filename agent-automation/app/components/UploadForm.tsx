"use client";

import { useRouter } from "next/navigation";
import { useState, type DragEvent, type FormEvent } from "react";

const MB = 1024 * 1024;
const formatSize = (bytes: number) =>
  bytes < MB ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / MB).toFixed(1)} MB`;

const inputClass =
  "w-full rounded-md border border-line bg-ground px-3 py-2 text-sm text-ink placeholder:text-mute/70 focus:border-run focus:outline-none";

/** Upload a .docx (+ optional cover) and hand off to the live run page. */
export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function pick(next: File | null | undefined) {
    setError(null);
    if (!next) return;
    if (!next.name.toLowerCase().endsWith(".docx")) {
      setFile(null);
      setError(`“${next.name}” is not a .docx file. Save it from Word as .docx and try again.`);
      return;
    }
    setFile(next);
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
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-start gap-1 rounded-lg border border-dashed px-6 py-10 transition-colors ${
          dragging ? "border-run bg-run/10" : file ? "border-gold/60 bg-panel" : "border-line bg-panel hover:border-mute"
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
            <span className="font-display text-xl font-semibold text-ink">{file.name}</span>
            <span className="text-sm text-mute">
              {formatSize(file.size)} · <span className="text-gold underline-offset-2 hover:underline">Choose another file</span>
            </span>
          </>
        ) : (
          <>
            <span className="font-display text-xl font-semibold text-ink">Drop a Word document here</span>
            <span className="text-sm text-mute">or click to browse. .docx only, up to 4 MB.</span>
          </>
        )}
      </label>

      <fieldset className="space-y-4">
        <legend className="mb-3 text-sm text-mute">Cover image (optional)</legend>
        <div className="space-y-1.5">
          <label htmlFor="coverUrl" className="block text-sm text-ink">Cover image URL</label>
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
          <label htmlFor="cover" className="block text-sm text-ink">Or upload a cover file</label>
          <input
            id="cover"
            name="cover"
            type="file"
            accept="image/*"
            className="block w-full text-sm text-mute file:mr-3 file:rounded-md file:border file:border-line file:bg-panel file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:border-mute"
          />
          <p className="text-xs text-mute">Image up to 2 MB. If both are given, the URL is used for imageURL.</p>
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-md border border-fail/40 bg-fail/10 px-3 py-2 text-sm text-fail">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-run px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-run/85 disabled:cursor-wait disabled:opacity-60"
      >
        {submitting ? "Starting agent…" : "Run agent"}
      </button>
    </form>
  );
}
