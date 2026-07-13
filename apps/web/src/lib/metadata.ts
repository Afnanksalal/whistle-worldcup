import type { Metadata } from "next";

export const SITE_NAME = "Whistle";
export const SITE_TITLE = "Whistle — World Cup 2026 match prediction pools";
export const SITE_DESCRIPTION =
  "Follow World Cup 2026 fixtures, make match predictions, track parimutuel pools, and see outcomes after the final whistle.";
export const SOCIAL_IMAGE = {
  url: "/brand/whistle-social-card.png",
  width: 1200,
  height: 630,
  alt: "Whistle — World Cup 2026 match prediction pools",
};

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  index?: boolean;
};

export function createPageMetadata({
  title,
  description,
  path,
  index = true,
}: PageMetadataOptions): Metadata {
  const robots: Metadata["robots"] = index
    ? {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
          "max-video-preview": -1,
        },
      }
    : {
        index: false,
        follow: false,
        nocache: true,
        googleBot: {
          index: false,
          follow: false,
          noimageindex: true,
        },
      };

  return {
    title,
    description,
    alternates: {
      canonical: path,
      languages: {
        en: path,
        "x-default": path,
      },
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: SITE_NAME,
      title,
      description,
      url: path,
      images: [SOCIAL_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [SOCIAL_IMAGE.url],
    },
    robots,
  };
}
