"use client";

import { createTree } from "@metaplex-foundation/mpl-bubblegum";
import { createV1, mintV1 } from "@metaplex-foundation/mpl-bubblegum";
import { generateSigner, keypairIdentity } from "@metaplex-foundation/umi";
import type { Connection } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { createUmiInstance } from "@/lib/metaplex";
import { uploadImageToIPFS, uploadMetadataToIPFS } from "./ipfsUpload";
import { createCheckpointMetadata } from "@/utils/nftMetadata";
import { toWeb3JsTransaction, fromWeb3JsPublicKey } from "@metaplex-foundation/umi-web3js-adapters";
import { PublicKey } from "@solana/web3.js";

export interface MintNFTParams {
  imageDataUrl: string;
  checkpointId: string;
  checkpointName: string;
  location: { lat: number; lng: number };
  verifiedLocation: { lat: number; lng: number };
  collectedAt: string;
  userId?: string;
  challengeId?: string;
  onProgress?: (progress: string) => void;
}

// Store tree address in a simple way (in production, you'd want to manage this better)
let merkleTreeAddress: string | null = null;

/**
 * Get or create a Merkle tree for compressed NFTs
 * In production, you'd want to manage this tree more carefully
 */
async function getOrCreateMerkleTree(
  umi: any,
  wallet: WalletContextState,
  connection: Connection
): Promise<string> {
  // If we already have a tree, return it
  if (merkleTreeAddress) {
    return merkleTreeAddress;
  }

  // For now, we'll create a simple tree
  // In production, you'd want to:
  // 1. Store the tree address in a database
  // 2. Reuse the same tree for all NFTs
  // 3. Or create a new tree per user/challenge

  const merkleTree = generateSigner(umi);
  
  // Create a small tree (can hold up to 16 NFTs)
  // For production, you'd want a larger tree
  const maxDepth = 3; // 2^3 = 8 leaves (small tree for testing)
  const maxBufferSize = 8;

  const treeBuilder = createTree(umi, {
    merkleTree,
    maxDepth,
    maxBufferSize,
  });

  const transaction = await treeBuilder.build(umi);
  const web3jsTx = toWeb3JsTransaction(transaction);
  
  const { blockhash } = await connection.getLatestBlockhash("finalized");
  web3jsTx.recentBlockhash = blockhash;
  web3jsTx.feePayer = wallet.publicKey;

  const signature = await wallet.sendTransaction(web3jsTx, connection);
  await connection.confirmTransaction(signature, "confirmed");

  merkleTreeAddress = merkleTree.publicKey.toString();
  return merkleTreeAddress;
}

/**
 * Mint a compressed NFT (cNFT) as proof of checkpoint visit
 * Compressed NFTs are much cheaper (~0.00001 SOL vs 0.01-0.02 SOL)
 * @param params - NFT minting parameters
 * @param wallet - Wallet adapter instance
 * @param connection - Solana connection
 * @returns Asset ID (compressed NFT identifier) of the created NFT
 */
export async function mintCheckpointNFT(
  params: MintNFTParams,
  wallet: WalletContextState,
  connection: Connection
): Promise<string> {
  // Validate wallet connection
  if (!wallet.publicKey || !wallet.signTransaction || !wallet.sendTransaction) {
    throw new Error("Wallet not connected. Please connect your wallet to mint NFT.");
  }

  try {
    // Step 1: Upload image to IPFS
    params.onProgress?.("Uploading image to IPFS...");
    const imageUri = await uploadImageToIPFS(
      params.imageDataUrl,
      `${params.checkpointId}-${Date.now()}.jpg`
    );

    // Step 2: Create metadata
    params.onProgress?.("Creating metadata...");
    const metadata = createCheckpointMetadata({
      checkpointId: params.checkpointId,
      checkpointName: params.checkpointName,
      location: params.location,
      verifiedLocation: params.verifiedLocation,
      collectedAt: params.collectedAt,
      userId: params.userId,
      challengeId: params.challengeId,
      imageUri,
    });

    // Step 3: Upload metadata to IPFS
    params.onProgress?.("Uploading metadata to IPFS...");
    const metadataUri = await uploadMetadataToIPFS(metadata);

    // Step 4: Create UMI instance with wallet adapter
    params.onProgress?.("Preparing compressed NFT mint...");
    const umi = createUmiInstance(connection, wallet);

    // Step 5: Get or create Merkle tree
    params.onProgress?.("Setting up Merkle tree...");
    const treeAddress = await getOrCreateMerkleTree(umi, wallet, connection);
    const treePublicKey = fromWeb3JsPublicKey(new PublicKey(treeAddress));

    // Step 6: Mint compressed NFT
    params.onProgress?.("Minting compressed NFT (almost free!)...");
    const leafOwner = fromWeb3JsPublicKey(wallet.publicKey);
    
    const mintBuilder = mintV1(umi, {
      leafOwner,
      merkleTree: treePublicKey,
      metadata: {
        name: metadata.name,
        uri: metadataUri,
        sellerFeeBasisPoints: 0,
        creators: [],
        symbol: "SOLSTEP",
        collection: null,
        uses: null,
      },
    });

    const transaction = await mintBuilder.build(umi);
    const web3jsTx = toWeb3JsTransaction(transaction);
    
    // Get fresh blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("finalized");
    web3jsTx.recentBlockhash = blockhash;
    web3jsTx.feePayer = wallet.publicKey;
    
    // Sign and send transaction
    const signature = await wallet.sendTransaction(web3jsTx, connection, {
      skipPreflight: false,
      maxRetries: 3,
    });

    // Step 7: Confirm transaction
    params.onProgress?.("Confirming transaction...");
    try {
      await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        "confirmed"
      );
    } catch (confirmError) {
      // Check status even if confirmation times out
      const status = await connection.getSignatureStatus(signature);
      if (status?.value?.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
      }
      console.warn("Confirmation timeout, but transaction appears successful");
    }
    
    // Wait a bit for final confirmation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // For compressed NFTs, we return the asset ID
    // The asset ID is derived from the tree address and leaf index
    // For simplicity, we'll return the tree address + a unique identifier
    // In production, you'd want to derive the actual asset ID from the mint transaction
    const assetId = `${treeAddress}-${params.checkpointId}-${Date.now()}`;
    return assetId;
  } catch (error) {
    console.error("Error minting compressed NFT:", error);
    
    // Provide user-friendly error messages
    if (error instanceof Error) {
      if (error.message.includes("User rejected") || error.message.includes("reject")) {
        throw new Error("Transaction cancelled. NFT minting was cancelled.");
      }
      if (error.message.includes("insufficient funds") || error.message.includes("0 SOL")) {
        throw new Error("Insufficient SOL balance. You need approximately 0.00001 SOL to mint a compressed NFT.");
      }
      if (error.message.includes("network") || error.message.includes("timeout")) {
        throw new Error("Network error. Please check your connection and try again.");
      }
      throw new Error(`Failed to mint NFT: ${error.message}`);
    }
    
    throw new Error("Failed to mint NFT. Please try again.");
  }
}
