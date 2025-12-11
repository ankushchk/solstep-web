"use client";

import { useMemo, useState } from "react";
import { useChallenges } from "@/hooks/useChallenges";
import { useSolana } from "@/hooks/useSolana";
import { useAuth } from "@/hooks/useAuth";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import Link from "next/link";
import { ChallengeDetailsModal } from "@/components/ChallengeDetailsModal";
import type { ChallengeAccount } from "@/hooks/useChallenges";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useEffect } from "react";

type ChallengeStatus = "all" | "completed" | "timed_out" | "cancelled" | "active";
type ParticipationStatus = "won" | "lost" | "participated" | "not_participated";

interface ChallengeWithHistory extends ChallengeAccount {
  status: "active" | "completed" | "timed_out" | "cancelled";
  participationStatus?: ParticipationStatus;
  winner?: string;
  payout?: number;
  firestoreData?: any;
}

export default function HistoryPage() {
  const { publicKey } = useSolana();
  const { user } = useAuth();
  const { data: challenges = [], isLoading } = useChallenges();
  const [selectedStatus, setSelectedStatus] = useState<ChallengeStatus>("all");
  const [selectedChallenge, setSelectedChallenge] = useState<ChallengeWithHistory | null>(null);
  const [challengesWithHistory, setChallengesWithHistory] = useState<ChallengeWithHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Load Firestore data and determine challenge status
  useEffect(() => {
    const loadChallengeHistory = async () => {
      if (challenges.length === 0) {
        setChallengesWithHistory([]);
        setLoadingHistory(false);
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const enriched: ChallengeWithHistory[] = [];

      for (const challenge of challenges) {
        const challengeId = challenge.publicKey.toBase58();
        const isEnded = Number(challenge.endTs) < now;
        const isFinalized = challenge.isFinalized;

        // Determine status
        let status: "active" | "completed" | "timed_out" | "cancelled" = "active";
        if (isFinalized) {
          status = "completed";
        } else if (isEnded && !isFinalized) {
          status = "timed_out";
        }

        // Get Firestore data
        let firestoreData = null;
        try {
          const challengeDoc = await getDoc(doc(db, "challenges", challengeId));
          if (challengeDoc.exists()) {
            firestoreData = challengeDoc.data();
            if (firestoreData.winner) {
              status = "completed";
            }
          }
        } catch (error) {
          console.warn("Failed to load Firestore data for challenge:", challengeId, error);
        }

        // Determine participation status
        let participationStatus: ParticipationStatus = "not_participated";
        let payout = 0;
        const winner = firestoreData?.winner || null;

        if (publicKey) {
          const isParticipant = challenge.participants?.some(
            (p: any) => {
              const pAddress = p instanceof PublicKey ? p.toBase58() : (typeof p === "string" ? p : p?.toBase58?.());
              return pAddress === publicKey.toBase58();
            }
          );

          if (isParticipant) {
            if (winner && winner === publicKey.toBase58()) {
              participationStatus = "won";
              // Calculate payout: total stake (all participants' stakes)
              payout = Number(challenge.totalStake) / LAMPORTS_PER_SOL;
            } else if (winner && winner !== publicKey.toBase58()) {
              participationStatus = "lost";
              // Lost: stake amount is forfeited
              payout = -(Number(challenge.stakeAmount) / LAMPORTS_PER_SOL);
            } else if (status === "timed_out") {
              participationStatus = "participated";
              // Timeout: stake is returned
              payout = 0;
            } else {
              participationStatus = "participated";
            }
          }
        }

        enriched.push({
          ...challenge,
          status,
          participationStatus,
          winner,
          payout,
          firestoreData,
        });
      }

      setChallengesWithHistory(enriched);
      setLoadingHistory(false);
    };

    loadChallengeHistory();
  }, [challenges, publicKey]);

  // Filter challenges by status
  const filteredChallenges = useMemo(() => {
    if (selectedStatus === "all") {
      return challengesWithHistory;
    }
    return challengesWithHistory.filter((c) => c.status === selectedStatus);
  }, [challengesWithHistory, selectedStatus]);

  // Group challenges by participation status
  const groupedChallenges = useMemo(() => {
    const groups = {
      won: filteredChallenges.filter((c) => c.participationStatus === "won"),
      lost: filteredChallenges.filter((c) => c.participationStatus === "lost"),
      participated: filteredChallenges.filter((c) => c.participationStatus === "participated"),
      not_participated: filteredChallenges.filter((c) => c.participationStatus === "not_participated"),
    };
    return groups;
  }, [filteredChallenges]);

  const formatTime = (timestamp: bigint) => {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getStatusBadge = (challenge: ChallengeWithHistory) => {
    if (challenge.status === "completed") {
      return (
        <span className="px-2.5 py-1 rounded-full text-[0.65rem] font-semibold bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
          ✅ Completed
        </span>
      );
    } else if (challenge.status === "timed_out") {
      return (
        <span className="px-2.5 py-1 rounded-full text-[0.65rem] font-semibold bg-orange-500/20 text-orange-300 border border-orange-500/40">
          ⏱️ Timed Out
        </span>
      );
    } else if (challenge.status === "cancelled") {
      return (
        <span className="px-2.5 py-1 rounded-full text-[0.65rem] font-semibold bg-red-500/20 text-red-300 border border-red-500/40">
          ❌ Cancelled
        </span>
      );
    } else {
      return (
        <span className="px-2.5 py-1 rounded-full text-[0.65rem] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
          🟢 Active
        </span>
      );
    }
  };

  const getParticipationBadge = (challenge: ChallengeWithHistory) => {
    if (challenge.participationStatus === "won") {
      return (
        <span className="px-2.5 py-1 rounded-full text-[0.65rem] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
          🏆 Won
        </span>
      );
    } else if (challenge.participationStatus === "lost") {
      return (
        <span className="px-2.5 py-1 rounded-full text-[0.65rem] font-semibold bg-red-500/20 text-red-400 border border-red-500/40">
          😔 Lost
        </span>
      );
    } else if (challenge.participationStatus === "participated") {
      return (
        <span className="px-2.5 py-1 rounded-full text-[0.65rem] font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/40">
          ✓ Participated
        </span>
      );
    }
    return null;
  };

  return (
    <main className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <header className="px-4 pt-5 pb-3 border-b border-slate-800/50 bg-slate-950/95 backdrop-blur-sm sticky top-0 z-20 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          <Link
            href="/map"
            className="text-slate-400 hover:text-slate-200 transition-colors"
            title="Back to Map"
          >
            ← Back
          </Link>
          <h1 className="text-lg font-bold text-slate-50">Challenge History</h1>
          <div className="w-12" /> {/* Spacer for centering */}
        </div>
      </header>

      <div className="flex-1 px-4 py-4 max-w-md mx-auto w-full space-y-4">
        {/* Status Filter */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {(["all", "completed", "timed_out", "cancelled", "active"] as ChallengeStatus[]).map((status) => (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                selectedStatus === status
                  ? "bg-emerald-500 text-slate-950"
                  : "bg-slate-800/70 text-slate-300 hover:bg-slate-700/70"
              }`}
            >
              {status === "all" ? "All" : status === "timed_out" ? "Timed Out" : status.charAt(0).toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>

        {/* Stats Summary */}
        {publicKey && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-3 text-center">
              <p className="text-xs text-slate-400 mb-1">Won</p>
              <p className="text-lg font-bold text-emerald-400">{groupedChallenges.won.length}</p>
            </div>
            <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-3 text-center">
              <p className="text-xs text-slate-400 mb-1">Lost</p>
              <p className="text-lg font-bold text-red-400">{groupedChallenges.lost.length}</p>
            </div>
            <div className="rounded-xl bg-slate-900/70 border border-slate-800 p-3 text-center">
              <p className="text-xs text-slate-400 mb-1">Total</p>
              <p className="text-lg font-bold text-slate-300">{groupedChallenges.participated.length + groupedChallenges.won.length + groupedChallenges.lost.length}</p>
            </div>
          </div>
        )}

        {/* Challenges List */}
        {isLoading || loadingHistory ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            <p className="text-xs text-slate-400">Loading challenge history...</p>
          </div>
        ) : filteredChallenges.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <p className="text-sm text-slate-400">No challenges found</p>
            <p className="text-xs text-slate-500">
              {selectedStatus === "all"
                ? "You haven't participated in any challenges yet."
                : `No ${selectedStatus.replace("_", " ")} challenges found.`}
            </p>
            <Link
              href="/map"
              className="inline-block mt-4 px-4 py-2 rounded-full bg-emerald-500 text-slate-950 text-xs font-semibold hover:bg-emerald-400 transition-colors"
            >
              Browse Challenges
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredChallenges.map((challenge) => {
              const organizerAddress = challenge.organizer instanceof PublicKey
                ? challenge.organizer.toBase58()
                : (typeof challenge.organizer === "string"
                  ? challenge.organizer
                  : (challenge.organizer && typeof challenge.organizer === "object" && "toBase58" in challenge.organizer
                    ? (challenge.organizer as { toBase58: () => string }).toBase58()
                    : ""));

              return (
                <div
                  key={challenge.publicKey.toBase58()}
                  className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3 hover:border-slate-700 transition-all cursor-pointer"
                  onClick={() => setSelectedChallenge(challenge)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold text-slate-50">
                          🏆 {challenge.firestoreData?.title || challenge.title || "Challenge"}
                        </p>
                        {getParticipationBadge(challenge)}
                      </div>
                      <p className="text-xs text-slate-400 mb-2">
                        by {challenge.firestoreData?.organizerName || organizerAddress.slice(0, 8) + "..."}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-slate-300">
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">👥</span>
                          <span>
                            {challenge.participantCount}/{challenge.maxParticipants}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-slate-400">💰</span>
                          <span>
                            {(Number(challenge.stakeAmount) / LAMPORTS_PER_SOL).toFixed(2)} SOL
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getStatusBadge(challenge)}
                    </div>
                  </div>

                  {/* Results & Payout */}
                  {challenge.status !== "active" && (
                    <div className="pt-2 border-t border-slate-700/50">
                      <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
                        {challenge.winner && (
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-slate-300">Winner:</p>
                            <p className="text-xs font-mono text-emerald-400">
                              {challenge.winner === publicKey?.toBase58()
                                ? "You 🏆"
                                : challenge.winner.slice(0, 8) + "..." + challenge.winner.slice(-6)}
                            </p>
                          </div>
                        )}
                        {challenge.participationStatus && challenge.participationStatus !== "not_participated" && (
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-slate-300">Your Result:</p>
                            <p
                              className={`text-xs font-semibold ${
                                challenge.participationStatus === "won"
                                  ? "text-emerald-400"
                                  : challenge.participationStatus === "lost"
                                  ? "text-red-400"
                                  : "text-blue-400"
                              }`}
                            >
                              {challenge.participationStatus === "won"
                                ? "🏆 Winner"
                                : challenge.participationStatus === "lost"
                                ? "😔 Lost"
                                : "✓ Participated"}
                            </p>
                          </div>
                        )}
                        {challenge.payout !== undefined && challenge.participationStatus !== "not_participated" && (
                          <div className="flex items-center justify-between pt-1 border-t border-slate-700/50">
                            <p className="text-xs font-semibold text-slate-300">Payout:</p>
                            <p
                              className={`text-xs font-bold ${
                                challenge.payout > 0
                                  ? "text-emerald-400"
                                  : challenge.payout < 0
                                  ? "text-red-400"
                                  : "text-slate-400"
                              }`}
                            >
                              {challenge.payout > 0
                                ? `+${challenge.payout.toFixed(2)} SOL`
                                : challenge.payout < 0
                                ? `${challenge.payout.toFixed(2)} SOL`
                                : "0.00 SOL (Refunded)"}
                            </p>
                          </div>
                        )}
                        <div className="flex items-center justify-between text-[0.7rem] text-slate-400 pt-1">
                          <span>Ended: {formatTime(challenge.endTs)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Active Challenge Info */}
                  {challenge.status === "active" && (
                    <div className="pt-2 border-t border-slate-700/50">
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span>Ends: {formatTime(challenge.endTs)}</span>
                        {challenge.participationStatus === "participated" && (
                          <span className="text-blue-400">You're in this challenge</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Challenge Details Modal */}
      {selectedChallenge && (
        <ChallengeDetailsModal
          challenge={{
            ...selectedChallenge,
            spots: selectedChallenge.firestoreData?.spots || [],
            progress: selectedChallenge.firestoreData?.progress || new Map(),
            title: selectedChallenge.firestoreData?.title || selectedChallenge.title,
            winner: selectedChallenge.winner,
          }}
          isOpen={!!selectedChallenge}
          onClose={() => setSelectedChallenge(null)}
          userPublicKey={publicKey}
          userProgress={
            selectedChallenge.firestoreData?.progress && user
              ? selectedChallenge.firestoreData.progress.get(user.uid)
              : null
          }
        />
      )}
    </main>
  );
}

