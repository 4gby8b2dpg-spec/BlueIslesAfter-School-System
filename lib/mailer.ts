// Resend transactional email over its REST API — deliberately no SDK, so this
// adds no dependency. Returns a result object rather than throwing, so a failed
// send can be recorded in report_deliveries instead of killing the whole run.

export type Attachment = { filename: string; content: string }; // content = base64

export type SendResult = { ok: true; id: string } | { ok: false; error: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Until a domain is verified in Resend, onboarding@resend.dev is the only
// usable sender and it can only deliver to the account owner's own address.
const DEFAULT_FROM = "BlueIsles <onboarding@resend.dev>";

export async function sendEmail({
  to,
  subject,
  html,
  attachments,
}: {
  to: string[];
  subject: string;
  html: string;
  attachments?: Attachment[];
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return {
      ok: false,
      error:
        "RESEND_API_KEY is not set — add it to .env.local and the Netlify environment to enable email.",
    };
  }
  if (to.length === 0) return { ok: false, error: "No recipients." };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.REPORTS_FROM_EMAIL || DEFAULT_FROM,
        to,
        subject,
        html,
        ...(attachments?.length ? { attachments } : {}),
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };

    if (!res.ok) {
      // Resend reports problems as {name, message} — surface it verbatim so the
      // delivery log says what actually went wrong (bad key, unverified domain…).
      return { ok: false, error: body.message || body.name || `Resend returned ${res.status}.` };
    }
    return { ok: true, id: body.id ?? "sent" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error contacting Resend." };
  }
}
