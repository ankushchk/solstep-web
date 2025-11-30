"use client";

import { useMemo, useState, useEffect } from "react";
import { AnchorProvider, Idl, Program } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, VersionedTransaction } from "@solana/web3.js";
import solstepIdl from "@/idl/solstep.json";

export type SolstepProgram = Program<Idl>;

// Create a wallet adapter wrapper that ensures all required methods exist
function createWalletAdapter(wallet: any) {
  return {
    publicKey: wallet.publicKey,
    signTransaction:
      wallet.signTransaction ||
      (async (tx: Transaction) => {
        if (wallet.signAllTransactions) {
          const signed = await wallet.signAllTransactions([tx]);
          return signed[0];
        }
        throw new Error("No signing method available");
      }),
    signAllTransactions:
      wallet.signAllTransactions ||
      (async (txs: Transaction[]) => {
        if (wallet.signTransaction) {
          return Promise.all(txs.map((tx) => wallet.signTransaction(tx)));
        }
        throw new Error("No signing method available");
      }),
    signMessage: wallet.signMessage,
  };
}

export function useAnchorProgram() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [initError, setInitError] = useState<string | null>(null);

  const program = useMemo<SolstepProgram | null>(() => {
    // Reset error on each attempt
    setInitError(null);

    if (!connection) {
      const error = "Solana connection not available";
      console.warn(error);
      setInitError(error);
      return null;
    }

    if (!wallet.connected) {
      return null;
    }

    // Check if wallet adapter is ready
    if (!wallet.publicKey) {
      const error = "Wallet public key not available yet";
      console.warn(error);
      setInitError(error);
      return null;
    }

    // Check for at least one signing method
    if (!wallet.signTransaction && !wallet.signAllTransactions) {
      const error =
        "Wallet signing functions not available. Please ensure your wallet supports transaction signing.";
      console.warn("Wallet signing functions not available:", {
        hasPublicKey: !!wallet.publicKey,
        hasSignTransaction: !!wallet.signTransaction,
        hasSignAllTransactions: !!wallet.signAllTransactions,
        walletName: wallet.wallet?.adapter?.name,
        walletAdapter: wallet.wallet?.adapter,
      });
      setInitError(error);
      return null;
    }

    try {
      // Create wallet adapter wrapper
      const walletAdapter = createWalletAdapter(wallet);

      const provider = new AnchorProvider(connection, walletAdapter as any, {
        commitment: "confirmed",
      });

      // Get program ID from IDL if available, otherwise use hardcoded value
      const programIdString =
        (solstepIdl as any).address ||
        "3aezMEt3EwNGU7uxBSNNwmXN5b54WXzmyosXpXSdma52";
      const programId = new PublicKey(programIdString);

      // Normalize IDL format - Anchor expects accounts to have full type definitions
      // The new IDL format has accounts with just names/discriminators and types separately
      // We need to merge them for Anchor compatibility
      const normalizedIdl = { ...solstepIdl } as any;

      // If accounts array only has names/discriminators, merge with types
      if (
        normalizedIdl.accounts &&
        normalizedIdl.types &&
        Array.isArray(normalizedIdl.accounts)
      ) {
        const typeMap = new Map();
        if (Array.isArray(normalizedIdl.types)) {
          normalizedIdl.types.forEach((type: any) => {
            if (type.name && type.type) {
              typeMap.set(type.name, type.type);
            }
          });
        }

        // Replace accounts array with full type definitions
        normalizedIdl.accounts = normalizedIdl.accounts.map((acc: any) => {
          const typeDef = typeMap.get(acc.name);
          if (typeDef) {
            return {
              name: acc.name,
              ...(acc.discriminator && { discriminator: acc.discriminator }),
              type: typeDef,
            };
          }
          return acc;
        });
      }

      // Program constructor: new Program(idl, programId, provider)
      // Using 'as any' for IDL to handle type mismatch with JSON import
      let program: any;
      try {
        // @ts-expect-error - Anchor 0.30.1 has type inference issues with Program constructor
        program = new Program(normalizedIdl, programId, provider);
      } catch (err: any) {
        // If normalization fails, try with original IDL
        console.warn(
          "Failed with normalized IDL, trying original format:",
          err
        );
        try {
          // @ts-expect-error - Anchor 0.30.1 has type inference issues with Program constructor
          program = new Program(solstepIdl as any, programId, provider);
        } catch (err2: any) {
          throw new Error(
            `Failed to initialize program: ${
              err2?.message || err2
            }. Original error: ${err?.message || err}`
          );
        }
      }

      // Verify program is accessible by checking if it has the expected structure
      if (!program || !program.methods) {
        throw new Error("Program initialized but methods are not accessible");
      }

      // Test account access to verify it's working
      try {
        // This will fail if account doesn't exist, but we just want to verify program structure
        const accountNames = Object.keys(program.account || {});
        console.log("Available account names:", accountNames);
      } catch (e) {
        console.warn("Could not list account names:", e);
      }

      console.log("Anchor program initialized successfully", {
        programId: programId.toBase58(),
        wallet: wallet.publicKey?.toBase58(),
        hasMethods: !!program.methods,
        hasAccounts: !!program.account,
      });
      setInitError(null);
      return program as SolstepProgram;
    } catch (err: any) {
      const error = `Error creating Anchor program: ${err?.message || err}`;
      console.error(error, err);
      setInitError(error);
      return null;
    }
  }, [
    connection,
    wallet.connected,
    wallet.publicKey,
    wallet.signTransaction,
    wallet.signAllTransactions,
    wallet.wallet?.adapter?.name,
  ]);

  // Log initialization status for debugging
  useEffect(() => {
    if (wallet.connected) {
      console.log("Program initialization status:", {
        hasProgram: !!program,
        hasConnection: !!connection,
        hasPublicKey: !!wallet.publicKey,
        hasSignTransaction: !!wallet.signTransaction,
        hasSignAllTransactions: !!wallet.signAllTransactions,
        error: initError,
        walletName: wallet.wallet?.adapter?.name,
      });
    }
  }, [
    wallet.connected,
    program,
    connection,
    wallet.publicKey,
    wallet.signTransaction,
    wallet.signAllTransactions,
    initError,
    wallet.wallet?.adapter?.name,
  ]);

  return { program, error: initError };
}
