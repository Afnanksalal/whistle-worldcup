"use client";

import Link from "next/link";
import { NAV_LINKS } from "../lib/nav";
import { useRuntime } from "../lib/runtime";
import { BrandMark } from "./BrandMark";

const trustLinks = [
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/responsible-play", label: "Responsible play" },
];

export function SiteFooter() {
  const { meta, stakeLabel } = useRuntime();
  const stakeDisclaimer =
    meta.stakeAsset === "USDC"
      ? `Whistle stakes ${stakeLabel} on Solana ${meta.network}. Predictions involve uncertainty and are not financial advice. 18+.`
      : `Whistle currently uses ${stakeLabel} with no guaranteed monetary value. Predictions involve uncertainty and are not financial advice. 18+.`;

  return (
    <footer className="site-footer-root" aria-label="Whistle footer">
      <div className="site-footer-inner">
        <div className="site-footer-lead">
          <Link href="/" className="site-footer-brand">
            <BrandMark
              className="site-footer-lockup"
              variant="lockup"
              tone="inverse"
              accessibleLabel="Whistle"
            />
          </Link>
          <p className="site-footer-intro">
            World Cup predictions built around the match: pick a side, follow the
            pool, and see the result after the final whistle.
          </p>
        </div>

        <nav className="site-footer-nav" aria-label="Product">
          <h2 className="site-footer-heading">Explore</h2>
          <ul className="site-footer-list">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="site-footer-link">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav className="site-footer-nav" aria-label="Trust and policies">
          <h2 className="site-footer-heading">Trust</h2>
          <ul className="site-footer-list">
            {trustLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="site-footer-link">
                  {link.label}
                </Link>
              </li>
            ))}
            <li>
              <a
                href="https://github.com/Afnanksalal/whistle-worldcup"
                className="site-footer-link"
                target="_blank"
                rel="noreferrer"
              >
                Project repository
                <span className="site-footer-external" aria-hidden="true">
                  ↗
                </span>
              </a>
            </li>
          </ul>
        </nav>
      </div>

      <div className="site-footer-bottom">
        <p className="site-footer-disclaimer">{stakeDisclaimer}</p>
        <p className="site-footer-copyright">
          © {new Date().getFullYear()} Whistle
        </p>
      </div>
    </footer>
  );
}
