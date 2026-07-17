"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useState } from "react";
import { api } from "../lib/api";
import { useRuntime } from "../lib/runtime";

type FundResponse = {
  usdcBalance: number;
  solBalance: number;
};

export function DemoWalletFund() {
  const { meta } = useRuntime();
  const { publicKey, connected } = useWallet();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const fund = useCallback(async () => {
    if (!publicKey) return;
    setBusy(true);
    setNote(null);
    try {
      const result = await api<FundResponse>("/demo/fund", {
        method: "POST",
        body: JSON.stringify({ wallet: publicKey.toBase58(), usdcAmount: 500 }),
      });
      setNote(`${result.usdcBalance.toFixed(0)} USDC · ${result.solBalance.toFixed(3)} SOL`);
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Funding failed");
    } finally {
      setBusy(false);
    }
  }, [publicKey]);

  if (!meta.demoWalletEnabled) return null;

  return (
    <div className="demo-wallet-fund">
      <button
        type="button"
        className="btn btn-secondary demo-wallet-fund-btn"
        disabled={!connected || busy}
        onClick={() => void fund()}
      >
        {busy ? "Funding…" : "Get demo USDC"}
      </button>
      {note && <span className="demo-wallet-fund-note">{note}</span>}
    </div>
  );
}
