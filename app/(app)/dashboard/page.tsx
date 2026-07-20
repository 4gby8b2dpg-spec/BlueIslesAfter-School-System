import Link from "next/link";
import { requireAppContext } from "@/lib/auth-context";
import { getDashboardData } from "@/lib/dashboard";
import { Sparkline } from "@/components/sparkline";

export const dynamic = "force-dynamic";

// Small inline icon helpers — keep the KPI/section markup readable.
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
function SpotIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export default async function DashboardPage() {
  const ctx = await requireAppContext();
  const d = await getDashboardData(ctx.orgId);
  const maxEnroll = Math.max(1, ...d.enrollByProgram.map((p) => Math.max(p.count, p.capacity ?? 0)));

  const kpiFmt = (v: number | null, suffix = "") =>
    v == null ? "—" : `${Math.round(v * 10) / 10}${suffix}`;

  // Week-over-week attendance change, from the same buckets that feed the chart.
  const points = d.trend.filter((t): t is number => t != null);
  const attDelta =
    points.length >= 2 ? points[points.length - 1] - points[points.length - 2] : null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const nudge =
    d.kpis.atRisk > 0
      ? `Attendance is running at ${kpiFmt(d.kpis.attRate, "%")} over the last four weeks. ${d.kpis.atRisk} participant${d.kpis.atRisk === 1 ? " has" : "s have"} slipped into the at-risk range — worth a look before pickup.`
      : `Attendance is running at ${kpiFmt(d.kpis.attRate, "%")} over the last four weeks, and nothing needs your attention right now.`;

  return (
    <main className="dash">
      {/* welcome */}
      <section className="dash-welcome">
        <span className="dash-blob a" aria-hidden="true" />
        <span className="dash-blob b" aria-hidden="true" />
        <div>
          <h1>
            {greeting}, {ctx.fullName.split(" ")[0]}
          </h1>
          <p>{nudge}</p>
        </div>
        {d.kpis.atRisk > 0 && (
          <Link className="dash-welcome-cta" href="/participants">
            Review at-risk
            <Icon>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </Icon>
          </Link>
        )}
      </section>

      {/* KPI row */}
      <section className="kpi-row" aria-label="Key metrics">
        <div className="kpi hero">
          <div className="kpi-top">
            <span className="kpi-ic">
              <Icon>
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              </Icon>
            </span>
          </div>
          <div className="kpi-val num">{d.kpis.activeEnrollment}</div>
          <div className="kpi-lab">Active enrollment</div>
        </div>

        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-ic teal">
              <Icon>
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </Icon>
            </span>
            {attDelta != null && (
              <span className={attDelta >= 0 ? "kpi-chip up" : "kpi-chip down"}>
                {attDelta >= 0 ? "▲" : "▼"} {Math.abs(Math.round(attDelta * 10) / 10)} pts
              </span>
            )}
          </div>
          <div className="kpi-val num">
            {d.kpis.attRate == null ? "—" : Math.round(d.kpis.attRate * 10) / 10}
            {d.kpis.attRate != null && <small>%</small>}
          </div>
          <div className="kpi-lab">Attendance rate · 4wk</div>
        </div>

        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-ic violet">
              <Icon>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 4v4" />
              </Icon>
            </span>
            <span className="kpi-chip flat">This week</span>
          </div>
          <div className="kpi-val num">{d.kpis.sessionsThisWeek}</div>
          <div className="kpi-lab">Sessions scheduled</div>
        </div>

        <div className="kpi">
          <div className="kpi-top">
            <span className="kpi-ic coral">
              <Icon>
                <rect x="3" y="3" width="7" height="9" rx="1.5" />
                <rect x="14" y="3" width="7" height="5" rx="1.5" />
                <rect x="14" y="12" width="7" height="9" rx="1.5" />
                <rect x="3" y="16" width="7" height="5" rx="1.5" />
              </Icon>
            </span>
          </div>
          <div className="kpi-val num">{d.kpis.activePrograms}</div>
          <div className="kpi-lab">Active programs</div>
        </div>

        <div className={d.kpis.atRisk > 0 ? "kpi warn" : "kpi"}>
          <div className="kpi-top">
            <span className="kpi-ic amber">
              <Icon>
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                <path d="M12 9v4M12 17h.01" />
              </Icon>
            </span>
          </div>
          <div className="kpi-val num">{d.kpis.atRisk}</div>
          <div className="kpi-lab">Participants at risk</div>
        </div>
      </section>

      <div className="dash-grid">
        {/* main column */}
        <div className="dash-col">
          <section className="card">
            <div className="card-head">
              <div className="card-title">
                <span className="spot teal">
                  <SpotIcon>
                    <path d="M3 3v18h18" />
                    <path d="m7 14 4-4 3 3 5-6" />
                  </SpotIcon>
                </span>
                <h2>Attendance trend</h2>
              </div>
              <span className="card-sub">Last 8 weeks</span>
            </div>
            <Sparkline
              points={d.trend}
              label="Weekly attendance rate, last 8 weeks"
              grid
              unit="%"
              area
            />
          </section>

          <section className="card">
            <div className="card-head">
              <div className="card-title">
                <span className="spot violet">
                  <SpotIcon>
                    <path d="M3 3v18h18" />
                    <rect x="7" y="10" width="3" height="7" rx="1" />
                    <rect x="12" y="6" width="3" height="11" rx="1" />
                    <rect x="17" y="13" width="3" height="4" rx="1" />
                  </SpotIcon>
                </span>
                <h2>Enrollment by program</h2>
              </div>
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
                  const cat = (i % 5) + 1;
                  return (
                    <li key={i} className="bar-row">
                      <span className="bar-name">
                        <span
                          className="bar-dot"
                          style={{ background: `var(--cat-${cat})` }}
                          aria-hidden="true"
                        />
                        {p.name}
                      </span>
                      <span className="bar-track">
                        <span
                          className={full ? "bar-fill full" : `bar-fill c${cat}`}
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
              <div className="card-title">
                <span className="spot coral">
                  <SpotIcon>
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
                  </SpotIcon>
                </span>
                <h2>Needs attention</h2>
              </div>
              {d.alerts.length > 0 && <span className="card-sub">{d.alerts.length} open</span>}
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
              <div className="card-title">
                <span className="spot amber">
                  <SpotIcon>
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </SpotIcon>
                </span>
                <h2>Today&rsquo;s schedule</h2>
              </div>
              <Link className="card-sub" href="/calendar">
                Calendar
              </Link>
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
              <div className="card-title">
                <span className="spot mint">
                  <SpotIcon>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <path d="M7 10l5 5 5-5M12 15V3" />
                  </SpotIcon>
                </span>
                <h2>Recent imports</h2>
              </div>
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
