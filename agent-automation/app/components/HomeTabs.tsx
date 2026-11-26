"use client";

import { useSearchParams } from "next/navigation";
import { HistoryList } from "./HistoryList";
import { UploadForm } from "./UploadForm";

export function HomeTabs() {
  const history = useSearchParams().get("tab") === "history";
  return history ? (
    <section className="space-y-6">
      <h1 className="font-display text-3xl font-bold tracking-tight">Recent runs</h1>
      <HistoryList />
    </section>
  ) : (
    <section className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight">Turn a Word document into a blog draft</h1>
        <p className="mt-2 max-w-prose text-mute">
          The agent converts the document, writes SEO metadata with Gemini, and saves an unpublished draft in Sanity.
          You can watch each step as it happens.
        </p>
      </div>
      <UploadForm />
    </section>
  );
}
