import Link from "next/link";
import { requireAppContext } from "@/lib/auth-context";
import { getDashboardData } from "@/lib/dashboard";
import { Sparkline } from "@/components/sparkline";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const ctx = await requireAppContext();
  const d = await getDashboardData(ctx.orgId);
  const maxEnroll = Math.max(1, ...d.enrollByProgram.map((p) => Math.max(p.count, p.capacity ?? 0)));

  const kpiFmt = (v: number | null, suffix = "") =>
    v == null ? "—" : `${Math.round(v * 10) / 10}${suffix}`;

  return (
    <main className="dash">
      <div className="dash-head">
        <h1>Good afternoon, {ctx.fullName.split(" ")[0]}</h1>
        <p>Here&rsquo;s what needs your attention at {ctx.orgName} today.</p>
      </div>

      {/* KPI row */}
      <section className="kpi-row" aria-label="Key metrics">
        <div className="kpi">
          <div className="kpi-val num">{d.kpis.activeEnrollment}</div>
          <div className="kpi-lab">Active enrollment</div>
        </div>
        <div className="kpi">
          <div className="kpi-val num">{kpiFmt(d.kpis.attRate, "%")}</div>
          <div className="kpi-lab">Attendance rate · 4wk</div>
        </div>
        <div className="kpi">
          <div className="kpi-val num">{d.kpis.sessionsThisWeek}</div>
          <div className="kpi-lab">Sessions this week</div>
        </div>
        <div className="kpi">
          <div className="kpi-val num">{d.kpis.activePrograms}</div>
          <div className="kpi-lab">Active programs</div>
        </div>
        <div className={d.kpis.atRisk > 0 ? "kpi warn" : "kpi"}>
          <div className="kpi-val num">{d.kpis.atRisk}</div>
          <div className="kpi-lab">Participants at risk</div>
        </div>
      </section>

      <div className="dash-grid">
        {/* main column */}
        <div className="dash-col">
          <section className="card">
            <div className="card-head">
              <h2>Attendance trend</h2>
              <span className="card-sub">Last 8 weeks</span>
            </div>
            <Sparkline points={d.trend} label="Weekly attendance rate, last 8 weeks" />
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Enrollment by program</h2>
              <span className="card-sub">Enrolled vs. capacity</span>
            </div>
            {d.enrollByProgram.length === 0 ? (
              <p className="empty">No programs yet.</p>
            ) : (
              <ul className="bars">
                {d.enrollByProgram.map((p, i) => {
                  const pct = (p.count / maxEnroll) * 100;
                  const capPct = p.capacity ? (p.capacity / maxEnroll) * 100 : null;
                  const full = p.capacity != null && p.count >= p.capacity;
                  return (
                    <li key={i} className="bar-row">
                      <span className="bar-name">{p.name}</span>
                      <span className="bar-track">
                        <span
                          className={full ? "bar-fill full" : "bar-fill"}
                          style={{ width: `${pct}%` }}
                        />
                        {capPct != null && (
                          <span className="bar-cap" style={{ left: `${capPct}%` }} />
                        )}
                      </span>
                      <span className="bar-val num">
                        {p.count}
                        {p.capacity != null ? `/${p.capacity}` : ""}
                        {full ? " · full" : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* right rail */}
        <div className="dash-rail">
          <section className="card">
            <div className="card-head">
              <h2>Needs attention</h2>
            </div>
            {d.alerts.length === 0 ? (
              <p className="empty good">Nothing needs attention. 🎉</p>
            ) : (
              <ul className="alerts">
                {d.alerts.map((a) => (
                  <li key={a.id} className={`alert ${a.severity}`}>
                    {a.href ? (
                      <Link href={a.href} className="alert-link">
                        <span className="alert-ic" aria-hidden="true">
                          {a.severity === "critical" ? "!" : a.severity === "warning" ? "▲" : "i"}
                        </span>
                        <span className="alert-txt">{a.label}</span>
                      </Link>
                    ) : (
                      <>
                        <span className="alert-ic" aria-hidden="true">
                          {a.severity === "critical" ? "!" : a.severity === "warning" ? "▲" : "i"}
                        </span>
                        <span className="alert-txt">{a.label}</span>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Today&rsquo;s schedule</h2>
            </div>
            {d.today.length === 0 ? (
              <p className="empty">No sessions scheduled today.</p>
            ) : (
              <ul className="sched">
                {d.today.map((s, i) => (
                  <li key={i} className="sched-row">
                    <span className="sched-time num">{s.time}</span>
                    <span className="sched-prog">{s.program}</span>
                    <span className="sched-room">{s.room}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Recent imports</h2>
            </div>
            {d.imports.length === 0 ? (
              <p className="empty">No imports yet.</p>
            ) : (
              <ul className="imports">
                {d.imports.map((im) => (
                  <li key={im.id} className="import-row">
                    <span className="import-check" aria-hidden="true">
                      ✓
                    </span>
                    <span className="import-name">{im.name}</span>
                    <span className="import-rows num">{im.rows} rows</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
