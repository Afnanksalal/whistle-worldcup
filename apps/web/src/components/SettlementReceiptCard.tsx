"use client";

import { useMemo, useState } from "react";
import type { SettlementReceipt } from "@whistle/shared";
import { shortAddr } from "../lib/api";
import { explorerAddressUrl, explorerTxUrl } from "../lib/explorer";
import { useRuntime } from "../lib/runtime";

type Props = {
  receipt: SettlementReceipt;
  homeName?: string;
  awayName?: string;
};

function modeLabel(mode: SettlementReceipt["mode"]): string {
  if (mode === "onchain") return "On-chain";
  if (mode === "ledger") return "Ledger";
  return mode;
}

function statusCopy(receipt: SettlementReceipt, feedLabel: string): {
  title: string;
  body: string;
  pill: string;
  pillClass: "is-ok" | "is-soft" | "is-warn";
} {
  if (receipt.onchainProofVerified) {
    return {
      title: "Result verified on-chain",
      body: `Full-time score confirmed via ${feedLabel}. Merkle root matched on Solana.`,
      pill: "Root verified",
      pillClass: "is-ok",
    };
  }
  if (receipt.validationOk) {
    return {
      title: "Result validated",
      body: `Full-time score confirmed via ${feedLabel}. On-chain Merkle root is still pending or unavailable.`,
      pill: "Feed validated",
      pillClass: "is-soft",
    };
  }
  return {
    title: "Settlement recorded",
    body: `Score stored for settlement. ${feedLabel} validation did not fully confirm this receipt.`,
    pill: "Unconfirmed",
    pillClass: "is-warn",
  };
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function ProofRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="settlement-proof-row">
      <dt>{label}</dt>
      <dd>
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" className="mono settlement-proof-link">
            {shortAddr(value)}
            <span aria-hidden="true">↗</span>
          </a>
        ) : (
          <span className="mono">{value.length > 24 ? shortAddr(value) : value}</span>
        )}
        <button
          type="button"
          className="settlement-copy-btn"
          onClick={async () => {
            const ok = await copyText(value);
            if (ok) {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            }
          }}
          aria-label={`Copy ${label}`}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </dd>
    </div>
  );
}

export function SettlementReceiptCard({ receipt, homeName, awayName }: Props) {
  const { meta } = useRuntime();
  const [open, setOpen] = useState(false);

  const feedLabel =
    meta.fixtureSource === "txline" || meta.txlineConfigured ? "TxLINE" : "match feed";
  const status = statusCopy(receipt, feedLabel);
  const checkedAt = new Date(receipt.validatedAt);
  const scoreline = `${receipt.homeScore}–${receipt.awayScore}`;
  const matchLabel =
    homeName && awayName ? `${homeName} ${scoreline} ${awayName}` : `Final score ${scoreline}`;

  const facts = useMemo(() => {
    const proofNodes =
      (receipt.merkle.mainTreeProofNodes ?? 0) + (receipt.merkle.subTreeProofNodes ?? 0);
    const rows: { label: string; value: string }[] = [
      { label: "Mode", value: modeLabel(receipt.mode) },
      {
        label: "Checked",
        value: new Date(receipt.validatedAt).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }),
      },
    ];
    if (receipt.merkle.epochDay != null) {
      rows.push({ label: "Epoch day", value: String(receipt.merkle.epochDay) });
    }
    if (proofNodes > 0) {
      rows.push({ label: "Proof nodes", value: String(proofNodes) });
    }
    if (receipt.merkle.statsCount != null) {
      rows.push({ label: "Stats", value: String(receipt.merkle.statsCount) });
    }
    rows.push({ label: "Sequence", value: String(receipt.seq) });
    if (receipt.marketIds?.length) {
      rows.push({
        label: "Markets",
        value: String(receipt.marketIds.length),
      });
    }
    return rows;
  }, [receipt]);

  const network = meta.network;

  return (
    <section className="settlement-receipt" aria-label="Settlement receipt">
      <div className="settlement-receipt-head">
        <div>
          <p className="section-kicker">Settlement receipt</p>
          <h3>{status.title}</h3>
          <p>
            {matchLabel}. {status.body}
          </p>
        </div>
        <span className={`receipt-pill ${status.pillClass}`}>{status.pill}</span>
      </div>

      <dl className="settlement-receipt-grid">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>
              {fact.label === "Checked" ? (
                <time dateTime={checkedAt.toISOString()}>{fact.value}</time>
              ) : (
                fact.value
              )}
            </dd>
          </div>
        ))}
      </dl>

      {receipt.proofSummary && (
        <p className="settlement-receipt-summary">{receipt.proofSummary}</p>
      )}

      {receipt.settleTxSig && (
        <p className="settlement-receipt-tx">
          <span>Settle transaction</span>
          <a
            className="mono settlement-proof-link"
            href={explorerTxUrl(receipt.settleTxSig, network)}
            target="_blank"
            rel="noreferrer"
          >
            {shortAddr(receipt.settleTxSig)}
            <span aria-hidden="true">↗</span>
          </a>
        </p>
      )}

      <button
        type="button"
        className="btn btn-secondary settlement-receipt-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? "Hide proof detail" : "Show proof detail"}
      </button>

      {open && (
        <dl className="settlement-receipt-tech">
          {receipt.merkle.dailyScoresPda && (
            <ProofRow
              label="Daily scores PDA"
              value={receipt.merkle.dailyScoresPda}
              href={explorerAddressUrl(receipt.merkle.dailyScoresPda, network)}
            />
          )}
          {receipt.merkle.eventStatRoot && (
            <ProofRow label="Event-stat root" value={receipt.merkle.eventStatRoot} />
          )}
          {receipt.merkle.mainTreeProofNodes != null && (
            <ProofRow
              label="Main-tree nodes"
              value={String(receipt.merkle.mainTreeProofNodes)}
            />
          )}
          {receipt.merkle.subTreeProofNodes != null && (
            <ProofRow
              label="Sub-tree nodes"
              value={String(receipt.merkle.subTreeProofNodes)}
            />
          )}
          {receipt.rawValidation != null && (
            <div className="settlement-proof-raw">
              <dt>Validation payload</dt>
              <dd>
                <pre>{JSON.stringify(receipt.rawValidation, null, 2).slice(0, 4000)}</pre>
              </dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
