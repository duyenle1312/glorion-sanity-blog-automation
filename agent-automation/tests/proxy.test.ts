import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "../proxy";

const req = (auth?: string) =>
  new NextRequest("http://localhost/", {
    headers: auth ? { authorization: auth } : {},
  });
const basic = (s: string) => "Basic " + Buffer.from(s).toString("base64");

describe("proxy basic auth", () => {
  const prev = process.env.AGENT_BASIC_AUTH;
  afterEach(() => {
    vi.unstubAllEnvs();
    if (prev === undefined) delete process.env.AGENT_BASIC_AUTH;
    else process.env.AGENT_BASIC_AUTH = prev;
  });

  it("passes when unset", () => {
    delete process.env.AGENT_BASIC_AUTH;
    const res = proxy(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("fails closed with 503 when unset on Vercel", async () => {
    delete process.env.AGENT_BASIC_AUTH;
    vi.stubEnv("VERCEL", "1");
    const res = proxy(req());
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("AGENT_BASIC_AUTH is not configured");
  });

  it("fails closed with 503 when unset in production", () => {
    delete process.env.AGENT_BASIC_AUTH;
    vi.stubEnv("NODE_ENV", "production");
    expect(proxy(req()).status).toBe(503);
  });

  it("still enforces credentials when set in production", () => {
    process.env.AGENT_BASIC_AUTH = "a:b";
    vi.stubEnv("NODE_ENV", "production");
    expect(proxy(req()).status).toBe(401);
    expect(proxy(req(basic("a:b"))).headers.get("x-middleware-next")).toBe("1");
  });

  it("passes when empty", () => {
    process.env.AGENT_BASIC_AUTH = "";
    expect(proxy(req()).headers.get("x-middleware-next")).toBe("1");
  });

  it("401 without credentials", () => {
    process.env.AGENT_BASIC_AUTH = "a:b";
    const res = proxy(req());
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe('Basic realm="Blog Agent"');
  });

  it("401 with wrong credentials", () => {
    process.env.AGENT_BASIC_AUTH = "a:b";
    expect(proxy(req(basic("a:wrong"))).status).toBe(401);
    expect(proxy(req("Basic !!!")).status).toBe(401);
    expect(proxy(req("Bearer x")).status).toBe(401);
  });

  it("passes with correct credentials", () => {
    process.env.AGENT_BASIC_AUTH = "a:b";
    expect(proxy(req(basic("a:b"))).headers.get("x-middleware-next")).toBe("1");
  });

  it("supports ':' in the password", () => {
    process.env.AGENT_BASIC_AUTH = "a:b:c";
    expect(proxy(req(basic("a:b:c"))).headers.get("x-middleware-next")).toBe("1");
    expect(proxy(req(basic("a:b"))).status).toBe(401);
  });

  it("matcher excludes workflow internals", () => {
    expect(config.matcher).toBe(
      "/((?!_next/static|_next/image|favicon.ico|.well-known/workflow/).*)",
    );
  });
});
