import Link from "next/link";

// Placeholder. Next build target (§8.4 step 6): port dashboard-mockup.html to
// live Supabase data — auth → RLS → query → SVG charts, end to end.
export default function DashboardPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "48px 24px",
        background: "#f4f7f6",
        color: "#14201f",
        fontFamily: "system-ui, sans-serif",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 520 }}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: "#0b5a54",
          }}
        >
          BlueIsles · App shell
        </p>
        <h1 style={{ fontSize: 30, margin: "12px 0 10px", lineHeight: 1.1 }}>
          Dashboard goes here
        </h1>
        <p style={{ color: "#47595a", lineHeight: 1.5 }}>
          Scaffolding is in place. This route is where the §5 dashboard mockup
          becomes live — reading real data through Supabase with RLS. Until then,
          the approved design lives in <code>dashboard-mockup.html</code>.
        </p>
        <p style={{ marginTop: 24 }}>
          <Link href="/" style={{ color: "#0b5a54", fontWeight: 600 }}>
            ← Back to the landing page
          </Link>
        </p>
      </div>
    </main>
  );
}
