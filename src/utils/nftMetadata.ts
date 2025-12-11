"use client";

import type { UploadMetadataInput } from "@metaplex-foundation/mpl-token-metadata";

export interface CheckpointMetadataParams {
  checkpointId: string;
  checkpointName: string;
  location: { lat: number; lng: number };
  verifiedLocation: { lat: number; lng: number };
  collectedAt: string;
  userId?: string;
  challengeId?: string;
  imageUri: string; // IPFS URL of the image
}

/**
 * Create standardized metadata for checkpoint proof NFTs
 */
export function createCheckpointMetadata(
  params: CheckpointMetadataParams
): UploadMetadataInput {
  const collectedDate = new Date(params.collectedAt);
  
  return {
    name: `SolStep Checkpoint: ${params.checkpointName}`,
    description: `Proof of visit to ${params.checkpointName} on ${collectedDate.toLocaleDateString()} at ${collectedDate.toLocaleTimeString()}. This NFT serves as immutable proof of your location-based achievement.`,
    image: params.imageUri,
    attributes: [
      { trait_type: "Checkpoint ID", value: params.checkpointId },
      { trait_type: "Checkpoint Name", value: params.checkpointName },
      { 
        trait_type: "Location", 
        value: `${params.location.lat.toFixed(6)}, ${params.location.lng.toFixed(6)}` 
      },
      { 
        trait_type: "Verified Location", 
        value: `${params.verifiedLocation.lat.toFixed(6)}, ${params.verifiedLocation.lng.toFixed(6)}` 
      },
      { 
        trait_type: "Collected At", 
        value: collectedDate.toISOString() 
      },
      { 
        trait_type: "Date", 
        value: collectedDate.toLocaleDateString() 
      },
      { 
        trait_type: "Time", 
        value: collectedDate.toLocaleTimeString() 
      },
      { trait_type: "Type", value: "Checkpoint Proof" },
      ...(params.challengeId 
        ? [{ trait_type: "Challenge ID", value: params.challengeId }] 
        : []
      ),
    ],
    properties: {
      checkpointId: params.checkpointId,
      userId: params.userId || "",
      verified: true,
      category: "Location Proof",
    },
  };
}

