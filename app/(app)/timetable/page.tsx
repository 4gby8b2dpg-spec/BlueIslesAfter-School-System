import Link from "next/link";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { NewScheduleForm } from "@/components/new-schedule-form";
import "./timetable.css";

export const dynamic = "force-dynamic";

// Same categorical palette as the calendar (distinct from brand + status).
const CAT_COLOR: Record<string, string> = {
  tutoring: "#2563EB",
  STEM: "#7C3AED",
  sports: "#DB2777",
  arts: "#C2410C",
  enrichment: "#0891B2",
};
const catColor = (c: string | null) => (c && CAT_COLOR[c]) || "#64748B";

const DAYS = [
  { wd: 1, label: "Monday" },
  { wd: 2, label: "Tuesday" },
  { wd: 3, label: "Wednesday" },
  { wd: 4, label: "Thursday" },
  { wd: 5, label: "Friday" },
];
const DAY = 86_400_000;

type Block = {
  programId: string;
  name: string;
  category: string | null;
  wd: number;
  minutes: number;
  time: string;
  room: string | null;
};

export default async function TimetablePage() {
  const ctx = await requireAppContext();
  const supabase = await createClient();

  const now = new Date();
  const from = new Date(now.getTime() - 7 * DAY).toISOString();
  const to = new Date(now.getTime() + 56 * DAY).toISOString();

  const [sitesRes, programsRes, sessionsRes] = await Promise.all([
    supabase.from("sites").select("id, name").eq("org_id", ctx.orgId).order("name"),
    supabase.from("programs").select("id, name, category, site_id").eq("org_id", ctx.orgId),
    supabase
      .from("sessions")
      .select("program_id, starts_at, room")
      .eq("org_id", ctx.orgId)
      .gte("starts_at", from)
      .lte("starts_at", to),
  ]);

  const sites = sitesRes.data ?? [];
  const programs = programsRes.data ?? [];
  const sessions = sessionsRes.data ?? [];
  const programById = new Map(programs.map((p) => [p.id, p]));

  // Derive the distinct weekly pattern: unique (program, weekday, time, room).
  const seen = new Set<string>();
  const blocksBySite = new Map<string, Block[]>(); // siteId | "none"
  for (const s of sessions) {
    const d = new Date(s.starts_at);
    const wd = d.getDay();
    if (wd < 1 || wd > 5) continue;
    const prog = programById.get(s.program_id);
    if (!prog) continue;
    const minutes = d.getHours() * 60 + d.getMinutes();
    const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const key = `${s.program_id}|${wd}|${minutes}|${s.room ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const siteKey = prog.site_id ?? "none";
    const arr = blocksBySite.get(siteKey) ?? [];
    arr.push({ programId: prog.id, name: prog.name, category: prog.category, wd, minutes, time, room: s.room });
    blocksBySite.set(siteKey, arr);
  }

  const siteList = [
    ...sites.map((s) => ({ id: s.id, name: s.name })),
    ...(blocksBySite.has("none") ? [{ id: "none", name: "Unassigned site" }] : []),
  ];

  const canEdit = ["admin", "director", "staff"].includes(ctx.role);

  return (
    <main className="dash">
      <div className="dash-head">
        <h1>Weekly Timetable</h1>
        <p>Recurring program schedule, Monday to Friday, by site.</p>
      </div>

      {canEdit && (
        <NewScheduleForm
          programs={programs.map((p) => ({ id: p.id, name: p.name, siteId: p.site_id }))}
          sites={sites.map((s) => ({ id: s.id, name: s.name }))}
        />
      )}

      {siteList.length === 0 ? (
        <section className="card">
          <p className="empty">No sites yet. Add a site in Settings, then schedule programs here.</p>
        </section>
      ) : (
        siteList.map((site) => {
          const blocks = (blocksBySite.get(site.id) ?? []).slice().sort((a, b) => a.minutes - b.minutes);
          return (
            <section key={site.id} className="tt-site card">
              <div className="tt-site-head">
                <h2>{site.name}</h2>
                <span className="card-sub">
                  {blocks.length} recurring block{blocks.length === 1 ? "" : "s"}
                </span>
              </div>
              {blocks.length === 0 ? (
                <p className="empty">Nothing scheduled at this site yet.</p>
              ) : (
                <div className="tt-grid">
                  {DAYS.map((d) => {
                    const dayBlocks = blocks.filter((b) => b.wd === d.wd);
                    return (
                      <div key={d.wd} className="tt-col">
                        <div className="tt-daylabel">{d.label}</div>
                        {dayBlocks.length === 0 ? (
                          <div className="tt-empty">—</div>
                        ) : (
                          dayBlocks.map((b, i) => (
                            <Link
                              key={i}
                              href={`/calendar?program=${b.programId}`}
                              className="tt-block"
                              style={{ borderLeftColor: catColor(b.category) }}
                              title={`${b.name} · ${b.time}${b.room ? " · " + b.room : ""} — view on calendar`}
                            >
                              <span className="tt-block-time num">{b.time}</span>
                              <span className="tt-block-name">{b.name}</span>
                              {b.room && <span className="tt-block-room">{b.room}</span>}
                            </Link>
                          ))
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })
      )}
    </main>
  );
}
