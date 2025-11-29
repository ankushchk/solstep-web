"use client";

import { useEffect, useState, useCallback } from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  User,
} from "firebase/auth";
import {
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db, googleProvider } from "@/lib/firebase";

type AuthState =
  | { loading: true; user: null }
  | { loading: false; user: User | null };

export function useAuth() {
  const [state, setState] = useState<AuthState>({ loading: true, user: null });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setState({ loading: false, user });
      if (user) {
        const ref = doc(db, "users", user.uid);
        await setDoc(
          ref,
          {
            uid: user.uid,
            displayName: user.displayName ?? "",
            email: user.email ?? "",
            photoURL: user.photoURL ?? "",
            // walletAddress: null,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          },
          { merge: true },
        );
      }
    });
    return () => unsub();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  return {
    ...state,
    signInWithGoogle,
    signOut,
  };
}


