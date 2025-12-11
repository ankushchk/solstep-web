"use client";

import { useMemo, useState } from "react";
import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import solstepIdl from "@/idl/solstep.json";
import { SOLSTEP_PROGRAM_ID_STRING } from "@/lib/solana";

// Type definitions based on the IDL
export type SolstepProgram = Program<Idl>;

/**
 * Hook to get program connection and coder (for account decoding only)
 * We use Web3.js directly for instructions to bypass Anchor's IDL parsing bugs
 */
export function useAnchorProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [initError, setInitError] = useState<string | null>(null);

  // Only create program for account decoding - we don't use it for instructions
  const program = useMemo<SolstepProgram | null>(() => {
    if (
      !wallet.publicKey ||
      !wallet.signTransaction ||
      !wallet.signAllTransactions
    ) {
      return null;
    }

    try {
      const programId = new PublicKey(SOLSTEP_PROGRAM_ID_STRING);

      // Create provider
      const provider = new AnchorProvider(
        connection,
        {
          publicKey: wallet.publicKey,
          signTransaction: wallet.signTransaction,
          signAllTransactions: wallet.signAllTransactions,
        },
        { commitment: "confirmed" }
      );

      // Remove accounts array to bypass AccountClient bug
      // We only need the program for account decoding, not for instructions
      const idlToUse: any = JSON.parse(JSON.stringify(solstepIdl));
      if (idlToUse.accounts) {
        delete idlToUse.accounts;
      }

      // Create program (only for account decoding)
      // Anchor 0.30.1 has type inference issues with Program constructor
      // TypeScript incorrectly infers parameter types, so we cast the entire call
      const prog = new (Program as any)(
        idlToUse as Idl,
        programId,
        provider
      ) as SolstepProgram;

      setInitError(null);
      return prog;
    } catch (error: any) {
      const errorMessage = error?.message || "Unknown error";
      console.error(
        "Error creating Anchor program (for account decoding):",
        error
      );
      setInitError(errorMessage);
      return null;
    }
  }, [
    connection,
    wallet.publicKey,
    wallet.signTransaction,
    wallet.signAllTransactions,
    wallet.connected,
  ]);

  return {
    program, // Only used for account decoding
    programId: new PublicKey(SOLSTEP_PROGRAM_ID_STRING),
    connection,
    initError,
    isInitialized: !!program && !initError,
  };
}
