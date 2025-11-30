import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";

// Store as string to avoid issues with PublicKey creation at module load
export const SOLSTEP_PROGRAM_ID_STRING =
  "3aezMEt3EwNGU7uxBSNNwmXN5b54WXzmyosXpXSdma52";

// Lazy getter for PublicKey to ensure it's created in client context
// This prevents errors when Buffer is not yet available
export function getSOLSTEP_PROGRAM_ID(): PublicKey {
  try {
    return new PublicKey(SOLSTEP_PROGRAM_ID_STRING);
  } catch (error) {
    console.error("Error creating SOLSTEP_PROGRAM_ID:", error);
    throw error;
  }
}

export type SolanaCluster = "devnet";

export function getRpcEndpoint(cluster: SolanaCluster = "devnet") {
  return clusterApiUrl(cluster);
}

export const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
// export function createConnection(cluster: SolanaCluster = "devnet") {
//   return new Connection(getRpcEndpoint(cluster), "confirmed");
// }
