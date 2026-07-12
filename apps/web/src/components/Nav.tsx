"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useIdentity } from "../lib/identity";
import { shortAddr } from "../lib/api";

const links = [
  { href: "/", label: "Fixtures" },
  { href: "/positions", label: "Positions" },
  { href: "/squads", label: "Squads" },
];

export function Nav() {
  const pathname = usePathname();
  const { owner, isConnected } = useIdentity();

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
        padding: "1.1rem 1.5rem",
        borderBottom: "1px solid var(--line)",
        position: "sticky",
        top: 0,
        zIndex: 40,
        backdropFilter: "blur(12px)",
        background: "rgba(8, 20, 13, 0.75)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "1.75rem" }}>
        <Link href="/" className="display" style={{ fontSize: "1.35rem", fontWeight: 800 }}>
          Whistle
        </Link>
        <nav style={{ display: "flex", gap: "1rem" }}>
          {links.map((l) => {
            const active = pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  color: active ? "var(--amber)" : "var(--chalk-dim)",
                  fontWeight: active ? 700 : 500,
                  fontSize: "0.95rem",
                }}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span style={{ color: "var(--chalk-dim)", fontSize: "0.85rem" }}>
          {isConnected ? shortAddr(owner) : owner}
        </span>
        <WalletMultiButton />
      </div>
    </header>
  );
}
