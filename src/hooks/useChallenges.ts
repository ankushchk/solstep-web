"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import bs58 from "bs58";
import { useAnchorProgram } from "./useAnchorProgram";
import { useSolana } from "./useSolana";
import { SOLSTEP_PROGRAM_ID_STRING } from "@/lib/solana";
import { toastTx } from "@/components/toast-tx";
import toast from "react-hot-toast";
import {
  buildCreateChallengeInstruction,
  buildJoinChallengeInstruction,
  buildInitEscrowInstruction,
  buildFinalizeChallengeInstruction,
  buildSettleChallengeInstruction,
} from "@/utils/instructions";

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
  title?: string;
};

/**
 * Hook to fetch all challenges from the program
 */
export function useChallenges() {
  const { program } = useAnchorProgram();
  const { connection } = useSolana();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["challenges"],
    queryFn: async (): Promise<ChallengeAccount[]> => {
      if (!program) {
        throw new Error("Program not initialized");
      }

      try {
        const programId = new PublicKey(SOLSTEP_PROGRAM_ID_STRING);

        let challengeDiscriminator: Uint8Array;
        try {
          const accountsCoder = program.coder?.accounts as any;
          if (accountsCoder?.discriminator) {
            challengeDiscriminator = accountsCoder.discriminator("Challenge");
          } else {
            throw new Error("Coder not available");
          }
        } catch (error) {
          challengeDiscriminator = new Uint8Array([
            119, 250, 161, 121, 119, 81, 22, 208,
          ]);
        }
        const accounts = await connection.getProgramAccounts(programId, {
          filters: [
            {
              memcmp: {
                offset: 0,
                bytes: bs58.encode(Buffer.from(challengeDiscriminator)),
              },
            },
          ],
        });

        const decodedAccounts = accounts
          .map((accountInfo) => {
            try {
              let accountData: Buffer;
              if (accountInfo.account.data instanceof Buffer) {
                accountData = accountInfo.account.data;
              } else if (accountInfo.account.data instanceof Uint8Array) {
                accountData = Buffer.from(accountInfo.account.data);
              } else if (Array.isArray(accountInfo.account.data)) {
                accountData = Buffer.from(accountInfo.account.data);
              } else {
                accountData = Buffer.from(accountInfo.account.data, "base64");
              }

              const dataWithoutDiscriminator = accountData.slice(8);
              const decoded = program.coder.types.decode(
                "Challenge",
                dataWithoutDiscriminator
              );
              return {
                publicKey: accountInfo.pubkey,
                account: decoded,
              };
            } catch (error) {
              console.warn(
                "Failed to decode account:",
                accountInfo.pubkey.toBase58(),
                error
              );
              return null;
            }
          })
          .filter(
            (acc): acc is { publicKey: PublicKey; account: any } => acc !== null
          );

        return decodedAccounts.map((account) => {
          let organizer: PublicKey;
          const orgValue = account.account.organizer;
          if (orgValue instanceof PublicKey) {
            organizer = orgValue;
          } else if (typeof orgValue === "string") {
            organizer = new PublicKey(orgValue);
          } else if (orgValue?.toBase58) {
            organizer = orgValue;
          } else {
            try {
              organizer = new PublicKey(orgValue);
            } catch (e) {
              console.warn(
                "Failed to convert organizer to PublicKey:",
                orgValue,
                e
              );
              organizer = account.publicKey;
            }
          }

          return {
            publicKey: account.publicKey,
            organizer,
            stakeAmount: BigInt(
              account.account.stake_amount?.toString() ||
                account.account.stakeAmount?.toString() ||
                "0"
            ),
            startTs: BigInt(
              account.account.start_ts?.toString() ||
                account.account.startTs?.toString() ||
                "0"
            ),
            endTs: BigInt(
              account.account.end_ts?.toString() ||
                account.account.endTs?.toString() ||
                "0"
            ),
            maxParticipants:
              account.account.max_participants ||
              account.account.maxParticipants ||
              0,
            participantCount:
              account.account.participant_count ||
              account.account.participantCount ||
              0,
            totalStake: BigInt(
              account.account.total_stake?.toString() ||
                account.account.totalStake?.toString() ||
                "0"
            ),
            isFinalized:
              account.account.is_finalized ??
              account.account.isFinalized ??
              false,
            participants: (account.account.participants || [])
              .map((p: any) => {
                if (p instanceof PublicKey) {
                  return p;
                } else if (typeof p === "string") {
                  return new PublicKey(p);
                } else if (p?.toBase58) {
                  return p;
                } else if (p?.publicKey) {
                  return new PublicKey(p.publicKey);
                } else {
                  try {
                    return new PublicKey(p);
                  } catch (e) {
                    console.warn(
                      "Failed to convert participant to PublicKey:",
                      p,
                      e
                    );
                    return null;
                  }
                }
              })
              .filter((p: PublicKey | null): p is PublicKey => p !== null),
            title: account.account.title || "",
          };
        });
      } catch (error) {
        console.error("Error fetching challenges:", error);
        return [];
      }
    },
    enabled: !!program,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });

  return {
    ...query,
    refreshChallenges: async () => {
      await queryClient.invalidateQueries({ queryKey: ["challenges"] });
    },
  };
}

