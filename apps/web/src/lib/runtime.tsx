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

const META_CACHE_KEY = "whistle.runtime.meta";

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

function readCachedMeta(): AppMeta | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(META_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppMeta>;
    if (parsed.stakeAsset !== "USDC" && parsed.stakeAsset !== "units") return null;
    return { ...defaultMeta, ...parsed };
  } catch {
    return null;
  }
}

function writeCachedMeta(meta: AppMeta) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(META_CACHE_KEY, JSON.stringify(meta));
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
    const cached = readCachedMeta();
    if (cached) {
      setMeta(cached);
      setLoading(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const m = await api<AppMeta>("/meta");
      setMeta(m);
      writeCachedMeta(m);
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
