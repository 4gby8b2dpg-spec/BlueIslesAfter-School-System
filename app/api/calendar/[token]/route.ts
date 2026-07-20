import { createClient } from "@/lib/supabase/server";
import { buildIcs, type FeedEvent } from "@/lib/ics";

// Public ICS feed (FR-E.5). Calendar clients fetch this with no cookie, so the
// token in the URL is the only credential — resolved through a SECURITY DEFINER
// function that returns nothing for unknown or revoked tokens.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_calendar_feed", { p_token: token });

  if (error || !data) {
    // Same answer for unknown and revoked, so the endpoint can't be probed.
    return new Response("Calendar not found.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const feed = data as { label: string; org: string; events: FeedEvent[] };
  const ics = buildIcs({
    name: `${feed.org} — ${feed.label}`,
    events: feed.events ?? [],
  });

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="blueisles.ics"`,
      // clients re-poll on their own schedule; keep it briefly cacheable
      "Cache-Control": "public, max-age=900",
    },
  });
}
