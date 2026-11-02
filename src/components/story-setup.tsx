"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client-api";
import { formatEther } from "viem";
type Setup = {
  network: string;
  chainId: number;
  nativeSymbol?: string;
  address?: string;
  balanceWei?: string;
  signerConfigured: boolean;
  contractConfigured: boolean;
  ready: boolean;
};
export default function StorySetup() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function refresh() {
    setBusy(true);
    try {
      setSetup(await api("story-setup"));
      setMessage("");
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Could not check Story setup.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <section className="panel">
      <h3>Story testnet licensing</h3>
      <p className="muted">
        Aeneid only · chain 1315 · no real-money purchases
      </p>
      {setup?.address && (
        <>
          <label>Dedicated test gas sponsor</label>
          <p style={{ overflowWrap: "anywhere" }}>{setup.address}</p>
          <p>
            Balance:{" "}
            {Number(formatEther(BigInt(setup.balanceWei || "0"))).toFixed(4)}{" "}
            {setup.nativeSymbol || "test tokens"}
          </p>
        </>
      )}
      {setup && (
        <p>
          {setup.ready
            ? "Ready for test registrations and licenses."
            : !setup.signerConfigured
              ? "The stage team is configuring the dedicated test signer."
              : !setup.balanceWei || BigInt(setup.balanceWei) === 0n
                ? "Fund this address with free Aeneid test tokens to continue."
                : !setup.contractConfigured
                  ? "The test sponsor is funded. Registration collection setup is next."
                  : "The stage team needs to complete test-account setup."}
        </p>
      )}
      <p className="fine-print">
        The app covers approved test gas, capped at 0.1 native test tokens per
        transaction. License recipients are app-managed Aeneid test accounts,
        separate from Privy wallets. Contributor shares are preserved.
      </p>
      <button
        className="btn secondary"
        disabled={busy}
        onClick={() => void refresh()}
      >
        {busy ? "Checking…" : "Refresh testnet status"}
      </button>
      {message && <p role="status">{message}</p>}
    </section>
  );
}
