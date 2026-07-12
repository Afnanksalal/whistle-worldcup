"use client";

import { useEffect, useState } from "react";
import { api } from "../lib/api";

type Note = { id: string; type: string; message: string; ts: number };

export function NotificationToasts() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [seen, setSeen] = useState<Set<string>>(new Set());

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await api<{ notifications: Note[] }>("/notifications");
        const fresh = res.notifications.filter((n) => !seen.has(n.id)).slice(0, 3);
        if (fresh.length) {
          setNotes((prev) => [...fresh, ...prev].slice(0, 4));
          setSeen((prev) => {
            const next = new Set(prev);
            for (const n of fresh) next.add(n.id);
            return next;
          });
        }
      } catch {
        // api may be offline during static load
      }
    };
    poll();
    const t = setInterval(poll, 5000);
    return () => clearInterval(t);
  }, [seen]);

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
            borderColor: "rgba(232,163,23,0.35)",
            boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ color: "var(--amber)", fontWeight: 700, fontSize: "0.75rem" }}>
            {n.type.toUpperCase()}
          </div>
          <div style={{ fontSize: "0.9rem", marginTop: "0.2rem" }}>{n.message}</div>
          <button
            className="btn btn-ghost"
            style={{ marginTop: "0.5rem", padding: "0.25rem 0.6rem", fontSize: "0.75rem" }}
            onClick={() => setNotes((prev) => prev.filter((x) => x.id !== n.id))}
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
