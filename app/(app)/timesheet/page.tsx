import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { formatLocal, localMonth, toLocalInput } from "@/lib/timezone";
import { clockIn, clockOut, correctEntry } from "./actions";
import "./timesheet.css";
import { PageHead } from "@/components/page-head";
import { CardIcon } from "@/components/card-icon";

export const dynamic = "force-dynamic";

const LONG_SHIFT_HOURS = 12;
const ERRORS: Record<string, string> = {
  site: "Pick a site before clocking in.",
  already: "You're already clocked in. Clock out first.",
  failed: "Something went wrong saving that. Please try again.",
};

type Site = { id: string; name: string; timezone: string };
type Entry = {
  id: string;
  user_id: string;
  site_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  note: string | null;
  sites: Site | Site[] | null;
  profiles: { full_name: string | null; email: string | null } | { full_name: string | null; email: string | null }[] | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

function hoursBetween(startIso: string, endIso: string) {
  return (new Date(endIso).getTime() - new Date(startIso).getTime()) / 3_600_000;
}

function monthOptions() {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export default async function TimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; month?: string; site?: string }>;
}) {
  const { error, month, site: siteFilter } = await searchParams;
  const ctx = await requireAppContext();
  const supabase = await createClient();
  const canManage = ctx.role === "admin" || ctx.role === "director";

  const [sitesRes, openRes, mineRes] = await Promise.all([
    supabase
      .from("sites")
      .select("id, name, timezone")
      .eq("org_id", ctx.orgId)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("staff_time_entries")
      .select("id, site_id, clock_in_at, sites(id, name, timezone)")
      .eq("user_id", ctx.userId)
      .is("clock_out_at", null)
      .maybeSingle(),
    supabase
      .from("staff_time_entries")
      .select("id, site_id, clock_in_at, clock_out_at, note, sites(id, name, timezone)")
      .eq("user_id", ctx.userId)
      .order("clock_in_at", { ascending: false })
      .limit(20),
  ]);

  const sites = (sitesRes.data ?? []) as Site[];
  const openEntry = openRes.data
    ? { ...openRes.data, site: one(openRes.data.sites as Site | Site[] | null) }
    : null;
  const mine = (mineRes.data ?? []).map((e) => ({
    ...e,
    site: one(e.sites as Site | Site[] | null),
  }));

  // Admin/director monthly view. Query a UTC window one day wider than the
  // month on each side, then keep entries whose local month (per site zone)
  // matches — so a late-evening shift in the site's zone lands in the right month.
  const selectedMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : localMonth(new Date().toISOString(), "UTC");
  let monthEntries: Entry[] = [];
  if (canManage) {
    const [y, m] = selectedMonth.split("-").map(Number);
    const from = new Date(Date.UTC(y, m - 1, 0)).toISOString();
    const to = new Date(Date.UTC(y, m, 2)).toISOString();
    let q = supabase
      .from("staff_time_entries")
      .select(
        "id, user_id, site_id, clock_in_at, clock_out_at, note, sites(id, name, timezone), profiles(full_name, email)",
      )
      .eq("org_id", ctx.orgId)
      .gte("clock_in_at", from)
      .lte("clock_in_at", to)
      .order("clock_in_at", { ascending: false });
    if (siteFilter) q = q.eq("site_id", siteFilter);
    const { data } = await q;
    monthEntries = ((data ?? []) as Entry[]).filter((e) => {
      const s = one(e.sites);
      return localMonth(e.clock_in_at, s?.timezone ?? "America/New_York") === selectedMonth;
    });
  }

  const totals = new Map<string, { name: string; hours: number; open: number }>();
  for (const e of monthEntries) {
    const p = one(e.profiles);
    const name = p?.full_name || p?.email || "Unknown";
    const row = totals.get(e.user_id) ?? { name, hours: 0, open: 0 };
    if (e.clock_out_at) row.hours += hoursBetween(e.clock_in_at, e.clock_out_at);
    else row.open += 1;
    totals.set(e.user_id, row);
  }
  const totalRows = [...totals.values()].sort((a, b) => a.name.localeCompare(b.name));
  const grandTotal = totalRows.reduce((sum, r) => sum + r.hours, 0);

  const openHours = openEntry ? hoursBetween(openEntry.clock_in_at, new Date().toISOString()) : 0;
  const openSite = openEntry?.site;

  return (
    <main className="dash">
      <PageHead href="/timesheet" title="Timesheet" tone="mint">
        Clock in at your site and out when you leave. Hours roll up into the monthly tally.
      </PageHead>

      {error && ERRORS[error] && (
        <p className="ts-alert" role="alert">
          {ERRORS[error]}
        </p>
      )}

      <section className="card ts-clock">
        <div className="card-head">
          <div className="card-title">
            <span className="spot mint">
              <CardIcon name="clock" />
            </span>
            <h2>{openEntry ? "You're on the clock" : "Clock in"}</h2>
          </div>
        </div>

        {openEntry ? (
          <div className="ts-clock-body">
            <p>
              At <strong>{openSite?.name ?? "your site"}</strong> since{" "}
              {formatLocal(openEntry.clock_in_at, openSite?.timezone ?? "America/New_York")} ·{" "}
              {openHours.toFixed(1)} h so far
            </p>
            {openHours > LONG_SHIFT_HOURS && (
              <p className="ts-warn">
                This shift is over {LONG_SHIFT_HOURS} hours. Check you haven&rsquo;t forgotten to clock out.
              </p>
            )}
            <form action={clockOut}>
              <button className="btn-primary" type="submit">
                Clock out
              </button>
            </form>
          </div>
        ) : sites.length === 0 ? (
          <p className="empty">No active sites yet. Ask an admin to add one in Settings.</p>
        ) : (
          <form action={clockIn} className="ts-clock-body">
            <label>
              Site
              <select name="siteId" required defaultValue={sites[0]?.id}>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn-primary" type="submit">
              Clock in
            </button>
          </form>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <span className="spot amber">
              <CardIcon name="list" />
            </span>
            <h2>My recent shifts</h2>
          </div>
        </div>
        {mine.length === 0 ? (
          <p className="empty">No shifts logged yet.</p>
        ) : (
          <div className="ts-scroll">
            <table className="ts-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Clocked in</th>
                  <th>Clocked out</th>
                  <th className="right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((e) => {
                  const tz = e.site?.timezone ?? "America/New_York";
                  return (
                    <tr key={e.id}>
                      <td>{e.site?.name ?? "—"}</td>
                      <td>{formatLocal(e.clock_in_at, tz)}</td>
                      <td>{e.clock_out_at ? formatLocal(e.clock_out_at, tz) : <em>On the clock</em>}</td>
                      <td className="right">
                        {e.clock_out_at ? hoursBetween(e.clock_in_at, e.clock_out_at).toFixed(2) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canManage && (
        <>
          <section className="card">
            <div className="card-head">
              <div className="card-title">
                <span className="spot teal">
                  <CardIcon name="chart" />
                </span>
                <h2>Monthly tally</h2>
              </div>
              <span className="card-sub">Closed shifts only. Open shifts are counted separately.</span>
            </div>

            <form method="get" className="ts-filters">
              <label>
                Month
                <select name="month" defaultValue={selectedMonth}>
                  {monthOptions().map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Site
                <select name="site" defaultValue={siteFilter ?? ""}>
                  <option value="">All sites</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn-primary" type="submit">
                Show
              </button>
              <a
                className="ts-export"
                href={`/timesheet/export?month=${selectedMonth}${siteFilter ? `&site=${siteFilter}` : ""}`}
              >
                Download CSV
              </a>
            </form>

            {totalRows.length === 0 ? (
              <p className="empty">No shifts recorded for {selectedMonth}.</p>
            ) : (
              <div className="ts-scroll">
                <table className="ts-table">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th className="right">Hours</th>
                      <th className="right">Still open</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totalRows.map((r) => (
                      <tr key={r.name + r.hours}>
                        <td>{r.name}</td>
                        <td className="right">{r.hours.toFixed(2)}</td>
                        <td className="right">{r.open || "—"}</td>
                      </tr>
                    ))}
                    <tr className="ts-total">
                      <td>Total</td>
                      <td className="right">{grandTotal.toFixed(2)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <div className="card-title">
                <span className="spot coral">
                  <CardIcon name="sliders" />
                </span>
                <h2>Shifts in {selectedMonth}</h2>
              </div>
              <span className="card-sub">Expand a row to correct its times. Changes are logged.</span>
            </div>

            {monthEntries.length === 0 ? (
              <p className="empty">No shifts in this month.</p>
            ) : (
              <div className="ts-scroll">
                <table className="ts-table">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Site</th>
                      <th>In</th>
                      <th>Out</th>
                      <th className="right">Hours</th>
                      <th>Note</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {monthEntries.map((e) => {
                      const s = one(e.sites);
                      const p = one(e.profiles);
                      const tz = s?.timezone ?? "America/New_York";
                      return (
                        <tr key={e.id}>
                          <td>{p?.full_name || p?.email || "Unknown"}</td>
                          <td>{s?.name ?? "—"}</td>
                          <td>{formatLocal(e.clock_in_at, tz)}</td>
                          <td>{e.clock_out_at ? formatLocal(e.clock_out_at, tz) : <em>Open</em>}</td>
                          <td className="right">
                            {e.clock_out_at ? hoursBetween(e.clock_in_at, e.clock_out_at).toFixed(2) : "—"}
                          </td>
                          <td>{e.note ?? ""}</td>
                          <td>
                            <details className="ts-correct">
                              <summary>Correct</summary>
                              <form action={correctEntry} className="ts-correct-form">
                                <input type="hidden" name="entryId" value={e.id} />
                                <label>
                                  In
                                  <input
                                    type="datetime-local"
                                    name="clockIn"
                                    required
                                    defaultValue={toLocalInput(e.clock_in_at, tz)}
                                  />
                                </label>
                                <label>
                                  Out
                                  <input
                                    type="datetime-local"
                                    name="clockOut"
                                    defaultValue={e.clock_out_at ? toLocalInput(e.clock_out_at, tz) : ""}
                                  />
                                </label>
                                <label>
                                  Note
                                  <input type="text" name="note" maxLength={500} defaultValue={e.note ?? ""} />
                                </label>
                                <button className="btn-primary" type="submit">
                                  Save
                                </button>
                              </form>
                            </details>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
