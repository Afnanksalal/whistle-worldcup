"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Squad } from "@whistle/shared";
import { api } from "../../lib/api";
import { useIdentity } from "../../lib/identity";

export default function SquadsPage() {
  const { owner } = useIdentity();
  const [squads, setSquads] = useState<Squad[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = () =>
    api<{ squads: Squad[] }>("/squads").then((r) => setSquads(r.squads));

  useEffect(() => {
    load().catch((e) => setMsg(String(e)));
  }, []);

  const create = async () => {
    try {
      const res = await api<{ squad: Squad }>("/squads", {
        method: "POST",
        body: JSON.stringify({ name, creator: owner }),
      });
      setMsg(`Created ${res.squad.name} — invite ${res.squad.inviteCode}`);
      setName("");
      await load();
    } catch (e) {
      setMsg(String(e));
    }
  };

  const join = async () => {
    try {
      const res = await api<{ squad: Squad }>("/squads/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode: code, member: owner }),
      });
      setMsg(`Joined ${res.squad.name}`);
      setCode("");
      await load();
    } catch (e) {
      setMsg(String(e));
    }
  };

  return (
    <main style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1.5rem 4rem" }}>
      <h1 className="display rise" style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>
        Squads
      </h1>
      <p style={{ color: "var(--chalk-dim)", maxWidth: 520 }}>
        Private World Cup tables for your group. Same markets, shared leaderboard — no Venmo
        arguments at full-time.
      </p>
      {msg && <p style={{ color: "var(--amber)" }}>{msg}</p>}

      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          margin: "1.5rem 0 2rem",
        }}
      >
        <div className="panel" style={{ padding: "1.25rem" }}>
          <h2 className="display" style={{ fontSize: "1.1rem", marginTop: 0 }}>
            Create squad
          </h2>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Squad name"
            style={{
              width: "100%",
              padding: "0.7rem",
              borderRadius: "0.75rem",
              border: "1px solid var(--line)",
              background: "rgba(0,0,0,0.25)",
              color: "var(--chalk)",
              marginBottom: "0.75rem",
            }}
          />
          <button className="btn btn-primary" disabled={name.length < 2} onClick={create}>
            Create
          </button>
        </div>
        <div className="panel" style={{ padding: "1.25rem" }}>
          <h2 className="display" style={{ fontSize: "1.1rem", marginTop: 0 }}>
            Join with invite
          </h2>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Invite code"
            style={{
              width: "100%",
              padding: "0.7rem",
              borderRadius: "0.75rem",
              border: "1px solid var(--line)",
              background: "rgba(0,0,0,0.25)",
              color: "var(--chalk)",
              marginBottom: "0.75rem",
            }}
          />
          <button className="btn btn-ghost" disabled={code.length < 3} onClick={join}>
            Join
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: "0.65rem" }}>
        {squads.map((s) => (
          <Link
            key={s.id}
            href={`/squads/${s.id}`}
            className="panel"
            style={{
              padding: "1rem 1.2rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div className="display" style={{ fontSize: "1.15rem" }}>
                {s.name}
              </div>
              <div style={{ color: "var(--chalk-dim)", fontSize: "0.85rem" }}>
                {s.members.length} members · invite {s.inviteCode}
              </div>
            </div>
            <span style={{ color: "var(--amber)" }}>Open →</span>
          </Link>
        ))}
        {!squads.length && (
          <p style={{ color: "var(--chalk-dim)" }}>No squads yet — create one for your group chat.</p>
        )}
      </div>
    </main>
  );
}
