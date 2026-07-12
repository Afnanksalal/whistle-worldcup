import Link from "next/link";
import { FixtureBoard } from "../components/FixtureBoard";

export default function HomePage() {
  return (
    <main>
      <section
        className="shell rise"
        style={{
          minHeight: "78vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "4.5rem 0 2.75rem",
          position: "relative",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            right: "-8%",
            top: "8%",
            width: "55%",
            height: "70%",
            background:
              "linear-gradient(135deg, transparent 30%, rgba(45,212,191,0.08) 55%, transparent 80%)",
            clipPath: "polygon(18% 0, 100% 0, 82% 100%, 0 100%)",
            pointerEvents: "none",
          }}
        />

        <p className="eyebrow" style={{ marginBottom: "1rem" }}>
          Whistle
        </p>
        <h1
          className="display hero-mark"
          style={{
            fontSize: "clamp(3.2rem, 9vw, 5.8rem)",
            lineHeight: 0.9,
            margin: "0 0 1.1rem",
            maxWidth: 780,
          }}
        >
          Tournament markets.
          <br />
          <span style={{ color: "var(--cyan)" }}>Settled at full time.</span>
        </h1>
        <p
          style={{
            fontSize: "1.08rem",
            color: "var(--mute)",
            maxWidth: 480,
            lineHeight: 1.55,
            margin: "0 0 1.85rem",
          }}
        >
          Parimutuel World Cup pools fed by live match data. Stake before kickoff,
          lock at live, claim when the whistle blows — then roll into the next fixture.
        </p>
        <div style={{ display: "flex", gap: "0.7rem", flexWrap: "wrap" }}>
          <a href="#board" className="btn btn-primary">
            Browse markets
          </a>
          <Link href="/groups" className="btn btn-ghost">
            Group stage
          </Link>
          <Link href="/news" className="btn btn-ghost">
            News
          </Link>
        </div>
      </section>

      <section className="shell" style={{ padding: "0 0 3.5rem" }}>
        <div className="product-grid">
          <article className="panel" style={{ padding: "1.35rem 1.4rem" }}>
            <p className="eyebrow" style={{ marginBottom: "0.65rem" }}>
              01 · Schedule
            </p>
            <h2 className="display" style={{ fontSize: "1.25rem", margin: "0 0 0.5rem" }}>
              Live fixtures, not a spreadsheet
            </h2>
            <p style={{ color: "var(--mute)", margin: 0, lineHeight: 1.5 }}>
              Kickoffs, status, and scores stream from the match data API. Markets open
              automatically for every scheduled and live fixture.
            </p>
          </article>
          <article className="panel" style={{ padding: "1.35rem 1.4rem" }}>
            <p className="eyebrow" style={{ marginBottom: "0.65rem" }}>
              02 · Stake
            </p>
            <h2 className="display" style={{ fontSize: "1.25rem", margin: "0 0 0.5rem" }}>
              Parimutuel 1X2 and totals
            </h2>
            <p style={{ color: "var(--mute)", margin: 0, lineHeight: 1.5 }}>
              Pool price is stake-weighted. No house odds — your share of the winning
              side is your payout at settlement.
            </p>
          </article>
          <article className="panel" style={{ padding: "1.35rem 1.4rem" }}>
            <p className="eyebrow" style={{ marginBottom: "0.65rem" }}>
              03 · Settle
            </p>
            <h2 className="display" style={{ fontSize: "1.25rem", margin: "0 0 0.5rem" }}>
              Full-time resolution
            </h2>
            <p style={{ color: "var(--mute)", margin: 0, lineHeight: 1.5 }}>
              Keeper settles on FT from the feed. Cancelled or postponed fixtures void
              and refund. Claim from Positions when the pool closes.
            </p>
          </article>
        </div>
      </section>

      <div id="board">
        <FixtureBoard />
      </div>

      <section className="shell" style={{ padding: "1rem 0 4rem" }}>
        <div
          className="panel"
          style={{
            padding: "1.75rem 1.5rem",
            display: "grid",
            gap: "1rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            alignItems: "center",
          }}
        >
          <div>
            <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>
              Squads
            </p>
            <h2 className="display" style={{ fontSize: "1.5rem", margin: "0 0 0.45rem" }}>
              Private books for your group
            </h2>
            <p style={{ color: "var(--mute)", margin: 0, maxWidth: 420, lineHeight: 1.5 }}>
              Same markets, shared leaderboard. Invite codes for the group chat —
              settle arguments at FT, not in Venmo threads.
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <Link href="/squads" className="btn btn-primary">
              Open squads
            </Link>
          </div>
        </div>
      </section>

      <footer
        className="shell"
        style={{
          padding: "0 0 3rem",
          borderTop: "1px solid var(--line)",
          paddingTop: "1.5rem",
          color: "var(--mute)",
          fontSize: "0.82rem",
          display: "flex",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <span className="mono" style={{ fontSize: "0.72rem", letterSpacing: "0.08em" }}>
          WHISTLE · WORLD CUP MARKETS
        </span>
        <span>Match data · parimutuel pools · Solana settlement path</span>
      </footer>
    </main>
  );
}
