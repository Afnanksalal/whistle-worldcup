import { cache } from "react";
import type { Fixture } from "@whistle/shared";

type FixtureResponse = {
  fixture?: Fixture;
};

type FixturesResponse = {
  fixtures?: Fixture[];
};

function internalApiUrl(path: string): string {
  const configured = process.env.INTERNAL_API_URL?.trim();
  const base = configured || "http://127.0.0.1:4000";
  return `${base.replace(/\/$/, "")}/api${path}`;
}

export const getFixtureForSeo = cache(async (id: string): Promise<Fixture | null> => {
  try {
    const response = await fetch(internalApiUrl(`/fixtures/${encodeURIComponent(id)}`), {
      next: { revalidate: 60 },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as FixtureResponse;
    return payload.fixture || null;
  } catch {
    return null;
  }
});

export async function getFixturesForSeo(): Promise<Fixture[]> {
  try {
    const response = await fetch(internalApiUrl("/fixtures"), {
      next: { revalidate: 900 },
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as FixturesResponse;
    return Array.isArray(payload.fixtures) ? payload.fixtures : [];
  } catch {
    return [];
  }
}
