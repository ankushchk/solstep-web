"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useSolana } from "@/hooks/useSolana";
import {
  useChallenges,
  useCreateChallenge,
  useInitEscrow,
  useJoinChallenge,
  useFinalizeChallenge,
} from "@/hooks/useChallenges";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

function formatLamports(lamports: bigint) {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

function formatTimestamp(ts: bigint): string {
  const date = new Date(Number(ts) * 1000);
  return date.toLocaleString();
}

function getTimeRemaining(endTs: bigint): string {
  const now = Math.floor(Date.now() / 1000);
  const end = Number(endTs);
  if (end < now) return "Ended";
  const diff = end - now;
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

export default function ChallengesPage() {
  const { wallet, publicKey } = useSolana();
  const { data: challenges = [], isLoading, error } = useChallenges();
  const createChallengeMutation = useCreateChallenge();
  const initEscrowMutation = useInitEscrow();
  const joinChallengeMutation = useJoinChallenge();
  const finalizeChallengeMutation = useFinalizeChallenge();

  const [creating, setCreating] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [finalizingId, setFinalizingId] = useState<string | null>(null);
  const [selectedChallenge, setSelectedChallenge] = useState<PublicKey | null>(null);
  const [txStatus, setTxStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const [stakeSol, setStakeSol] = useState("0.1");
  const [durationHours, setDurationHours] = useState("24");
  const [maxParticipants, setMaxParticipants] = useState("10");

  const now = useMemo(() => Math.floor(Date.now() / 1000), []);

  const handleCreate = async () => {
    if (!publicKey) return;
    try {
      setCreating(true);
      setTxStatus(null);
      const stakeAmountLamports = BigInt(
        Math.floor(Number(stakeSol || "0") * LAMPORTS_PER_SOL),
      );
      const duration = Number(durationHours || "24") * 60 * 60;

      const challengePda = await createChallengeMutation.mutateAsync({
        title: "SolStep Challenge",
        stakeAmountLamports,
        startTs: now,
        endTs: now + duration,
        maxParticipants: Number(maxParticipants || "10"),
      });

      await initEscrowMutation.mutateAsync(challengePda);
      setTxStatus({ type: "success", message: "Challenge created successfully!" });
      // Reset form
      setStakeSol("0.1");
      setDurationHours("24");
      setMaxParticipants("10");
    } catch (e: any) {
      console.error(e);
      const errorMsg = e?.message || e?.toString() || "Failed to create challenge";
      setTxStatus({ type: "error", message: errorMsg });
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (pubkey: PublicKey) => {
    try {
      setJoiningId(pubkey.toBase58());
      setTxStatus(null);
      await joinChallengeMutation.mutateAsync(pubkey);
      setTxStatus({ type: "success", message: "Successfully joined challenge!" });
    } catch (e: any) {
      console.error(e);
      const errorMsg = e?.message || e?.toString() || "Failed to join challenge";
      setTxStatus({ type: "error", message: errorMsg });
    } finally {
      setJoiningId(null);
    }
  };

  const handleFinalize = async (pubkey: PublicKey) => {
    try {
      setFinalizingId(pubkey.toBase58());
      setTxStatus(null);
      await finalizeChallengeMutation.mutateAsync(pubkey);
      setTxStatus({ type: "success", message: "Challenge finalized! You can now payout winners." });
    } catch (e: any) {
      console.error(e);
      const errorMsg = e?.message || e?.toString() || "Failed to finalize challenge";
      setTxStatus({ type: "error", message: errorMsg });
    } finally {
      setFinalizingId(null);
    }
  };

  // Payout / settlement is now handled on-chain via settle_challenge / timeout_challenge.
  // This page currently only exposes create / join / finalize operations.

  return (
    <main className="min-h-screen flex flex-col bg-slate-950 text-slate-50">
      <header className="px-4 pt-5 pb-3 border-b border-slate-800 bg-slate-950/95 sticky top-0 z-20">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.25em] text-amber-300/80">
              Challenges
            </p>
            <h1 className="text-xl font-semibold">
              SolStep staking challenges
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="hidden sm:inline text-xs px-3 py-1.5 rounded-full border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              Home
            </Link>
            <WalletMultiButton />
          </div>
        </div>
      </header>

      <section className="px-4 py-4 max-w-4xl mx-auto w-full flex flex-col gap-6">
        {/* Transaction Status */}
        {txStatus && (
          <div
            className={`rounded-lg border p-3 text-xs ${
              txStatus.type === "success"
                ? "bg-emerald-950/30 border-emerald-800/50 text-emerald-300"
                : "bg-red-950/30 border-red-800/50 text-red-300"
            }`}
          >
            {txStatus.message}
          </div>
        )}

        {/* Create challenge form */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 space-y-3">
          <h2 className="text-sm font-semibold">Create a new challenge</h2>
          {!publicKey && (
            <p className="text-xs text-slate-400">
              Connect your wallet to create and manage challenges.
            </p>
          )}
          <div className="grid grid-cols-3 gap-3 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-slate-300">Stake (SOL)</span>
              <input
                className="rounded-md bg-slate-950/70 border border-slate-700 px-2 py-1 text-xs"
                type="number"
                min="0"
                step="0.01"
                value={stakeSol}
                onChange={(e) => setStakeSol(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-300">Duration (hours)</span>
              <input
                className="rounded-md bg-slate-950/70 border border-slate-700 px-2 py-1 text-xs"
                type="number"
                min="1"
                step="1"
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-slate-300">Max participants</span>
              <input
                className="rounded-md bg-slate-950/70 border border-slate-700 px-2 py-1 text-xs"
                type="number"
                min="1"
                max="50"
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(e.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            disabled={!publicKey || creating}
            onClick={handleCreate}
            className="mt-1 inline-flex items-center justify-center rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 disabled:bg-slate-700 disabled:text-slate-400"
          >
            {creating ? "Creating..." : "Create challenge"}
          </button>
        </div>

        {/* Challenges list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Active challenges</h2>
            <p className="text-[0.7rem] text-slate-400">
              {status === "loading"
                ? "Loading..."
                : `${challenges.length} found`}
            </p>
          </div>
          {error && (
            <p className="text-xs text-red-400">
              Failed to load challenges: {error instanceof Error ? error.message : String(error)}
            </p>
          )}
          {challenges.length === 0 && !error && (
            <p className="text-xs text-slate-400">
              No challenges yet. Be the first to create one.
            </p>
          )}
          <div className="space-y-3">
            {challenges.map((c) => {
              const isOrganizer =
                publicKey &&
                (() => {
                  const orgAddress = c.organizer instanceof PublicKey
                    ? c.organizer.toBase58()
                    : (typeof c.organizer === "string"
                      ? c.organizer
                      : (c.organizer && typeof c.organizer === "object" && "toBase58" in c.organizer
                        ? (c.organizer as { toBase58: () => string }).toBase58()
                        : ""));
                  return publicKey.toBase58() === orgAddress;
                })();
              const isFull =
                c.participantCount >= c.maxParticipants;
              const isSelected = selectedChallenge?.equals(c.publicKey);
              const canJoin = publicKey && !isOrganizer && !isFull && !c.isFinalized;
              const isEnded = Number(c.endTs) < Math.floor(Date.now() / 1000);

              return (
                <article
                  key={c.publicKey.toBase58()}
                  className="rounded-2xl border border-slate-800 bg-slate-900/70 p-3 flex flex-col gap-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5 flex-1">
                      <p className="font-semibold text-slate-50">
                        Stake {formatLamports(c.stakeAmount)} SOL
                      </p>
                      <p className="text-[0.65rem] text-slate-400 break-all font-mono">
                        {c.publicKey.toBase58().slice(0, 8)}...{c.publicKey.toBase58().slice(-8)}
                      </p>
                      <div className="flex flex-col gap-0.5 mt-1 text-[0.7rem] text-slate-400">
                        <span>Start: {formatTimestamp(c.startTs)}</span>
                        <span>End: {formatTimestamp(c.endTs)}</span>
                        {!c.isFinalized && (
                          <span className="text-emerald-400 font-medium">
                            {getTimeRemaining(c.endTs)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[0.65rem] ${
                          c.isFinalized
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                            : isEnded
                            ? "bg-red-500/20 text-red-300 border border-red-500/40"
                            : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        }`}
                      >
                        {c.isFinalized ? "Finalized" : isEnded ? "Ended" : "Active"}
                      </span>
                      <span className="text-[0.7rem] text-slate-400">
                        {c.participantCount}/{c.maxParticipants} joined
                      </span>
                      <span className="text-[0.7rem] text-slate-500">
                        Total: {formatLamports(c.totalStake)} SOL
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-700/50">
                    <div className="text-[0.7rem] text-slate-400 flex flex-col">
                      {isOrganizer && (
                        <span className="text-amber-400 font-medium">
                          You are the organizer
                        </span>
                      )}
                      {canJoin && (
                        <span className="text-slate-300">
                          Stake {formatLamports(c.stakeAmount)} SOL to join
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {!c.isFinalized && canJoin && (
                        <button
                          type="button"
                          disabled={joiningId === c.publicKey.toBase58()}
                          onClick={() => handleJoin(c.publicKey)}
                          className="px-3 py-1.5 rounded-full bg-emerald-500/90 text-slate-950 font-medium disabled:opacity-50"
                        >
                          {joiningId === c.publicKey.toBase58()
                            ? "Joining..."
                            : "Join Challenge"}
                        </button>
                      )}
                      {isOrganizer && !c.isFinalized && (
                        <button
                          type="button"
                          disabled={finalizingId === c.publicKey.toBase58() || !isEnded}
                          onClick={() => handleFinalize(c.publicKey)}
                          className="px-3 py-1.5 rounded-full bg-amber-500/90 text-slate-950 text-[0.7rem] font-medium disabled:opacity-50"
                        >
                          {finalizingId === c.publicKey.toBase58()
                            ? "Finalizing..."
                            : "Finalize"}
                        </button>
                      )}
                      {isOrganizer && c.isFinalized && (
                        <button
                          type="button"
                          onClick={() => setSelectedChallenge(isSelected ? null : c.publicKey)}
                          className="px-3 py-1.5 rounded-full bg-purple-500/90 text-slate-950 text-[0.7rem] font-medium"
                        >
                          {isSelected ? "Cancel" : "Payout Winner"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Payout is now handled on-chain via settle_challenge instruction */}
                  {isSelected && isOrganizer && c.isFinalized && (
                    <div className="mt-2 pt-3 border-t border-slate-700/50">
                      <p className="text-[0.7rem] text-slate-400">
                        Challenge finalized. Use settle_challenge to distribute rewards on-chain.
                      </p>
                      <p className="text-[0.65rem] text-slate-500 mt-1">
                        Total pool: {formatLamports(c.totalStake)} SOL
                      </p>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}


