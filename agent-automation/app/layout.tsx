import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { Geist, Libre_Bodoni, Poppins } from "next/font/google";
import { NavTabs, NavTabsFallback } from "./components/NavTabs";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const libreBodoni = Libre_Bodoni({ variable: "--font-libre-bodoni", subsets: ["latin"], style: ["normal", "italic"] });
const poppins = Poppins({ variable: "--font-poppins", subsets: ["latin"], weight: ["400", "500", "600", "700"] });

export const metadata: Metadata = {
  title: "Blog Agent | GLORION Media",
  description: "Turn a Word document into a Sanity blog draft, step by step.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark h-full antialiased">
      <body className={`${geistSans.variable} ${libreBodoni.variable} ${poppins.variable} min-h-full bg-black font-sans`}>
        <header className="sticky top-0 z-50 px-4 pt-5 md:px-8 lg:px-12">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-10 gap-y-3 rounded-[20px] border border-white/10 bg-black/30 px-6 py-3 backdrop-blur-lg lg:rounded-full">
            <Link href="/" className="flex shrink-0 items-center gap-4">
              <Image
                src="/logo.png"
                alt="GLORION Media"
                width={382}
                height={135}
                priority
                className="h-[35px] w-auto object-contain md:h-[48px]"
              />
              <span className="hidden border-l border-white/20 pl-4 font-poppins text-base font-semibold text-white sm:inline">
                Blog agent
              </span>
            </Link>
            <Suspense fallback={<NavTabsFallback />}>
              <NavTabs />
            </Suspense>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-6 py-12 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
