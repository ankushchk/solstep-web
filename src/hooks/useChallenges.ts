"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { useAnchorProgram } from "@/hooks/useAnchorProgram";
import { Buffer } from "buffer";

export type ChallengeAccount = {
  publicKey: PublicKey;
  organizer: PublicKey;
  stakeAmount: bigint;
  startTs: bigint;
  endTs: bigint;
  maxParticipants: number;
  participantCount: number;
  totalStake: bigint;
  isFinalized: boolean;
  participants?: PublicKey[];
};

type Status = "idle" | "loading" | "ready" | "error";

export function useChallenges() {
  const { program, error: programError } = useAnchorProgram();
  const wallet = useWallet();

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [challenges, setChallenges] = useState<ChallengeAccount[]>([]);

  const refresh = useCallback(async () => {
    if (!program) {
      setStatus("idle");
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const accounts = await program.account.challenge.all();
      const parsed: ChallengeAccount[] = accounts.map((a) => ({
        publicKey: a.publicKey,
        organizer: a.account.organizer,
        stakeAmount: BigInt(a.account.stakeAmount.toString()),
        startTs: BigInt(a.account.startTs.toString()),
        endTs: BigInt(a.account.endTs.toString()),
        maxParticipants: a.account.maxParticipants,
        participantCount: a.account.participantCount,
        totalStake: BigInt(a.account.totalStake.toString()),
        isFinalized: a.account.isFinalized,
        participants: a.account.participants
          ? a.account.participants
              .filter((p: any) => {
                if (!p) return false;
                // Handle both PublicKey objects and string/array formats
                try {
                  const pubkey = p instanceof PublicKey ? p : new PublicKey(p);
                  return !pubkey.equals(PublicKey.default);
                } catch {
                  return false;
                }
              })
              .map((p: any) => (p instanceof PublicKey ? p : new PublicKey(p)))
          : [],
      }));
      setChallenges(parsed);
      setStatus("ready");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load challenges");
      setStatus("error");
    }
  }, [program]);

  useEffect(() => {
    if (!program) {
      setStatus("idle");
      setChallenges([]);
      return;
    }
    void refresh();
  }, [program, refresh]);

  const createChallenge = useCallback(
    async (params: {
      stakeAmountLamports: bigint;
      startTs: number;
      endTs: number;
      maxParticipants: number;
    }) => {
      if (!wallet.connected) {
        throw new Error(
          "Wallet not connected. Please connect your wallet first."
        );
      }

      if (!wallet.publicKey) {
        throw new Error(
          "Wallet public key not available. Please try reconnecting your wallet."
        );
      }

      if (!wallet.signTransaction || !wallet.signAllTransactions) {
        throw new Error(
          "Wallet signing functions not available. Please ensure your wallet is fully connected."
        );
      }

      if (!program) {
        throw new Error(
          "Solana program not initialized. Please ensure your wallet is connected and try again."
        );
      }

      const [challengePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("challenge"), wallet.publicKey.toBuffer()],
        program.programId
      );

      await program.methods
        .createChallenge(
          params.stakeAmountLamports,
          params.startTs,
          params.endTs,
          params.maxParticipants
        )
        .accounts({
          organizer: wallet.publicKey,
          challenge: challengePda,
        })
        .rpc();

      await refresh();
      return challengePda;
    },
    [program, wallet.connected, wallet.publicKey, refresh]
  );

  const initEscrow = useCallback(
    async (challengePubkey: PublicKey) => {
      if (!wallet.connected || !wallet.publicKey) {
        throw new Error(
          "Wallet not connected. Please connect your wallet first."
        );
      }

      if (!program) {
        throw new Error(
          "Solana program not initialized. Please ensure your wallet is connected."
        );
      }

      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), challengePubkey.toBuffer()],
        program.programId
      );

      await program.methods
        .initEscrow()
        .accounts({
          organizer: wallet.publicKey,
          challenge: challengePubkey,
          escrow: escrowPda,
        })
        .rpc();

      await refresh();
      return escrowPda;
    },
    [program, wallet.connected, wallet.publicKey, refresh]
  );

  const joinChallenge = useCallback(
    async (challengePubkey: PublicKey) => {
      if (!wallet.connected || !wallet.publicKey) {
        throw new Error(
          "Wallet not connected. Please connect your wallet first."
        );
      }

      if (!program) {
        throw new Error(
          "Solana program not initialized. Please ensure your wallet is connected."
        );
      }

      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), challengePubkey.toBuffer()],
        program.programId
      );

      await program.methods
        .joinChallenge()
        .accounts({
          participant: wallet.publicKey,
          challenge: challengePubkey,
          escrow: escrowPda,
        })
        .rpc();

      await refresh();
    },
    [program, wallet.connected, wallet.publicKey, refresh]
  );

  const finalizeChallenge = useCallback(
    async (challengePubkey: PublicKey) => {
      if (!wallet.connected || !wallet.publicKey) {
        throw new Error(
          "Wallet not connected. Please connect your wallet first."
        );
      }

      if (!program) {
        throw new Error(
          "Solana program not initialized. Please ensure your wallet is connected."
        );
      }

      await program.methods
        .finalizeChallenge()
        .accounts({
          organizer: wallet.publicKey,
          challenge: challengePubkey,
        })
        .rpc();

      await refresh();
    },
    [program, wallet.connected, wallet.publicKey, refresh]
  );

  const payoutWinner = useCallback(
    async (params: {
      challengePubkey: PublicKey;
      winner: PublicKey;
      shareAmountLamports: bigint;
    }) => {
      if (!wallet.connected || !wallet.publicKey) {
        throw new Error(
          "Wallet not connected. Please connect your wallet first."
        );
      }

      if (!program) {
        throw new Error(
          "Solana program not initialized. Please ensure your wallet is connected."
        );
      }

      const [escrowPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), params.challengePubkey.toBuffer()],
        program.programId
      );

      await program.methods
        .payoutWinner(params.shareAmountLamports)
        .accounts({
          organizer: wallet.publicKey,
          winner: params.winner,
          challenge: params.challengePubkey,
          escrow: escrowPda,
        })
        .rpc();

      await refresh();
    },
    [program, wallet.connected, wallet.publicKey, refresh]
  );

  return {
    program,
    wallet,
    status,
    error: error || programError,
    challenges,
    refresh,
    createChallenge,
    initEscrow,
    joinChallenge,
    finalizeChallenge,
    payoutWinner,
  };
}