/**
 * Hook to create a challenge using Web3.js directly
 */
export function useCreateChallenge() {
  const { connection } = useAnchorProgram();
  const { wallet, publicKey, sendTransaction } = useSolana();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      title: string;
      stakeAmountLamports: bigint;
      startTs: number;
      endTs: number;
      maxParticipants: number;
    }): Promise<PublicKey> => {
      if (!publicKey || !sendTransaction) {
        throw new Error("Wallet not connected");
      }

      try {
        const programId = new PublicKey(SOLSTEP_PROGRAM_ID_STRING);

        const [challengePda] = PublicKey.findProgramAddressSync(
          [Buffer.from("challenge"), publicKey.toBuffer()],
          programId
        );
        const instruction = buildCreateChallengeInstruction({
          organizer: publicKey,
          title: params.title,
          stakeAmount: params.stakeAmountLamports,
          startTs: params.startTs,
          endTs: params.endTs,
          maxParticipants: params.maxParticipants,
        });

        // Get recent blockhash RIGHT BEFORE sending (to avoid expiration)
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("finalized");

        // Create transaction with fresh blockhash
        const transaction = new Transaction({
          feePayer: publicKey,
          recentBlockhash: blockhash,
        }).add(instruction);

        // Sign and send using wallet adapter (this will get a fresh blockhash if needed)
        const signature = await sendTransaction(transaction, connection, {
          skipPreflight: false,
          maxRetries: 3,
        });

        // Wait for confirmation - use a timeout to avoid block height expiration
        try {
          const confirmation = (await Promise.race([
            connection.confirmTransaction(
              {
                signature,
                blockhash,
                lastValidBlockHeight,
              },
              "confirmed"
            ),
            // Timeout after 30 seconds
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Confirmation timeout")), 30000)
            ),
          ])) as any;

          if (confirmation?.value?.err) {
            throw new Error(
              `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
            );
          }
        } catch (confirmError: any) {
          // If confirmation fails, check transaction status
          const status = await connection.getSignatureStatus(signature);
          if (status?.value?.err) {
            throw new Error(
              `Transaction failed: ${JSON.stringify(status.value.err)}`
            );
          }
          // If no error in status, transaction likely succeeded
          console.warn(
            "Confirmation timeout, but transaction appears successful:",
            signature
          );
        }

        toastTx(signature, "Challenge created successfully!");
        await queryClient.invalidateQueries({ queryKey: ["challenges"] });

        return challengePda;
      } catch (error: any) {
        console.error("Challenge creation error:", error);
        toast.error(
          error?.message || "Failed to create challenge. Please try again."
        );
        throw error;
      }
    },
  });
}

/**
 * Hook to initialize escrow for a challenge using Web3.js directly
 */
export function useInitEscrow() {
  const { connection } = useAnchorProgram();
  const { publicKey, sendTransaction } = useSolana();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (challengePubkey: PublicKey): Promise<PublicKey> => {
      if (!publicKey || !sendTransaction) {
        throw new Error("Wallet not connected");
      }

      try {
        const programId = new PublicKey(SOLSTEP_PROGRAM_ID_STRING);

        const [escrowPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("escrow"), challengePubkey.toBuffer()],
          programId
        );

        // Build instruction using Web3.js directly
        const instruction = buildInitEscrowInstruction({
          organizer: publicKey,
          challenge: challengePubkey,
        });

        // Get recent blockhash RIGHT BEFORE sending (to avoid expiration)
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("finalized");

        // Create transaction with fresh blockhash
        const transaction = new Transaction({
          feePayer: publicKey,
          recentBlockhash: blockhash,
        }).add(instruction);

        // Sign and send using wallet adapter (this will get a fresh blockhash if needed)
        const signature = await sendTransaction(transaction, connection, {
          skipPreflight: false,
          maxRetries: 3,
        });

        // Wait for confirmation - use a timeout to avoid block height expiration
        try {
          const confirmation = (await Promise.race([
            connection.confirmTransaction(
              {
                signature,
                blockhash,
                lastValidBlockHeight,
              },
              "confirmed"
            ),
            // Timeout after 30 seconds
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Confirmation timeout")), 30000)
            ),
          ])) as any;

          if (confirmation?.value?.err) {
            throw new Error(
              `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
            );
          }
        } catch (confirmError: any) {
          // If confirmation fails, check transaction status
          const status = await connection.getSignatureStatus(signature);
          if (status?.value?.err) {
            throw new Error(
              `Transaction failed: ${JSON.stringify(status.value.err)}`
            );
          }
          // If no error in status, transaction likely succeeded
          console.warn(
            "Confirmation timeout, but transaction appears successful:",
            signature
          );
        }

        toastTx(signature, "Escrow initialized successfully!");

        // Invalidate and refetch challenges
        await queryClient.invalidateQueries({ queryKey: ["challenges"] });
        await queryClient.refetchQueries({ queryKey: ["challenges"] });

        return escrowPda;
      } catch (error: any) {
        console.error("Escrow initialization error:", error);
        toast.error(
          error?.message || "Failed to initialize escrow. Please try again."
        );
        throw error;
      }
    },
  });
}

