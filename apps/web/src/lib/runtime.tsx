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
  demoWalletEnabled?: boolean;
};

/** Presentation-only cache — never restore program/mint/cluster for txs. */
const STAKE_LABEL_CACHE_KEY = "whistle.runtime.stakeAsset";

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
  demoWalletEnabled: false,
};

function readCachedStakeAsset(): AppMeta["stakeAsset"] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STAKE_LABEL_CACHE_KEY);
    if (raw === "USDC" || raw === "units") return raw;
    // Migrate older full-meta cache if present, then drop it.
    const legacy = sessionStorage.getItem("whistle.runtime.meta");
    if (legacy) {
      sessionStorage.removeItem("whistle.runtime.meta");
      const parsed = JSON.parse(legacy) as { stakeAsset?: string };
      if (parsed.stakeAsset === "USDC" || parsed.stakeAsset === "units") {
        sessionStorage.setItem(STAKE_LABEL_CACHE_KEY, parsed.stakeAsset);
        return parsed.stakeAsset;
      }
    }
    return null;
  } catch {
    return null;
  }
}

function writeCachedStakeAsset(stakeAsset: AppMeta["stakeAsset"]) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STAKE_LABEL_CACHE_KEY, stakeAsset);
  } catch {
    // ignore quota / private mode
  }
}

function stakeLabelFor(meta: AppMeta): string {
  return meta.stakeAsset === "USDC" ? "USDC" : "units";
}

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

  useEffect(() => {
    const cached = readCachedStakeAsset();
    if (cached) {
      setMeta((prev) => ({ ...prev, stakeAsset: cached }));
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const m = await api<AppMeta>("/meta");
      setMeta(m);
      writeCachedStakeAsset(m.stakeAsset);
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
      stakeLabel: stakeLabelFor(meta),
    }),
    [meta, loading, refresh]
  );

  return <MetaCtx.Provider value={value}>{children}</MetaCtx.Provider>;
}

export function useRuntime() {
  return useContext(MetaCtx);
}
