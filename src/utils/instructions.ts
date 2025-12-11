import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { SOLSTEP_PROGRAM_ID_STRING } from "@/lib/solana";
import BN from "bn.js";

const PROGRAM_ID = new PublicKey(SOLSTEP_PROGRAM_ID_STRING);

/**
 * Instruction discriminators from IDL
 */
const DISCRIMINATORS = {
  create_challenge: Buffer.from([170, 244, 47, 1, 1, 15, 173, 239]),
  join_challenge: Buffer.from([41, 104, 214, 73, 32, 168, 76, 79]),
  init_escrow: Buffer.from([70, 46, 40, 23, 6, 11, 81, 139]),
  finalize_challenge: Buffer.from([184, 38, 132, 51, 103, 143, 203, 9]),
  settle_challenge: Buffer.from([242, 58, 232, 150, 127, 199, 11, 204]),
  timeout_challenge: Buffer.from([15, 101, 245, 99, 220, 185, 252, 152]),
  close_challenge: Buffer.from([29, 156, 109, 17, 41, 99, 71, 236]),
};

/**
 * Helper to encode string for Borsh
 */
function encodeString(str: string): Buffer {
  const strBytes = Buffer.from(str, "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32LE(strBytes.length, 0);
  return Buffer.concat([len, strBytes]);
}

/**
 * Helper to encode u64 for Borsh
 */
function encodeU64(value: bigint | BN | number): Buffer {
  const bn = typeof value === "bigint" ? new BN(value.toString()) : typeof value === "number" ? new BN(value) : value;
  const buffer = Buffer.alloc(8);
  bn.toArrayLike(Buffer, "le", 8).copy(buffer);
  return buffer;
}

/**
 * Helper to encode i64 for Borsh
 */
function encodeI64(value: bigint | BN | number): Buffer {
  const bn = typeof value === "bigint" ? new BN(value.toString()) : typeof value === "number" ? new BN(value) : value;
  const buffer = Buffer.alloc(8);
  bn.toArrayLike(Buffer, "le", 8).copy(buffer);
  return buffer;
}

/**
 * Helper to encode u32 for Borsh
 */
function encodeU32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

/**
 * Build create_challenge instruction
 */
export function buildCreateChallengeInstruction(params: {
  organizer: PublicKey;
  title: string;
  stakeAmount: bigint | BN;
  startTs: number | bigint;
  endTs: number | bigint;
  maxParticipants: number;
}): TransactionInstruction {
  const {
    organizer,
    title,
    stakeAmount,
    startTs,
    endTs,
    maxParticipants,
  } = params;

  // Find PDAs
  const [organizerStatsPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("organizer_stats"), organizer.toBuffer()],
    PROGRAM_ID
  );

  const [challengePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("challenge"), organizer.toBuffer()],
    PROGRAM_ID
  );

  // Encode instruction data
  const data = Buffer.concat([
    DISCRIMINATORS.create_challenge,
    encodeString(title),
    encodeU64(stakeAmount),
    encodeI64(startTs),
    encodeI64(endTs),
    encodeU32(maxParticipants),
  ]);

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: organizer, isSigner: true, isWritable: true },
      { pubkey: organizerStatsPda, isSigner: false, isWritable: true },
      { pubkey: challengePda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build join_challenge instruction
 */
export function buildJoinChallengeInstruction(params: {
  participant: PublicKey;
  challenge: PublicKey;
}): TransactionInstruction {
  const { participant, challenge } = params;

  // Find escrow PDA
  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), challenge.toBuffer()],
    PROGRAM_ID
  );

  // Encode instruction data (no args for join_challenge)
  const data = DISCRIMINATORS.join_challenge;

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: participant, isSigner: true, isWritable: true },
      { pubkey: challenge, isSigner: false, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build init_escrow instruction
 */
export function buildInitEscrowInstruction(params: {
  organizer: PublicKey;
  challenge: PublicKey;
}): TransactionInstruction {
  const { organizer, challenge } = params;

  // Find escrow PDA
  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), challenge.toBuffer()],
    PROGRAM_ID
  );

  // Encode instruction data (no args for init_escrow)
  const data = DISCRIMINATORS.init_escrow;

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: organizer, isSigner: true, isWritable: true },
      { pubkey: challenge, isSigner: false, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build finalize_challenge instruction
 */
export function buildFinalizeChallengeInstruction(params: {
  organizer: PublicKey;
  challenge: PublicKey;
}): TransactionInstruction {
  const { organizer, challenge } = params;

  // Encode instruction data (no args for finalize_challenge)
  const data = DISCRIMINATORS.finalize_challenge;

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: organizer, isSigner: true, isWritable: true },
      { pubkey: challenge, isSigner: false, isWritable: true },
    ],
    data,
  });
}

/**
 * Build settle_challenge instruction
 */
export function buildSettleChallengeInstruction(params: {
  organizer: PublicKey;
  challenge: PublicKey;
  winner: PublicKey;
  loser: PublicKey;
}): TransactionInstruction {
  const { organizer, challenge, winner, loser } = params;

  // Find escrow PDA
  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), challenge.toBuffer()],
    PROGRAM_ID
  );

  // Encode instruction data (no args for settle_challenge)
  const data = DISCRIMINATORS.settle_challenge;

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: organizer, isSigner: true, isWritable: true },
      { pubkey: winner, isSigner: false, isWritable: true },
      { pubkey: loser, isSigner: false, isWritable: true },
      { pubkey: challenge, isSigner: false, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build timeout_challenge instruction
 */
export function buildTimeoutChallengeInstruction(params: {
  caller: PublicKey;
  challenge: PublicKey;
  organizer: PublicKey;
}): TransactionInstruction {
  const { caller, challenge, organizer } = params;

  // Find escrow PDA
  const [escrowPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), challenge.toBuffer()],
    PROGRAM_ID
  );

  // Encode instruction data (no args for timeout_challenge)
  const data = DISCRIMINATORS.timeout_challenge;

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: caller, isSigner: true, isWritable: false },
      { pubkey: challenge, isSigner: false, isWritable: true },
      { pubkey: escrowPda, isSigner: false, isWritable: true },
      { pubkey: organizer, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

/**
 * Build close_challenge instruction
 */
export function buildCloseChallengeInstruction(params: {
  organizer: PublicKey;
  challenge: PublicKey;
}): TransactionInstruction {
  const { organizer, challenge } = params;

  // Encode instruction data (no args for close_challenge)
  const data = DISCRIMINATORS.close_challenge;

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: organizer, isSigner: true, isWritable: true },
      { pubkey: challenge, isSigner: false, isWritable: true },
    ],
    data,
  });
}

