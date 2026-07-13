"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";
import { useRuntime } from "../lib/runtime";
import { BrandMark } from "./BrandMark";

const links = [
  { href: "/", label: "Matches", short: "Matches", icon: "matches" },
  { href: "/groups", label: "Tournament", short: "Groups", icon: "tournament" },
  { href: "/news", label: "News", short: "News", icon: "news" },
  { href: "/positions", label: "My picks", short: "My picks", icon: "picks" },
  { href: "/squads", label: "Squads", short: "Squads", icon: "squads" },
] as const;

function NavGlyph({ name }: { name: (typeof links)[number]["icon"] }) {
  return (
    <span className="mobile-nav-icon-frame" aria-hidden="true">
      <svg
        className="mobile-nav-icon"
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        {name === "matches" && (
          <>
            <circle cx="12" cy="12" r="8.25" />
            <path d="m12 8.4 3 2.15-1.15 3.5h-3.7L9 10.55 12 8.4Z" />
            <path d="m12 3.75 0 4.65M4.15 9.7 9 10.55m-1.9 7.7 3.05-4.2m6.75 4.2-3.05-4.2m6-4.35L15 10.55" />
          </>
        )}
        {name === "tournament" && (
          <>
            <path d="M8 4.25h8v3.1c0 3.25-1.55 5.55-4 6.45-2.45-.9-4-3.2-4-6.45v-3.1Z" />
            <path d="M8 6H4.75v1.1c0 2.25 1.2 3.7 3.75 4.15M16 6h3.25v1.1c0 2.25-1.2 3.7-3.75 4.15M12 13.8v3.3m-3.25 2.65h6.5M10 17.1h4" />
          </>
        )}
        {name === "news" && (
          <>
            <path d="M6.25 4.25h11.5v15.5H6.25z" />
            <path d="M8.8 7.5h6.4M8.8 10.5h6.4M8.8 13.5h4.35M8.8 16.5h5.2" />
          </>
        )}
        {name === "picks" && (
          <>
            <path d="M5 5.25h14v4a2.75 2.75 0 0 0 0 5.5v4H5v-4a2.75 2.75 0 0 0 0-5.5v-4Z" />
            <path d="m9.25 12 1.8 1.8 3.8-4" />
          </>
        )}
        {name === "squads" && (
          <>
            <circle cx="9" cy="9" r="2.75" />
            <circle cx="16.5" cy="10" r="2.1" />
            <path d="M3.9 18.75c.35-3.25 2.1-5 5.1-5s4.75 1.75 5.1 5m.65-4.2c2.8-.25 4.5 1.15 4.85 3.75" />
          </>
        )}
      </svg>
    </span>
  );
}

function isActive(pathname: string, href: string) {
  return href === "/"
    ? pathname === "/"
    : pathname === href || pathname.startsWith(`${href}/`);
}

function MountedWalletButton() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <button
        className="wallet-adapter-button wallet-adapter-button-trigger"
        type="button"
        aria-busy="true"
        aria-label="Wallet controls loading"
        disabled
      >
        Select Wallet
      </button>
    );
  }

  return <WalletMultiButton />;
}

export function Nav() {
  const pathname = usePathname();
  const { meta } = useRuntime();
  const dataIsLive = meta.txlineConfigured;
  const isHome = pathname === "/";
  const [hasScrolled, setHasScrolled] = useState(false);

  useEffect(() => {
    if (!isHome) {
      setHasScrolled(false);
      return;
    }

    const updateHeader = () => setHasScrolled(window.scrollY > 20);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, [isHome]);

  return (
    <>
      <header
        className={`site-header${isHome ? " is-home" : ""}${
          hasScrolled ? " is-scrolled" : ""
        }`}
      >
        <div className="nav-shell">
          <div className="nav-leading">
            <Link href="/" className="brand" aria-label="Whistle home">
              <BrandMark
                className="brand-logo"
                variant="mark"
                accessibleLabel={null}
                compact
              />
              <span className="brand-wordmark" aria-hidden="true">
                WHISTLE
              </span>
            </Link>
            <nav className="nav-links" aria-label="Primary navigation">
              {links.map((link) => {
                const active = isActive(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`nav-link${active ? " active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="nav-actions">
            <span className={`data-status${dataIsLive ? " is-live" : " is-preview"}`}>
              <span className="data-status-dot" aria-hidden />
              {dataIsLive ? "Live match feed" : "Schedule preview"}
            </span>
            <MountedWalletButton />
          </div>
        </div>
      </header>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {links.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`mobile-nav-link${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <NavGlyph name={link.icon} />
              <span className="mobile-nav-label">{link.short}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
