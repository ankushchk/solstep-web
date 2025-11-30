"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import {
  GoogleMap,
  Marker,
  Circle,
  useJsApiLoader,
} from "@react-google-maps/api";

import { useGeolocation } from "@/hooks/useGeolocation";
import { useCheckpoints } from "@/hooks/useCheckpoints";
import { useAvatarCollection } from "@/hooks/useAvatarCollection";
import { useChallenges, type ChallengeAccount } from "@/hooks/useChallenges";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useAuth } from "@/hooks/useAuth";
import { QRCodeSVG } from "qrcode.react";
import dynamic from "next/dynamic";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { formatDistance, isWithinRadius } from "@/utils/location";
import type { Checkpoint } from "@/utils/types";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  onSnapshot,
  getDocs,
  updateDoc,
  addDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// Dynamically import WalletMultiButton to avoid SSR hydration issues
const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

const COLLECTION_RADIUS_METERS = 100;

const PLACE_TYPES = [
  { id: "gym", label: "🏋️ Gyms", value: "gym" },
  { id: "cafe", label: "☕ Cafes", value: "cafe" },
  { id: "park", label: "🌳 Parks", value: "park" },
  { id: "restaurant", label: "🍽️ Restaurants", value: "restaurant" },
  { id: "store", label: "🛍️ Stores", value: "store" },
  { id: "museum", label: "🏛️ Museums", value: "museum" },
  {
    id: "tourist_attraction",
    label: "📸 Attractions",
    value: "tourist_attraction",
  },
  {
    id: "point_of_interest",
    label: "📍 All Places",
    value: "point_of_interest",
  },
] as const;

const containerStyle = {
  width: "100%",
  height: "60vh",
};

const mapStyles = [
  {
    featureType: "all",
    elementType: "geometry",
    stylers: [{ color: "#1e293b" }],
  },
  {
    featureType: "all",
    elementType: "labels.text.fill",
    stylers: [{ color: "#cbd5e1" }],
  },
  {
    featureType: "all",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#0f172a" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#0f172a" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#334155" }],
  },
];

type ChallengeProgress = {
  challengeId: string;
  participantId: string;
  spotsCaptured: string[]; // checkpoint IDs
  completedAt?: number;
};

type ChallengeWithProgress = ChallengeAccount & {
  spots: Checkpoint[];
  progress: Map<string, ChallengeProgress>; // participantId -> progress
  winner?: string;
  id?: string; // For Firestore challenges
  organizerName?: string; // For Firestore challenges
  endTs?: number; // For Firestore challenges
  title?: string; // Challenge title
  stakeAmount?: number; // Stake amount in SOL
};

// Helper function to get challenge ID
function getChallengeId(challenge: ChallengeWithProgress | any): string {
  return challenge.id || challenge.publicKey?.toBase58() || "";
}

