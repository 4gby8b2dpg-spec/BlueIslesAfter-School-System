// Placeholder screen for MVP modules that are specified but not yet built.
// Uses the shared app.css classes so it sits inside the real app shell.
export function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <main className="dash">
      <div className="dash-head">
        <h1>{title}</h1>
        <p>{blurb}</p>
      </div>
      <section className="card" style={{ maxWidth: 640 }}>
        <div className="card-head">
          <h2>Coming soon</h2>
          <span className="card-sub">Next up to build</span>
        </div>
        <p className="empty">
          This screen is specified in the product blueprint and is part of the MVP
          build queue. The app shell, auth, and database behind it are already live —
          the screen itself is what we build next.
        </p>
      </section>
    </main>
  );
}