/**
 * Hook to join a challenge using Web3.js directly - ON-CHAIN ONLY
 * This sends a transaction to the Solana program's join_challenge instruction.
 * The participant's wallet address (publicKey) is used as the signer.
 * This ensures the join happens on-chain and is recorded in the blockchain.
 */
export function useJoinChallenge() {
  const { connection } = useAnchorProgram();
  const { publicKey, sendTransaction } = useSolana();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (challengePubkey: PublicKey): Promise<string> => {
      if (!publicKey || !sendTransaction) {
        throw new Error("Wallet not connected");
      }

      try {
        // Build on-chain join_challenge instruction
        // The participant (publicKey) will sign this transaction
        const instruction = buildJoinChallengeInstruction({
          participant: publicKey, // This is the wallet address joining the challenge
          challenge: challengePubkey,
        });

        // Get recent blockhash RIGHT BEFORE sending (to avoid expiration)
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("finalized");

        // Create transaction with fresh blockhash
        const transaction = new Transaction({
          feePayer: publicKey,
          recentBlockhash: blockhash,
        }).add(instruction);

        // Sign and send using wallet adapter (this will get a fresh blockhash if needed)
        const signature = await sendTransaction(transaction, connection, {
          skipPreflight: false,
          maxRetries: 3,
        });

        // Wait for confirmation - use a timeout to avoid block height expiration
        try {
          const confirmation = (await Promise.race([
            connection.confirmTransaction(
              {
                signature,
                blockhash,
                lastValidBlockHeight,
              },
              "confirmed"
            ),
            // Timeout after 30 seconds
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Confirmation timeout")), 30000)
            ),
          ])) as any;

          if (confirmation?.value?.err) {
            throw new Error(
              `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
            );
          }
        } catch (confirmError: any) {
          // If confirmation fails, check transaction status
          const status = await connection.getSignatureStatus(signature);
          if (status?.value?.err) {
            throw new Error(
              `Transaction failed: ${JSON.stringify(status.value.err)}`
            );
          }
          // If no error in status, transaction likely succeeded
          console.warn(
            "Confirmation timeout, but transaction appears successful:",
            signature
          );
        }

        toastTx(signature, "Successfully joined challenge!");

        // Invalidate and refetch challenges to get updated participant list
        await queryClient.invalidateQueries({ queryKey: ["challenges"] });
        await queryClient.refetchQueries({ queryKey: ["challenges"] });

        return signature;
      } catch (error: any) {
        console.error("Join challenge error:", error);
        toast.error(
          error?.message || "Failed to join challenge. Please try again."
        );
        throw error;
      }
    },
  });
}

/**
 * Hook to settle a challenge (distribute rewards) using Web3.js directly
 * Called by the organizer once a winner is determined
 */
export function useSettleChallenge() {
  const { connection } = useAnchorProgram();
  const { publicKey, sendTransaction } = useSolana();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      challenge: PublicKey;
      organizer: PublicKey;
      winner: PublicKey;
      loser: PublicKey;
    }): Promise<string> => {
      if (!publicKey || !sendTransaction) {
        throw new Error("Wallet not connected");
      }

      // Only organizer can settle
      if (!publicKey.equals(params.organizer)) {
        throw new Error(
          "Only the challenge organizer can settle the challenge"
        );
      }

      try {
        const { challenge, organizer, winner, loser } = params;

        // Build on-chain settle_challenge instruction
        const instruction = buildSettleChallengeInstruction({
          organizer,
          challenge,
          winner,
          loser,
        });

        // Get recent blockhash RIGHT BEFORE sending (to avoid expiration)
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("finalized");

        // Create transaction with fresh blockhash
        const transaction = new Transaction({
          feePayer: publicKey,
          recentBlockhash: blockhash,
        }).add(instruction);

        // Sign and send
        const signature = await sendTransaction(transaction, connection, {
          skipPreflight: false,
          maxRetries: 3,
        });

        // Wait for confirmation
        try {
          const confirmation = (await Promise.race([
            connection.confirmTransaction(
              {
                signature,
                blockhash,
                lastValidBlockHeight,
              },
              "confirmed"
            ),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Confirmation timeout")), 30000)
            ),
          ])) as any;

          if (confirmation?.value?.err) {
            throw new Error(
              `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
            );
          }
        } catch (confirmError: any) {
          const status = await connection.getSignatureStatus(signature);
          if (status?.value?.err) {
            throw new Error(
              `Transaction failed: ${JSON.stringify(status.value.err)}`
            );
          }
          // If no error in status, transaction likely succeeded
          console.warn(
            "Confirmation timeout, but transaction appears successful:",
            signature
          );
        }

        toastTx(signature, "Challenge settled! Rewards distributed.");

        // Refresh challenges
        await queryClient.invalidateQueries({ queryKey: ["challenges"] });
        await queryClient.refetchQueries({ queryKey: ["challenges"] });

        return signature;
      } catch (error: any) {
        console.error("Settle challenge error:", error);
        toast.error(
          error?.message || "Failed to settle challenge. Please try again."
        );
        throw error;
      }
    },
  });
}

