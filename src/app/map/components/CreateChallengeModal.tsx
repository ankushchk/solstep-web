import type { PublicKey } from "@solana/web3.js";
import type { TxStatus } from "../types";
import type { Checkpoint } from "@/utils/types";

type CheckpointsState =
  | { status: "loading"; data: Checkpoint[] }
  | { status: "error"; data: Checkpoint[] }
  | { status: "ready"; data: Checkpoint[] };

type CreateChallengeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  challengeTitle: string;
  setChallengeTitle: (value: string) => void;
  stakeSol: string;
  setStakeSol: (value: string) => void;
  durationHours: string;
  setDurationHours: (value: string) => void;
  maxParticipants: string;
  setMaxParticipants: (value: string) => void;
  txStatus: TxStatus | null;
  checkpointsState: CheckpointsState;
  creatingChallenge: boolean;
  publicKey: PublicKey | null;
  dailyChallengeCount: number | null;
  handleCreateChallenge: () => void;
  setSelectedSpots: (spots: Checkpoint[]) => void;
  resetStake: () => void;
};

export function CreateChallengeModal({
  isOpen,
  onClose,
  challengeTitle,
  setChallengeTitle,
  stakeSol,
  setStakeSol,
  durationHours,
  setDurationHours,
  maxParticipants,
  setMaxParticipants,
  txStatus,
  checkpointsState,
  creatingChallenge,
  publicKey,
  dailyChallengeCount,
  handleCreateChallenge,
  setSelectedSpots,
  resetStake,
}: CreateChallengeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-50">
            Create 10-Spot Challenge (On-Chain)
          </h2>
          <button
            onClick={() => {
              onClose();
              setSelectedSpots([]);
              setChallengeTitle("");
              resetStake();
            }}
            className="text-slate-400 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-200">
              Challenge Title{" "}
              <span className="text-slate-500 font-normal">(optional)</span>
            </span>
            <input
              className="rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
              type="text"
              placeholder="e.g., Weekend Warrior Challenge"
              value={challengeTitle}
              onChange={(e) => setChallengeTitle(e.target.value)}
              maxLength={50}
            />
          </label>

          <div className="mb-2">
            <p className="text-sm text-slate-300 mb-2">
              🎲 10 random spots will be automatically selected from nearby
              checkpoints. First person to capture all 10 wins!
            </p>
            <p className="text-xs text-slate-400">
              {checkpointsState.status === "ready"
                ? `${checkpointsState.data.length} nearby checkpoints available`
                : "Loading checkpoints..."}
            </p>
          </div>

          {txStatus && (
            <div
              className={`rounded-lg border p-3 text-xs ${
                txStatus.type === "success"
                  ? "bg-emerald-950/30 border-emerald-800/50 text-emerald-300"
                  : "bg-red-950/30 border-red-800/50 text-red-300"
              }`}
            >
              {txStatus.message}
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-200">
              Stake Amount (SOL) <span className="text-red-400">*</span>
            </span>
            <input
              className="rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
              type="number"
              min="0.1"
              step="0.1"
              placeholder="0.1"
              value={stakeSol}
              onChange={(e) => setStakeSol(e.target.value)}
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              Amount each participant needs to stake to join (required)
            </p>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-300">Duration (hours)</span>
            <input
              className="rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
              type="number"
              min="1"
              step="1"
              value={durationHours}
              onChange={(e) => setDurationHours(e.target.value)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-300">Max Participants</span>
            <input
              className="rounded-lg bg-slate-950/70 border border-slate-700 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500"
              type="number"
              min="1"
              max="50"
              value={maxParticipants}
              onChange={(e) => setMaxParticipants(e.target.value)}
            />
          </label>

          <button
            type="button"
            onClick={handleCreateChallenge}
            disabled={
              creatingChallenge ||
              !publicKey ||
              checkpointsState.status !== "ready" ||
              checkpointsState.data.length < 10 ||
              (dailyChallengeCount !== null && dailyChallengeCount >= 2) ||
              !stakeSol ||
              Number(stakeSol) <= 0
            }
            className="w-full rounded-full bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 disabled:bg-slate-700 disabled:text-slate-400"
          >
            {creatingChallenge
              ? "Creating..."
              : dailyChallengeCount !== null && dailyChallengeCount >= 2
              ? "Daily Limit Reached (2/2)"
              : checkpointsState.data.length < 10
              ? `Need ${10 - checkpointsState.data.length} more checkpoints`
              : dailyChallengeCount !== null
              ? `Create Challenge (${dailyChallengeCount}/2 today)`
              : "Create Challenge"}
          </button>
        </div>
      </div>
    </div>
  );
}