export default function MapPage() {
  const [activeTab, setActiveTab] = useState<"map" | "challenges">("map");
  const [selectedCheckpoint, setSelectedCheckpoint] =
    useState<Checkpoint | null>(null);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [challengeForCheckpoint, setChallengeForCheckpoint] =
    useState<Checkpoint | null>(null);
  const [stakeSol, setStakeSol] = useState("0.1");
  const [durationHours, setDurationHours] = useState("24");
  const [maxParticipants, setMaxParticipants] = useState("10");
  const [challengeTitle, setChallengeTitle] = useState("");
  const [creatingChallenge, setCreatingChallenge] = useState(false);
  const [joiningChallengeId, setJoiningChallengeId] = useState<string | null>(
    null
  );
  const [txStatus, setTxStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [checkpointChallenges, setCheckpointChallenges] = useState<
    Map<string, ChallengeAccount>
  >(new Map());
  const [challengesWithProgress, setChallengesWithProgress] = useState<
    ChallengeWithProgress[]
  >([]);
  const [firestoreChallenges, setFirestoreChallenges] = useState<any[]>([]);
  const [selectedSpots, setSelectedSpots] = useState<Checkpoint[]>([]);
  const [sharingChallenge, setSharingChallenge] =
    useState<ChallengeWithProgress | null>(null);
  const [inviteWalletAddress, setInviteWalletAddress] = useState("");
  const [invitingChallenge, setInvitingChallenge] = useState<string | null>(
    null
  );
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [dailyChallengeCount, setDailyChallengeCount] = useState<number | null>(
    null
  );
  const { user } = useAuth();

  const wallet = useWallet();
  const { connection } = useConnection();
  const {
    status: geoStatus,
    position: userPosition,
    error: geoError,
  } = useGeolocation(true);

  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const checkpointsState = useCheckpoints(
    userPosition,
    1000,
    selectedTypes.length > 0 ? selectedTypes : undefined
  );
  const { avatars } = useAvatarCollection();
  const {
    challenges,
    createChallenge,
    initEscrow,
    joinChallenge,
    refresh: refreshChallenges,
    program,
    error: programError,
  } = useChallenges();

  // Debug program status and auto-refresh when wallet connects
  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      console.log("Wallet connected, program status:", {
        hasProgram: !!program,
        hasPublicKey: !!wallet.publicKey,
        hasSignTransaction: !!wallet.signTransaction,
        hasSignAllTransactions: !!wallet.signAllTransactions,
      });

      // Refresh challenges when wallet connects to trigger program initialization
      if (!program) {
        const timer = setTimeout(() => {
          refreshChallenges();
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [wallet.connected, wallet.publicKey, program, refreshChallenges]);

  // Check for pending invites when wallet connects (optional - won't error if wallet not connected)
  useEffect(() => {
    if (!wallet.connected || !wallet.publicKey) {
      setPendingInvites([]);
      return;
    }

    const checkInvites = async () => {
      try {
        const invitesQuery = query(
          collection(db, "challengeInvites"),
          where("inviteeAddress", "==", wallet.publicKey!.toBase58()),
          where("status", "==", "pending")
        );
        const invitesSnap = await getDocs(invitesQuery);
        const invites = invitesSnap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setPendingInvites(invites);
      } catch (e) {
        // Silently fail if there's an error - don't block the UI
        console.warn("Could not check invites (wallet may not be ready):", e);
        setPendingInvites([]);
      }
    };

    void checkInvites();
  }, [wallet.connected, wallet.publicKey]);

  // Deep linking: Check URL params for challenge ID (works without wallet)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const challengeId = params.get("challenge");
      if (challengeId) {
        // Switch to challenges tab
        setActiveTab("challenges");
        // Scroll to challenge after a brief delay (wait for challenges to load)
        const scrollToChallenge = () => {
          const element = document.getElementById(`challenge-${challengeId}`);
          if (element) {
            element.scrollIntoView({ behavior: "smooth", block: "center" });
            // Highlight the challenge
            element.classList.add("ring-2", "ring-purple-500");
            setTimeout(() => {
              element.classList.remove("ring-2", "ring-purple-500");
            }, 3000);
          } else {
            // Retry if element not found yet
            setTimeout(scrollToChallenge, 500);
          }
        };
        setTimeout(scrollToChallenge, 1000);
      }
    }
  }, [firestoreChallenges.length]); // Re-run when challenges load

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  });

  // Check which checkpoints have already been collected
  const collectedCheckpointIds = useMemo(() => {
    return new Set(avatars.map((avatar) => avatar.checkpointId));
  }, [avatars]);

  // Load checkpoint-to-challenge mappings from Firestore
  useEffect(() => {
    if (challenges.length === 0) return;

    const unsubscribePromises = challenges.map(async (challenge) => {
      const challengeId = challenge.publicKey.toBase58();
      const challengeRef = doc(db, "challenges", challengeId);

      return onSnapshot(challengeRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data.checkpointId) {
            setCheckpointChallenges((prev) => {
              const newMap = new Map(prev);
              newMap.set(data.checkpointId, challenge);
              return newMap;
            });
          }
        }
      });
    });

    return () => {
      unsubscribePromises.forEach((promise) => {
        promise.then((unsubscribe) => unsubscribe?.());
      });
    };
  }, [challenges]);

  // Debug program status and auto-refresh when wallet connects
  useEffect(() => {
    if (wallet.connected && wallet.publicKey) {
      console.log("Wallet connected, program status:", {
        hasProgram: !!program,
        hasPublicKey: !!wallet.publicKey,
        hasSignTransaction: !!wallet.signTransaction,
        hasSignAllTransactions: !!wallet.signAllTransactions,
      });

      // Refresh challenges when wallet connects to trigger program initialization
      if (!program) {
        const timer = setTimeout(() => {
          refreshChallenges();
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [wallet.connected, wallet.publicKey, program, refreshChallenges]);

  // Load challenges directly from Firestore (no Solana required)
  useEffect(() => {
    if (!user) {
      setFirestoreChallenges([]);
      return;
    }

    const challengesQuery = query(
      collection(db, "challenges"),
      where("type", "==", "10-spot-competition")
    );

    const unsubscribe = onSnapshot(
      challengesQuery,
      async (snapshot) => {
        const challengesData: any[] = [];

        for (const challengeDoc of snapshot.docs) {
          const data = challengeDoc.data();
          const challengeId = challengeDoc.id;

          // Check if this is a 10-spot challenge
          if (
            data.spots &&
            Array.isArray(data.spots) &&
            data.spots.length === 10
          ) {
            // Load progress for all participants
            const progressMap = new Map<string, ChallengeProgress>();
            const progressQuery = query(
              collection(db, "challengeProgress"),
              where("challengeId", "==", challengeId)
            );
            const progressSnap = await getDocs(progressQuery);

            progressSnap.forEach((doc) => {
              const progressData = doc.data();
              progressMap.set(progressData.participantId, {
                challengeId,
                participantId: progressData.participantId,
                spotsCaptured: progressData.spotsCaptured || [],
                completedAt: progressData.completedAt,
              });
            });

            // Get participants list from progress
            const participants = Array.from(progressMap.keys());

            challengesData.push({
              id: challengeId,
              spots: data.spots || [],
              spotNames: data.spotNames || [],
              organizer: data.organizer || "unknown",
              organizerName: data.organizerName || "Anonymous",
              createdAt: data.createdAt || Date.now(),
              startTs: data.startTs || Math.floor(Date.now() / 1000),
              endTs: data.endTs || Math.floor(Date.now() / 1000) + 86400,
              maxParticipants: data.maxParticipants || 10,
              stakeAmount: data.stakeAmount || 0,
              status: data.status || "active",
              winner: data.winner || null,
              title: data.title || "10-Spot Challenge",
              progress: progressMap,
              participants: participants,
              participantCount: participants.length,
            });
          }
        }

        setFirestoreChallenges(challengesData);
      },
      (error) => {
        console.error("Error loading challenges:", error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const nearest = useMemo(() => {
    if (!userPosition || checkpointsState.status !== "ready") return null;
    if (!checkpointsState.data.length) return null;
    return checkpointsState.data.reduce<Checkpoint | null>((closest, cp) => {
      if (!closest) return cp;
      const d1 = cp.distanceMeters ?? Number.POSITIVE_INFINITY;
      const d2 = closest.distanceMeters ?? Number.POSITIVE_INFINITY;
      return d1 < d2 ? cp : closest;
    }, null);
  }, [userPosition, checkpointsState]);

  const displayCheckpoint = selectedCheckpoint || nearest;
  const isAlreadyCollected = displayCheckpoint
    ? collectedCheckpointIds.has(displayCheckpoint.id)
    : false;
  const canCollect =
    userPosition && displayCheckpoint && !isAlreadyCollected
      ? isWithinRadius(
          userPosition,
          displayCheckpoint.position,
          COLLECTION_RADIUS_METERS
        )
      : false;

  // Get challenge for current checkpoint
  const checkpointChallenge = displayCheckpoint
    ? checkpointChallenges.get(displayCheckpoint.id)
    : null;
  const isChallengeOrganizer =
    checkpointChallenge &&
    wallet.publicKey &&
    wallet.publicKey.equals(checkpointChallenge.organizer);
  const isChallengeParticipant =
    checkpointChallenge &&
    wallet.publicKey &&
    checkpointChallenge.participants?.some((p: PublicKey) =>
      p.equals(wallet.publicKey!)
    );
  const canJoinChallenge =
    checkpointChallenge &&
    !checkpointChallenge.isFinalized &&
    checkpointChallenge.participantCount <
      checkpointChallenge.maxParticipants &&
    !isChallengeOrganizer &&
    !isChallengeParticipant;

  const handleRecenter = () => {
    if (mapInstance && userPosition) {
      mapInstance.panTo(userPosition);
      mapInstance.setZoom(15);
    }
  };

  const collectibleCount = useMemo(() => {
    if (!userPosition || checkpointsState.status !== "ready") return 0;
    return checkpointsState.data.filter((cp) =>
      isWithinRadius(userPosition, cp.position, COLLECTION_RADIUS_METERS)
    ).length;
  }, [userPosition, checkpointsState]);

  // Check how many challenges user has created today
  const checkDailyChallengeLimit = async (): Promise<number> => {
    if (!user) return 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000;

    try {
      const challengesQuery = query(
        collection(db, "challenges"),
        where("organizer", "==", user.uid),
        where("type", "==", "10-spot-competition")
      );
      const snapshot = await getDocs(challengesQuery);

      let count = 0;
      snapshot.forEach((doc) => {
        const data = doc.data();
        const createdAt = data.createdAt || 0;
        if (createdAt >= todayStart && createdAt < todayEnd) {
          count++;
        }
      });

      return count;
    } catch (error) {
      console.error("Error checking daily limit:", error);
      return 0;
    }
  };

  // Challenge creation handler - Creates on-chain and syncs to Firestore
  const handleCreateChallenge = async () => {
    // Validate wallet connection
    if (!wallet.connected || !wallet.publicKey) {
      setTxStatus({
        type: "error",
        message: "Please connect your wallet to create a challenge",
      });
      return;
    }

    // Validate stake amount (required)
    const stakeValue = Number(stakeSol);
    if (!stakeSol || isNaN(stakeValue) || stakeValue <= 0) {
      setTxStatus({
        type: "error",
        message: "Please enter a valid stake amount (must be greater than 0)",
      });
      return;
    }

    // Check daily limit first
    if (user) {
      const todayCount = await checkDailyChallengeLimit();
      if (todayCount >= 2) {
        setTxStatus({
          type: "error",
          message:
            "You've reached the daily limit of 2 challenges. Try again tomorrow!",
        });
        return;
      }
    }

    // Auto-select 10 random checkpoints
    if (
      checkpointsState.status !== "ready" ||
      checkpointsState.data.length < 10
    ) {
      setTxStatus({
        type: "error",
        message: "Need at least 10 nearby checkpoints to create a challenge",
      });
      return;
    }

    // Randomly select 10 checkpoints
    const availableCheckpoints = [...checkpointsState.data];
    const shuffled = availableCheckpoints.sort(() => Math.random() - 0.5);
    const randomSpots = shuffled.slice(0, 10);

    try {
      setCreatingChallenge(true);
      setTxStatus(null);
      const now = Math.floor(Date.now() / 1000);
      const duration = Number(durationHours || "24") * 60 * 60;

      // Convert SOL to lamports
      const stakeAmountLamports = BigInt(
        Math.floor(stakeValue * LAMPORTS_PER_SOL)
      );

      setTxStatus({
        type: "success",
        message: "Creating challenge on-chain...",
      });

      // Step 1: Create challenge on-chain
      const challengePda = await createChallenge({
        stakeAmountLamports,
        startTs: now,
        endTs: now + duration,
        maxParticipants: Number(maxParticipants || "10"),
      });

      setTxStatus({
        type: "success",
        message: "Initializing escrow...",
      });

      // Step 2: Initialize escrow
      await initEscrow(challengePda);

      // Step 3: Store challenge metadata in Firestore (spots, title, etc.)
      const challengeId = challengePda.toBase58();
      await setDoc(doc(db, "challenges", challengeId), {
        title: challengeTitle.trim() || "10-Spot Challenge",
        spots: randomSpots.map((s) => s.id),
        spotNames: randomSpots.map((s) => s.name),
        organizer: user?.uid || wallet.publicKey.toBase58(),
        organizerWallet: wallet.publicKey.toBase58(),
        organizerName: user?.displayName || "Anonymous",
        challengePda: challengeId,
        createdAt: Date.now(),
        startTs: now,
        endTs: now + duration,
        maxParticipants: Number(maxParticipants || "10"),
        stakeAmount: stakeValue, // Store stake amount in SOL
        type: "10-spot-competition",
        status: "active",
        onChain: true, // Mark as on-chain challenge
      });

      setTxStatus({
        type: "success",
        message:
          "Challenge created successfully on-chain! First to capture all 10 spots wins!",
      });
      setShowChallengeModal(false);
      setChallengeForCheckpoint(null);
      setDurationHours("24");
      setMaxParticipants("10");
      setChallengeTitle("");
      setStakeSol("0.1");

      // Refresh challenges
      await refreshChallenges();

      // Refresh daily count after creating
      if (user) {
        const newCount = await checkDailyChallengeLimit();
        setDailyChallengeCount(newCount);
      }
    } catch (e: any) {
      console.error("Challenge creation error:", e);
      setTxStatus({
        type: "error",
        message: e?.message || "Failed to create challenge on-chain",
      });
    } finally {
      setCreatingChallenge(false);
    }
  };

  // Join challenge handler
  const handleJoinChallenge = async (challengePubkey: PublicKey) => {
    try {
      setJoiningChallengeId(challengePubkey.toBase58());
      setTxStatus(null);
      await joinChallenge(challengePubkey);
      setTxStatus({
        type: "success",
        message: "Successfully joined challenge!",
      });
      await refreshChallenges();
    } catch (e: any) {
      console.error(e);
      const errorMsg =
        e?.message || e?.toString() || "Failed to join challenge";
      setTxStatus({ type: "error", message: errorMsg });
    } finally {
      setJoiningChallengeId(null);
    }
  };

  return (
    <main className="min-h-screen flex flex-col bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-50">
      <header className="px-4 pt-5 pb-3 border-b border-slate-800/50 bg-slate-950/95 backdrop-blur-sm sticky top-0 z-20 shadow-lg">
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[0.65rem] uppercase tracking-[0.25em] text-emerald-400/70 font-medium">
                {activeTab === "map" ? "Live Map" : "Challenges"}
              </p>
              <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                Solstep
              </h1>
            </div>
            <div className="flex gap-2 items-center">
              {activeTab === "map" && checkpointsState.status === "ready" && (
                <div className="text-xs px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {checkpointsState.data.length} nearby
                </div>
              )}
              <WalletMultiButton className="!bg-emerald-600 !text-xs !py-1.5" />
              <Link
                href="/"
                className="text-xs px-3 py-1.5 rounded-full border border-slate-700 text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Home
              </Link>
            </div>
          </div>
          {/* Tabs */}
          <div className="flex gap-2 border-b border-slate-800">
            <button
              onClick={() => setActiveTab("map")}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === "map"
                  ? "border-emerald-400 text-emerald-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              Map
            </button>
            <button
              onClick={() => setActiveTab("challenges")}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === "challenges"
                  ? "border-amber-400 text-amber-400"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              Challenges
            </button>
          </div>
        </div>
      </header>

      {/* Map Tab Content */}
      {activeTab === "map" && (
        <>
          {/* Status Bar */}
          <section className="px-4 py-2 max-w-md mx-auto w-full">
            {geoStatus === "locating" && (
              <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800/50 rounded-lg p-2.5 border border-slate-700/50">
                <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span>Locating your position...</span>
              </div>
            )}
            {geoError && (
              <div className="text-xs text-red-400 bg-red-950/30 rounded-lg p-2.5 border border-red-800/50">
                ⚠️ Location error: {geoError}. Please enable location services.
              </div>
            )}
            {checkpointsState.status === "loading" && (
              <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800/50 rounded-lg p-2.5 border border-slate-700/50">
                <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span>Discovering checkpoints...</span>
              </div>
            )}
            {checkpointsState.status === "error" && (
              <div className="text-xs text-red-400 bg-red-950/30 rounded-lg p-2.5 border border-red-800/50">
                Failed to load checkpoints: {checkpointsState.error}
              </div>
            )}
            {collectibleCount > 0 && (
              <div className="text-xs text-emerald-300 bg-emerald-950/30 rounded-lg p-2.5 border border-emerald-800/50 flex items-center gap-2">
                <span className="text-base">🎯</span>
                <span className="font-medium">
                  {collectibleCount} checkpoint
                  {collectibleCount !== 1 ? "s" : ""} in range!
                </span>
              </div>
            )}
          </section>

          {/* Map Container */}
          <section className="mt-1 px-4 max-w-md mx-auto w-full">
            <div className="rounded-2xl border border-slate-700/50 overflow-hidden bg-slate-900/80 shadow-2xl relative">
              {loadError && (
                <div className="p-6 text-center">
                  <div className="text-4xl mb-2">🗺️</div>
                  <p className="text-sm text-red-400">Failed to load map.</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Check your API key configuration.
                  </p>
                </div>
              )}
              {!isLoaded && !loadError && (
                <div className="p-6 text-center">
                  <div className="w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-slate-300">Loading map...</p>
                </div>
              )}
              {isLoaded && userPosition && (
                <>
                  <GoogleMap
                    mapContainerStyle={containerStyle}
                    center={userPosition}
                    zoom={15}
                    options={{
                      disableDefaultUI: true,
                      zoomControl: true,
                      streetViewControl: false,
                      styles: mapStyles,
                      gestureHandling: "greedy",
                    }}
                    onLoad={(map) => setMapInstance(map)}
                  >
                    {/* User Position Marker */}
                    <Marker
                      position={userPosition}
                      icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 10,
                        fillColor: "#3b82f6",
                        fillOpacity: 1,
                        strokeColor: "#ffffff",
                        strokeWeight: 3,
                      }}
                      title="You are here"
                      zIndex={1000}
                    />

                    {/* User Position Pulse Circle */}
                    <Circle
                      center={userPosition}
                      radius={50}
                      options={{
                        strokeColor: "#3b82f6",
                        strokeOpacity: 0.4,
                        strokeWeight: 2,
                        fillColor: "#3b82f6",
                        fillOpacity: 0.1,
                      }}
                    />

                    {/* Checkpoint Markers */}
                    {checkpointsState.status === "ready" &&
                      checkpointsState.data.map((cp) => {
                        const inRange =
                          userPosition &&
                          isWithinRadius(
                            userPosition,
                            cp.position,
                            COLLECTION_RADIUS_METERS
                          );
                        const isCollected = collectedCheckpointIds.has(cp.id);
                        return (
                          <Marker
                            key={cp.id}
                            position={cp.position}
                            label={{
                              text: cp.name,
                              className: "text-xs font-bold text-white",
                              color: "#ffffff",
                            }}
                            icon={{
                              url: isCollected
                                ? "http://maps.google.com/mapfiles/ms/icons/blue-dot.png"
                                : inRange
                                ? "http://maps.google.com/mapfiles/ms/icons/green-dot.png"
                                : "http://maps.google.com/mapfiles/ms/icons/red-dot.png",
                              scaledSize: new google.maps.Size(40, 40),
                            }}
                            onClick={() => setSelectedCheckpoint(cp)}
                          />
                        );
                      })}

                    {/* Collection Radius Circle */}
                    {displayCheckpoint && (
                      <Circle
                        center={displayCheckpoint.position}
                        radius={COLLECTION_RADIUS_METERS}
                        options={{
                          strokeColor: canCollect ? "#22c55e" : "#ef4444",
                          strokeOpacity: 0.8,
                          strokeWeight: 2,
                          fillColor: canCollect ? "#22c55e" : "#ef4444",
                          fillOpacity: 0.15,
                        }}
                      />
                    )}
                  </GoogleMap>

                  {/* Recenter Button */}
                  <button
                    onClick={handleRecenter}
                    className="absolute bottom-4 right-4 bg-slate-900/90 backdrop-blur-sm border border-slate-700 rounded-full p-3 shadow-lg hover:bg-slate-800 transition-colors"
                    title="Recenter map"
                  >
                    <svg
                      className="w-5 h-5 text-cyan-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </section>

          {/* Filter Section */}
          <section className="px-4 pt-3">
            <div className="w-full max-w-md mx-auto">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-semibold text-slate-300">
                  Filter by type:
                </p>
                {selectedTypes.length > 0 && (
                  <button
                    onClick={() => setSelectedTypes([])}
                    className="text-xs text-slate-400 hover:text-slate-200 underline"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {PLACE_TYPES.map((type) => {
                  const isSelected = selectedTypes.includes(type.value);
                  return (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setSelectedTypes(
                            selectedTypes.filter((t) => t !== type.value)
                          );
                        } else {
                          setSelectedTypes([...selectedTypes, type.value]);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        isSelected
                          ? "bg-emerald-500/90 text-slate-950 border border-emerald-400"
                          : "bg-slate-800/70 text-slate-300 border border-slate-700 hover:bg-slate-700/70"
                      }`}
                    >
                      {type.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Checkpoint Info Card */}
          <section className="mt-auto px-4 pb-6 pt-3">
            <div className="w-full max-w-md mx-auto rounded-3xl border border-slate-700/50 bg-gradient-to-br from-slate-900/95 to-slate-800/95 backdrop-blur-sm p-4 shadow-2xl">
              {displayCheckpoint && userPosition ? (
                <>
                  <div className="flex justify-between items-start gap-3 mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-base truncate text-slate-50">
                          {displayCheckpoint.name}
                        </h3>
                        {isAlreadyCollected ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            Collected
                          </span>
                        ) : canCollect ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/30 animate-pulse">
                            In Range
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-300">
                        {displayCheckpoint.distanceMeters != null && (
                          <span className="flex items-center gap-1">
                            <svg
                              className="w-3.5 h-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                              />
                            </svg>
                            {formatDistance(displayCheckpoint.distanceMeters)}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          ⭐ {displayCheckpoint.rating.toFixed(1)}
                        </span>
                      </div>
                    </div>
                    {selectedCheckpoint && (
                      <button
                        onClick={() => setSelectedCheckpoint(null)}
                        className="text-xs text-slate-400 hover:text-slate-200"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-slate-950/40 border border-slate-700/30">
                    <p className="text-xs text-slate-300 flex-1">
                      {isAlreadyCollected ? (
                        <span className="flex items-center gap-2">
                          <span className="text-blue-400 text-base">✓</span>
                          <span className="font-medium text-blue-300">
                            Already collected! You&apos;ve captured an avatar
                            from this location.
                          </span>
                        </span>
                      ) : canCollect ? (
                        <span className="flex items-center gap-2">
                          <span className="text-green-400 text-base">✓</span>
                          <span className="font-medium text-green-300">
                            Ready to collect! Open camera to capture avatar.
                          </span>
                        </span>
                      ) : displayCheckpoint.distanceMeters ? (
                        <span>
                          Walk{" "}
                          <span className="font-semibold text-cyan-300">
                            {formatDistance(
                              Math.max(
                                0,
                                displayCheckpoint.distanceMeters -
                                  COLLECTION_RADIUS_METERS
                              )
                            )}
                          </span>{" "}
                          closer to unlock
                        </span>
                      ) : (
                        "Move towards the checkpoint to collect"
                      )}
                    </p>
                    <Link
                      href={{
                        pathname: "/camera",
                        query: {
                          checkpointId: displayCheckpoint.id,
                          checkpointName: displayCheckpoint.name,
                          lat: displayCheckpoint.position.lat,
                          lng: displayCheckpoint.position.lng,
                        },
                      }}
                      className={`px-5 py-2.5 rounded-full text-xs font-bold min-w-[8rem] text-center transition-all shadow-lg ${
                        isAlreadyCollected
                          ? "bg-blue-600/50 text-blue-200 cursor-not-allowed opacity-60"
                          : canCollect
                          ? "bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-500 hover:to-emerald-500 shadow-green-500/30"
                          : "bg-slate-700 text-slate-400 cursor-not-allowed opacity-60"
                      }`}
                      aria-disabled={!canCollect || isAlreadyCollected}
                      onClick={(e) => {
                        if (!canCollect || isAlreadyCollected) {
                          e.preventDefault();
                        }
                      }}
                    >
                      {isAlreadyCollected
                        ? "✓ Collected"
                        : canCollect
                        ? "📸 Collect"
                        : "🔒 Locked"}
                    </Link>
                  </div>

                  {/* Challenge Section */}
                  <div className="mt-3 pt-3 border-t border-slate-700/50">
                    {checkpointChallenge ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-amber-300">
                            💰 Active Challenge
                          </p>
                          <span className="text-xs text-slate-400">
                            {checkpointChallenge.participantCount}/
                            {checkpointChallenge.maxParticipants} joined
                          </span>
                        </div>
                        <div className="text-xs text-slate-300 space-y-1">
                          <p>
                            Stake:{" "}
                            <span className="font-semibold text-emerald-400">
                              {(
                                Number(checkpointChallenge.stakeAmount) /
                                LAMPORTS_PER_SOL
                              ).toFixed(2)}{" "}
                              SOL
                            </span>
                          </p>
                          <p>
                            Pool:{" "}
                            <span className="font-semibold text-cyan-400">
                              {(
                                Number(checkpointChallenge.totalStake) /
                                LAMPORTS_PER_SOL
                              ).toFixed(2)}{" "}
                              SOL
                            </span>
                          </p>
                        </div>
                        {canJoinChallenge && (
                          <button
                            type="button"
                            onClick={() =>
                              handleJoinChallenge(checkpointChallenge.publicKey)
                            }
                            disabled={
                              joiningChallengeId ===
                              checkpointChallenge.publicKey.toBase58()
                            }
                            className="w-full mt-2 px-4 py-2 rounded-full bg-emerald-500/90 text-slate-950 text-xs font-semibold disabled:opacity-50"
                          >
                            {joiningChallengeId ===
                            checkpointChallenge.publicKey.toBase58()
                              ? "Joining..."
                              : `Join Challenge (${(
                                  Number(checkpointChallenge.stakeAmount) /
                                  LAMPORTS_PER_SOL
                                ).toFixed(2)} SOL)`}
                          </button>
                        )}
                        {isChallengeParticipant && (
                          <p className="text-xs text-blue-300 font-medium">
                            ✓ You&apos;re in this challenge
                          </p>
                        )}
                        {isChallengeOrganizer && (
                          <p className="text-xs text-amber-300 font-medium">
                            👑 You created this challenge
                          </p>
                        )}
                      </div>
                    ) : (
                      <div>
                        {wallet.connected ? (
                          <button
                            type="button"
                            onClick={() => {
                              setChallengeForCheckpoint(displayCheckpoint);
                              setShowChallengeModal(true);
                            }}
                            className="w-full px-4 py-2 rounded-full bg-amber-500/90 text-slate-950 text-xs font-semibold hover:bg-amber-500 transition-colors"
                          >
                            🎯 Create Challenge
                          </button>
                        ) : (
                          <p className="text-xs text-slate-400 text-center">
                            Connect wallet to create a challenge
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-2">
                  <div className="text-3xl mb-2">🗺️</div>
                  <p className="text-sm text-slate-300 font-medium mb-1">
                    Explore the area
                  </p>
                  <p className="text-xs text-slate-400">
                    Move around to discover nearby checkpoints and unlock
                    avatars
                  </p>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* Challenges Tab Content */}
      {activeTab === "challenges" && (
        <section className="px-4 py-4 max-w-md mx-auto w-full flex flex-col gap-4">
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

          {/* Create Challenge Button - No wallet required */}
          {user && (
            <button
              onClick={async () => {
                // Check daily limit before opening modal
                const todayCount = await checkDailyChallengeLimit();
                setDailyChallengeCount(todayCount);

                if (todayCount >= 2) {
                  setTxStatus({
                    type: "error",
                    message:
                      "You've reached the daily limit of 2 challenges. Try again tomorrow!",
                  });
                  return;
                }

                if (
                  checkpointsState.status === "ready" &&
                  checkpointsState.data.length >= 10
                ) {
                  setShowChallengeModal(true);
                } else {
                  setTxStatus({
                    type: "error",
                    message:
                      "Need at least 10 nearby checkpoints to create a challenge",
                  });
                }
              }}
              disabled={
                checkpointsState.status !== "ready" ||
                checkpointsState.data.length < 10 ||
                (dailyChallengeCount !== null && dailyChallengeCount >= 2)
              }
              className="w-full rounded-full bg-amber-500/90 text-slate-950 py-3 text-sm font-semibold hover:bg-amber-500 transition-colors disabled:bg-slate-700 disabled:text-slate-400"
            >
              {dailyChallengeCount !== null && dailyChallengeCount >= 2
                ? `Daily Limit Reached (${dailyChallengeCount}/2)`
                : dailyChallengeCount !== null
                ? `Create Challenge (${dailyChallengeCount}/2 today)`
                : "🎯 Create 10-Spot Challenge"}
            </button>
          )}

          {!user && (
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-center">
              <p className="text-xs text-slate-400">
                Sign in to create or join challenges
              </p>
            </div>
          )}

          {/* Pending Invites Notification */}
          {pendingInvites.length > 0 && wallet.connected && (
            <div className="rounded-lg border border-purple-700/50 bg-purple-950/20 p-4 space-y-2">
              <p className="text-xs font-semibold text-purple-300">
                📬 You have {pendingInvites.length} pending invite
                {pendingInvites.length !== 1 ? "s" : ""}!
              </p>
              {pendingInvites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between bg-slate-800/50 rounded-lg p-2"
                >
                  <p className="text-xs text-slate-300">
                    Challenge: {invite.challengeId.slice(0, 8)}...
                  </p>
                  <button
                    onClick={async () => {
                      if (!wallet.connected) {
                        setTxStatus({
                          type: "error",
                          message: "Please connect your wallet to join",
                        });
                        return;
                      }
                      try {
                        const challengePubkey = new PublicKey(
                          invite.challengeId
                        );
                        await handleJoinChallenge(challengePubkey);
                        // Mark invite as accepted
                        await updateDoc(
                          doc(db, "challengeInvites", invite.id),
                          {
                            status: "accepted",
                            acceptedAt: Date.now(),
                          }
                        );
                        setPendingInvites(
                          pendingInvites.filter((i) => i.id !== invite.id)
                        );
                      } catch (e: any) {
                        console.error("Error joining from invite:", e);
                        setTxStatus({
                          type: "error",
                          message: e.message || "Failed to join challenge",
                        });
                      }
                    }}
                    disabled={!wallet.connected}
                    className="px-3 py-1 rounded-md bg-purple-500/90 text-white text-xs font-semibold disabled:opacity-50"
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Challenges List */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Active Challenges</h2>
            {firestoreChallenges.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">
                No active challenges yet. Be the first to create one!
              </p>
            ) : (
              firestoreChallenges.map((challenge) => {
                const isParticipant =
                  user && challenge.participants?.includes(user.uid);
                const isOrganizer = user && challenge.organizer === user.uid;
                const userProgress = user
                  ? challenge.progress.get(user.uid)
                  : null;
                const spotsCaptured = userProgress?.spotsCaptured.length || 0;
                const isEnded =
                  Number(challenge.endTs) < Math.floor(Date.now() / 1000);
                const canJoin =
                  user &&
                  !isParticipant &&
                  !isOrganizer &&
                  !isEnded &&
                  challenge.participantCount < challenge.maxParticipants;

                return (
                  <div
                    id={`challenge-${challenge.id}`}
                    key={challenge.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-slate-50">
                            🏆 {(challenge as any).title || "10-Spot Challenge"}
                          </p>
                          {challenge.winner && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
                              Winner: {challenge.winner.slice(0, 8)}...
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mb-2">
                          by {challenge.organizerName || "Anonymous"}
                          {(challenge as any).stakeAmount > 0 && (
                            <span className="ml-2 text-emerald-400">
                              • {(challenge as any).stakeAmount} SOL stake
                            </span>
                          )}
                        </p>
                        <div className="text-xs text-slate-300 space-y-1">
                          <p>
                            Participants: {challenge.participantCount}/
                            {challenge.maxParticipants}
                          </p>
                          {!isEnded && (
                            <p className="text-emerald-400 font-medium">
                              {Math.floor(
                                (Number(challenge.endTs) - Date.now() / 1000) /
                                  3600
                              )}
                              h{" "}
                              {Math.floor(
                                ((Number(challenge.endTs) - Date.now() / 1000) %
                                  3600) /
                                  60
                              )}
                              m left
                            </p>
                          )}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-1 rounded-full text-[0.65rem] ${
                          challenge.winner
                            ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40"
                            : isEnded
                            ? "bg-red-500/20 text-red-300 border border-red-500/40"
                            : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                        }`}
                      >
                        {challenge.winner
                          ? "Completed"
                          : isEnded
                          ? "Ended"
                          : "Active"}
                      </span>
                    </div>

                    {/* Progress */}
                    {isParticipant && userProgress && (
                      <div className="pt-2 border-t border-slate-700/50">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-semibold text-slate-300">
                            Your Progress
                          </p>
                          <p className="text-xs text-emerald-400 font-bold">
                            {spotsCaptured}/10 spots captured
                          </p>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2 mb-2">
                          <div
                            className="bg-emerald-500 h-2 rounded-full transition-all"
                            style={{ width: `${(spotsCaptured / 10) * 100}%` }}
                          />
                        </div>
                        {spotsCaptured === 10 && !challenge.winner && (
                          <p className="text-xs text-yellow-400 font-medium animate-pulse">
                            🎉 You captured all 10 spots! Waiting for challenge
                            to finalize...
                          </p>
                        )}
                      </div>
                    )}

                    {/* Leaderboard */}
                    {challenge.progress.size > 0 && (
                      <div className="pt-2 border-t border-slate-700/50">
                        <p className="text-xs font-semibold text-slate-300 mb-2">
                          Leaderboard
                        </p>
                        <div className="space-y-1">
                          {(
                            Array.from(challenge.progress.entries()) as [
                              string,
                              ChallengeProgress
                            ][]
                          )
                            .sort(
                              (a, b) =>
                                b[1].spotsCaptured.length -
                                  a[1].spotsCaptured.length ||
                                (a[1].completedAt || 0) -
                                  (b[1].completedAt || 0)
                            )
                            .slice(0, 5)
                            .map(([participantId, progress], idx) => (
                              <div
                                key={participantId}
                                className="flex items-center justify-between text-xs"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-400 w-4">
                                    {idx === 0
                                      ? "🥇"
                                      : idx === 1
                                      ? "🥈"
                                      : idx === 2
                                      ? "🥉"
                                      : `${idx + 1}.`}
                                  </span>
                                  <span className="text-slate-300">
                                    {participantId === user?.uid
                                      ? "You"
                                      : participantId.slice(0, 6) + "..."}
                                  </span>
                                </div>
                                <span className="text-emerald-400 font-semibold">
                                  {progress.spotsCaptured.length}/10
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="pt-2 border-t border-slate-700/50 flex gap-2">
                      {canJoin && (
                        <button
                          onClick={async () => {
                            // Join challenge by adding user to participants
                            try {
                              const progressRef = doc(
                                db,
                                "challengeProgress",
                                `${challenge.id}_${user!.uid}`
                              );
                              await setDoc(progressRef, {
                                challengeId: challenge.id,
                                participantId: user!.uid,
                                spotsCaptured: [],
                                completedAt: null,
                              });
                              setTxStatus({
                                type: "success",
                                message: "Joined challenge successfully!",
                              });
                            } catch (e: any) {
                              setTxStatus({
                                type: "error",
                                message:
                                  e?.message || "Failed to join challenge",
                              });
                            }
                          }}
                          className="flex-1 px-3 py-2 rounded-full bg-emerald-500/90 text-slate-950 text-xs font-semibold"
                        >
                          Join Challenge
                        </button>
                      )}
                      {isParticipant && (
                        <span className="px-3 py-2 rounded-full bg-blue-500/20 text-blue-300 text-xs font-medium border border-blue-500/40">
                          ✓ Joined
                        </span>
                      )}
                      {isOrganizer && (
                        <span className="px-3 py-2 rounded-full bg-amber-500/20 text-amber-300 text-xs font-medium border border-amber-500/40">
                          👑 Organizer
                        </span>
                      )}
                      {/* Share Button - Always visible */}
                      <button
                        onClick={() => setSharingChallenge(challenge as any)}
                        className="px-3 py-2 rounded-full bg-purple-500/90 text-white text-xs font-semibold hover:bg-purple-500 transition-colors"
                        title="Share challenge"
                      >
                        📤 Share
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      {/* Share Challenge Modal */}
      {sharingChallenge && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-50">
                Share Challenge
              </h2>
              <button
                onClick={() => {
                  setSharingChallenge(null);
                  setInviteWalletAddress("");
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Share Link */}
              <div>
                <label className="block text-xs text-slate-300 mb-2">
                  Share Link
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={`${
                      typeof window !== "undefined"
                        ? window.location.origin
                        : ""
                    }/map?challenge=${getChallengeId(sharingChallenge)}`}
                    className="flex-1 rounded-md bg-slate-950/70 border border-slate-700 px-3 py-2 text-xs font-mono"
                  />
                  <button
                    onClick={async () => {
                      const link = `${
                        window.location.origin
                      }/map?challenge=${getChallengeId(sharingChallenge)}`;
                      await navigator.clipboard.writeText(link);
                      setTxStatus({
                        type: "success",
                        message: "Link copied to clipboard!",
                      });
                      setTimeout(() => setTxStatus(null), 2000);
                    }}
                    className="px-4 py-2 rounded-md bg-emerald-500/90 text-slate-950 text-xs font-semibold hover:bg-emerald-500"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* QR Code */}
              <div className="flex flex-col items-center gap-2">
                <label className="block text-xs text-slate-300">
                  Scan to Join
                </label>
                <div className="bg-white p-4 rounded-lg">
                  <QRCodeSVG
                    value={`${
                      typeof window !== "undefined"
                        ? window.location.origin
                        : ""
                    }/map?challenge=${getChallengeId(sharingChallenge)}`}
                    size={200}
                  />
                </div>
              </div>

              {/* Social Share Buttons */}
              <div>
                <label className="block text-xs text-slate-300 mb-2">
                  Share via
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const link = `${
                        window.location.origin
                      }/map?challenge=${getChallengeId(sharingChallenge)}`;
                      const text = `Join my 10-Spot Challenge! First to capture all 10 spots wins!`;
                      window.open(
                        `https://twitter.com/intent/tweet?text=${encodeURIComponent(
                          text
                        )}&url=${encodeURIComponent(link)}`,
                        "_blank"
                      );
                    }}
                    className="flex-1 px-3 py-2 rounded-md bg-blue-500/90 text-white text-xs font-semibold hover:bg-blue-500"
                  >
                    Twitter
                  </button>
                  <button
                    onClick={() => {
                      const link = `${
                        window.location.origin
                      }/map?challenge=${getChallengeId(sharingChallenge)}`;
                      if (navigator.share) {
                        navigator.share({
                          title: "Join my 10-Spot Challenge!",
                          text: `First to capture all 10 spots wins!`,
                          url: link,
                        });
                      }
                    }}
                    className="flex-1 px-3 py-2 rounded-md bg-purple-500/90 text-white text-xs font-semibold hover:bg-purple-500"
                  >
                    Share
                  </button>
                </div>
              </div>

              {/* Invite by Wallet Address - Optional if wallet not connected */}
              <div className="pt-4 border-t border-slate-700/50">
                <label className="block text-xs text-slate-300 mb-2">
                  Invite by Wallet Address
                </label>
                {!wallet.connected ? (
                  <div className="rounded-md bg-slate-800/50 border border-slate-700 p-3 text-xs text-slate-400">
                    💡 Connect your wallet to send direct invites by wallet
                    address. You can still share the link above!
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Enter wallet address"
                        value={inviteWalletAddress}
                        onChange={(e) => setInviteWalletAddress(e.target.value)}
                        className="flex-1 rounded-md bg-slate-950/70 border border-slate-700 px-3 py-2 text-xs font-mono"
                      />
                      <button
                        onClick={async () => {
                          if (!inviteWalletAddress.trim()) {
                            setTxStatus({
                              type: "error",
                              message: "Please enter a wallet address",
                            });
                            return;
                          }

                          try {
                            // Validate wallet address
                            new PublicKey(inviteWalletAddress.trim());

                            const challengeId =
                              getChallengeId(sharingChallenge);
                            setInvitingChallenge(challengeId);

                            // Store invite in Firestore
                            await addDoc(collection(db, "challengeInvites"), {
                              challengeId: challengeId,
                              organizerId:
                                wallet.publicKey?.toBase58() || "unknown",
                              inviteeAddress: inviteWalletAddress.trim(),
                              createdAt: Date.now(),
                              status: "pending",
                            });

                            setTxStatus({
                              type: "success",
                              message:
                                "Invite sent! They'll see it when they connect their wallet.",
                            });
                            setInviteWalletAddress("");
                            setTimeout(() => setTxStatus(null), 3000);
                          } catch (e: any) {
                            setTxStatus({
                              type: "error",
                              message: "Invalid wallet address",
                            });
                          } finally {
                            setInvitingChallenge(null);
                          }
                        }}
                        disabled={
                          !inviteWalletAddress.trim() ||
                          invitingChallenge === getChallengeId(sharingChallenge)
                        }
                        className="px-4 py-2 rounded-md bg-cyan-500/90 text-slate-950 text-xs font-semibold hover:bg-cyan-500 disabled:opacity-50"
                      >
                        {invitingChallenge === getChallengeId(sharingChallenge)
                          ? "Sending..."
                          : "Send Invite"}
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      They&apos;ll receive a notification when they connect
                      their wallet
                    </p>
                  </>
                )}
              </div>

              {/* Challenge Info */}
              <div className="pt-4 border-t border-slate-700/50 text-xs text-slate-300 space-y-1">
                <p>
                  <span className="font-semibold">Organizer:</span>{" "}
                  {(sharingChallenge as any).organizerName || "Anonymous"}
                </p>
                <p>
                  <span className="font-semibold">Participants:</span>{" "}
                  {sharingChallenge.participantCount}/
                  {sharingChallenge.maxParticipants}
                </p>
                {(sharingChallenge as any).endTs && (
                  <p>
                    <span className="font-semibold">Time Left:</span>{" "}
                    {Math.floor(
                      (Number((sharingChallenge as any).endTs) -
                        Date.now() / 1000) /
                        3600
                    )}{" "}
                    hours
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Challenge Creation Modal - Outside tabs so it appears on any tab */}
      {showChallengeModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl border border-slate-700 p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-50">
                Create 10-Spot Challenge (On-Chain)
              </h2>
              <button
                onClick={() => {
                  setShowChallengeModal(false);
                  setSelectedSpots([]);
                  setChallengeTitle("");
                  setStakeSol("0.1");
                }}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Challenge Title - First field */}
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
                  !wallet.connected ||
                  !wallet.publicKey ||
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
      )}
    </main>
  );
}
