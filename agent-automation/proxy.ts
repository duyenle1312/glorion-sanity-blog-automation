import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

const sha = (s: string) => createHash("sha256").update(s).digest();

function safeEqual(a: string, b: string): boolean {
  // Hash first so lengths are equal and comparison is length-independent.
  return timingSafeEqual(sha(a), sha(b));
}

function unauthorized() {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Blog Agent"' },
  });
}

export function proxy(request: NextRequest) {
  const expected = process.env.AGENT_BASIC_AUTH;
  if (!expected) return NextResponse.next();

  const header = request.headers.get("authorization") ?? "";
  const match = /^Basic\s+(.+)$/i.exec(header);
  if (!match) return unauthorized();

  let provided: string;
  try {
    provided = Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return unauthorized();
  }
  return safeEqual(provided, expected) ? NextResponse.next() : unauthorized();
}

export const config = {
  matcher: "/((?!_next/static|_next/image|favicon.ico|.well-known/workflow/).*)",
};
