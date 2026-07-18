"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useCallback, useState } from "react";
import { api } from "../lib/api";
import { useIdentity } from "../lib/identity";
import { useRuntime } from "../lib/runtime";

type FundResponse = {
  usdcBalance: number;
  solBalance: number;
};

export function DemoWalletFund() {
  const { meta } = useRuntime();
  const { publicKey, connected } = useWallet();
  const { withWalletAuth, ready } = useIdentity();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const fund = useCallback(async () => {
    if (!publicKey) return;
    setBusy(true);
    setNote(null);
    try {
      const headers = await withWalletAuth({ required: true });
      const result = await api<FundResponse>("/demo/fund", {
        method: "POST",
        headers,
        body: JSON.stringify({ wallet: publicKey.toBase58(), usdcAmount: 500 }),
      });
      setNote(`${result.usdcBalance.toFixed(0)} USDC · ${result.solBalance.toFixed(3)} SOL`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Funding failed";
      setNote(
        /signed challenge|wallet identity/i.test(message)
          ? "Sign the wallet challenge to receive demo funds."
          : message
      );
    } finally {
      setBusy(false);
    }
  }, [publicKey, withWalletAuth]);

  if (!meta.demoWalletEnabled) return null;

  return (
    <div className="demo-wallet-fund">
      <button
        type="button"
        className="btn btn-secondary demo-wallet-fund-btn"
        disabled={!connected || !ready || busy}
        onClick={() => void fund()}
        title={note || "Request demo USDC for this wallet"}
        aria-label={busy ? "Funding demo wallet" : "Get demo USDC"}
      >
        {busy ? (
          "Funding…"
        ) : (
          <>
            <span className="demo-wallet-fund-label-full">Get demo USDC</span>
            <span className="demo-wallet-fund-label-short">Demo USDC</span>
          </>
        )}
      </button>
      {note && (
        <span className="demo-wallet-fund-note" role="status">
          {note}
        </span>
      )}
    </div>
  );
}
