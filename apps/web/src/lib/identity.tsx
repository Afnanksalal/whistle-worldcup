"use client";

import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

type IdentityCtx = {
  owner: string;
  setDemoName: (name: string) => void;
  isConnected: boolean;
};

const Ctx = createContext<IdentityCtx>({
  owner: "guest",
  setDemoName: () => undefined,
  isConnected: false,
});

export function IdentityProvider({ children }: { children: ReactNode }) {
  const wallet = useWallet();
  const [demo, setDemo] = useState("fan-" + Math.random().toString(36).slice(2, 6));

  useEffect(() => {
    const saved = localStorage.getItem("whistle_demo_owner");
    if (saved) setDemo(saved);
  }, []);

  const setDemoName = (name: string) => {
    const v = name.trim() || demo;
    setDemo(v);
    localStorage.setItem("whistle_demo_owner", v);
  };

  const value = useMemo(
    () => ({
      owner: wallet.publicKey?.toBase58() || demo,
      setDemoName,
      isConnected: !!wallet.publicKey,
    }),
    [wallet.publicKey, demo]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useIdentity() {
  return useContext(Ctx);
}
