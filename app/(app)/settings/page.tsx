import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { PageHead } from "@/components/page-head";
import {
  updateMemberRole,
  setMemberStatus,
  addSite,
  addTerm,
  toggleSiteActive,
  deleteSite,
  deleteTerm,
  updateThresholds,
  createCalendarFeed,
  revokeCalendarFeed,
} from "./actions";
import { CopyField } from "@/components/copy-field";
import { headers } from "next/headers";
import { getFlagThresholds } from "@/lib/flags";
import "./settings.css";
import { CardIcon } from "@/components/card-icon";

export const dynamic = "force-dynamic";

const ROLES = ["admin", "director", "staff", "viewer"];

export default async function SettingsPage() {
  const ctx = await requireAppContext();

  if (ctx.role !== "admin") {
    return (
      <main className="dash">
        <PageHead href="/settings" title="Settings" tone="teal">
          Administration is limited to admins.
        </PageHead>
        <section className="card">
          <p className="empty">
            You&rsquo;re signed in as <strong>{ctx.role}</strong>. Ask an admin for access
            to user management, sites, terms, and the audit log.
          </p>
        </section>
      </main>
    );
  }

  const supabase = await createClient();
  const [membersRes, sitesRes, termsRes, programsRes, auditRes, thresholds] = await Promise.all([
    supabase
      .from("memberships")
      .select("id, role, status, user_id, profiles(email, full_name)")
      .eq("org_id", ctx.orgId),
    supabase.from("sites").select("id, name, is_active").eq("org_id", ctx.orgId).order("name"),
    supabase.from("terms").select("id, name, starts_on, ends_on").eq("org_id", ctx.orgId).order("starts_on"),
    supabase.from("programs").select("site_id, term_id").eq("org_id", ctx.orgId),
    supabase
      .from("audit_log")
      .select("id, action, entity_table, at, profiles(full_name)")
      .eq("org_id", ctx.orgId)
      .order("at", { ascending: false })
      .limit(30),
    getFlagThresholds(ctx.orgId),
  ]);

  const { data: feedRows } = await supabase
    .from("calendar_feeds")
    .select("id, label, site_id, token")
    .eq("org_id", ctx.orgId)
    .is("revoked_at", null)
    .order("created_at", { ascending: true });
  const feeds = feedRows ?? [];

  // Feed URLs must be absolute — they're pasted into external calendar apps.
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("host") ?? "localhost:3210";
  const baseUrl = `${proto}://${host}`;

  const members = (membersRes.data ?? []) as unknown as {
    id: string;
    role: string;
    status: string;
    user_id: string;
    profiles: { email: string | null; full_name: string | null } | null;
  }[];
  const sites = sitesRes.data ?? [];
  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  const terms = termsRes.data ?? [];
  const programs = programsRes.data ?? [];
  const siteUse = new Map<string, number>();
  const termUse = new Map<string, number>();
  for (const p of programs) {
    if (p.site_id) siteUse.set(p.site_id, (siteUse.get(p.site_id) ?? 0) + 1);
    if (p.term_id) termUse.set(p.term_id, (termUse.get(p.term_id) ?? 0) + 1);
  }
  const audit = (auditRes.data ?? []) as unknown as {
    id: string;
    action: string;
    entity_table: string | null;
    at: string;
    profiles: { full_name: string | null } | null;
  }[];

  return (
    <main className="dash">
      <PageHead href="/settings" title="Settings" tone="teal">
        Manage users, sites, terms, and review the audit log.
      </PageHead>

      {/* USERS */}
      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <span className="spot violet"><CardIcon name="users" /></span>
            <h2>Users &amp; roles</h2>
          </div>
          <span className="card-sub">{members.length} in this organization</span>
        </div>
        <div className="settings-scroll">
          <table className="settings-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const isSelf = m.user_id === ctx.userId;
                return (
                  <tr key={m.id}>
                    <td>
                      {m.profiles?.full_name ?? "—"}
                      {isSelf && <span className="you-chip">you</span>}
                    </td>
                    <td className="settings-muted">{m.profiles?.email ?? "—"}</td>
                    <td>
                      <form action={updateMemberRole} className="inline-form">
                        <input type="hidden" name="membershipId" value={m.id} />
                        <select name="role" defaultValue={m.role} aria-label={`Role for ${m.profiles?.full_name ?? "member"}`}>
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <button className="mini-btn" type="submit">
                          Save
                        </button>
                      </form>
                    </td>
                    <td>
                      <span className={`member-status ${m.status}`}>{m.status}</span>
                    </td>
                    <td className="right">
                      {!isSelf && (
                        <form action={setMemberStatus}>
                          <input type="hidden" name="membershipId" value={m.id} />
                          <input
                            type="hidden"
                            name="status"
                            value={m.status === "deactivated" ? "active" : "deactivated"}
                          />
                          <button className="link-btn" type="submit">
                            {m.status === "deactivated" ? "Reactivate" : "Deactivate"}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="settings-note">
          New members sign in with a Supabase account, then appear here to be assigned a
          role. Email invitations are a follow-up (they need the server service-role key).
        </p>
      </section>

      {/* ALERT THRESHOLDS */}
      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <span className="spot coral"><CardIcon name="sliders" /></span>
            <h2>Alert thresholds</h2>
          </div>
          <span className="card-sub">Drives the dashboard flags</span>
        </div>
        <form action={updateThresholds} className="threshold-form">
          <label>
            <span>Chronic absence — warning</span>
            <div className="threshold-input">
              <input
                type="number"
                name="chronicWarningPct"
                min={1}
                max={100}
                defaultValue={thresholds.warningPct}
              />
              <em>% absent</em>
            </div>
          </label>
          <label>
            <span>Chronic absence — critical</span>
            <div className="threshold-input">
              <input
                type="number"
                name="chronicCriticalPct"
                min={1}
                max={100}
                defaultValue={thresholds.criticalPct}
              />
              <em>% absent</em>
            </div>
          </label>
          <label>
            <span>Minimum sessions before flagging</span>
            <div className="threshold-input">
              <input
                type="number"
                name="chronicMinSessions"
                min={1}
                max={60}
                defaultValue={thresholds.minSessions}
              />
              <em>sessions</em>
            </div>
          </label>
          <label>
            <span>Default staff ratio (fallback)</span>
            <div className="threshold-input">
              <em>1 :</em>
              <input
                type="number"
                name="ratioDefaultTarget"
                min={1}
                max={100}
                placeholder="—"
                defaultValue={thresholds.ratioDefaultTarget ?? ""}
              />
              <em>participants</em>
            </div>
          </label>
          <p className="threshold-note">
            Used when a program has no ratio of its own. Leave blank to skip ratio checks for those
            programs. Critical is raised to the warning value if set lower.
          </p>
          <button className="btn-primary" type="submit">
            Save thresholds
          </button>
        </form>
      </section>

      {/* SITES + TERMS */}
      <div className="settings-grid">
        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <span className="spot mint"><CardIcon name="pin" /></span>
              <h2>Sites</h2>
            </div>
            <span className="card-sub">{sites.length}</span>
          </div>
          <ul className="settings-list">
            {sites.map((s) => {
              const used = siteUse.get(s.id) ?? 0;
              return (
                <li key={s.id} className="settings-list-row">
                  <span>{s.name}</span>
                  <span className="settings-row-actions">
                    <span className={s.is_active ? "member-status active" : "member-status deactivated"}>
                      {s.is_active ? "active" : "inactive"}
                    </span>
                    <form action={toggleSiteActive}>
                      <input type="hidden" name="siteId" value={s.id} />
                      <input type="hidden" name="active" value={(!s.is_active).toString()} />
                      <button className="link-btn" type="submit">
                        {s.is_active ? "Deactivate" : "Reactivate"}
                      </button>
                    </form>
                    {used > 0 ? (
                      <span className="in-use" title="Reassign or remove its programs first">
                        {used} program{used === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <form action={deleteSite}>
                        <input type="hidden" name="siteId" value={s.id} />
                        <button className="link-btn danger" type="submit">
                          Delete
                        </button>
                      </form>
                    )}
                  </span>
                </li>
              );
            })}
            {sites.length === 0 && <li className="empty">No sites yet.</li>}
          </ul>
          <form action={addSite} className="inline-add">
            <input name="name" placeholder="New site name" required />
            <button className="btn-primary" type="submit">
              Add site
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card-head">
            <div className="card-title">
              <span className="spot violet"><CardIcon name="calendar" /></span>
              <h2>Terms</h2>
            </div>
            <span className="card-sub">{terms.length}</span>
          </div>
          <ul className="settings-list">
            {terms.map((t) => {
              const used = termUse.get(t.id) ?? 0;
              return (
                <li key={t.id} className="settings-list-row">
                  <span>{t.name}</span>
                  <span className="settings-row-actions">
                    <span className="settings-muted">
                      {t.starts_on ?? "—"} → {t.ends_on ?? "—"}
                    </span>
                    {used > 0 ? (
                      <span className="in-use" title="Reassign or remove its programs first">
                        {used} program{used === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <form action={deleteTerm}>
                        <input type="hidden" name="termId" value={t.id} />
                        <button className="link-btn danger" type="submit">
                          Delete
                        </button>
                      </form>
                    )}
                  </span>
                </li>
              );
            })}
            {terms.length === 0 && <li className="empty">No terms yet.</li>}
          </ul>
          <form action={addTerm} className="inline-add term-add">
            <input name="name" placeholder="e.g. Fall 2026" required />
            <input name="startsOn" type="date" aria-label="Term start" />
            <input name="endsOn" type="date" aria-label="Term end" />
            <button className="btn-primary" type="submit">
              Add term
            </button>
          </form>
        </section>
      </div>

      {/* CALENDAR FEEDS */}
      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <span className="spot amber"><CardIcon name="calendar" /></span>
            <h2>Calendar feeds</h2>
          </div>
          <span className="card-sub">Subscribe in Google, Outlook, or Apple Calendar</span>
        </div>
        <ul className="feed-list">
          {feeds.map((f) => (
            <li key={f.id} className="feed-row">
              <span className="feed-meta">
                <span className="feed-label">{f.label}</span>
                <span className="feed-scope">
                  {f.site_id ? (siteName.get(f.site_id) ?? "Site") : "All sites"}
                </span>
              </span>
              <CopyField value={`${baseUrl}/api/calendar/${f.token}`} label={`${f.label} feed URL`} />
              <form action={revokeCalendarFeed}>
                <input type="hidden" name="feedId" value={f.id} />
                <button className="link-btn danger" type="submit">
                  Revoke
                </button>
              </form>
            </li>
          ))}
          {feeds.length === 0 && (
            <li className="empty">
              No feeds yet. Create one to publish the schedule to a staff calendar.
            </li>
          )}
        </ul>
        <form action={createCalendarFeed} className="inline-add">
          <input name="label" placeholder="e.g. Staff schedule" required />
          <select name="siteId" defaultValue="all" aria-label="Site for this feed">
            <option value="all">All sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="btn-primary" type="submit">
            Create feed
          </button>
        </form>
        <p className="settings-note">
          Anyone with a feed URL can read that schedule, so share it like a password.
          Revoking a feed stops it updating immediately; subscribers keep whatever
          their calendar already downloaded.
        </p>
      </section>

      {/* AUDIT LOG */}
      <section className="card">
        <div className="card-head">
          <div className="card-title">
            <span className="spot teal"><CardIcon name="list" /></span>
            <h2>Audit log</h2>
          </div>
          <span className="card-sub">Most recent 30</span>
        </div>
        {audit.length === 0 ? (
          <p className="empty">
            No activity logged yet. Changes made here (roles, sites, terms) are recorded.
          </p>
        ) : (
          <div className="settings-scroll">
            <table className="settings-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Entity</th>
                </tr>
              </thead>
              <tbody>
                {audit.map((a) => (
                  <tr key={a.id}>
                    <td className="settings-muted num">
                      {new Date(a.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                    </td>
                    <td>{a.profiles?.full_name ?? "—"}</td>
                    <td>
                      <span className={`audit-action ${a.action}`}>{a.action}</span>
                    </td>
                    <td className="settings-muted">{a.entity_table ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
