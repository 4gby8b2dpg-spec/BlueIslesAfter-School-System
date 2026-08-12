import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { PageHead } from "@/components/page-head";
import { NarrativeBuilder } from "@/components/narrative-builder";
import { parseNarrativeBlocks } from "@/lib/narratives";
import "../../reports.css";

export const dynamic = "force-dynamic";

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function NarrativeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAppContext();
  if (!["admin", "director"].includes(ctx.role)) {
    return (
      <main className="dash">
        <PageHead href="/reports/narratives" title="Narrative" tone="violet">
          Building narratives is limited to admins and directors.
        </PageHead>
      </main>
    );
  }

  const now = new Date();
  const from = iso(new Date(now.getTime() - 60 * 86_400_000));
  const to = iso(now);

  if (id === "new") {
    return (
      <main className="dash">
        <PageHead href="/reports/narratives" title="New narrative" tone="violet">
          KPI and chart blocks snapshot today&rsquo;s numbers (last 60 days) — they won&rsquo;t change later.
        </PageHead>
        <section className="card">
          <NarrativeBuilder narrativeId={null} initialTitle="" initialBlocks={[]} from={from} to={to} />
        </section>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: narrative } = await supabase
    .from("report_narratives")
    .select("id, title, blocks")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!narrative) notFound();

  return (
    <main className="dash">
      <PageHead href="/reports/narratives" title={narrative.title} tone="violet">
        KPI and chart blocks are snapshots — add a fresh one if the numbers should update.
      </PageHead>
      <div style={{ margin: "-8px 0 16px" }}>
        <Link href={`/reports/narratives/${narrative.id}/preview`} className="btn-ghost" target="_blank">
          Preview →
        </Link>
      </div>
      <section className="card">
        <NarrativeBuilder
          narrativeId={narrative.id}
          initialTitle={narrative.title}
          initialBlocks={parseNarrativeBlocks(JSON.stringify(narrative.blocks))}
          from={from}
          to={to}
        />
      </section>
    </main>
  );
}
