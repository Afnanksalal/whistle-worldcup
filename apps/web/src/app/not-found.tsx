import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main-content" className="not-found-page">
      <div className="not-found-card">
        <p className="section-kicker">Offside</p>
        <strong aria-hidden>404</strong>
        <h1>This page left the pitch.</h1>
        <p>The match board is still live. Head back to the schedule or follow the tournament road.</p>
        <div>
          <Link href="/" className="btn btn-primary">View matches</Link>
          <Link href="/groups" className="btn btn-secondary">Open tournament</Link>
        </div>
      </div>
    </main>
  );
}
