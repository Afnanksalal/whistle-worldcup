"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { getMetricsLabel } from "./adminUtils";

type Overview = {
  meta: Record<string, unknown>;
  metrics: Record<string, number | null>;
  fixtures: number;
  openMarkets: number;
  lockedMarkets: number;
  settledMarkets: number;
  markets: Array<{
    id: string;
    fixtureId: string;
    marketType: string;
    status: string;
    totalPool: number;
  }>;
  notifications: Array<{ id: string; type: string; message: string; ts: number }>;
};

const KEY = "whistle_admin_key";

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    const k = sessionStorage.getItem(KEY) || "";
    setKey(k);
    setSaved(k);
  }, []);

  const load = useCallback(async (adminKey: string) => {
    if (!adminKey) return;
    const res = await api<Overview>("/admin/overview", {
      headers: { "x-admin-key": adminKey },
    });
    setData(res);
    if (!selected && res.markets[0]) setSelected(res.markets[0].id);
  }, [selected]);

  useEffect(() => {
    if (!saved) return;
    load(saved).catch((e) => setMsg(String(e)));
    const t = setInterval(() => load(saved).catch(() => undefined), 10_000);
    return () => clearInterval(t);
  }, [saved, load]);

  const persist = () => {
    sessionStorage.setItem(KEY, key.trim());
    setSaved(key.trim());
    setMsg("Admin key saved locally");
  };

  const act = async (path: string, body?: object) => {
    try {
      await api(path, {
        method: "POST",
        headers: { "x-admin-key": saved },
        body: body ? JSON.stringify(body) : undefined,
      });
      setMsg(`OK ${path}`);
      await load(saved);
    } catch (e) {
      setMsg(String(e));
    }
  };

  return (
    <main className="shell" style={{ padding: "2rem 0 4rem" }}>
      <p className="eyebrow" style={{ marginBottom: "0.5rem" }}>
        Operations
      </p>
      <h1 className="display" style={{ fontSize: "2.1rem", marginBottom: "0.35rem" }}>
        Admin
      </h1>
      <p style={{ color: "var(--mute)", maxWidth: 520 }}>
        Protected by ADMIN_API_KEY. The key is kept only for this browser tab session.
      </p>

      <div className="panel" style={{ padding: "1.1rem", margin: "1.25rem 0", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input
          className="field mono"
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="ADMIN_API_KEY"
          style={{ flex: 1, minWidth: 220, marginTop: 0 }}
        />
        <button className="btn btn-primary" onClick={persist}>
          Save key
        </button>
      </div>

      {msg && <p style={{ color: "var(--cyan)" }}>{msg}</p>}

      {data && (
        <>
          <div className="product-grid" style={{ marginBottom: "1.5rem" }}>
            {[
              ["Fixtures", data.fixtures],
              ["Open", data.openMarkets],
              ["Locked", data.lockedMarkets],
              ["Settled", data.settledMarkets],
            ].map(([label, value]) => (
              <div key={String(label)} className="panel" style={{ padding: "1rem 1.15rem" }}>
                <div className="mono" style={{ color: "var(--mute)", fontSize: "0.7rem" }}>
                  {label}
                </div>
                <div className="display" style={{ fontSize: "1.8rem", color: "var(--cyan)" }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div className="panel" style={{ padding: "1.1rem", marginBottom: "1.25rem" }}>
            <h2 className="display" style={{ fontSize: "1.1rem", marginTop: 0 }}>
              Metrics
            </h2>
            <div className="mono" style={{ display: "grid", gap: "0.25rem", fontSize: "0.78rem", color: "var(--mute)" }}>
              {Object.entries(data.metrics).map(([k, v]) => (
                <div key={k}>
                  {getMetricsLabel(k)}: {String(v)}
                </div>
              ))}
            </div>
          </div>

          <div className="panel" style={{ padding: "1.1rem", marginBottom: "1.25rem" }}>
            <h2 className="display" style={{ fontSize: "1.1rem", marginTop: 0 }}>
              Market actions
            </h2>
            <select
              className="field"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              style={{ marginBottom: "0.75rem" }}
            >
              {data.markets.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.fixtureId.slice(0, 12)}… · {m.marketType} · {m.status} · ${m.totalPool}
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
              <button className="btn btn-ghost" onClick={() => act(`/markets/${selected}/lock`)}>
                Lock
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => act(`/markets/${selected}/void`, { reason: "admin void" })}
              >
                Void
              </button>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "end" }}>
              <label style={{ color: "var(--mute)", fontSize: "0.85rem" }}>
                Home
                <input
                  className="field mono"
                  type="number"
                  min={0}
                  value={home}
                  onChange={(e) => setHome(Number(e.target.value))}
                />
              </label>
              <label style={{ color: "var(--mute)", fontSize: "0.85rem" }}>
                Away
                <input
                  className="field mono"
                  type="number"
                  min={0}
                  value={away}
                  onChange={(e) => setAway(Number(e.target.value))}
                />
              </label>
              <button
                className="btn btn-primary"
                onClick={() =>
                  act(`/markets/${selected}/settle`, { homeScore: home, awayScore: away })
                }
              >
                Force settle
              </button>
            </div>
          </div>

          <h2 className="display" style={{ fontSize: "1.15rem" }}>
            Recent events
          </h2>
          <div style={{ display: "grid", gap: "0.4rem" }}>
            {data.notifications.map((n) => (
              <div key={n.id} className="panel" style={{ padding: "0.75rem 1rem", color: "var(--mute)", fontSize: "0.88rem" }}>
                <span className="mono" style={{ color: "var(--cyan)", fontSize: "0.7rem" }}>
                  {n.type}
                </span>{" "}
                {n.message}
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
