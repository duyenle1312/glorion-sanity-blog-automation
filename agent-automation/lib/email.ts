import { getEnv } from "@/lib/env";

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildHtml(title: string, studioUrl: string): string {
  const safeTitle = escapeHtml(title);
  const safeUrl = escapeHtml(studioUrl);
  return `
    <html>
    <body style="font-family: Arial, sans-serif; background-color: #ffffff; color: #000000; margin: 0; padding: 0;">
        <div style="max-width: 600px; margin: 10px auto; padding: 20px;">

        <!-- Notification Header -->
        <h2 style="color: #D32F2F; text-align: center;">New Blog Draft Ready!</h2>
        <p style="text-align: center; font-size: 16px; color: #333333;">
            GLORION Media's AI Agent has created a new blog draft for you.
        </p>

        <!-- Blog Title -->
        <div style="margin: 20px 0; padding: 15px; background-color: #f8f8f8; border-left: 5px solid #D32F2F;">
            <h3 style="margin: 5px 0 0 0; color: #000000;"><strong>${safeTitle}</strong></h3>
        </div>

        <!-- Studio URL -->
        <p style="font-size: 14px; color: #000000;">
            Please review the draft in Sanity Studio and set isPublished to publish it: <br/> <br/>
            <a href="${safeUrl}" style="color: #D32F2F; text-decoration: none;">Open the draft in Sanity Studio</a>
        </p>

        <!-- Footer -->
        <p style="margin-top: 30px; font-size: 14px; color: #000000;">
            Have a nice day!<br/><br/>
            Best regards,<br/>
            <strong>GLORION Media AI Agent</strong>
        </p>

        <!-- Note about API -->
        <p style="margin-top: 30px; font-size: 12px; color: #999999; text-align: center;">
            This AI Agent uses Google Gemini to summarize blog content.
        </p>
        </div>
    </body>
    </html>
    `;
}

/**
 * Notify recipients that a new blog draft is ready in Sanity Studio.
 * Returns 'skipped' when Brevo configuration is missing.
 */
export async function sendDraftEmail(input: {
  title: string;
  studioUrl: string;
}): Promise<"sent" | "skipped"> {
  const env = getEnv();
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL || !env.EMAIL_TO) {
    return "skipped";
  }

  const recipients = env.EMAIL_TO.split(",")
    .map((email) => email.trim())
    .filter(Boolean)
    .map((email) => ({ email }));

  if (recipients.length === 0) return "skipped";

  const response = await fetch(BREVO_URL, {
    method: "POST",
    headers: {
      "api-key": env.BREVO_API_KEY,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: "GLORION Media AI Agent", email: env.BREVO_SENDER_EMAIL },
      to: recipients,
      subject: `New blog draft ready for review: ${input.title}`,
      htmlContent: buildHtml(input.title, input.studioUrl),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Brevo email failed with status ${response.status}: ${body}`);
  }

  return "sent";
}
