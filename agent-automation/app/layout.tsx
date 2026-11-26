import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Geist, Libre_Bodoni, Poppins } from "next/font/google";
import { HealthStatus } from "./components/HealthStatus";
import { NavTabs, NavTabsFallback } from "./components/NavTabs";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const libreBodoni = Libre_Bodoni({ variable: "--font-libre-bodoni", subsets: ["latin"], style: ["normal", "italic"] });
const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Blog Agent · GLORION Media",
  description: "Turn a Word document into a Sanity blog draft, step by step.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${libreBodoni.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-black font-sans">
        <header className="sticky top-0 z-50 px-4 pt-4 sm:px-6">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-8 gap-y-3 rounded-[20px] border border-white/10 bg-black/30 px-5 py-3 backdrop-blur-lg sm:rounded-full">
            <Link href="/" className="flex items-center gap-3">
              <Image src="/logo.png" alt="GLORION Media" width={382} height={135} priority className="h-7 w-auto" />
              <span className="font-poppins text-sm font-semibold text-body">Blog agent</span>
            </Link>
            <Suspense fallback={<NavTabsFallback />}>
              <NavTabs />
            </Suspense>
            <HealthStatus />
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
