"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { User } from "firebase/auth";

export type UserProfile = {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  walletAddress: string | null;
  googleFit?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    connectedAt?: number;
    lastSyncedAt?: number;
    totalSteps?: number;
    totalDistanceMeters?: number;
    totalCalories?: number;
    activeMinutes?: number;
    averageHeartRate?: number;
  };
};

type ProfileState =
  | { loading: true; profile: null }
  | { loading: false; profile: UserProfile | null };

export function useUserProfile(user: User | null) {
  const [state, setState] = useState<ProfileState>({
    loading: !!user,
    profile: null,
  });

  useEffect(() => {
    if (!user) {
      setState({ loading: false, profile: null });
      return;
    }

    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setState({ loading: false, profile: null });
          return;
        }
        setState({
          loading: false,
          profile: snap.data() as UserProfile,
        });
      },
      () => {
        setState({ loading: false, profile: null });
      },
    );

    return () => unsub();
  }, [user]);

  return state;
}


