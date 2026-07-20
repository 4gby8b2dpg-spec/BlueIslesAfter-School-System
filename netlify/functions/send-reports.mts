import { createAdminClient } from "../../lib/supabase/admin";
import { runDueSchedules } from "../../lib/report-scheduler";

/**
 * Hourly scheduled report delivery.
 *
 * Netlify scheduled functions only run on published production deploys, can't
 * be invoked by URL, and are capped at 30s — so this stays thin: ask which
 * schedules are due right now and send those. The "Send now" button in the app
 * exercises the same code path for testing.
 */
const handler = async () => {
  try {
    const supabase = createAdminClient();
    const result = await runDueSchedules(supabase);
    console.log("[send-reports]", JSON.stringify(result));
    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[send-reports] failed:", message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
};

export default handler;

export const config = { schedule: "0 * * * *" };
