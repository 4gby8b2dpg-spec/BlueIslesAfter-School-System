import Link from "next/link";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { NewProgramForm } from "@/components/new-program-form";
import "./programs.css";

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  const ctx = await requireAppContext();
  const supabase = await createClient();

  const [programsRes, enrollRes, sitesRes] = await Promise.all([
    supabase
      .from("programs")
      .select("id, name, category, capacity, status, site_id, sites(name)")
      .eq("org_id", ctx.orgId)
      .order("name"),
    supabase.from("enrollments").select("program_id, status").eq("org_id", ctx.orgId),
    supabase.from("sites").select("id, name").eq("org_id", ctx.orgId),
  ]);

  const programs = (programsRes.data ?? []) as unknown as {
    id: string;
    name: string;
    category: string | null;
    capacity: number | null;
    status: string;
    site_id: string | null;
    sites: { name: string } | null;
  }[];
  const enrollments = enrollRes.data ?? [];
  const sites = sitesRes.data ?? [];

  const enrolledCount = new Map<string, number>();
  for (const e of enrollments) {
    if (e.status !== "enrolled") continue;
    enrolledCount.set(e.program_id, (enrolledCount.get(e.program_id) ?? 0) + 1);
  }

  const canCreate = ctx.role === "admin" || ctx.role === "director";

  return (
    <main className="dash">
      <div className="dash-head">
        <h1>Programs</h1>
        <p>
          {programs.length} program{programs.length === 1 ? "" : "s"} across{" "}
          {sites.length} site{sites.length === 1 ? "" : "s"}.
        </p>
      </div>

      {canCreate && (
        <div className="new-program">
          <NewProgramForm sites={sites} />
        </div>
      )}

      <div className="prog-grid">
        {programs.map((p) => {
          const enrolled = enrolledCount.get(p.id) ?? 0;
          const cap = p.capacity ?? 0;
          const pct = cap > 0 ? Math.min(100, Math.round((enrolled / cap) * 100)) : 0;
          const full = cap > 0 && enrolled >= cap;
          return (
            <Link key={p.id} href={`/programs/${p.id}`} className="prog-card">
              <div className="prog-card-top">
                <span className="prog-title">{p.name}</span>
                <span className={`prog-status ${p.status}`}>{p.status}</span>
              </div>
              <div className="prog-tags">
                {p.category && <span className="prog-cat">{p.category}</span>}
                {p.sites?.name && <span className="prog-site">{p.sites.name}</span>}
              </div>
              <div className="prog-gauge">
                <div className="prog-gauge-track">
                  <div
                    className={full ? "prog-gauge-fill full" : "prog-gauge-fill"}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="prog-gauge-label num">
                  {enrolled}
                  {cap > 0 ? `/${cap}` : ""} enrolled{full ? " · full" : ""}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