/**
 * Hook to finalize a challenge using Web3.js directly
 */
export function useFinalizeChallenge() {
  const { connection } = useAnchorProgram();
  const { publicKey, sendTransaction } = useSolana();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (challengePubkey: PublicKey): Promise<string> => {
      if (!publicKey || !sendTransaction) {
        throw new Error("Wallet not connected");
      }

      try {
        // Build instruction using Web3.js directly
        const instruction = buildFinalizeChallengeInstruction({
          organizer: publicKey,
          challenge: challengePubkey,
        });

        // Get recent blockhash RIGHT BEFORE sending (to avoid expiration)
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash("finalized");

        // Create transaction with fresh blockhash
        const transaction = new Transaction({
          feePayer: publicKey,
          recentBlockhash: blockhash,
        }).add(instruction);

        // Sign and send using wallet adapter (this will get a fresh blockhash if needed)
        const signature = await sendTransaction(transaction, connection, {
          skipPreflight: false,
          maxRetries: 3,
        });

        // Wait for confirmation - use a timeout to avoid block height expiration
        try {
          const confirmation = (await Promise.race([
            connection.confirmTransaction(
              {
                signature,
                blockhash,
                lastValidBlockHeight,
              },
              "confirmed"
            ),
            // Timeout after 30 seconds
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Confirmation timeout")), 30000)
            ),
          ])) as any;

          if (confirmation?.value?.err) {
            throw new Error(
              `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
            );
          }
        } catch (confirmError: any) {
          // If confirmation fails, check transaction status
          const status = await connection.getSignatureStatus(signature);
          if (status?.value?.err) {
            throw new Error(
              `Transaction failed: ${JSON.stringify(status.value.err)}`
            );
          }
          // If no error in status, transaction likely succeeded
          console.warn(
            "Confirmation timeout, but transaction appears successful:",
            signature
          );
        }

        toastTx(signature, "Challenge finalized successfully!");

        // Invalidate and refetch challenges to show updated status
        await queryClient.invalidateQueries({ queryKey: ["challenges"] });
        await queryClient.refetchQueries({ queryKey: ["challenges"] });

        return signature;
      } catch (error: any) {
        console.error("Finalize challenge error:", error);
        toast.error(
          error?.message || "Failed to finalize challenge. Please try again."
        );
        throw error;
      }
    },
  });
}
