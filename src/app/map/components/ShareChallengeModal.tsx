import { QRCodeSVG } from "qrcode.react";
import { PublicKey } from "@solana/web3.js";
import { useMemo } from "react";
import {
  ChallengeWithProgress,
  TxStatus,
  getChallengeId,
} from "../types";

type ShareChallengeModalProps = {
  challenge: ChallengeWithProgress;
  publicKey: PublicKey | null | undefined;
  inviteWalletAddress: string;
  invitingChallenge: string | null;
  onInviteAddressChange: (value: string) => void;
  onSendInvite: (address: string, challengeId: string) => Promise<void>;
  onClose: () => void;
  setTxStatus: (status: TxStatus | null) => void;
};

export function ShareChallengeModal({
  challenge,
  publicKey,
  inviteWalletAddress,
  invitingChallenge,
  onInviteAddressChange,
  onSendInvite,
  onClose,
  setTxStatus,
}: ShareChallengeModalProps) {
  const challengeId = getChallengeId(challenge);

  const shareLink = useMemo(() => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/map?challenge=${challengeId}`;
  }, [challengeId]);

  const handleCopy = async () => {
    if (typeof navigator === "undefined") return;
    await navigator.clipboard.writeText(shareLink);
    setTxStatus({
      type: "success",
      message: "Link copied to clipboard!",
    });
    setTimeout(() => setTxStatus(null), 2000);
  };

  const handleSocialShare = () => {
    if (typeof window === "undefined") return;
    const text = `Join my 10-Spot Challenge! First to capture all 10 spots wins!`;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(
        text
      )}&url=${encodeURIComponent(shareLink)}`,
      "_blank"
    );
  };

  const handleNativeShare = () => {
    if (typeof navigator === "undefined" || !navigator.share) return;
    navigator.share({
      title: "Join my 10-Spot Challenge!",
      text: `First to capture all 10 spots wins!`,
      url: shareLink,
    });
  };

  const handleSendInviteClick = async () => {
    if (!inviteWalletAddress.trim()) {
      setTxStatus({
        type: "error",
        message: "Please enter a wallet address",
      });
      return;
    }

    try {
      await onSendInvite(inviteWalletAddress.trim(), challengeId);
      setTxStatus({
        type: "success",
        message:
          "Invite sent! They'll see it when they connect their wallet.",
      });
      onInviteAddressChange("");
      setTimeout(() => setTxStatus(null), 3000);
    } catch (error: any) {
      setTxStatus({
        type: "error",
        message: error?.message || "Failed to send invite",
      });
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 rounded-2xl border border-slate-700 p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-50">Share Challenge</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-300 mb-2">
              Share Link
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={shareLink}
                className="flex-1 rounded-md bg-slate-950/70 border border-slate-700 px-3 py-2 text-xs font-mono"
              />
              <button
                onClick={handleCopy}
                className="px-4 py-2 rounded-md bg-emerald-500/90 text-slate-950 text-xs font-semibold hover:bg-emerald-500"
              >
                Copy
              </button>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2">
            <label className="block text-xs text-slate-300">
              Scan to Join
            </label>
            <div className="bg-white p-4 rounded-lg">
              <QRCodeSVG value={shareLink} size={200} />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-300 mb-2">
              Share via
            </label>
            <div className="flex gap-2">
              <button
                onClick={handleSocialShare}
                className="flex-1 px-3 py-2 rounded-md bg-blue-500/90 text-white text-xs font-semibold hover:bg-blue-500"
              >
                Twitter
              </button>
              <button
                onClick={handleNativeShare}
                className="flex-1 px-3 py-2 rounded-md bg-purple-500/90 text-white text-xs font-semibold hover:bg-purple-500"
              >
                Share
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-700/50">
            <label className="block text-xs text-slate-300 mb-2">
              Invite by Wallet Address
            </label>
            {!publicKey ? (
              <div className="rounded-md bg-slate-800/50 border border-slate-700 p-3 text-xs text-slate-400">
                💡 Connect your wallet to send direct invites by wallet address.
                You can still share the link above!
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter wallet address"
                    value={inviteWalletAddress}
                    onChange={(e) => onInviteAddressChange(e.target.value)}
                    className="flex-1 rounded-md bg-slate-950/70 border border-slate-700 px-3 py-2 text-xs font-mono"
                  />
                  <button
                    onClick={handleSendInviteClick}
                    disabled={
                      !inviteWalletAddress.trim() ||
                      invitingChallenge === challengeId
                    }
                    className="px-4 py-2 rounded-md bg-cyan-500/90 text-slate-950 text-xs font-semibold hover:bg-cyan-500 disabled:opacity-50"
                  >
                    {invitingChallenge === challengeId
                      ? "Sending..."
                      : "Send Invite"}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  They&apos;ll receive a notification when they connect their
                  wallet
                </p>
              </>
            )}
          </div>

          <div className="pt-4 border-t border-slate-700/50 text-xs text-slate-300 space-y-1">
            <p>
              <span className="font-semibold">Organizer:</span>{" "}
              {(challenge as any).organizerName || "Anonymous"}
            </p>
            <p>
              <span className="font-semibold">Participants:</span>{" "}
              {challenge.participantCount}/{challenge.maxParticipants}
            </p>
            {(challenge as any).endTs && (
              <p>
                <span className="font-semibold">Time Left:</span>{" "}
                {Math.floor(
                  (Number((challenge as any).endTs) - Date.now() / 1000) / 3600
                )}{" "}
                hours
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

