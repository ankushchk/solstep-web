"use client";

import { NFTStorage, File } from "nft.storage";

// NFT.Storage API key - in production, store this in environment variable
// For now, using a public key (free tier allows 5GB)
// In production, you should use: process.env.NEXT_PUBLIC_NFT_STORAGE_API_KEY
const NFT_STORAGE_API_KEY = process.env.NEXT_PUBLIC_NFT_STORAGE_API_KEY || "";

/**
 * Upload image to IPFS using NFT.Storage
 * @param imageDataUrl - Base64 data URL of the image
 * @param fileName - Name for the file
 * @returns IPFS URL (ipfs://...) or HTTP gateway URL
 */
export async function uploadImageToIPFS(
  imageDataUrl: string,
  fileName: string = "checkpoint-image.jpg"
): Promise<string> {
  try {
    // If no API key, return a placeholder (for development)
    if (!NFT_STORAGE_API_KEY) {
      console.warn("NFT.Storage API key not set. Using placeholder URL.");
      // In production, you should throw an error or use a fallback
      return "ipfs://placeholder";
    }

    // Convert data URL to Blob
    const response = await fetch(imageDataUrl);
    const blob = await response.blob();
    
    // Create File object for NFT.Storage
    const file = new File([blob], fileName, { type: blob.type || "image/jpeg" });

    // Initialize NFT.Storage client
    const client = new NFTStorage({ token: NFT_STORAGE_API_KEY });

    // Upload to IPFS
    const cid = await client.storeBlob(file);
    return `ipfs://${cid}`;
  } catch (error) {
    console.error("Error uploading image to IPFS:", error);
    throw new Error(
      `Failed to upload image to IPFS: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Upload JSON metadata to IPFS
 * @param metadata - JSON object to upload
 * @returns IPFS URL
 */
export async function uploadMetadataToIPFS(
  metadata: Record<string, any>
): Promise<string> {
  try {
    if (!NFT_STORAGE_API_KEY) {
      console.warn("NFT.Storage API key not set. Using placeholder URL.");
      return "ipfs://placeholder-metadata";
    }

    // Convert metadata to Blob
    const metadataBlob = new Blob([JSON.stringify(metadata, null, 2)], {
      type: "application/json",
    });

    // Initialize NFT.Storage client
    const client = new NFTStorage({ token: NFT_STORAGE_API_KEY });

    // Upload to IPFS
    const cid = await client.storeBlob(metadataBlob);
    return `ipfs://${cid}`;
  } catch (error) {
    console.error("Error uploading metadata to IPFS:", error);
    throw new Error(
      `Failed to upload metadata to IPFS: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get HTTP gateway URL from IPFS URL
 * @param ipfsUrl - IPFS URL (ipfs://...)
 * @returns HTTP gateway URL
 */
export function getIPFSGatewayUrl(ipfsUrl: string): string {
  if (!ipfsUrl.startsWith("ipfs://")) {
    return ipfsUrl; // Already a gateway URL or invalid
  }
  
  const cid = ipfsUrl.replace("ipfs://", "");
  // Using NFT.Storage gateway (you can use any public IPFS gateway)
  return `https://nftstorage.link/ipfs/${cid}`;
}

