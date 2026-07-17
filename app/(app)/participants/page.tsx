import Link from "next/link";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import "./participants.css";

export const dynamic = "force-dynamic";

function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

function band(rate: number | null): { label: string; cls: string } {
  if (rate == null) return { label: "—", cls: "muted" };
  if (rate >= 90) return { label: `${rate}%`, cls: "good" };
  if (rate >= 80) return { label: `${rate}%`, cls: "ok" };
  return { label: `${rate}%`, cls: "warn" };
}

export default async function ParticipantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; grade?: string; program?: string; site?: string }>;
}) {
  const ctx = await requireAppContext();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().toLowerCase();
  const gradeFilter = sp.grade ?? "";
  const programFilter = sp.program ?? "";
  const siteFilter = sp.site ?? "";

  const supabase = await createClient();
  const [partsRes, enrollRes, programsRes, sitesRes, attRes, flagsRes] = await Promise.all([
    supabase
      .from("participants")
      .select("id, first_name, last_name, grade, school, date_of_birth")
      .eq("org_id", ctx.orgId)
      .is("deleted_at", null),
    supabase.from("enrollments").select("participant_id, program_id, status").eq("org_id", ctx.orgId),
    supabase.from("programs").select("id, name, site_id").eq("org_id", ctx.orgId),
    supabase.from("sites").select("id, name").eq("org_id", ctx.orgId).order("name"),
    supabase.from("attendance_records").select("participant_id, status").eq("org_id", ctx.orgId),
    supabase.from("flags").select("participant_id").eq("org_id", ctx.orgId).is("resolved_at", null),
  ]);

  const participants = partsRes.data ?? [];
  const enrollments = enrollRes.data ?? [];
  const programs = programsRes.data ?? [];
  const sites = sitesRes.data ?? [];
  const attendance = attRes.data ?? [];
  const flags = flagsRes.data ?? [];

  const programName = new Map(programs.map((p) => [p.id, p.name]));
  const programSite = new Map(programs.map((p) => [p.id, p.site_id]));

  // per-participant aggregates
  const enrollByPart = new Map<string, string[]>(); // active program names
  const enrolledProgramIds = new Map<string, Set<string>>();
  const enrolledSiteIds = new Map<string, Set<string>>();
  for (const e of enrollments) {
    if (e.status !== "enrolled") continue;
    const arr = enrollByPart.get(e.participant_id) ?? [];
    arr.push(programName.get(e.program_id) ?? "—");
    enrollByPart.set(e.participant_id, arr);
    const set = enrolledProgramIds.get(e.participant_id) ?? new Set();
    set.add(e.program_id);
    enrolledProgramIds.set(e.participant_id, set);
    const siteId = programSite.get(e.program_id);
    if (siteId) {
      const sset = enrolledSiteIds.get(e.participant_id) ?? new Set<string>();
      sset.add(siteId);
      enrolledSiteIds.set(e.participant_id, sset);
    }
  }
  const attByPart = new Map<string, { pres: number; tot: number }>();
  for (const a of attendance) {
    const cur = attByPart.get(a.participant_id) ?? { pres: 0, tot: 0 };
    if (a.status === "present" || a.status === "late") {
      cur.pres++;
      cur.tot++;
    } else if (a.status === "absent") cur.tot++;
    attByPart.set(a.participant_id, cur);
  }
  const flaggedParts = new Set(flags.map((f) => f.participant_id).filter(Boolean));

  const grades = [...new Set(participants.map((p) => p.grade).filter(Boolean))].sort();

  let rows = participants.map((p) => {
    const att = attByPart.get(p.id);
    const rate = att && att.tot > 0 ? Math.round((att.pres / att.tot) * 100) : null;
    return {
      id: p.id,
      name: `${p.first_name} ${p.last_name}`,
      grade: p.grade ?? "—",
      school: p.school ?? "—",
      age: ageFrom(p.date_of_birth),
      programs: enrollByPart.get(p.id) ?? [],
      rate,
      atRisk: flaggedParts.has(p.id),
    };
  });

  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q));
  if (gradeFilter) rows = rows.filter((r) => r.grade === gradeFilter);
  if (programFilter)
    rows = rows.filter((r) => enrolledProgramIds.get(r.id)?.has(programFilter));
  if (siteFilter) rows = rows.filter((r) => enrolledSiteIds.get(r.id)?.has(siteFilter));
  rows.sort((a, b) => a.name.localeCompare(b.name));

  const anyFilter = q || gradeFilter || programFilter || siteFilter;

  return (
    <main className="dash">
      <div className="dash-head">
        <h1>Participants</h1>
        <p>
          {rows.length} of {participants.length} participant
          {participants.length === 1 ? "" : "s"}
          {anyFilter ? " (filtered)" : ""}.
        </p>
      </div>

      <section className="card">
        <form className="roster-filters" method="get">
          <input
            type="search"
            name="q"
            placeholder="Search by name…"
            defaultValue={sp.q ?? ""}
            aria-label="Search participants by name"
          />
          <select name="site" defaultValue={siteFilter} aria-label="Filter by site">
            <option value="">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select name="grade" defaultValue={gradeFilter} aria-label="Filter by grade">
            <option value="">All grades</option>
            {grades.map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
          <select name="program" defaultValue={programFilter} aria-label="Filter by program">
            <option value="">All programs</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="btn-primary" type="submit">
            Apply
          </button>
          {anyFilter && (
            <Link className="roster-clear" href="/participants">
              Clear
            </Link>
          )}
        </form>

        {rows.length === 0 ? (
          <p className="empty">No participants match. Import some in Data Import, or clear filters.</p>
        ) : (
          <div className="roster-scroll">
            <table className="roster-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Grade</th>
                  <th>School</th>
                  <th>Programs</th>
                  <th className="right">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const b = band(r.rate);
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link className="roster-name" href={`/participants/${r.id}`}>
                          {r.name}
                        </Link>
                        {r.atRisk && <span className="risk-chip" title="At risk">at risk</span>}
                      </td>
                      <td>{r.grade}</td>
                      <td className="roster-muted">{r.school}</td>
                      <td>
                        {r.programs.length === 0 ? (
                          <span className="roster-muted">—</span>
                        ) : (
                          <span className="prog-chips">
                            {r.programs.map((p, i) => (
                              <span key={i} className="prog-chip">
                                {p}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td className="right">
                        <span className={`att-band ${b.cls} num`}>{b.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
