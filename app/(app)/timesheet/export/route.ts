import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { localMonth, toLocalInput } from "@/lib/timezone";

export const dynamic = "force-dynamic";

// CSV of closed shifts for one month, in each site's local time, for payroll.
// Admins and directors only. Open shifts are left out until they're closed.
export async function GET(request: Request) {
  const ctx = await requireAppContext();
  if (!["admin", "director"].includes(ctx.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const month = url.searchParams.get("month") ?? "";
  const siteId = url.searchParams.get("site") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return new Response("Bad month", { status: 400 });
  }

  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 0)).toISOString();
  const to = new Date(Date.UTC(y, m, 2)).toISOString();

  const supabase = await createClient();
  let q = supabase
    .from("staff_time_entries")
    .select(
      "clock_in_at, clock_out_at, note, sites(name, timezone), profiles(full_name, email)",
    )
    .eq("org_id", ctx.orgId)
    .not("clock_out_at", "is", null)
    .gte("clock_in_at", from)
    .lte("clock_in_at", to)
    .order("clock_in_at", { ascending: true });
  if (siteId) q = q.eq("site_id", siteId);
  const { data, error } = await q;
  if (error) return new Response("Could not load shifts", { status: 500 });

  type Row = {
    clock_in_at: string;
    clock_out_at: string;
    note: string | null;
    sites: { name: string; timezone: string } | { name: string; timezone: string }[] | null;
    profiles: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
  };
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

  const lines = [["Staff", "Site", "Date", "Clock in", "Clock out", "Hours", "Note"].join(",")];
  for (const r of (data ?? []) as Row[]) {
    const s = one(r.sites);
    const p = one(r.profiles);
    const tz = s?.timezone ?? "America/New_York";
    if (localMonth(r.clock_in_at, tz) !== month) continue;
    const local = toLocalInput(r.clock_in_at, tz);
    const localOut = toLocalInput(r.clock_out_at, tz);
    const hours = (new Date(r.clock_out_at).getTime() - new Date(r.clock_in_at).getTime()) / 3_600_000;
    lines.push(
      [
        p?.full_name || p?.email || "Unknown",
        s?.name ?? "",
        local.slice(0, 10),
        local.slice(11),
        localOut.slice(11),
        hours.toFixed(2),
        r.note ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }

  return new Response(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="timesheet-${month}.csv"`,
    },
  });
}

// Quote anything that could break a CSV row, and neutralise spreadsheet
// formula injection (cells starting with = + - @).
function csvCell(value: string) {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
