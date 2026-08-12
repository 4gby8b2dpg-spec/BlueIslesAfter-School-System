import { notFound } from "next/navigation";
import { requireAppContext } from "@/lib/auth-context";
import { createClient } from "@/lib/supabase/server";
import { renderNarrativeHtml } from "@/lib/report-render";
import { parseNarrativeBlocks } from "@/lib/narratives";

export const dynamic = "force-dynamic";

export default async function NarrativePreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireAppContext();
  const supabase = await createClient();

  const [{ data: narrative }, { data: org }] = await Promise.all([
    supabase.from("report_narratives").select("title, blocks").eq("id", id).eq("org_id", ctx.orgId).maybeSingle(),
    supabase.from("orgs").select("name").eq("id", ctx.orgId).maybeSingle(),
  ]);
  if (!narrative) notFound();

  const html = renderNarrativeHtml({
    title: narrative.title,
    orgName: org?.name ?? "",
    blocks: parseNarrativeBlocks(JSON.stringify(narrative.blocks)),
  });

  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
