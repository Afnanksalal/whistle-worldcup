"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useIdentity } from "../lib/identity";
import { useRuntime } from "../lib/runtime";
import { shortAddr } from "../lib/api";

const links = [
  { href: "/", label: "Markets" },
  { href: "/groups", label: "Groups" },
  { href: "/news", label: "News" },
  { href: "/positions", label: "Positions" },
  { href: "/squads", label: "Squads" },
];

export function Nav() {
  const pathname = usePathname();
  const { owner, isConnected } = useIdentity();
  const { meta } = useRuntime();

  return (
    <header className="site-header">
      <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden />
          Whistle
        </Link>
        <nav className="nav-links">
          {links.map((l) => {
            const active =
              l.href === "/"
                ? pathname === "/"
                : pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link key={l.href} href={l.href} className={`nav-link${active ? " active" : ""}`}>
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span className="mode-pill live">Live · {meta.network}</span>
        <span className="mono" style={{ color: "var(--mute)", fontSize: "0.78rem" }}>
          {isConnected && owner ? shortAddr(owner) : "Connect wallet"}
        </span>
        <WalletMultiButton />
      </div>
    </header>
  );
}
