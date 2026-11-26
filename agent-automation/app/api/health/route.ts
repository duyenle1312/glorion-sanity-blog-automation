import { connection, NextResponse } from "next/server";

const present = (name: string) => Boolean(process.env[name]);

export async function GET() {
  await connection();
  return NextResponse.json({
    ok: true,
    sanity: present("SANITY_API_WRITE_TOKEN") && present("SANITY_STUDIO_URL"),
    gemini: present("GEMINI_API_KEY"),
  });
}
