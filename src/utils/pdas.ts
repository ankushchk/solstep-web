import { PublicKey } from "@solana/web3.js";
import { SOLSTEP_PROGRAM_ID_STRING } from "@/lib/solana";

const PROGRAM_ID = new PublicKey(SOLSTEP_PROGRAM_ID_STRING);

/**
 * Get challenge PDA
 */
export function getChallengePda(organizer: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("challenge"), organizer.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Get organizer stats PDA
 */
export function getOrganizerStatsPda(organizer: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("organizer_stats"), organizer.toBuffer()],
    PROGRAM_ID
  );
}

/**
 * Get escrow PDA
 */
export function getEscrowPda(challenge: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), challenge.toBuffer()],
    PROGRAM_ID
  );
}

