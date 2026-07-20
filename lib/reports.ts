import { createClient } from "@/lib/supabase/server";

// Report builders, shared by the Reports screen and (later) the scheduled
// mailer, so a report emailed on a cron is byte-for-byte what the screen shows.
// Takes a client rather than making one, so the caller decides whether it runs
// under RLS (a signed-in user) or the service role (an unattended cron job).

type DB = Awaited<ReturnType<typeof createClient>>;

export const REPORT_TEMPLATES = [
  {
    key: "program",
    title: "Monthly Program Report",
    blurb: "Per program: enrollment, sessions held, attendance, participants served.",
  },
  {
    key: "attendance",
    title: "Attendance Summary",
    blurb: "Per participant: present, late, absent, and attendance rate over the range.",
  },
  {
    key: "funder",
    title: "Funder / Grant Report",
    blurb: "Aggregated by funding source: programs, unduplicated participants, attendance.",
  },
] as const;

export type TemplateKey = (typeof REPORT_TEMPLATES)[number]["key"];

export function isTemplateKey(v: unknown): v is TemplateKey {
  return typeof v === "string" && REPORT_TEMPLATES.some((t) => t.key === v);
}

export type Report = {
  title: string;
  columns: string[];
  rows: (string | number)[][];
};

const attended = (s: string) => s === "present" || s === "late";

export async function buildReport(
  supabase: DB,
  orgId: string,
  template: TemplateKey,
  from: string,
  to: string,
): Promise<Report> {
  const fromTs = new Date(`${from}T00:00:00`).toISOString();
  const toTs = new Date(`${to}T23:59:59`).toISOString();

  const [programsRes, enrollRes, sessionsRes, participantsRes] = await Promise.all([
    supabase.from("programs").select("id, name, category, funding_source").eq("org_id", orgId),
    supabase.from("enrollments").select("program_id, participant_id, status").eq("org_id", orgId),
    supabase
      .from("sessions")
      .select("id, program_id, status")
      .eq("org_id", orgId)
      .gte("starts_at", fromTs)
      .lte("starts_at", toTs),
    supabase
      .from("participants")
      .select("id, first_name, last_name, grade")
      .eq("org_id", orgId)
      .is("deleted_at", null),
  ]);

  const programs = programsRes.data ?? [];
  const enrollments = enrollRes.data ?? [];
  const sessions = sessionsRes.data ?? [];
  const participants = participantsRes.data ?? [];

  // attendance within the session window
  const sessionIds = sessions.map((s) => s.id);
  const sessionProgram = new Map(sessions.map((s) => [s.id, s.program_id]));
  let attendance: { session_id: string; participant_id: string; status: string }[] = [];
  if (sessionIds.length) {
    const { data } = await supabase
      .from("attendance_records")
      .select("session_id, participant_id, status")
      .eq("org_id", orgId)
      .in("session_id", sessionIds);
    attendance = data ?? [];
  }

  if (template === "program" || template === "funder") {
    type Agg = {
      name: string;
      category: string;
      funder: string;
      enrolled: number;
      sessionsHeld: number;
      present: number;
      total: number;
      served: Set<string>;
    };
    const byProgram = new Map<string, Agg>();
    for (const p of programs) {
      byProgram.set(p.id, {
        name: p.name,
        category: p.category ?? "—",
        funder: p.funding_source ?? "Unfunded",
        enrolled: 0,
        sessionsHeld: 0,
        present: 0,
        total: 0,
        served: new Set(),
      });
    }
    for (const e of enrollments) {
      if (e.status !== "enrolled") continue;
      const a = byProgram.get(e.program_id);
      if (a) a.enrolled++;
    }
    for (const s of sessions) {
      if (s.status !== "completed") continue;
      const a = byProgram.get(s.program_id);
      if (a) a.sessionsHeld++;
    }
    for (const r of attendance) {
      const pid = sessionProgram.get(r.session_id);
      if (!pid) continue;
      const a = byProgram.get(pid);
      if (!a) continue;
      if (attended(r.status)) {
        a.present++;
        a.total++;
        a.served.add(r.participant_id);
      } else if (r.status === "absent") a.total++;
    }

    if (template === "program") {
      return {
        title: "Monthly Program Report",
        columns: [
          "Program",
          "Category",
          "Funder",
          "Enrolled",
          "Sessions held",
          "Avg daily att.",
          "Attendance rate",
          "Served",
        ],
        rows: [...byProgram.values()]
          .sort((x, y) => x.name.localeCompare(y.name))
          .map((a) => [
            a.name,
            a.category,
            a.funder,
            a.enrolled,
            a.sessionsHeld,
            a.sessionsHeld > 0 ? Math.round((a.present / a.sessionsHeld) * 10) / 10 : 0,
            a.total > 0 ? `${Math.round((a.present / a.total) * 100)}%` : "—",
            a.served.size,
          ]),
      };
    }

    const byFunder = new Map<
      string,
      {
        programs: number;
        enrolled: number;
        sessionsHeld: number;
        present: number;
        total: number;
        served: Set<string>;
      }
    >();
    for (const a of byProgram.values()) {
      const f = byFunder.get(a.funder) ?? {
        programs: 0,
        enrolled: 0,
        sessionsHeld: 0,
        present: 0,
        total: 0,
        served: new Set<string>(),
      };
      f.programs++;
      f.enrolled += a.enrolled;
      f.sessionsHeld += a.sessionsHeld;
      f.present += a.present;
      f.total += a.total;
      a.served.forEach((x) => f.served.add(x));
      byFunder.set(a.funder, f);
    }
    return {
      title: "Funder / Grant Report",
      columns: [
        "Funding source",
        "Programs",
        "Enrolled",
        "Sessions held",
        "Attendance rate",
        "Unduplicated served",
      ],
      rows: [...byFunder.entries()]
        .sort((x, y) => x[0].localeCompare(y[0]))
        .map(([funder, f]) => [
          funder,
          f.programs,
          f.enrolled,
          f.sessionsHeld,
          f.total > 0 ? `${Math.round((f.present / f.total) * 100)}%` : "—",
          f.served.size,
        ]),
    };
  }

  // attendance summary per participant
  const name = new Map(participants.map((p) => [p.id, `${p.first_name} ${p.last_name}`]));
  const grade = new Map(participants.map((p) => [p.id, p.grade ?? "—"]));
  const byPart = new Map<string, { present: number; late: number; absent: number }>();
  for (const r of attendance) {
    const cur = byPart.get(r.participant_id) ?? { present: 0, late: 0, absent: 0 };
    if (r.status === "present") cur.present++;
    else if (r.status === "late") cur.late++;
    else if (r.status === "absent") cur.absent++;
    byPart.set(r.participant_id, cur);
  }
  return {
    title: "Attendance Summary",
    columns: ["Participant", "Grade", "Present", "Late", "Absent", "Attendance rate"],
    rows: [...byPart.entries()]
      .map(([pid, c]) => {
        const denom = c.present + c.late + c.absent;
        const rate = denom > 0 ? Math.round(((c.present + c.late) / denom) * 100) : 0;
        return {
          name: name.get(pid) ?? "—",
          row: [
            name.get(pid) ?? "—",
            grade.get(pid) ?? "—",
            c.present,
            c.late,
            c.absent,
            `${rate}%`,
          ] as (string | number)[],
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((x) => x.row),
  };
}
