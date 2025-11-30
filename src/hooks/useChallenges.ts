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

  // Log program status for debugging
  useEffect(() => {
    if (wallet.connected) {
      console.log("useChallenges - Program status:", {
        hasProgram: !!program,
        programError,
        walletConnected: wallet.connected,
        hasPublicKey: !!wallet.publicKey,
      });
    }
  }, [program, programError, wallet.connected, wallet.publicKey]);

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
      // Try both lowercase and capitalized account names (Anchor converts types to lowercase)
      // The IDL has "Challenge" in types but Anchor accesses it as lowercase
      // Use type assertion to bypass TypeScript checking since IDL is dynamic
      let accounts;
      try {
        accounts = await (program.account as any).challenge.all();
      } catch (e) {
        // Fallback to capitalized if lowercase doesn't work
        console.warn(
          "Failed to access challenge account (lowercase), trying capitalized:",
          e
        );
        accounts = await (program.account as any).Challenge.all();
      }
      const parsed: ChallengeAccount[] = accounts.map((a: any) => ({
        publicKey: a.publicKey,
        organizer: a.account.organizer,
        stakeAmount: BigInt(
          a.account.stake_amount?.toString() ||
            a.account.stakeAmount?.toString() ||
            "0"
        ),
        startTs: BigInt(
          a.account.start_ts?.toString() || a.account.startTs?.toString() || "0"
        ),
        endTs: BigInt(
          a.account.end_ts?.toString() || a.account.endTs?.toString() || "0"
        ),
        maxParticipants:
          a.account.max_participants || a.account.maxParticipants || 0,
        participantCount:
          a.account.participant_count || a.account.participantCount || 0,
        totalStake: BigInt(
          a.account.total_stake?.toString() ||
            a.account.totalStake?.toString() ||
            "0"
        ),
        isFinalized:
          a.account.is_finalized !== undefined
            ? a.account.is_finalized
            : a.account.isFinalized || false,
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
        const errorMsg = programError
          ? `Solana program not initialized: ${programError}. Please ensure your wallet is connected and try again.`
          : "Solana program not initialized. Please ensure your wallet is connected and try again.";
        console.error("Program not available:", {
          programError,
          walletConnected: wallet.connected,
        });
        throw new Error(errorMsg);
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
          systemProgram: new PublicKey("11111111111111111111111111111111"),
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
          systemProgram: new PublicKey("11111111111111111111111111111111"),
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
          systemProgram: new PublicKey("11111111111111111111111111111111"),
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
          winner: params.winner,
          challenge: params.challengePubkey,
          escrow: escrowPda,
          systemProgram: new PublicKey("11111111111111111111111111111111"),
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
