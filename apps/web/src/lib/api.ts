function resolveApiBase(): string {
  const env = process.env.NEXT_PUBLIC_API_URL;
  if (env === "" || env === "same-origin") {
    if (typeof window !== "undefined") return "";
    return "";
  }
  return env || "http://localhost:4000";
}

export const API_URL = resolveApiBase();

export function apiUrl(path: string): string {
  const base = resolveApiBase();
  return `${base}/api${path}`;
}

export function wsUrl(): string {
  if (typeof window !== "undefined") {
    const base = resolveApiBase();
    if (!base) {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${window.location.host}/ws`;
    }
    return base.replace(/^http/, "ws") + "/ws";
  }
  return "ws://localhost:4000/ws";
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

export function shortAddr(addr: string) {
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

export function formatKickoff(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function statusLabel(status: string) {
  if (status === "live") return "LIVE";
  if (status === "finished") return "FT";
  if (status === "scheduled") return "Upcoming";
  return status.toUpperCase();
}
