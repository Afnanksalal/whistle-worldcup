import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, IBM_Plex_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { JsonLd } from "../components/JsonLd";
import { Nav } from "../components/Nav";
import { Providers } from "../components/Providers";
import { SiteFooter } from "../components/SiteFooter";
import {
  createPageMetadata,
  SOCIAL_IMAGE,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
} from "../lib/metadata";
import { absoluteUrl, getSiteUrl } from "../lib/site";

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const displayFont = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const dataFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-data",
  display: "swap",
});

const homeMetadata = createPageMetadata({
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  path: "/",
});

export const metadata: Metadata = {
  ...homeMetadata,
  metadataBase: getSiteUrl(),
  applicationName: SITE_NAME,
  title: {
    default: SITE_TITLE,
    template: "%s | Whistle",
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "World Cup 2026",
    "football predictions",
    "AI football forecasts",
    "World Cup fixtures",
    "World Cup pools",
    "parimutuel prediction pools",
    "live football scores",
    "TxLINE",
  ],
  category: "sports",
  classification: "Sports prediction application",
  creator: SITE_NAME,
  publisher: SITE_NAME,
  referrer: "strict-origin-when-cross-origin",
  manifest: "/manifest.webmanifest",
  formatDetection: {
    telephone: false,
    address: false,
    email: false,
  },
  icons: {
    icon: [
      {
        url: "/icons/whistle-192.png?v=20260714",
        type: "image/png",
        sizes: "192x192",
      },
    ],
    apple: [
      {
        url: "/icons/whistle-apple-v2-180.png?v=20260714",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: SITE_NAME,
  },
  other: {
    "mobile-web-app-capable": "yes",
    "application-name": SITE_NAME,
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EEF1EB" },
    { media: "(prefers-color-scheme: dark)", color: "#173F33" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: absoluteUrl("/"),
      description: SITE_DESCRIPTION,
      inLanguage: "en",
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      url: absoluteUrl("/"),
      description: SITE_DESCRIPTION,
      applicationCategory: "SportsApplication",
      applicationSubCategory: "Football prediction pools",
      operatingSystem: "Web",
      browserRequirements:
        "Requires a modern web browser; wallet connection is optional for public match views.",
      isAccessibleForFree: true,
      image: absoluteUrl(SOCIAL_IMAGE.url),
      brand: {
        "@type": "Brand",
        name: SITE_NAME,
        logo: absoluteUrl("/brand/whistle-logo.png"),
      },
      sameAs: ["https://github.com/Afnanksalal/whistle-worldcup"],
      featureList: [
        "World Cup 2026 fixtures and match status",
        "Parimutuel match prediction pools",
        "Evidence-labelled match forecasts",
        "Tournament standings and match road",
        "Matchday news and evidence-based insights",
        "Private squad leaderboards",
      ],
    },
  ];

  return (
    <html lang="en" dir="ltr">
      <head>
        <link rel="preconnect" href="https://r2.thesportsdb.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://r2.thesportsdb.com" />
      </head>
      <body className={`${bodyFont.variable} ${displayFont.variable} ${dataFont.variable}`}>
        <JsonLd data={structuredData} />
        <Providers>
          <a className="skip-link" href="#main-content">
            Skip to content
          </a>
          <div className="app-frame">
            <Nav />
            {children}
            <SiteFooter />
          </div>
        </Providers>
      </body>
    </html>
  );
}
