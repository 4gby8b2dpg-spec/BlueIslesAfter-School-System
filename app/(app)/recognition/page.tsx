import Link from "next/link";
import { requireAppContext } from "@/lib/auth-context";
import { getRecognitionBoard } from "@/lib/recognition";
import "../participants/participants.css";
import "./recognition.css";

export const dynamic = "force-dynamic";

export default async function RecognitionPage() {
  const ctx = await requireAppContext();
  const board = await getRecognitionBoard(ctx.orgId);

  // headline counts by badge kind
  const totals = { milestone: 0, improvement: 0, streak: 0, consistency: 0, engagement: 0 };
  for (const e of board)
    for (const b of e.badges) totals[b.kind]++;
  const totalBadges = Object.values(totals).reduce((a, n) => a + n, 0);

  return (
    <main className="dash">
      <div className="dash-head">
        <h1>Recognition</h1>
        <p>
          Effort, improvement, and consistency — earned automatically from attendance. Reward
          showing up and growth, not a spotless record.
        </p>
      </div>

      {board.length === 0 ? (
        <section className="card">
          <p className="empty">
            No badges earned yet. As participants build attendance, milestones and streaks appear
            here.
          </p>
        </section>
      ) : (
        <>
          <div className="recog-stats">
            <div className="recog-stat">
              <span className="recog-stat-val num">{board.length}</span>
              <span className="recog-stat-lbl">participants recognized</span>
            </div>
            <div className="recog-stat">
              <span className="recog-stat-val num">{totalBadges}</span>
              <span className="recog-stat-lbl">badges earned</span>
            </div>
            <div className="recog-stat">
              <span className="recog-stat-val num">{totals.improvement}</span>
              <span className="recog-stat-lbl">most improved</span>
            </div>
            <div className="recog-stat">
              <span className="recog-stat-val num">{totals.streak}</span>
              <span className="recog-stat-lbl">active streaks</span>
            </div>
          </div>

          <div className="recog-grid">
            {board.map((e) => (
              <section key={e.participantId} className="card recog-person">
                <div className="recog-person-head">
                  <Link href={`/participants/${e.participantId}`} className="recog-name">
                    {e.name}
                  </Link>
                  <Link href={`/recognition/certificate/${e.participantId}`} className="recog-cert-link">
                    Certificate →
                  </Link>
                </div>
                <ul className="badge-shelf">
                  {e.badges.map((b) => (
                    <li key={b.key} className={`badge badge-${b.kind}`}>
                      <span className="badge-emoji" aria-hidden="true">
                        {b.emoji}
                      </span>
                      <span className="badge-body">
                        <span className="badge-label">{b.label}</span>
                        <span className="badge-detail">{b.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
