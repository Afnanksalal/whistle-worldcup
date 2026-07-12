const LOCAL_SITE_URL = "http://localhost:3000";

function normalizeSiteUrl(raw: string | undefined): URL {
  const value = raw?.trim() || LOCAL_SITE_URL;
  const url = new URL(value);

  if (!url.hostname) {
    throw new Error("NEXT_PUBLIC_SITE_URL must include a hostname");
  }

  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (!isLocal && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SITE_URL must use HTTPS outside local development");
  }

  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

export function getSiteUrl(): URL {
  return normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
}

export function absoluteUrl(path = "/"): string {
  return new URL(path, getSiteUrl()).toString();
}
