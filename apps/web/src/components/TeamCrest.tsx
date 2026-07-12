"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { FixtureTeam } from "@whistle/shared";
import styles from "./TeamCrest.module.css";

type TeamCrestVariant = "default" | "small" | "featured" | "hero";

type TeamCrestProps = {
  team: FixtureTeam;
  variant?: TeamCrestVariant;
  decorative?: boolean;
  className?: string;
};

const variantClasses: Record<TeamCrestVariant, string> = {
  default: "",
  small: styles.teamCrestSmall,
  featured: styles.teamCrestFeatured,
  hero: styles.teamCrestHero,
};

export function teamShortCode(name: string, shortName?: string) {
  if (shortName?.trim()) return shortName.trim().slice(0, 3).toUpperCase();

  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map((word) => word[0]).join("").slice(0, 3).toUpperCase();
}

function safeTeamLogo(logo?: string) {
  if (!logo) return null;
  try {
    const url = new URL(logo);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function TeamCrest({
  team,
  variant = "default",
  decorative = true,
  className,
}: TeamCrestProps) {
  const logo = safeTeamLogo(team.logo);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [logo]);

  const classes = [
    styles.teamCrestRoot,
    variantClasses[variant],
    className,
  ].filter(Boolean).join(" ");

  return (
    <span
      className={classes}
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : `${team.name} crest`}
      title={decorative ? undefined : team.name}
    >
      {logo && !imageFailed ? (
        <Image
          className={styles.teamCrestImage}
          src={logo}
          alt=""
          width={96}
          height={96}
          unoptimized
          draggable={false}
          onError={() => setImageFailed(true)}
        />
      ) : (
        teamShortCode(team.name, team.shortName)
      )}
    </span>
  );
}
