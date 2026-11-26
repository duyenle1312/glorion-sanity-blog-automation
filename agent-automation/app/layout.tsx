import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Bricolage_Grotesque, Geist } from "next/font/google";
import { HealthStatus } from "./components/HealthStatus";
import { NavTabs, NavTabsFallback } from "./components/NavTabs";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Blog Agent · GLORION Media",
  description: "Turn a Word document into a Sanity blog draft, step by step.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${bricolage.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4 sm:px-6">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="font-display text-lg font-bold tracking-tight text-gold">GLORION</span>
              <span className="text-sm text-mute">Blog agent</span>
            </Link>
            <Suspense fallback={<NavTabsFallback />}>
              <NavTabs />
            </Suspense>
            <HealthStatus />
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
