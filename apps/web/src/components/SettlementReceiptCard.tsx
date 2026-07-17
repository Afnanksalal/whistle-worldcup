"use client";

import { useState } from "react";
import type { SettlementReceipt } from "@whistle/shared";

export function SettlementReceiptCard({ receipt }: { receipt: SettlementReceipt }) {
  const [open, setOpen] = useState(false);
  const when = new Date(receipt.validatedAt).toLocaleString();

  return (
    <section className="settlement-receipt" aria-label="Settlement receipt">
      <div className="settlement-receipt-head">
        <div>
          <p className="section-kicker">Verified result</p>
          <h3>Full-time settled with TxLINE</h3>
          <p>
            Final score {receipt.homeScore}–{receipt.awayScore}. Sequence {String(receipt.seq)}.
            {receipt.onchainProofVerified
              ? " On-chain Merkle root confirmed."
              : " Validation payload stored; on-chain root pending or unavailable."}
          </p>
        </div>
        <span className={`receipt-pill ${receipt.onchainProofVerified ? "is-ok" : "is-soft"}`}>
          {receipt.onchainProofVerified ? "Root verified" : "API validated"}
        </span>
      </div>

      <dl className="settlement-receipt-grid">
        <div>
          <dt>Mode</dt>
          <dd>{receipt.mode}</dd>
        </div>
        <div>
          <dt>Checked</dt>
          <dd>
            <time dateTime={new Date(receipt.validatedAt).toISOString()}>{when}</time>
          </dd>
        </div>
        <div>
          <dt>Epoch day</dt>
          <dd>{receipt.merkle.epochDay ?? "—"}</dd>
        </div>
        <div>
          <dt>Proof nodes</dt>
          <dd>
            {(receipt.merkle.mainTreeProofNodes ?? 0) + (receipt.merkle.subTreeProofNodes ?? 0)}
          </dd>
        </div>
      </dl>

      {receipt.proofSummary && (
        <p className="settlement-receipt-summary">{receipt.proofSummary}</p>
      )}

      {receipt.settleTxSig && (
        <p className="settlement-receipt-tx mono">Settle sig · {receipt.settleTxSig}</p>
      )}

      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        {open ? "Hide proof detail" : "Show proof detail"}
      </button>

      {open && (
        <div className="settlement-receipt-tech">
          <p className="mono">PDA {receipt.merkle.dailyScoresPda || "—"}</p>
          <p className="mono">Root {receipt.merkle.eventStatRoot || "—"}</p>
          {receipt.rawValidation != null && (
            <pre>{JSON.stringify(receipt.rawValidation, null, 2).slice(0, 4000)}</pre>
          )}
        </div>
      )}
    </section>
  );
}
