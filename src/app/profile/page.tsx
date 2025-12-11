"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAvatarCollection } from "@/hooks/useAvatarCollection";
import { computeStatsFromAvatars } from "@/utils/stats";
import { useAuth } from "@/hooks/useAuth";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useSolana } from "@/hooks/useSolana";
import { NFTCard } from "@/components/NFTCard";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { auth } from "@/lib/firebase";

function ProfilePageContent() {
  const { user, signOut } = useAuth();
  const { profile } = useUserProfile(user);
  const { publicKey } = useSolana();
  const { avatars } = useAvatarCollection();
  const stats = computeStatsFromAvatars(avatars);
  const searchParams = useSearchParams();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    const googleFitStatus = searchParams.get("googleFit");
    const tokensParam = searchParams.get("tokens");
    const error = searchParams.get("error");
    
    if (googleFitStatus === "connected" && tokensParam && user) {
      // Store tokens from callback
      const storeTokens = async () => {
        try {
          // Decode base64url in browser (convert to base64 first)
          const base64 = tokensParam.replace(/-/g, "+").replace(/_/g, "/");
          const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
          const decoded = atob(padded);
          const tokens = JSON.parse(decoded);
          
          const ref = doc(db, "users", user.uid);
          await updateDoc(ref, {
            googleFit: {
              ...tokens,
              connectedAt: Date.now(),
            },
          });
          // Clean URL
          window.history.replaceState({}, "", "/profile");
        } catch (e: any) {
          console.error("Failed to store tokens:", e);
          setSyncError(`Failed to store tokens: ${e.message || "Unknown error"}`);
        }
      };
      storeTokens();
    }
    if (error) {
      setSyncError(error);
    }
  }, [searchParams, user]);

  const handleLinkWallet = async () => {
    if (!user || !publicKey) return;
    const ref = doc(db, "users", user.uid);
    await updateDoc(ref, {
      walletAddress: publicKey.toBase58(),
    });
  };

  const handleConnectGoogleFit = async () => {
    if (!user) return;
    try {
      // Pass uid as query param instead of verifying token server-side
      const response = await fetch(`/api/google-fit/auth?uid=${user.uid}`);
      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        setSyncError(data.error || "Failed to initiate Google Fit connection");
      }
    } catch (error: any) {
      setSyncError(error.message || "Failed to connect");
    }
  };

  const handleSyncGoogleFit = async () => {
    if (!user || !profile?.googleFit) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const response = await fetch("/api/google-fit/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          googleFit: profile.googleFit,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setSyncError(data.error || "Sync failed");
        return;
      }
      
      // Show warnings if any metrics failed
      if (data.warnings) {
        const warningMessages = Object.entries(data.warnings)
          .map(([metric, message]) => `${metric}: ${message}`)
          .join(", ");
        console.warn("Google Fit sync warnings:", warningMessages);
        // Optionally show warning to user (non-blocking)
        if (data.warnings.steps) {
          setSyncError(`Warning: ${data.warnings.steps}. Other data synced successfully.`);
        }
      }
      
      // Update Firestore with synced data
      const ref = doc(db, "users", user.uid);
      await updateDoc(ref, {
        googleFit: {
          ...profile.googleFit,
          ...(data.updatedTokens || {}),
          lastSyncedAt: Date.now(),
          totalSteps: data.steps || 0,
          totalDistanceMeters: data.distanceMeters || 0,
          totalCalories: data.calories || 0,
          activeMinutes: data.activeMinutes || 0,
          averageHeartRate: data.averageHeartRate || null,
        },
      });
    } catch (error: any) {
      setSyncError(error.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const isGoogleFitConnected = !!profile?.googleFit?.refreshToken;

  const handleLogout = async () => {
    try {
      await signOut();
      // Redirect will happen automatically via useAuth
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <main className="min-h-screen flex flex-col bg-slate-950 text-slate-50">
      <header className="px-4 pt-5 pb-3 border-b border-slate-800 bg-slate-950/95 sticky top-0 z-20">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div>
            <p className="text-[0.65rem] uppercase tracking-[0.25em] text-slate-500">
              Profile
            </p>
            <h1 className="text-xl font-semibold">
              {profile?.displayName || "Explorer"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="text-xs px-3 py-1 rounded-full border border-slate-700 text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Home
            </Link>
            {user && (
              <button
                type="button"
                onClick={handleLogout}
                className="text-xs px-3 py-1 rounded-full border border-red-700/50 text-red-400 hover:bg-red-950/30 transition-colors"
              >
                Logout
              </button>
            )}
          </div>
        </div>
      </header>

      <section className="px-4 py-4 max-w-md mx-auto w-full">
        {/* Wallet & integrations */}
        <div className="mb-4 flex flex-col gap-3 text-xs">
          <div className="rounded-2xl bg-slate-900/70 border border-slate-700 px-3 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.7rem] uppercase tracking-wide text-slate-400">
                Solana wallet
              </p>
              <p className="mt-1 text-[0.75rem] text-slate-200 break-all">
                {profile?.walletAddress
                  ? profile.walletAddress
                  : "Not linked"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleLinkWallet}
              disabled={!publicKey}
              className="text-[0.7rem] px-3 py-1.5 rounded-full border border-emerald-500 text-emerald-300 disabled:border-slate-600 disabled:text-slate-500"
            >
              {profile?.walletAddress ? "Update" : "Link"}
            </button>
          </div>
          <div className="rounded-2xl bg-slate-900/70 border border-slate-700 px-3 py-3 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className="text-[0.7rem] uppercase tracking-wide text-slate-400">
                  Google Fit
                </p>
                {isGoogleFitConnected && profile.googleFit?.lastSyncedAt ? (
                  <p className="mt-1 text-[0.65rem] text-slate-400">
                    Last synced: {new Date(profile.googleFit.lastSyncedAt).toLocaleString()}
                  </p>
                ) : (
                  <p className="mt-1 text-[0.75rem] text-slate-200">
                    {isGoogleFitConnected
                      ? "Connected - sync to get data"
                      : "Connect to sync fitness data"}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                {!isGoogleFitConnected ? (
                  <button
                    type="button"
                    onClick={handleConnectGoogleFit}
                    className="text-[0.7rem] px-3 py-1.5 rounded-full border border-emerald-500 text-emerald-300 hover:bg-emerald-500/10"
                  >
                    Connect
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSyncGoogleFit}
                    disabled={syncing}
                    className="text-[0.7rem] px-3 py-1.5 rounded-full border border-cyan-500 text-cyan-300 hover:bg-cyan-500/10 disabled:opacity-50"
                  >
                    {syncing ? "Syncing..." : "Sync Now"}
                  </button>
                )}
              </div>
            </div>

            {/* Fitness Metrics Grid */}
            {isGoogleFitConnected && profile.googleFit?.totalSteps != null && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-700/50">
                <div className="flex flex-col">
                  <p className="text-[0.65rem] text-slate-400 uppercase tracking-wide">Steps</p>
                  <p className="text-lg font-bold text-emerald-400 mt-0.5">
                    {profile.googleFit.totalSteps?.toLocaleString() || "0"}
                  </p>
                  <p className="text-[0.6rem] text-slate-500 mt-0.5">
                      Today&apos;s data
                    </p>
                </div>
                <div className="flex flex-col">
                  <p className="text-[0.65rem] text-slate-400 uppercase tracking-wide">Distance</p>
                  <p className="text-lg font-bold text-cyan-400 mt-0.5">
                    {profile.googleFit.totalDistanceMeters
                      ? (profile.googleFit.totalDistanceMeters / 1000).toFixed(1)
                      : "0"}
                    <span className="text-xs text-slate-400 ml-1">km</span>
                  </p>
                </div>
                {profile.googleFit.totalCalories != null && (
                  <div className="flex flex-col">
                    <p className="text-[0.65rem] text-slate-400 uppercase tracking-wide">Calories</p>
                    <p className="text-lg font-bold text-orange-400 mt-0.5">
                      {profile.googleFit.totalCalories.toLocaleString()}
                      <span className="text-xs text-slate-400 ml-1">kcal</span>
                    </p>
                  </div>
                )}
                {profile.googleFit.activeMinutes != null && (
                  <div className="flex flex-col">
                    <p className="text-[0.65rem] text-slate-400 uppercase tracking-wide">Active</p>
                    <p className="text-lg font-bold text-purple-400 mt-0.5">
                      {profile.googleFit.activeMinutes}
                      <span className="text-xs text-slate-400 ml-1">min</span>
                    </p>
                  </div>
                )}
                {profile.googleFit.averageHeartRate != null && (
                  <div className="flex flex-col col-span-2">
                    <p className="text-[0.65rem] text-slate-400 uppercase tracking-wide">Avg Heart Rate</p>
                    <p className="text-lg font-bold text-red-400 mt-0.5">
                      {profile.googleFit.averageHeartRate}
                      <span className="text-xs text-slate-400 ml-1">bpm</span>
                    </p>
                  </div>
                )}
              </div>
            )}

            {syncError && (
              <p className="text-[0.65rem] text-red-400 mt-1">{syncError}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="rounded-2xl bg-slate-900/70 border border-slate-700 px-3 py-3">
            <p className="text-[0.7rem] uppercase tracking-wide text-slate-400">
              Checkpoints visited
            </p>
            <p className="mt-1 text-2xl font-semibold">
              {stats.checkpointsVisited}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900/70 border border-slate-700 px-3 py-3">
            <p className="text-[0.7rem] uppercase tracking-wide text-slate-400">
              Avatars collected
            </p>
            <p className="mt-1 text-2xl font-semibold">
              {stats.avatarsCollected}
            </p>
          </div>
        </div>

        {/* NFT Collection Section */}
        {avatars.filter((avatar) => avatar.nftMintAddress).length > 0 && (
          <div className="rounded-2xl bg-slate-900/70 border border-slate-700 px-3 py-3 mt-3">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[0.7rem] uppercase tracking-wide text-slate-400">
                  🎨 NFT Collection
                </p>
                <p className="mt-1 text-[0.75rem] text-slate-200">
                  Your on-chain checkpoint proofs
                </p>
              </div>
              <span className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                {avatars.filter((avatar) => avatar.nftMintAddress).length} NFTs
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {avatars
                .filter((avatar) => avatar.nftMintAddress)
                .map((avatar) => (
                  <NFTCard
                    key={avatar.id}
                    avatar={avatar}
                    mintAddress={avatar.nftMintAddress!}
                  />
                ))}
            </div>
          </div>
        )}
      </section>

      <section className="flex-1 px-4 pb-6 max-w-md mx-auto w-full">
        <h2 className="font-semibold mb-2 text-sm">Avatar gallery</h2>
        {avatars.length === 0 ? (
          <p className="text-xs text-slate-300">
            You haven&apos;t collected any avatars yet. Head to the map to
            start exploring!
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-4">
            {avatars.map((avatar) => (
              <article
                key={avatar.id}
                className="rounded-2xl border border-slate-800 overflow-hidden flex flex-col bg-slate-900/80"
              >
                <img
                  src={avatar.imageDataUrl}
                  alt={avatar.checkpointName}
                  className="w-full aspect-square object-cover"
                />
                <div className="p-2 flex flex-col gap-1">
                  <p className="text-xs font-semibold truncate">
                    {avatar.checkpointName}
                  </p>
                  <p className="text-[0.7rem] text-slate-400">
                    {new Date(avatar.collectedAt).toLocaleString()}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-50">Loading...</div>}>
      <ProfilePageContent />
    </Suspense>
  );
}


