"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Squad } from "@whistle/shared";
import { api, shortAddr } from "../../lib/api";
import { useIdentity } from "../../lib/identity";

export default function SquadsPage() {
  const { owner, ready, withWalletAuth } = useIdentity();
  const [squads, setSquads] = useState<Squad[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => api<{ squads: Squad[] }>("/squads").then((r) => setSquads(r.squads));

  useEffect(() => {
    load().catch((e) => setMsg(String(e)));
  }, []);

  const create = async () => {
    if (!owner) return;
    try {
      const headers = await withWalletAuth();
      const res = await api<{ squad: Squad }>("/squads", {
        method: "POST",
        headers,
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
    if (!owner) return;
    try {
      const headers = await withWalletAuth();
      const res = await api<{ squad: Squad }>("/squads/join", {
        method: "POST",
        headers,
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
    <main className="shell" style={{ padding: "2rem 0 4rem" }}>
      <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>
        Private tables
      </p>
      <h1 className="display rise" style={{ fontSize: "2.1rem", marginBottom: "0.45rem" }}>
        Squads
      </h1>
      <p style={{ color: "var(--mute)", maxWidth: 520, marginTop: 0 }}>
        Private World Cup books for your group. Same markets, shared PnL — settle at FT, not in Venmo.
      </p>
      {msg && <p style={{ color: "var(--cyan)" }}>{msg}</p>}
      {!ready && (
        <p style={{ color: "var(--signal)" }}>Connect a wallet to create or join a squad.</p>
      )}

      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          margin: "1.5rem 0 2rem",
        }}
      >
        <div className="panel" style={{ padding: "1.2rem" }}>
          <h2 className="display" style={{ fontSize: "1.05rem", marginTop: 0 }}>
            Create squad
          </h2>
          <input
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Squad name"
            style={{ marginBottom: "0.75rem" }}
          />
          <button
            className="btn btn-primary"
            disabled={!ready || name.length < 2}
            onClick={create}
          >
            Create
          </button>
        </div>
        <div className="panel" style={{ padding: "1.2rem" }}>
          <h2 className="display" style={{ fontSize: "1.05rem", marginTop: 0 }}>
            Join with invite
          </h2>
          <input
            className="field mono"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Invite code"
            style={{ marginBottom: "0.75rem" }}
          />
          <button
            className="btn btn-ghost"
            disabled={!ready || code.length < 3}
            onClick={join}
          >
            Join
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: "0.55rem" }}>
        {squads.map((s) => (
          <Link
            key={s.id}
            href={`/squads/${s.id}`}
            className="panel"
            style={{
              padding: "1rem 1.15rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div className="display" style={{ fontSize: "1.1rem" }}>
                {s.name}
              </div>
              <div className="mono" style={{ color: "var(--mute)", fontSize: "0.72rem" }}>
                {s.members.length} members · {s.inviteCode}
                {owner && s.members.includes(owner)
                  ? ` · you (${shortAddr(owner)})`
                  : ""}
              </div>
            </div>
            <span className="mono" style={{ color: "var(--cyan)", fontSize: "0.75rem" }}>
              OPEN →
            </span>
          </Link>
        ))}
        {!squads.length && (
          <p style={{ color: "var(--mute)" }}>No squads yet — create one for your group chat.</p>
        )}
      </div>
    </main>
  );
}
