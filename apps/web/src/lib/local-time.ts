"use client";

import { useEffect, useState } from "react";

export type LocalTimeContext = {
  locale: string;
  timeZone: string;
  ready: boolean;
};

const UTC_CONTEXT: LocalTimeContext = {
  locale: "en-US",
  timeZone: "UTC",
  ready: false,
};

const ABSOLUTE_ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(
  locale: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions
): Intl.DateTimeFormat {
  const key = JSON.stringify([locale, timeZone, options]);
  const cached = formatterCache.get(key);
  if (cached) return cached;

  try {
    const created = new Intl.DateTimeFormat(locale, { ...options, timeZone });
    formatterCache.set(key, created);
    return created;
  } catch {
    const fallbackKey = JSON.stringify(["en-US", "UTC", options]);
    const fallback = formatterCache.get(fallbackKey);
    if (fallback) return fallback;
    const created = new Intl.DateTimeFormat("en-US", {
      ...options,
      timeZone: "UTC",
    });
    formatterCache.set(fallbackKey, created);
    return created;
  }
}

export function useLocalTimeContext(): LocalTimeContext {
  const [context, setContext] = useState<LocalTimeContext>(UTC_CONTEXT);

  useEffect(() => {
    let locale = "en-US";
    let timeZone = "UTC";
    try {
      locale = navigator.languages?.[0] || navigator.language || locale;
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || timeZone;
      // Validate both values before exposing them to every formatter.
      new Intl.DateTimeFormat(locale, { timeZone });
    } catch {
      locale = "en-US";
      timeZone = "UTC";
    }
    setContext({ locale, timeZone, ready: true });
  }, []);

  return context;
}

function date(value: number | string): Date | null {
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  let input = value;
  if (typeof value === "string") {
    input = value.trim();
    if (!ABSOLUTE_ISO_TIMESTAMP.test(input)) {
      // Offset-less date-times are interpreted in the host zone. Rejecting them
      // keeps the server render and browser hydration deterministic worldwide.
      return null;
    }
  }
  const parsed = new Date(input);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function formatKickoff(
  value: number | string,
  context: LocalTimeContext
): string {
  const parsed = date(value);
  if (!parsed) return "Kickoff pending";
  return formatter(context.locale, context.timeZone, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(parsed);
}

export function formatClock(
  value: number | string,
  context: LocalTimeContext
): string {
  const parsed = date(value);
  if (!parsed) return "Time pending";
  return formatter(context.locale, context.timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(parsed);
}

export function formatCalendarDate(
  value: number | string,
  context: LocalTimeContext,
  includeTime = false
): string {
  const parsed = date(value);
  if (!parsed) return "Recently published";
  return formatter(context.locale, context.timeZone, {
    month: "short",
    day: "numeric",
    ...(includeTime
      ? { hour: "numeric" as const, minute: "2-digit" as const, timeZoneName: "short" as const }
      : {}),
  }).format(parsed);
}

function calendarParts(value: number, timeZone: string) {
  const parsed = date(value);
  if (!parsed) return null;
  const parts = formatter("en-US", timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  if (!map.year || !map.month || !map.day) return null;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

export function calendarDateKey(value: number, timeZone: string): string {
  const parts = calendarParts(value, timeZone);
  if (!parts) return "date-pending";
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day
  ).padStart(2, "0")}`;
}

export function formatDayLabel(
  value: number,
  now: number | null,
  context: LocalTimeContext
): string {
  const parsed = date(value);
  if (!parsed) return "Date pending";

  if (now !== null) {
    const match = calendarParts(value, context.timeZone);
    const today = calendarParts(now, context.timeZone);
    if (match && today) {
      const matchDay = Date.UTC(match.year, match.month - 1, match.day);
      const todayDay = Date.UTC(today.year, today.month - 1, today.day);
      const difference = Math.round((matchDay - todayDay) / 86_400_000);
      if (difference === 0) return "Today";
      if (difference === 1) return "Tomorrow";
    }
  }

  return formatter(context.locale, context.timeZone, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

export function timeZoneLabel(context: LocalTimeContext): string {
  if (!context.ready) return "UTC";
  const zoneName = formatter(context.locale, context.timeZone, {
    hour: "2-digit",
    timeZoneName: "short",
  })
    .formatToParts(new Date())
    .find((part) => part.type === "timeZoneName")?.value;
  const place = context.timeZone.replace(/_/g, " ");
  return zoneName && zoneName !== place ? `${place} (${zoneName})` : place;
}
