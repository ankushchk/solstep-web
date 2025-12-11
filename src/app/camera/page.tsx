"use client";

import { useCallback, useRef, useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Webcam from "react-webcam";

import { useAvatarCollection } from "@/hooks/useAvatarCollection";
import type { LatLng } from "@/utils/types";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useSolana } from "@/hooks/useSolana";
import { useNFTMinting } from "@/hooks/useNFTMinting";
import toast from "react-hot-toast";
import {
  collection,
  query,
  where,
  getDocs,
  setDoc,
  doc,
  updateDoc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useGeolocation } from "@/hooks/useGeolocation";
import { isWithinRadius, distanceBetween } from "@/utils/location";

const videoConstraints = {
  facingMode: "environment",
};

const LOCATION_VERIFICATION_RADIUS_METERS = 100; // 100 meters tolerance (matches map page)

function CameraPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { addAvatar, avatars } = useAvatarCollection();
  const webcamRef = useRef<Webcam | null>(null);
  const { user } = useAuth();
  const { publicKey } = useSolana();
  const { mintNFT, isMinting, progress: mintProgress } = useNFTMinting();
  const { position: currentPosition, status: geoStatus } = useGeolocation(true);

  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAtCheckpoint, setIsAtCheckpoint] = useState<boolean | null>(null);
  const [distanceFromCheckpoint, setDistanceFromCheckpoint] = useState<
    number | null
  >(null);
  const [shouldMintNFT, setShouldMintNFT] = useState(false);
  const [nftMintAddress, setNftMintAddress] = useState<string | null>(null);

  const checkpointId = searchParams.get("checkpointId") ?? "unknown";
  const checkpointName =
    searchParams.get("checkpointName") ?? "Unknown checkpoint";

  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");

  const checkpointLocation: LatLng | null =
    lat && lng
      ? { lat: Number.parseFloat(lat), lng: Number.parseFloat(lng) }
      : null;

  // Check if this checkpoint has already been collected
  const isAlreadyCollected =
    checkpointId !== "unknown"
      ? avatars.some((avatar) => avatar.checkpointId === checkpointId)
      : false;

  // Check location continuously when position updates
  useEffect(() => {
    if (!checkpointLocation || !currentPosition || geoStatus !== "ready") {
      setIsAtCheckpoint(null);
      setDistanceFromCheckpoint(null);
      if (geoStatus === "ready" && checkpointLocation && !currentPosition) {
        setError(
          "Unable to get your location. Please enable location services."
        );
      }
      return;
    }

    const distance = distanceBetween(currentPosition, checkpointLocation);
    const atLocation = isWithinRadius(
      currentPosition,
      checkpointLocation,
      LOCATION_VERIFICATION_RADIUS_METERS
    );

    setDistanceFromCheckpoint(Math.round(distance));
    setIsAtCheckpoint(atLocation);

    if (!atLocation) {
      setError(
        `You are ${Math.round(
          distance
        )}m away from the checkpoint. Please move within ${LOCATION_VERIFICATION_RADIUS_METERS}m to capture.`
      );
    } else {
      setError(null);
    }
  }, [currentPosition, checkpointLocation, geoStatus]);

  const handleCapture = useCallback(() => {
    if (!isAtCheckpoint) {
      const errorMsg = `You must be within ${LOCATION_VERIFICATION_RADIUS_METERS}m of the checkpoint to capture.`;
      console.warn("Capture blocked:", errorMsg);
      setError(errorMsg);
      return;
    }

    if (!webcamRef.current) {
      console.error("Webcam ref is null");
      setError("Camera not ready. Please refresh the page.");
      return;
    }

    try {
      setIsCapturing(true);
      const screenshot = webcamRef.current.getScreenshot();
      
      if (!screenshot) {
        console.error("Screenshot returned null");
        setError("Failed to capture image. Please try again.");
        setIsCapturing(false);
        return;
      }

      setPreview(screenshot);
      setError(null);
      setIsCapturing(false);
    } catch (e) {
      console.error("Capture error:", e);
      setError(`Capture failed: ${e instanceof Error ? e.message : "Unknown error"}`);
      setIsCapturing(false);
    }
  }, [isAtCheckpoint, LOCATION_VERIFICATION_RADIUS_METERS]);

  const handleSave = async () => {
      hasUser: !!user,
      isAlreadyCollected,
      currentPosition,
      geoStatus,
    });

    if (!preview || !checkpointLocation) {
      setError("Missing capture or location data.");
      console.error("Missing data:", {
        preview: !!preview,
        checkpointLocation: !!checkpointLocation,
      });
      return;
    }

    if (!user) {
      setError(
        "Please sign in to save avatars. You'll be redirected to sign in."
      );
      setTimeout(() => router.push("/"), 2000);
      return;
    }

    if (isAlreadyCollected) {
      router.push("/map");
      return;
    }

    // Verify geolocation
    setIsVerifying(true);
    setError(null);

    if (!currentPosition) {
      console.warn("No current position available, geoStatus:", geoStatus);
      setError(
        `Unable to verify location (Status: ${geoStatus}). Please enable location services and try again.`
      );
      setIsVerifying(false);
      return;
    }

    // Check if user is at the checkpoint location
    // Calculate actual distance for logging
    const actualDistance = distanceBetween(currentPosition, checkpointLocation);
    const isAtLocation = isWithinRadius(
      currentPosition,
      checkpointLocation,
      LOCATION_VERIFICATION_RADIUS_METERS
    );

      checkpointLocation,
      isAtLocation,
      actualDistanceMeters: Math.round(actualDistance),
      radius: LOCATION_VERIFICATION_RADIUS_METERS,
    });

    if (!isAtLocation) {
      const distance = Math.round(actualDistance);
      const errorMsg = `Location verification failed! You are ${distance}m away from the checkpoint. Please move to the location to capture.`;
      console.warn("Location verification failed:", errorMsg);
      setError(errorMsg);
      setIsVerifying(false);
      return;
    }

    setIsVerifying(false);

    // Save avatar (no wallet/NFT required)
    setIsSaving(true);
    setError(null);

    try {

      if (!preview) {
        throw new Error("No preview image available");
      }

      // Save avatar first
      let mintAddress: string | undefined = undefined;

      // Mint NFT if requested and wallet is connected
      if (shouldMintNFT && publicKey) {
        try {
          mintAddress = await mintNFT({
            imageDataUrl: preview,
            checkpointId,
            checkpointName,
            location: checkpointLocation,
            verifiedLocation: currentPosition,
            collectedAt: new Date().toISOString(),
            userId: user.uid,
          });

          setNftMintAddress(mintAddress);
          
          toast.success(
            <div>
              <div>NFT minted successfully!</div>
              {mintAddress && (
                <a
                  href={`https://solscan.io/token/${mintAddress}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs underline mt-1 block"
                >
                  View on Solscan →
                </a>
              )}
            </div>,
            {
              icon: "🎨",
              duration: 5000,
            }
          );
        } catch (nftError: any) {
          console.error("NFT minting error:", nftError);
          // Don't block avatar save if NFT minting fails
          toast.error(
            nftError?.message || "NFT minting failed, but avatar was saved.",
            { icon: "⚠️", duration: 4000 }
          );
        }
      }

      // Wait for avatar to be saved (with or without NFT)
      await addAvatar({
        checkpointId,
        checkpointName,
        imageDataUrl: preview,
        location: checkpointLocation,
        mintAddress,
      });

      // If NFT was minted, update the avatar document with mint address
      if (mintAddress && user) {
        try {
          // Find the avatar document we just created
          const avatarsQuery = query(
            collection(db, "avatars"),
            where("userId", "==", user.uid),
            where("checkpointId", "==", checkpointId)
          );
          const avatarsSnap = await getDocs(avatarsQuery);
          
          if (!avatarsSnap.empty) {
            // Update the most recent one (should be the one we just created)
            const avatarDoc = avatarsSnap.docs[0];
            await updateDoc(avatarDoc.ref, {
              nftMintAddress: mintAddress,
            });
          }
        } catch (updateError) {
          console.error("Error updating avatar with mint address:", updateError);
          // Non-critical error, continue
        }
      }


      // Check and update challenge progress (no wallet required)
      if (user) {
        try {
          // Find all challenges that include this checkpoint
          const challengesQuery = query(
            collection(db, "challenges"),
            where("type", "==", "10-spot-competition")
          );
          const challengesSnap = await getDocs(challengesQuery);

          for (const challengeDoc of challengesSnap.docs) {
            const challengeData = challengeDoc.data();
            const challengeId = challengeDoc.id;

            // Check if this checkpoint is part of this challenge
            if (
              challengeData.spots &&
              challengeData.spots.includes(checkpointId)
            ) {
              const participantId = user.uid;

              // Get or create progress document
              const progressRef = doc(
                db,
                "challengeProgress",
                `${challengeId}_${participantId}`
              );
              const progressSnap = await getDoc(progressRef);

              let spotsCaptured: string[] = [];
              if (progressSnap.exists()) {
                spotsCaptured = progressSnap.data().spotsCaptured || [];
              }

              // Add this checkpoint if not already captured
              if (!spotsCaptured.includes(checkpointId)) {
                spotsCaptured.push(checkpointId);

                const isComplete = spotsCaptured.length === 10;

                await setDoc(
                  progressRef,
                  {
                    challengeId,
                    participantId,
                    spotsCaptured,
                    completedAt: isComplete ? Date.now() : null,
                  },
                  { merge: true }
                );

                // If completed and no winner yet, set as winner
                if (isComplete && !challengeData.winner) {
                  await updateDoc(doc(db, "challenges", challengeId), {
                    winner: participantId,
                    winnerCompletedAt: Date.now(),
                    status: "completed",
                  });
                }
              }
            }
          }
        } catch (e) {
          console.error("Error updating challenge progress:", e);
          // Don't block avatar save if challenge update fails
        }
      }
    } catch (e: any) {
      console.error("Error saving avatar:", e);
      setError(e?.message || "Failed to save avatar. Please try again.");
      setIsSaving(false);
      return;
    } finally {
      setIsSaving(false);
    }

    // Show success message briefly before navigating
    setError(null);
    await new Promise((resolve) => setTimeout(resolve, 300));
    router.push("/map");
  };

  if (isAlreadyCollected) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-black text-slate-50 p-4">
        <div className="text-center space-y-4">
          <div className="text-6xl">✓</div>
          <h2 className="text-xl font-bold text-blue-300">Already Collected</h2>
          <p className="text-slate-300">
            You&apos;ve already collected an avatar from{" "}
            <strong>{checkpointName}</strong>
          </p>
          <Link
            href="/map"
            className="inline-block mt-4 px-6 py-3 bg-emerald-600 rounded-full font-semibold hover:bg-emerald-500 transition-colors"
          >
            Back to Map
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col bg-black text-slate-50">
      <header className="px-4 pt-5 pb-3 border-b border-slate-900 bg-black/90 sticky top-0 z-20">
        <h1 className="text-lg font-semibold">Collect Avatar</h1>
        <p className="text-xs text-slate-400 mt-1">
          {checkpointName !== "Unknown checkpoint"
            ? `You are at: ${checkpointName}`
            : "Align yourself with the location and capture."}
        </p>
      </header>

      {error && (
        <div className="px-4 pt-2">
          <p className="text-xs text-red-400 bg-red-950/30 rounded-lg p-2.5 border border-red-800/50">
            <strong>⚠️</strong> {error}
          </p>
        </div>
      )}

      {!error && isAtCheckpoint && (
        <div className="px-4 pt-2">
          <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-950/30 rounded-lg p-2.5 border border-emerald-800/50">
            <span>✓</span>
            <span>You&apos;re at the checkpoint! Ready to capture.</span>
          </div>
        </div>
      )}

      {isVerifying && (
        <div className="px-4 pt-2">
          <div className="flex items-center gap-2 text-xs text-cyan-300 bg-cyan-950/30 rounded-lg p-2.5 border border-cyan-800/50">
            <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <span>Verifying your location...</span>
          </div>
        </div>
      )}

      {isSaving && (
        <div className="px-4 pt-2">
          <div className="flex items-center gap-2 text-xs text-emerald-300 bg-emerald-950/30 rounded-lg p-2.5 border border-emerald-800/50">
            <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
            <span>Saving avatar...</span>
          </div>
        </div>
      )}

      <section className="flex-1 flex flex-col justify-center items-center px-4 py-4 gap-4">
        {!preview && (
          <div className="w-full max-w-sm aspect-[9/16] rounded-3xl overflow-hidden border border-slate-800 bg-black">
            <Webcam
              ref={webcamRef}
              audio={false}
              screenshotFormat="image/jpeg"
              videoConstraints={videoConstraints}
              className="h-full w-full object-cover"
              onUserMedia={() => {
              }}
              onUserMediaError={(error) => {
                console.error("Webcam error:", error);
                setError("Camera access denied or unavailable. Please allow camera permissions.");
              }}
            />
          </div>
        )}

        {preview && (
          <div className="w-full max-w-sm aspect-[9/16] rounded-3xl overflow-hidden border border-emerald-500/70">
            <img
              src={preview}
              alt="Avatar preview"
              className="h-full w-full object-cover"
            />
          </div>
        )}
      </section>

      <section className="px-4 pb-6 pt-3 border-t border-slate-900 bg-black/95">
        <div className="max-w-md mx-auto flex flex-col gap-3">
          {!preview ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                handleCapture();
              }}
              disabled={isCapturing || !isAtCheckpoint || geoStatus !== "ready"}
              className="w-full rounded-full bg-emerald-500 py-3.5 text-center text-[0.95rem] font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 active:scale-[0.99] disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
            >
              {isCapturing
                ? "Capturing..."
                : !isAtCheckpoint && distanceFromCheckpoint !== null
                ? `Too Far (${distanceFromCheckpoint}m away)`
                : geoStatus !== "ready"
                ? "Getting Location..."
                : "Capture Avatar"}
            </button>
          ) : (
            <div className="space-y-3">
              {/* NFT Minting Option */}
              {publicKey && (
                <div className="flex items-center gap-2 p-3 bg-purple-950/20 border border-purple-700/50 rounded-lg">
                  <input
                    type="checkbox"
                    id="mintNFT"
                    checked={shouldMintNFT}
                    onChange={(e) => setShouldMintNFT(e.target.checked)}
                    disabled={isSaving || isMinting}
                    className="w-4 h-4 rounded border-purple-500 text-purple-600 focus:ring-purple-500 focus:ring-2"
                  />
                  <label 
                    htmlFor="mintNFT" 
                    className="text-xs text-slate-300 cursor-pointer flex-1"
                  >
                    🎨 Mint as Compressed NFT (Almost Free!)
                    <span className="block text-[0.7rem] text-slate-400 mt-0.5">
                      Create an on-chain proof (~0.00001 SOL)
                    </span>
                  </label>
                </div>
              )}
              
              {!publicKey && (
                <div className="p-3 bg-slate-800/50 border border-slate-700/50 rounded-lg">
                  <p className="text-xs text-slate-400">
                    💡 Connect your Solana wallet to mint NFT proof
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  className="flex-1 rounded-full border border-slate-700 py-3 text-[0.85rem] font-medium text-slate-100 bg-slate-900/60"
                >
                  Retake
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    handleSave().catch((err) => {
                      console.error("Unhandled error in handleSave:", err);
                      setError(err?.message || "An unexpected error occurred");
                    });
                  }}
                  disabled={isVerifying || isSaving || isMinting}
                  className="flex-1 rounded-full bg-emerald-500 py-3 text-[0.85rem] font-semibold text-slate-950 shadow-lg shadow-emerald-500/30 active:scale-[0.99] disabled:bg-slate-700 disabled:text-slate-400 disabled:shadow-none"
                >
                  {isVerifying
                    ? "Verifying Location..."
                    : isMinting
                    ? "Minting NFT..."
                    : isSaving
                    ? "Saving..."
                    : "Save Avatar"}
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => router.back()}
            className="mt-1 text-[0.75rem] text-slate-400 underline self-center"
          >
            Cancel &amp; go back
          </button>
        </div>
      </section>
    </main>
  );
}

export default function CameraPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-50">Loading...</div>}>
      <CameraPageContent />
    </Suspense>
  );
}
