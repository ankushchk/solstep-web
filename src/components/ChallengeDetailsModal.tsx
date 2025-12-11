"use client";

import { PublicKey } from "@solana/web3.js";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { X } from "lucide-react";
import type { ChallengeAccount } from "@/hooks/useChallenges";
import type { Checkpoint } from "@/utils/types";

interface ChallengeDetailsModalProps {
  challenge: ChallengeAccount & {
    spots?: Checkpoint[];
    progress?: Map<string, { spotsCaptured: string[]; completedAt?: number }>;
    winner?: string;
    title?: string;
  };
  isOpen: boolean;
  onClose: () => void;
  userPublicKey?: PublicKey | null;
  userProgress?: { spotsCaptured: string[]; completedAt?: number } | null;
}

export function ChallengeDetailsModal({
  challenge,
  isOpen,
  onClose,
  userPublicKey,
  userProgress,
}: ChallengeDetailsModalProps) {
  if (!isOpen) return null;

  const isEnded = Number(challenge.endTs) < Math.floor(Date.now() / 1000);
  const isParticipant = challenge.participants?.some(
    (p: any) => {
      // Handle both PublicKey objects and strings
      let pAddress: string | undefined;
      if (p instanceof PublicKey) {
        pAddress = p.toBase58();
      } else if (typeof p === "string") {
        pAddress = p;
      } else if (p && typeof p === "object" && "toBase58" in p && typeof p.toBase58 === "function") {
        pAddress = (p as any).toBase58();
      }
      return pAddress === userPublicKey?.toBase58();
    }
  );
  const spotsCaptured = userProgress?.spotsCaptured.length || 0;
  const stakeAmount = Number(challenge.stakeAmount) / LAMPORTS_PER_SOL;
  const totalPool = Number(challenge.totalStake) / LAMPORTS_PER_SOL;

  const formatTime = (timestamp: bigint) => {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleString();
  };

  const getTimeRemaining = () => {
    if (isEnded) return "Ended";
    const now = Math.floor(Date.now() / 1000);
    const end = Number(challenge.endTs);
    const diff = end - now;
    if (diff <= 0) return "Ended";
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 rounded-2xl border border-slate-800 max-w-md w-full max-h-[90vh] overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-50">
            {challenge.title || "Challenge Details"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                challenge.winner
                  ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40"
                  : isEnded
                  ? "bg-red-500/20 text-red-300 border border-red-500/40"
                  : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
              }`}
            >
              {challenge.winner ? "Completed" : isEnded ? "Ended" : "Active"}
            </span>
            {challenge.winner && (
              <span className="text-xs text-slate-400">
                Winner: {challenge.winner.slice(0, 8)}...
              </span>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/50 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Stake Amount</p>
              <p className="text-sm font-bold text-emerald-400">
                {stakeAmount.toFixed(2)} SOL
              </p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Total Pool</p>
              <p className="text-sm font-bold text-cyan-400">
                {totalPool.toFixed(2)} SOL
              </p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Participants</p>
              <p className="text-sm font-bold text-slate-50">
                {challenge.participantCount}/{challenge.maxParticipants}
              </p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Time Remaining</p>
              <p className="text-sm font-bold text-amber-400">
                {getTimeRemaining()}
              </p>
            </div>
          </div>

          {/* Dates */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Start Time</span>
              <span className="text-slate-300">{formatTime(challenge.startTs)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">End Time</span>
              <span className="text-slate-300">{formatTime(challenge.endTs)}</span>
            </div>
          </div>

          {/* Organizer */}
          <div className="pt-2 border-t border-slate-800">
            <p className="text-xs text-slate-400 mb-1">Organizer</p>
            <p className="text-sm text-slate-300 font-mono">
              {(() => {
                let orgAddress: string = "Unknown";
                if (challenge.organizer instanceof PublicKey) {
                  orgAddress = challenge.organizer.toBase58();
                } else if (typeof challenge.organizer === "string") {
                  orgAddress = challenge.organizer;
                } else if (challenge.organizer && typeof challenge.organizer === "object" && "toBase58" in challenge.organizer && typeof (challenge.organizer as any).toBase58 === "function") {
                  orgAddress = (challenge.organizer as any).toBase58() || "Unknown";
                }
                return `${orgAddress.slice(0, 8)}...${orgAddress.slice(-6)}`;
              })()}
            </p>
          </div>

          {/* User Progress */}
          {isParticipant && userProgress && (
            <div className="pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-slate-300">
                  Your Progress
                </p>
                <p className="text-sm text-emerald-400 font-bold">
                  {spotsCaptured}/10 spots
                </p>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-3 mb-2">
                <div
                  className="bg-emerald-500 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${(spotsCaptured / 10) * 100}%` }}
                />
              </div>
              {spotsCaptured === 10 && !challenge.winner && (
                <p className="text-xs text-yellow-400 font-medium animate-pulse">
                  🎉 You collected all 10 spots! You're the winner!
                </p>
              )}
            </div>
          )}

          {/* Leaderboard */}
          {challenge.progress && challenge.progress.size > 0 && (
            <div className="pt-2 border-t border-slate-800">
              <p className="text-sm font-semibold text-slate-300 mb-3">
                Leaderboard
              </p>
              <div className="space-y-2">
                {Array.from(challenge.progress.entries())
                  .sort(
                    (a, b) =>
                      b[1].spotsCaptured.length - a[1].spotsCaptured.length ||
                      (a[1].completedAt || 0) - (b[1].completedAt || 0)
                  )
                  .slice(0, 10)
                  .map(([participantId, progress], idx) => (
                    <div
                      key={participantId}
                      className="flex items-center justify-between bg-slate-800/50 rounded-lg p-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 w-6 text-xs">
                          {idx === 0
                            ? "🥇"
                            : idx === 1
                            ? "🥈"
                            : idx === 2
                            ? "🥉"
                            : `${idx + 1}.`}
                        </span>
                        <span className="text-sm text-slate-300 font-mono">
                          {participantId === userPublicKey?.toBase58()
                            ? "You"
                            : participantId.slice(0, 6) + "..."}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-emerald-400 font-semibold">
                          {progress.spotsCaptured.length}/10
                        </span>
                        {progress.completedAt && (
                          <span className="text-xs text-yellow-400">✓</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Participants List */}
          <div className="pt-2 border-t border-slate-800">
            <p className="text-sm font-semibold text-slate-300 mb-2">
              Participants ({challenge.participantCount || challenge.participants?.length || 0})
            </p>
            <div className="grid grid-cols-1 gap-2">
              {challenge.participants && challenge.participants.length > 0 ? (
                challenge.participants.map((participant, idx) => {
                  let participantAddress: string;
                  if (participant instanceof PublicKey) {
                    participantAddress = participant.toBase58();
                  } else if (typeof participant === "string") {
                    participantAddress = participant;
                  } else if (participant && typeof participant === "object") {
                    const p = participant as { toBase58?: () => string };
                    participantAddress = p.toBase58?.() || "";
                  } else {
                    participantAddress = "";
                  }
                  const isCurrentUser = participantAddress === userPublicKey?.toBase58();
                  
                  return (
                    <div
                      key={idx}
                      className={`p-2 rounded-lg text-xs border ${
                        isCurrentUser
                          ? "bg-emerald-500/20 border-emerald-500/40"
                          : "bg-slate-800/50 border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 w-6">{idx + 1}.</span>
                        <span className={`font-mono text-slate-300 ${isCurrentUser ? "text-emerald-400 font-semibold" : ""}`}>
                          {isCurrentUser ? "You" : `${participantAddress.slice(0, 8)}...${participantAddress.slice(-6)}`}
                        </span>
                        {isCurrentUser && <span className="text-emerald-400 text-xs">(You)</span>}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-slate-400 text-center py-4">
                  No participants yet
                </p>
              )}
              {/* Fill remaining slots with empty placeholders */}
              {challenge.maxParticipants && challenge.participants && 
               challenge.participants.length < challenge.maxParticipants && (
                Array.from({ length: challenge.maxParticipants - challenge.participants.length }).map((_, idx) => (
                  <div
                    key={`empty-${idx}`}
                    className="p-2 rounded-lg text-xs bg-slate-800/30 border border-slate-700/50 border-dashed"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 w-6">{(challenge.participants?.length || 0) + idx + 1}.</span>
                      <span className="text-slate-500 italic">Empty slot</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

