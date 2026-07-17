"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";

export type AppMeta = {
  mode: "live";
  network: string;
  settlementRail: "ledger" | "onchain";
  stakeAsset: "USDC" | "units";
  whistleProgramId: string | null;
  usdcMint: string | null;
  platformFeeBps: number;
  requireWalletAuth: boolean;
  txlineConfigured: boolean;
  fixtureSource?: "txline" | "thesportsdb";
  keepSettleEnabled: boolean;
  newsConfigured?: boolean;
};

const defaultMeta: AppMeta = {
  mode: "live",
  network: "devnet",
  settlementRail: "ledger",
  stakeAsset: "units",
  whistleProgramId: null,
  usdcMint: null,
  platformFeeBps: 0,
  requireWalletAuth: true,
  txlineConfigured: false,
  fixtureSource: "thesportsdb",
  keepSettleEnabled: true,
};

type Ctx = {
  meta: AppMeta;
  loading: boolean;
  refresh: () => Promise<void>;
  stakeLabel: string;
};

const MetaCtx = createContext<Ctx>({
  meta: defaultMeta,
  loading: true,
  refresh: async () => undefined,
  stakeLabel: "units",
});

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<AppMeta>(defaultMeta);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const m = await api<AppMeta>("/meta");
      setMeta(m);
    } catch {
      // keep last known
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  const value = useMemo(
    () => ({
      meta,
      loading,
      refresh,
      stakeLabel: meta.stakeAsset === "USDC" ? "USDC" : "units",
    }),
    [meta, loading, refresh]
  );

  return <MetaCtx.Provider value={value}>{children}</MetaCtx.Provider>;
}

export function useRuntime() {
  return useContext(MetaCtx);
}
