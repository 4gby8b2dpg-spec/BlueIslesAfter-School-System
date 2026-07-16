"use client";

// Marketing landing — ported from landing-mockup.html (design already approved).
// Self-contained styling lives in ./marketing.css; fonts/images under /public.
import { useEffect } from "react";
import "./marketing.css";

export default function MarketingHome() {
  useEffect(() => {
    const root = document.documentElement;
    try {
      const stored = localStorage.getItem("bi-theme");
      if (stored) root.setAttribute("data-theme", stored);
    } catch {}

    const btn = document.getElementById("themeToggle");
    const onClick = () => {
      const isDark = getComputedStyle(root)
        .getPropertyValue("color-scheme").trim().indexOf("dark") > -1;
      const next = isDark ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("bi-theme", next); } catch {}
    };
    btn?.addEventListener("click", onClick);

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const els = Array.from(document.querySelectorAll(".reveal"));
    let io: IntersectionObserver | undefined;
    if (reduce || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
    } else {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              io!.unobserve(e.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
      );
      els.forEach((el) => io!.observe(el));
    }

    return () => {
      btn?.removeEventListener("click", onClick);
      io?.disconnect();
    };
  }, []);

  return (
    <>
      <header className="nav">
        <div className="wrap nav-in">
          <a className="brand" href="#top" aria-label="BlueIsles home">
            <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
              <path d="M16 3c-1.4 3.6-4 6-7.6 7.4C12 11.8 14.6 14.4 16 18c1.4-3.6 4-6.2 7.6-7.6C20 9 17.4 6.6 16 3Z" fill="var(--teal)"/>
              <path d="M6 20c3 .8 5.2 2.6 6.6 5.4C14 22.6 16.2 20.8 19.2 20c-3-.8-5.2-2.6-6.6-5.4C11.2 17.4 9 19.2 6 20Z" fill="var(--teal-deep)" opacity=".85"/>
              <circle cx="24" cy="22" r="3" fill="var(--marigold)"/>
            </svg>
            BlueIsles <span className="tag">Working name</span>
          </a>
          <nav className="nav-links" aria-label="Primary">
            <a href="#problem">The problem</a>
            <a href="#how">How it works</a>
            <a href="#modules">What's inside</a>
            <a href="#privacy">Privacy</a>
          </nav>
          <div className="nav-cta">
            <button className="theme-btn" id="themeToggle" aria-label="Toggle light or dark theme" title="Toggle theme">
              <svg id="themeIcon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>
            </button>
            <a className="btn btn-ghost" href="#how">See how</a>
            <a className="btn btn-primary" href="#cta">Request early access</a>
          </div>
        </div>
      </header>
      
      <main id="top">
      
        
        <section className="hero" style={{ padding: "0" }}>
          <div className="wrap hero-in">
            <div className="hero-copy">
              <span className="eyebrow">After-school program intelligence</span>
              <h1>Drop your spreadsheets in.<br /><em>Get answers out.</em></h1>
              <p className="lede">Attendance in one file, enrollment in another, surveys in a third. BlueIsles pulls the data you already have into one workspace — then hands you the funder report your board asks for.</p>
              <div className="hero-cta">
                <a className="btn btn-primary" href="#cta">Request early access</a>
                <a className="btn btn-onDark" href="#how">Watch the 3-step loop</a>
              </div>
              <div className="hero-trust">
                <span>Built for directors &amp; funders</span><span className="dot"></span>
                <span>FERPA-aware by design</span><span className="dot"></span>
                <span>Import in minutes</span>
              </div>
            </div>
      
            <div className="hero-visual reveal">
              <div className="photo-frame">
                <img src="/img/hero-classroom.jpg"
                     alt="Students gathered around a table in an after-school session, engaged with an instructor" loading="eager" width="1400" height="871" />
              </div>
              
              <aside className="peek" aria-label="Preview of the BlueIsles dashboard">
                <div className="peek-head">
                  <span className="lbl">Program dashboard</span>
                  <span className="peek-live">Live</span>
                </div>
                <div className="kpi-row">
                  <div className="kpi up">
                    <div className="k-val num">87.4%</div>
                    <div className="k-lab">Attendance · 4wk</div>
                    <div className="k-delta num">▲ 1.2</div>
                  </div>
                  <div className="kpi risk">
                    <div className="k-val num">14</div>
                    <div className="k-lab">Students at risk</div>
                    <div className="k-delta">⚠ follow up</div>
                  </div>
                </div>
                <svg className="peek-spark" viewBox="0 0 240 40" preserveAspectRatio="none" aria-hidden="true">
                  <polyline points="0,30 30,28 60,31 90,22 120,24 150,16 180,18 210,11 240,9"
                    fill="none" stroke="var(--teal)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="240" cy="9" r="3.4" fill="var(--marigold)"/>
                </svg>
                <div className="peek-alert">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
                  3 sessions missing attendance
                </div>
              </aside>
            </div>
          </div>
        </section>
      
        
        <section className="stats" style={{ padding: "0" }}>
          <div className="wrap stats-in">
            <div className="stat"><div className="s-val num">&lt;15 min</div><div className="s-lab">to produce a funder report — down from days</div></div>
            <div className="stat"><div className="s-val num">90%</div><div className="s-lab">of sessions get attendance within 24 hours</div></div>
            <div className="stat"><div className="s-val num">95%</div><div className="s-lab">of imported rows commit without rework</div></div>
            <div className="stat"><div className="s-val num">1</div><div className="s-lab">workspace instead of a dozen scattered files</div></div>
          </div>
        </section>
      
        
        <section id="problem">
          <div className="wrap">
            <div className="sec-head reveal">
              <span className="eyebrow">Why it exists</span>
              <h2>After-school programs run on scattered spreadsheets. Nobody trusts the totals.</h2>
              <p>Six problems show up in every program office. BlueIsles was built around fixing each one.</p>
            </div>
            <div className="pf-grid">
              <article className="pf reveal">
                <div className="pain"><b>Data lives in a dozen inconsistent Excel files</b></div>
                <div className="arrow"></div>
                <div className="fix">An import wizard maps your columns, validates every row, and catches duplicates before anything is saved.</div>
              </article>
              <article className="pf reveal">
                <div className="pain"><b>Attendance is on paper — entered late, or never</b></div>
                <div className="arrow"></div>
                <div className="fix">Roster check-in and a tablet kiosk that keep working when the gym Wi-Fi drops, then sync.</div>
              </article>
              <article className="pf reveal">
                <div className="pain"><b>Planning happens on a whiteboard; conflicts surface too late</b></div>
                <div className="arrow"></div>
                <div className="fix">A live calendar flags a double-booked room, staff, or student the moment you schedule it.</div>
              </article>
              <article className="pf reveal">
                <div className="pain"><b>Feedback is collected sporadically, connected to nothing</b></div>
                <div className="arrow"></div>
                <div className="fix">Built-in surveys tie every response back to a program, a term, and its attendance.</div>
              </article>
              <article className="pf reveal">
                <div className="pain"><b>Funder and board reports take days to assemble by hand</b></div>
                <div className="arrow"></div>
                <div className="fix">Report templates render to polished PDF and Excel, with every metric defined in the footer.</div>
              </article>
              <article className="pf reveal">
                <div className="pain"><b>No early warning when a student disengages</b></div>
                <div className="arrow"></div>
                <div className="fix">Risk flags for chronic absence, ratio breaches, and falling ratings surface on the dashboard.</div>
              </article>
            </div>
          </div>
        </section>
      
        
        <section id="how" className="modules">
          <div className="wrap">
            <div className="sec-head reveal">
              <span className="eyebrow">The core loop</span>
              <h2>Import what you have. Track what happens. Report what matters.</h2>
              <p>Three steps, on repeat, all term. No migration project, no data-entry marathon.</p>
            </div>
            <div className="steps">
              <div className="step reveal">
                <h3>Import</h3>
                <p>Drag in an Excel or CSV export. BlueIsles auto-suggests the column mapping, flags bad dates and missing fields, and remembers the mapping so next month is one click.</p>
              </div>
              <div className="step reveal">
                <h3>Track</h3>
                <p>Take attendance from a roster or a door kiosk, plan sessions on a conflict-aware calendar, and collect survey feedback — all captured against the same records.</p>
              </div>
              <div className="step reveal">
                <h3>Report</h3>
                <p>Open a dashboard that tells you what needs attention today, then export the monthly, attendance, or grant report your partners keep asking for.</p>
              </div>
            </div>
          </div>
        </section>
      
        
        <section>
          <div className="wrap split">
            <div className="split-copy reveal">
              <span className="eyebrow">See every child, not just the totals</span>
              <h2>The numbers stay attached to the kids behind them.</h2>
              <p>Every attendance mark, enrollment, and survey answer rolls up to a dashboard — and rolls back down to a single student's profile when a director needs to follow up.</p>
              <ul>
                <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span>Attendance sparkline, flags, and enrollment history on one profile.</span></li>
                <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span>Chronic-absence follow-up before a student quietly drops off.</span></li>
                <li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg><span>Guardian contacts and authorized-pickup, right where staff need them.</span></li>
              </ul>
            </div>
            <div className="s-img reveal">
              <img src="/img/cand-mentor.jpg" alt="An instructor sitting beside a young student, helping them work through an activity" loading="lazy" width="1200" height="800" />
            </div>
          </div>
        </section>
      
        
        <section id="modules" className="modules">
          <div className="wrap">
            <div className="sec-head reveal">
              <span className="eyebrow">What's inside</span>
              <h2>Nine modules, one workspace.</h2>
              <p>The MVP ships the front-to-back loop; the rest turns records into intelligence.</p>
            </div>
            <div className="mod-grid">
              <article className="mod reveal">
                <div className="m-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg></div>
                <h3>Data Import Center</h3>
                <p>Upload, map, validate, de-duplicate. Saved templates make the next import one click.</p>
                <span className="m-tag mvp">In the MVP</span>
              </article>
              <article className="mod reveal">
                <div className="m-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 6.5a3 3 0 0 1 0 5.5M18 20c0-2.4-1-4.4-2.5-5.6"/></svg></div>
                <h3>Participants &amp; Enrollment</h3>
                <p>Profiles, guardians, consent flags, and searchable rosters with bulk actions.</p>
                <span className="m-tag mvp">In the MVP</span>
              </article>
              <article className="mod reveal">
                <div className="m-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/></svg></div>
                <h3>Programs &amp; Planning</h3>
                <p>Programs → activities → recurring sessions, with conflict detection at save time.</p>
                <span className="m-tag mvp">In the MVP</span>
              </article>
              <article className="mod reveal">
                <div className="m-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>
                <h3>Attendance</h3>
                <p>Roster check-in, bulk entry, offline-tolerant kiosk, and missing-attendance alerts.</p>
                <span className="m-tag mvp">In the MVP</span>
              </article>
              <article className="mod reveal">
                <div className="m-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M7 13h4v4H7z"/></svg></div>
                <h3>Calendar &amp; Scheduling</h3>
                <p>Month, week, and day views; drag-to-reschedule; closures that suppress false alerts.</p>
                <span className="m-tag mvp">In the MVP</span>
              </article>
              <article className="mod reveal">
                <div className="m-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 13l2 2 4-4"/></svg></div>
                <h3>Surveys &amp; Feedback</h3>
                <p>Build surveys, target audiences, and read per-question results with pre/post pairing.</p>
                <span className="m-tag">Phase 2</span>
              </article>
              <article className="mod reveal">
                <div className="m-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg></div>
                <h3>Analytics &amp; Dashboards</h3>
                <p>KPIs, attendance trends, enrollment vs. capacity, and a metric explorer.</p>
                <span className="m-tag mvp">Dashboard in MVP</span>
              </article>
              <article className="mod reveal">
                <div className="m-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 15h6M9 18h4"/></svg></div>
                <h3>Reports</h3>
                <p>Monthly, attendance, and grant templates as PDF + Excel, with defensible definitions.</p>
                <span className="m-tag mvp">In the MVP</span>
              </article>
              <article className="mod reveal">
                <div className="m-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 2 4 6v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6z"/><path d="M9 12l2 2 4-4"/></svg></div>
                <h3>Administration</h3>
                <p>Roles and site scope, org settings, and an append-only audit log of every change.</p>
                <span className="m-tag mvp">In the MVP</span>
              </article>
            </div>
          </div>
        </section>
      
        
        <section id="privacy" className="privacy">
          <div className="wrap">
            <div className="sec-head reveal">
              <span className="eyebrow">Because this is minors' data</span>
              <h2>Built to be trusted with student records.</h2>
              <p>Privacy isn't a settings page bolted on at the end — it's in the schema, the roles, and the logs.</p>
            </div>
            <div className="priv-grid">
              <div className="priv reveal">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
                <h3>Role-based access</h3>
                <p>Permissions enforced server-side, not just hidden in the UI. Viewers see aggregates only.</p>
              </div>
              <div className="priv reveal">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 2 4 6v6c0 5 3.4 8.4 8 10 4.6-1.6 8-5 8-10V6z"/></svg>
                <h3>Encrypted &amp; FERPA-aware</h3>
                <p>Encrypted in transit and at rest; medical notes and PII handled with consent flags.</p>
              </div>
              <div className="priv reveal">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></svg>
                <h3>Full audit log</h3>
                <p>Every create, update, delete, and export recorded with actor, time, and before/after.</p>
              </div>
              <div className="priv reveal">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.6M21 5l-9 9-3-3"/></svg>
                <h3>WCAG 2.1 AA</h3>
                <p>Keyboard-operable check-in, visible focus, and color never the only signal.</p>
              </div>
            </div>
          </div>
        </section>
      
        
        <section id="cta" className="cta-band">
          <div className="wrap">
            <div className="cta-card reveal">
              <span className="eyebrow">Early access</span>
              <h2>Get your spreadsheets working for you.</h2>
              <p>BlueIsles is in active build. Join the early-access list to shape the MVP and be first in when it opens for your program.</p>
              <div className="hero-cta">
                <a className="btn btn-primary" href="#cta">Request early access</a>
                <a className="btn btn-ghost" href="#how">See the 3-step loop</a>
              </div>
              <p className="cta-note">No spam. We'll only email about early access and launch.</p>
            </div>
          </div>
        </section>
      
      </main>
      
      
      <footer>
        <div className="wrap">
          <div className="foot-in">
            <a className="brand" href="#top" aria-label="BlueIsles home">
              <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden="true">
                <path d="M16 3c-1.4 3.6-4 6-7.6 7.4C12 11.8 14.6 14.4 16 18c1.4-3.6 4-6.2 7.6-7.6C20 9 17.4 6.6 16 3Z" fill="var(--teal)"/>
                <circle cx="24" cy="22" r="3" fill="var(--marigold)"/>
              </svg>
              BlueIsles
            </a>
            <nav className="foot-links" aria-label="Footer">
              <a href="#problem">The problem</a>
              <a href="#how">How it works</a>
              <a href="#modules">What's inside</a>
              <a href="#privacy">Privacy</a>
              <a href="#cta">Early access</a>
            </nav>
          </div>
          <div className="foot-note">
            <span>&ldquo;BlueIsles&rdquo; is a working name — placeholder, to be confirmed.</span>
            <span>Prototype landing page · illustrative content · no data is collected.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
