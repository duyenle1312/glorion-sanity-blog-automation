import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendDraftEmail } from "@/lib/email";

// getEnv() validates the required keys too, so they must be present for any call.
const requiredEnv = {
  GEMINI_API_KEY: "test-gemini",
  SANITY_API_WRITE_TOKEN: "test-sanity-token",
  SANITY_STUDIO_URL: "https://studio.example.com",
};

const fullEnv = {
  ...requiredEnv,
  BREVO_API_KEY: "test-key",
  BREVO_SENDER_EMAIL: "agent@example.com",
  EMAIL_TO: "a@x.com, b@y.com",
};

function okResponse() {
  return new Response(JSON.stringify({ messageId: "<1@brevo>" }), { status: 201 });
}

describe("sendDraftEmail", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_SENDER_EMAIL;
    delete process.env.EMAIL_TO;
    Object.assign(process.env, requiredEnv);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it("returns skipped and does not call fetch when env is missing", async () => {
    const result = await sendDraftEmail({
      title: "Hello",
      studioUrl: "https://studio.example.com/desk/post;abc",
    });

    expect(result).toBe("skipped");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("treats empty env values as unset", async () => {
    Object.assign(process.env, {
      ...requiredEnv,
      BREVO_API_KEY: "",
      BREVO_SENDER_EMAIL: "agent@example.com",
      EMAIL_TO: "a@x.com",
    });

    const result = await sendDraftEmail({ title: "Hello", studioUrl: "https://s.example.com" });

    expect(result).toBe("skipped");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("posts to Brevo with split recipients, sender and subject", async () => {
    Object.assign(process.env, fullEnv);
    vi.mocked(fetch).mockResolvedValue(okResponse());

    const result = await sendDraftEmail({
      title: "My Post",
      studioUrl: "https://studio.example.com/desk/post;abc",
    });

    expect(result).toBe("sent");
    expect(fetch).toHaveBeenCalledTimes(1);

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init?.method).toBe("POST");

    const headers = new Headers(init?.headers);
    expect(headers.get("api-key")).toBe("test-key");
    expect(headers.get("content-type")).toBe("application/json");

    const body = JSON.parse(String(init?.body));
    expect(body.sender).toEqual({
      name: "GLORION Media AI Agent",
      email: "agent@example.com",
    });
    expect(body.to).toEqual([{ email: "a@x.com" }, { email: "b@y.com" }]);
    expect(body.subject).toBe("New blog draft ready for review: My Post");
    expect(body.htmlContent).toContain("GLORION");
    expect(body.htmlContent).toContain("isPublished");
    expect(body.htmlContent).toContain("https://studio.example.com/desk/post;abc");
  });

  it("HTML-escapes title and URL in the email body", async () => {
    Object.assign(process.env, fullEnv);
    vi.mocked(fetch).mockResolvedValue(okResponse());

    await sendDraftEmail({
      title: "<script>alert('x')</script> & \"quotes\"",
      studioUrl: "https://s.example.com/?a=1&b=\"2\"",
    });

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.htmlContent).not.toContain("<script>alert");
    expect(body.htmlContent).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;quotes&quot;");
    expect(body.htmlContent).toContain("https://s.example.com/?a=1&amp;b=&quot;2&quot;");
  });

  it("throws with status and body on a non-2xx response", async () => {
    Object.assign(process.env, fullEnv);
    vi.mocked(fetch).mockResolvedValue(
      new Response('{"message":"bad request"}', { status: 400 }),
    );

    await expect(
      sendDraftEmail({ title: "Hello", studioUrl: "https://s.example.com" }),
    ).rejects.toThrow(/400.*bad request/);
  });
});
