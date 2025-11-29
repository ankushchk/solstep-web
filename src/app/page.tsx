"use client";

import Link from "next/link";
import { useAvatarCollection } from "@/hooks/useAvatarCollection";
import { computeStatsFromAvatars } from "@/utils/stats";
import { useAuth } from "@/hooks/useAuth";
import { useUserProfile } from "@/hooks/useUserProfile";

export default function Home() {
  const { user, loading, signInWithGoogle, signOut } = useAuth();
  const { profile } = useUserProfile(user);
  const { avatars } = useAvatarCollection();
  const stats = computeStatsFromAvatars(avatars);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <p className="text-sm text-slate-300">Loading your session...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen flex flex-col items-stretch bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
        <section className="flex-1 flex flex-col justify-between px-5 pt-12 pb-6 max-w-md w-full mx-auto">
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
                Solstep
              </p>
              <h1 className="text-3xl font-extrabold leading-tight">
                Explore. Collect.{" "}
                <span className="text-emerald-400">Conquer.</span>
              </h1>
            </div>
            <p className="text-sm text-slate-300">
              Sign in with Google to save your progress, link your Solana
              wallet, and join movement challenges.
            </p>
          </div>
          <div className="space-y-3">
            <button
              type="button"
              onClick={signInWithGoogle}
              className="w-full rounded-full bg-white py-3.5 text-center text-[0.95rem] font-semibold text-slate-900 shadow-lg active:scale-[0.99]"
            >
              Continue with Google
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col items-stretch bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <section className="flex-1 flex flex-col justify-between px-5 pt-12 pb-6 max-w-md w-full mx-auto">
        <div className="space-y-6 text-center">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">
              Solstep
            </p>
            <h1 className="text-3xl font-extrabold leading-tight">
              Explore. Collect.{" "}
              <span className="text-emerald-400">Conquer.</span>
            </h1>
          </div>

          <p className="text-sm text-slate-300">
            Walk your city, discover real locations, and collect avatars as you
            move. Built for mobile, powered by your movement.
          </p>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="rounded-2xl bg-slate-900/70 border border-slate-700 px-3 py-3 text-left">
              <p className="text-[0.7rem] uppercase tracking-wide text-slate-400">
                Checkpoints
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {stats.checkpointsVisited}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-900/70 border border-slate-700 px-3 py-3 text-left">
              <p className="text-[0.7rem] uppercase tracking-wide text-slate-400">
                Avatars
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {stats.avatarsCollected}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-900/70 border border-slate-700 px-3 py-3 text-left">
              <p className="text-[0.7rem] uppercase tracking-wide text-slate-400">
                Streak
              </p>
              <p className="mt-1 text-2xl font-semibold">{stats.streakDays}d</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Link
            href="/map"
            className="block w-full rounded-full bg-emerald-500 py-3.5 text-center text-[0.95rem] font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 active:scale-[0.99]"
          >
            Start Exploring
          </Link>
          <Link
            href="/profile"
            className="block w-full rounded-full border border-slate-600 py-3 text-center text-[0.9rem] font-medium text-slate-100 bg-slate-900/60"
          >
            View Profile
          </Link>
        </div>
      </section>
    </main>
  );
}
