import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { getParticipantBadges, type Badge } from "@/lib/recognition";
import { PrintButton } from "@/components/print-button";
import "./certificate.css";

export const dynamic = "force-dynamic";

export default async function CertificatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ badge?: string }>;
}) {
  const { id } = await params;
  const { badge: badgeKey } = await searchParams;
  const ctx = await requireAppContext();
  const supabase = await createClient();

  const [{ data: p }, { data: enr }, badges] = await Promise.all([
    supabase
      .from("participants")
      .select("first_name, last_name")
      .eq("org_id", ctx.orgId)
      .eq("id", id)
      .maybeSingle(),
    // the participant's site (location), via their enrolled programs
    supabase
      .from("enrollments")
      .select("status, programs(sites(name))")
      .eq("org_id", ctx.orgId)
      .eq("participant_id", id),
    getParticipantBadges(ctx.orgId, id),
  ]);
  if (!p) notFound();
  if (badges.length === 0) notFound();

  const enrollments = (enr ?? []) as unknown as {
    status: string;
    programs: { sites: { name: string } | null } | null;
  }[];
  // Prefer an active enrollment's site; fall back to any, then the org name.
  const siteName =
    enrollments.find((e) => e.status === "enrolled")?.programs?.sites?.name ??
    enrollments.find((e) => e.programs?.sites?.name)?.programs?.sites?.name ??
    ctx.orgName;

  const badge: Badge = badges.find((b) => b.key === badgeKey) ?? badges[0];
  const name = `${p.first_name} ${p.last_name}`.trim();
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="cert-page">
      <div className="cert-toolbar">
        <Link href={`/participants/${id}`} className="btn-ghost">
          ← Back to profile
        </Link>
        <div className="cert-toolbar-right">
          {badges.length > 1 && (
            <div className="cert-switch">
              {badges.map((b) => (
                <Link
                  key={b.key}
                  href={`/recognition/certificate/${id}?badge=${b.key}`}
                  className={b.key === badge.key ? "cert-switch-btn active" : "cert-switch-btn"}
                >
                  {b.emoji} {b.label}
                </Link>
              ))}
            </div>
          )}
          <PrintButton />
        </div>
      </div>

      <article className={`cert badge-${badge.kind}`}>
        <div className="cert-inner">
          <div className="cert-brand">
            <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
              <path
                d="M16 3c-1.4 3.6-4 6-7.6 7.4C12 11.8 14.6 14.4 16 18c1.4-3.6 4-6.2 7.6-7.6C20 9 17.4 6.6 16 3Z"
                fill="#0D9488"
              />
              <circle cx="24" cy="22" r="3" fill="#D97706" />
            </svg>
            <span>{siteName}</span>
          </div>

          <p className="cert-eyebrow">Certificate of Recognition</p>
          <div className="cert-emoji" aria-hidden="true">
            {badge.emoji}
          </div>
          <p className="cert-awarded">This certificate is proudly awarded to</p>
          <h1 className="cert-name">{name}</h1>
          <p className="cert-for">
            for earning the <strong>{badge.label}</strong> badge
          </p>
          <p className="cert-detail">{badge.detail}</p>

          <div className="cert-foot">
            <div className="cert-sign">
              <span className="cert-sign-line" />
              <span className="cert-sign-lbl">Program Director</span>
            </div>
            <div className="cert-date">
              <span className="cert-date-val">{today}</span>
              <span className="cert-sign-lbl">Date</span>
            </div>
          </div>
        </div>
      </article>
    </main>
  );
}
