import type { ChallengeAccount } from "@/hooks/useChallenges";
import type { Checkpoint } from "@/utils/types";

export type ChallengeProgress = {
  challengeId: string;
  participantId: string;
  spotsCaptured: string[];
  completedAt?: number;
};

export type ChallengeWithProgress = Omit<
  ChallengeAccount,
  "endTs" | "stakeAmount" | "startTs" | "totalStake"
> & {
  spots: Checkpoint[];
  progress: Map<string, ChallengeProgress>;
  winner?: string;
  id?: string;
  organizerName?: string;
  endTs?: number;
  title?: string;
  stakeAmount?: number;
};

export type TxStatus = { type: "success" | "error"; message: string };

export function getChallengeId(challenge: ChallengeWithProgress | any): string {
  return challenge?.id || challenge?.publicKey?.toBase58?.() || "";
}

