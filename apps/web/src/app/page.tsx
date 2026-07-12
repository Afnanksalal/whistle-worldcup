import Link from "next/link";
import { FixtureBoard } from "../components/FixtureBoard";

export default function HomePage() {
  return (
    <main>
      <section
        className="rise"
        style={{
          minHeight: "72vh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "4rem 1.5rem 3rem",
          maxWidth: 1100,
          margin: "0 auto",
          position: "relative",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: "10% 5% auto",
            height: "55%",
            background:
              "radial-gradient(ellipse at center, rgba(232,163,23,0.12), transparent 65%)",
            pointerEvents: "none",
          }}
        />
        <p
          style={{
            color: "var(--amber)",
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontSize: "0.8rem",
            marginBottom: "0.75rem",
          }}
        >
          World Cup 2026
        </p>
        <h1
          className="display"
          style={{
            fontSize: "clamp(2.8rem, 8vw, 5.2rem)",
            lineHeight: 0.95,
            margin: "0 0 1rem",
            maxWidth: 720,
          }}
        >
          Whistle
        </h1>
        <p
          style={{
            fontSize: "1.2rem",
            color: "var(--chalk-dim)",
            maxWidth: 480,
            lineHeight: 1.5,
            margin: "0 0 1.75rem",
          }}
        >
          Take a side on any match. Watch it live. Winnings unlock at full-time —
          ready for the next kickoff.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <a href="#board" className="btn btn-primary">
            Browse fixtures
          </a>
          <Link href="/squads" className="btn btn-ghost">
            Start a squad
          </Link>
        </div>
      </section>

      <div id="board">
        <FixtureBoard />
      </div>
    </main>
  );
}

