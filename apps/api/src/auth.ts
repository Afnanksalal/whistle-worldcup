import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";
import nacl from "tweetnacl";
import bs58 from "bs58";
import type { AppConfig } from "./config";

const challenges = new Map<string, { message: string; expiresAt: number }>();

export function issueChallenge(wallet: string): { nonce: string; message: string; expiresAt: number } {
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = Date.now() + 5 * 60 * 1000;
  const message = `Whistle auth\nWallet: ${wallet}\nNonce: ${nonce}\nExpires: ${expiresAt}`;
  challenges.set(nonce, { message, expiresAt });
  for (const [k, v] of challenges) {
    if (v.expiresAt < Date.now()) challenges.delete(k);
  }
  return { nonce, message, expiresAt };
}

export function consumeChallenge(nonce: string): string | null {
  const c = challenges.get(nonce);
  challenges.delete(nonce);
  if (!c || c.expiresAt < Date.now()) return null;
  return c.message;
}

export function isValidSolanaAddress(addr: string): boolean {
  try {
    return bs58.decode(addr).length === 32;
  } catch {
    return false;
  }
}

export function verifyWalletSignature(args: {
  wallet: string;
  message: string;
  signatureBase58: string;
}): boolean {
  try {
    const pubkey = bs58.decode(args.wallet);
    const sig = bs58.decode(args.signatureBase58);
    const msg = new TextEncoder().encode(args.message);
    return nacl.sign.detached.verify(msg, sig, pubkey);
  } catch {
    return false;
  }
}

function header(req: Request, name: string): string {
  const v = req.header(name);
  return typeof v === "string" ? v.trim() : "";
}

function secretsEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function requireAdmin(cfg: AppConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const provided =
      header(req, "x-admin-key") ||
      header(req, "authorization").replace(/^Bearer\s+/i, "");
    if (!provided || !secretsEqual(provided, cfg.adminApiKey)) {
      return res.status(401).json({ error: "unauthorized" });
    }
    next();
  };
}

export function requireWalletOwner(cfg: AppConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const owner = String(req.body?.owner || req.body?.member || req.body?.creator || "");
    if (!owner) return res.status(400).json({ error: "owner required" });

    if (!isValidSolanaAddress(owner)) {
      return res.status(400).json({ error: "owner must be a Solana wallet address" });
    }

    if (!cfg.requireWalletAuth) {
      return next();
    }

    const wallet = header(req, "x-wallet") || owner;
    if (wallet !== owner) {
      return res.status(401).json({ error: "wallet identity required" });
    }

    const nonce = header(req, "x-wallet-nonce");
    const signature = header(req, "x-wallet-signature");
    const expected = consumeChallenge(nonce);
    if (!expected || !signature) {
      return res.status(401).json({ error: "valid signed challenge required" });
    }
    if (!verifyWalletSignature({ wallet, message: expected, signatureBase58: signature })) {
      return res.status(401).json({ error: "invalid wallet signature" });
    }
    next();
  };
}
