"use client";

import { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { mintCheckpointNFT, type MintNFTParams } from "@/services/nftMinting";
import toast from "react-hot-toast";

export function useNFTMinting() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [isMinting, setIsMinting] = useState(false);
  const [progress, setProgress] = useState<string>("");

  const mintNFT = useCallback(
    async (params: MintNFTParams): Promise<string> => {
      if (!wallet.publicKey) {
        throw new Error("Wallet not connected");
      }

      setIsMinting(true);
      setProgress("");

      try {
        const mintAddress = await mintCheckpointNFT(
          {
            ...params,
            onProgress: (progressMsg) => {
              setProgress(progressMsg);
            },
          },
          wallet,
          connection
        );

        setProgress("✅ NFT minted successfully!");
        return mintAddress;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to mint NFT";
        toast.error(errorMessage);
        throw error;
      } finally {
        setIsMinting(false);
        // Clear progress after a delay
        setTimeout(() => setProgress(""), 3000);
      }
    },
    [wallet, connection]
  );

  return {
    mintNFT,
    isMinting,
    progress,
  };
}

