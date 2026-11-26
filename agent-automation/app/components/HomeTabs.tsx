"use client";

import { useSearchParams } from "next/navigation";
import { HistoryList } from "./HistoryList";
import { UploadForm } from "./UploadForm";
import type { TargetOption } from "@/lib/targets";

export function HomeTabs({ targets }: { targets: TargetOption[] }) {
  const history = useSearchParams().get("tab") === "history";
  return history ? (
    <section className="space-y-6">
      <h1 className="text-center font-geist-sans text-4xl font-semibold tracking-tight text-white">
        Recent <span className="font-libre-bodoni italic text-primary">runs</span>
      </h1>
      <HistoryList />
    </section>
  ) : (
    <section className="space-y-8">
      <div className="text-center">
        <h1 className="font-geist-sans text-4xl font-semibold tracking-tight text-balance text-white">
          Turn a Word document into a <span className="font-libre-bodoni italic text-primary">blog draft</span>
        </h1>
        <p className="mx-auto mt-2 max-w-prose text-muted-foreground">
          The agent converts the document, writes SEO metadata with Gemini, and saves an unpublished draft in Sanity.
          You can watch each step as it happens.
        </p>
      </div>
      <UploadForm targets={targets} />
    </section>
  );
}
