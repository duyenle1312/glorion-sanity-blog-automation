import { connection, NextResponse } from "next/server";
import { configuredTargets } from "@/lib/targets";

const present = (name: string) => Boolean(process.env[name]);

export async function GET() {
  await connection();
  return NextResponse.json({
    ok: true,
    sanity: configuredTargets().map((t) => t.id),
    gemini: present("GEMINI_API_KEY"),
  });
}
