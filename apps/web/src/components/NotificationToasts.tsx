"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

type Note = { id: string; type: string; message: string; ts: number };

export function NotificationToasts() {
  const [notes, setNotes] = useState<Note[]>([]);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await api<{ notifications: Note[] }>("/notifications");
        const fresh = res.notifications.filter((n) => !seen.current.has(n.id)).slice(0, 3);
        if (fresh.length) {
          for (const n of fresh) seen.current.add(n.id);
          setNotes((prev) => [...fresh, ...prev].slice(0, 4));
        }
      } catch {
        // api may be offline
      }
    };
    void poll();
    const t = setInterval(() => void poll(), 5000);
    return () => clearInterval(t);
  }, []);

  if (!notes.length) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: "1rem",
        bottom: "1rem",
        zIndex: 50,
        display: "grid",
        gap: "0.5rem",
        maxWidth: 360,
      }}
    >
      {notes.map((n) => (
        <div
          key={n.id}
          className="panel rise"
          style={{
            padding: "0.85rem 1rem",
            borderColor: "rgba(45, 212, 191, 0.35)",
            boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
          }}
        >
          <div className="mono" style={{ color: "var(--cyan)", fontWeight: 700, fontSize: "0.68rem" }}>
            {n.type.toUpperCase()}
          </div>
          <div style={{ fontSize: "0.88rem", marginTop: "0.25rem" }}>{n.message}</div>
          <button
            className="btn btn-ghost"
            style={{ marginTop: "0.55rem", padding: "0.25rem 0.55rem", fontSize: "0.72rem" }}
            onClick={() => setNotes((prev) => prev.filter((x) => x.id !== n.id))}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
