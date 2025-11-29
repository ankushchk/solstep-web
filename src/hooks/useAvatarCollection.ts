"use client";

import { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import type { Avatar, LatLng } from "@/utils/types";

const STORAGE_KEY = "ar-fitness-avatars";

// Fallback to localStorage if not authenticated
function loadFromStorage(): Avatar[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Avatar[];
  } catch {
    return [];
  }
}

function saveToStorage(avatars: Avatar[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(avatars));
}

export function useAvatarCollection() {
  const { user } = useAuth();
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);

  // Load from Firebase if authenticated, otherwise localStorage
  useEffect(() => {
    if (!user) {
      // Not authenticated - use localStorage
      setAvatars(loadFromStorage());
      setLoading(false);
      return;
    }

    // Authenticated - use Firestore
    setLoading(true);
    // Query with userId filter only, then sort client-side to avoid index requirement
    const q = query(collection(db, "avatars"), where("userId", "==", user.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const firestoreAvatars: Avatar[] = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              checkpointId: data.checkpointId || "",
              checkpointName: data.checkpointName || "",
              imageDataUrl: data.imageDataUrl || "",
              location: data.location || { lat: 0, lng: 0 },
              collectedAt: data.collectedAt || new Date().toISOString(),
              nftMintAddress: data.nftMintAddress,
            } as Avatar;
          })
          .sort((a, b) => {
            // Sort by collectedAt descending (newest first)
            const aTime = new Date(a.collectedAt || 0).getTime();
            const bTime = new Date(b.collectedAt || 0).getTime();
            return bTime - aTime;
          });
        setAvatars(firestoreAvatars);
        setLoading(false);
      },
      (error) => {
        console.error("Error loading avatars:", error);
        // Fallback to localStorage on error
        setAvatars(loadFromStorage());
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Sync localStorage to Firestore when user logs in
  useEffect(() => {
    if (user && avatars.length > 0) {
      const localAvatars = loadFromStorage();
      if (localAvatars.length > 0) {
        // Migrate local avatars to Firestore (one-time)
        localAvatars.forEach(async (avatar) => {
          try {
            await addDoc(collection(db, "avatars"), {
              userId: user.uid,
              checkpointId: avatar.checkpointId,
              checkpointName: avatar.checkpointName,
              imageDataUrl: avatar.imageDataUrl,
              location: avatar.location,
              collectedAt: avatar.collectedAt,
              createdAt: serverTimestamp(),
            });
          } catch (error) {
            console.error("Error migrating avatar:", error);
          }
        });
        // Clear localStorage after migration
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, [user]);

  async function addAvatar(input: {
    checkpointId: string;
    checkpointName: string;
    imageDataUrl: string;
    location: LatLng;
    mintAddress?: string;
  }) {
    const now = new Date().toISOString();
    const avatar: Avatar = {
      id: `${input.checkpointId}-${now}`,
      checkpointId: input.checkpointId,
      checkpointName: input.checkpointName,
      imageDataUrl: input.imageDataUrl,
      location: input.location,
      collectedAt: now,
      nftMintAddress: input.mintAddress,
    };

    if (user) {
      // Save to Firestore
      try {
        await addDoc(collection(db, "avatars"), {
          userId: user.uid,
          checkpointId: input.checkpointId,
          checkpointName: input.checkpointName,
          imageDataUrl: input.imageDataUrl,
          location: input.location,
          collectedAt: now,
          nftMintAddress: input.mintAddress,
          createdAt: serverTimestamp(),
        });
        // Firestore listener will update state automatically
      } catch (error) {
        console.error("Error saving avatar to Firestore:", error);
        // Fallback to localStorage
        setAvatars((prev) => [avatar, ...prev]);
        saveToStorage([avatar, ...avatars]);
      }
    } else {
      // Not authenticated - use localStorage
      setAvatars((prev) => [avatar, ...prev]);
      saveToStorage([avatar, ...avatars]);
    }
  }

  return { avatars, addAvatar, loading };
}
