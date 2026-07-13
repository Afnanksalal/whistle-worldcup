import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Whistle — World Cup 2026 match pools",
    short_name: "Whistle",
    description:
      "Follow World Cup 2026 fixtures, make match predictions, and track parimutuel pools through the final whistle.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    lang: "en",
    dir: "ltr",
    background_color: "#EEF1EB",
    theme_color: "#173F33",
    categories: ["sports", "entertainment"],
    icons: [
      {
        src: "/icons/whistle-192.png?v=20260714",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/whistle-512.png?v=20260714",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/whistle-maskable-512.png?v=20260714",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Matches",
        short_name: "Matches",
        description: "Open the World Cup match board",
        url: "/",
        icons: [
          {
            src: "/icons/whistle-192.png?v=20260714",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
      {
        name: "Tournament",
        short_name: "Tournament",
        description: "Open fixtures, results, and group context",
        url: "/groups",
        icons: [
          {
            src: "/icons/whistle-192.png?v=20260714",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
    ],
  };
}
