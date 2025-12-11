"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
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
import {
  useChallenges,
  useCreateChallenge,
  useInitEscrow,
  useJoinChallenge,
  useFinalizeChallenge,
  useSettleChallenge,
  type ChallengeAccount,
} from "@/hooks/useChallenges";
import { useSolana } from "@/hooks/useSolana";
import { useAuth } from "@/hooks/useAuth";
import { useAnchorProgram } from "@/hooks/useAnchorProgram";
import toast from "react-hot-toast";
import dynamic from "next/dynamic";
import { ChallengeDetailsModal } from "@/components/ChallengeDetailsModal";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { SOLSTEP_PROGRAM_ID_STRING } from "@/lib/solana";
import { buildTimeoutChallengeInstruction } from "@/utils/instructions";
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
import {
  COLLECTION_RADIUS_METERS,
  MIN_SPOT_DISTANCE_CANDIDATES,
  PLACE_TYPES,
  containerStyle,
  mapStyles,
} from "./constants";
import {
  ChallengeProgress,
  ChallengeWithProgress,
  TxStatus,
  getChallengeId,
} from "./types";
import { selectSpacedCheckpoints } from "./utils";
import { ShareChallengeModal } from "./components/ShareChallengeModal";
import { CreateChallengeModal } from "./components/CreateChallengeModal";

// Dynamically import WalletMultiButton to avoid hydration errors
const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

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
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null);
  const [checkpointChallenges, setCheckpointChallenges] = useState<
    Map<string, ChallengeAccount>
  >(new Map());
  const [challengesWithProgress, setChallengesWithProgress] = useState<
    ChallengeWithProgress[]
  >([]);
  const [firestoreChallenges, setFirestoreChallenges] = useState<any[]>([]);
  const [firestoreChallengesLoading, setFirestoreChallengesLoading] =
    useState(true);
  const [selectedSpots, setSelectedSpots] = useState<Checkpoint[]>([]);
  const [sharingChallenge, setSharingChallenge] =
    useState<ChallengeWithProgress | null>(null);
  const [inviteWalletAddress, setInviteWalletAddress] = useState("");
  const [invitingChallenge, setInvitingChallenge] = useState<string | null>(
    null
  );
  // State to store actual escrow balances
  const [escrowBalances, setEscrowBalances] = useState<Map<string, number>>(
    new Map()
  );
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [dailyChallengeCount, setDailyChallengeCount] = useState<number | null>(
    null
  );
  const [selectedChallengeForDetails, setSelectedChallengeForDetails] =
    useState<ChallengeWithProgress | null>(null);
  const { user } = useAuth();

  const { wallet, publicKey, connected, connection } = useSolana();
  const { connection: connectionFromProgram } = useAnchorProgram();

  const resetStake = useCallback(() => setStakeSol("0.1"), []);

  const handleCloseCreateModal = useCallback(() => {
    setShowChallengeModal(false);
    setSelectedSpots([]);
    setChallengeTitle("");
    resetStake();
  }, [resetStake]);

  const handleSendInvite = useCallback(
    async (walletAddress: string, challengeId: string) => {
      try {
        new PublicKey(walletAddress);
        setInvitingChallenge(challengeId);

        await addDoc(collection(db, "challengeInvites"), {
          challengeId,
          organizerId: publicKey?.toBase58() || "unknown",
          inviteeAddress: walletAddress,
          createdAt: Date.now(),
          status: "pending",
        });
      } finally {
        setInvitingChallenge(null);
      }
    },
    [publicKey]
  );
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
    data: challenges = [],
    isLoading: challengesLoading,
    refreshChallenges,
  } = useChallenges();
  const createChallengeMutation = useCreateChallenge();
  const initEscrowMutation = useInitEscrow();
  const joinChallengeMutation = useJoinChallenge();
  const finalizeChallengeMutation = useFinalizeChallenge();
  const settleChallengeMutation = useSettleChallenge();

  // Check for pending invites when wallet connects (optional - won't error if wallet not connected)
  useEffect(() => {
    if (!publicKey) {
      setPendingInvites([]);
      return;
    }

    const checkInvites = async () => {
      try {
        const invitesQuery = query(
          collection(db, "challengeInvites"),
          where("inviteeAddress", "==", publicKey?.toBase58() || ""),
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
  }, [publicKey]);

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

  // Win condition detection: Monitor avatar collection for on-chain challenges
  useEffect(() => {
    if (!publicKey || !user || avatars.length === 0 || challenges.length === 0)
      return;

    const checkWinConditions = async () => {
      for (const challenge of challenges) {
        // Only check on-chain challenges
        if (!challenge.publicKey) continue;

        // Check if user is a participant
        const isParticipant = challenge.participants?.some((p: any) => {
          // Handle both PublicKey objects and strings
          let pAddress: string | undefined;
          if (p instanceof PublicKey) {
            pAddress = p.toBase58();
          } else if (typeof p === "string") {
            pAddress = p;
          } else if (
            p &&
            typeof p === "object" &&
            "toBase58" in p &&
            typeof (p as any).toBase58 === "function"
          ) {
            pAddress = (p as any).toBase58();
          }
          return pAddress === publicKey.toBase58();
        });
        if (!isParticipant) continue;

        // Get challenge spots from Firestore
        const challengeId = challenge.publicKey.toBase58();
        const challengeDoc = await getDoc(doc(db, "challenges", challengeId));
        if (!challengeDoc.exists()) continue;

        const challengeData = challengeDoc.data();
        const challengeSpots = challengeData.spots || [];
        if (challengeSpots.length !== 10) continue; // Only 10-spot challenges

        // Check if user has collected all 10 spots
        const userCollectedSpots = avatars
          .filter((avatar) => challengeSpots.includes(avatar.checkpointId))
          .map((avatar) => avatar.checkpointId);

        const uniqueCollectedSpots = new Set(userCollectedSpots);

        if (uniqueCollectedSpots.size === 10) {
          // User collected all 10! Check if they're the first
          const progressRef = doc(
            db,
            "challengeProgress",
            `${challengeId}_${user.uid}`
          );
          const progressDoc = await getDoc(progressRef);

          if (!progressDoc.exists() || !progressDoc.data()?.completedAt) {
            // Mark as completed
            await setDoc(
              progressRef,
              {
                challengeId,
                participantId: user.uid,
                spotsCaptured: Array.from(uniqueCollectedSpots),
                completedAt: Date.now(),
              },
              { merge: true }
            );

            // Show success message
            toast.success(
              "🎉 Congratulations! You collected all 10 checkpoints! You're the winner!"
            );

            // If user is organizer, they can settle immediately
            const orgAddress =
              challenge.organizer instanceof PublicKey
                ? challenge.organizer.toBase58()
                : typeof challenge.organizer === "string"
                ? challenge.organizer
                : challenge.organizer &&
                  typeof challenge.organizer === "object" &&
                  "toBase58" in challenge.organizer
                ? (challenge.organizer as { toBase58: () => string }).toBase58()
                : "";
            if (orgAddress === publicKey.toBase58()) {
              toast("You can now settle the challenge to distribute rewards.", {
                icon: "💰",
              });
            }
          }
        }
      }
    };

    checkWinConditions().catch(console.error);
  }, [avatars, challenges, publicKey, user]);

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
    // This effect is no longer needed - React Query handles refetching
  }, [publicKey]);

  // Fetch actual escrow account balances
  useEffect(() => {
    const fetchEscrowBalances = async () => {
      const conn = connection || connectionFromProgram;
      if (!conn || challenges.length === 0) return;

      const balances = new Map<string, number>();

      for (const challenge of challenges) {
        try {
          const [escrowPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("escrow"), challenge.publicKey.toBuffer()],
            new PublicKey(SOLSTEP_PROGRAM_ID_STRING)
          );

          const balance = await conn.getBalance(escrowPda);
          balances.set(challenge.publicKey.toBase58(), balance);
        } catch (error) {
          console.warn(
            "Failed to fetch escrow balance for challenge:",
            challenge.publicKey.toBase58(),
            error
          );
        }
      }

      setEscrowBalances(balances);
    };

    fetchEscrowBalances();
  }, [connection, connectionFromProgram, challenges]);

  // Load challenges directly from Firestore (no Solana required)
  useEffect(() => {
    if (!user) {
      setFirestoreChallenges([]);
      setFirestoreChallengesLoading(false);
      return;
    }

    setFirestoreChallengesLoading(true);
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
        setFirestoreChallengesLoading(false);
      },
      (error) => {
        console.error("Error loading challenges:", error);
        setFirestoreChallengesLoading(false);
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
  // User is close enough to the checkpoint
  const isInCollectionRadius =
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
    publicKey &&
    (() => {
      const orgAddress =
        checkpointChallenge.organizer instanceof PublicKey
          ? checkpointChallenge.organizer.toBase58()
          : typeof checkpointChallenge.organizer === "string"
          ? checkpointChallenge.organizer
          : checkpointChallenge.organizer &&
            typeof checkpointChallenge.organizer === "object" &&
            "toBase58" in checkpointChallenge.organizer
          ? (
              checkpointChallenge.organizer as { toBase58: () => string }
            ).toBase58()
          : "";
      return publicKey.toBase58() === orgAddress;
    })();
  const isChallengeParticipant =
    checkpointChallenge &&
    publicKey &&
    checkpointChallenge.participants?.some((p: any) => {
      // Handle both PublicKey objects and strings
      let pAddress: string | undefined;
      if (p instanceof PublicKey) {
        pAddress = p.toBase58();
      } else if (typeof p === "string") {
        pAddress = p;
      } else if (
        p &&
        typeof p === "object" &&
        "toBase58" in p &&
        typeof (p as any).toBase58 === "function"
      ) {
        pAddress = (p as any).toBase58();
      }
      return pAddress === publicKey.toBase58();
    });
  // Allow organizer to join their own challenge
  const canJoinChallenge =
    checkpointChallenge &&
    !checkpointChallenge.isFinalized &&
    checkpointChallenge.participantCount <
      checkpointChallenge.maxParticipants &&
    !isChallengeParticipant; // Removed !isChallengeOrganizer to allow organizer to join
  // User can actually collect an avatar that counts toward a challenge:
  // must be in range AND joined the checkpoint's active challenge
  const canCollectAvatar = !!isChallengeParticipant && isInCollectionRadius;

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
    if (!publicKey) {
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

    // Auto-select 10 checkpoints with a minimum spacing between spots
    const availableCheckpoints = [...checkpointsState.data];
    let randomSpots: Checkpoint[] = [];

    for (const minDistance of MIN_SPOT_DISTANCE_CANDIDATES) {
      randomSpots = selectSpacedCheckpoints(
        availableCheckpoints,
        10,
        minDistance
      );
      if (randomSpots.length === 10) break;
    }

    if (randomSpots.length < 10) {
      setTxStatus({
        type: "error",
        message:
          "Couldn't find 10 spots that aren't all clustered together. Try moving to an area with more places nearby.",
      });
      return;
    }

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
      const challengePda = await createChallengeMutation.mutateAsync({
        title: challengeTitle.trim() || "10-Spot Challenge",
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
      await initEscrowMutation.mutateAsync(challengePda);

      // Step 3: Store challenge metadata in Firestore (spots, title, etc.)
      const challengeId = challengePda.toBase58();
      await setDoc(doc(db, "challenges", challengeId), {
        title: challengeTitle.trim() || "10-Spot Challenge",
        spots: randomSpots.map((s) => s.id),
        spotNames: randomSpots.map((s) => s.name),
        organizer: user?.uid || publicKey?.toBase58() || "",
        organizerWallet: publicKey?.toBase58() || "",
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
      // Reset form
      setShowChallengeModal(false);
      setChallengeForCheckpoint(null);
      setDurationHours("24");
      setMaxParticipants("10");
      setChallengeTitle("");
      setStakeSol("0.1");
      setTxStatus(null);

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

  // Find user's active challenge (if any)
  const userActiveChallenge = useMemo(() => {
    if (!publicKey && !user) return null;

    // Check on-chain challenges
    for (const challenge of challenges) {
      const isEnded = Number(challenge.endTs) < Math.floor(Date.now() / 1000);
      if (isEnded || challenge.isFinalized) continue;

      const isParticipant = challenge.participants?.some((p: any) => {
        const pAddress =
          p instanceof PublicKey
            ? p.toBase58()
            : typeof p === "string"
            ? p
            : p &&
              typeof p === "object" &&
              "toBase58" in p &&
              typeof (p as any).toBase58 === "function"
            ? (p as any).toBase58()
            : undefined;
        return (
          (publicKey && pAddress === publicKey.toBase58()) ||
          (user && pAddress === user.uid)
        );
      });

      if (isParticipant) {
        return challenge;
      }
    }

    // Check Firestore challenges
    for (const challenge of firestoreChallenges) {
      const isEnded = Number(challenge.endTs) < Math.floor(Date.now() / 1000);
      // Winner is stored in Firestore, not on-chain
      if (isEnded) continue;

      const isParticipant = user && challenge.participants?.includes(user.uid);
      if (isParticipant) {
        return challenge;
      }
    }

    return null;
  }, [challenges, firestoreChallenges, publicKey, user]);

  // Join challenge handler - ON-CHAIN ONLY
  // This function calls the Solana program's join_challenge instruction
  // The participant's wallet address is automatically used as the signer
  const handleJoinChallenge = async (challengePubkey: PublicKey) => {
    // Prevent joining if user is already in an active challenge
    if (userActiveChallenge) {
      setTxStatus({
        type: "error",
        message:
          "You can only join one active challenge at a time. Please complete or wait for your current challenge to end.",
      });
      return;
    }

    try {
      setJoiningChallengeId(challengePubkey.toBase58());
      setTxStatus(null);

      // This calls the on-chain join_challenge instruction
      // The transaction is signed by the connected wallet (publicKey)
      // and sent to the Solana blockchain
      await joinChallengeMutation.mutateAsync(challengePubkey);

      setTxStatus({
        type: "success",
        message: "Successfully joined challenge on-chain!",
      });

      // Refresh challenges to show updated participant count
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
              <WalletMultiButton />
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
                ⚠️ {geoError}
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
            {challengesLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800/50 rounded-lg p-2.5 border border-slate-700/50">
                <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                <span>Loading challenges...</span>
              </div>
            )}
            {createChallengeMutation.isPending && (
              <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/30 rounded-lg p-2.5 border border-amber-800/50">
                <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <span>Creating challenge on-chain...</span>
              </div>
            )}
            {initEscrowMutation.isPending && (
              <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-950/30 rounded-lg p-2.5 border border-amber-800/50">
                <div className="w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
                <span>Initializing escrow...</span>
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
                          strokeColor: isInCollectionRadius
                            ? "#22c55e"
                            : "#ef4444",
                          strokeOpacity: 0.8,
                          strokeWeight: 2,
                          fillColor: isInCollectionRadius
                            ? "#22c55e"
                            : "#ef4444",
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
                        ) : isInCollectionRadius ? (
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
                      ) : canCollectAvatar ? (
                        <span className="flex items-center gap-2">
                          <span className="text-green-400 text-base">✓</span>
                          <span className="font-medium text-green-300">
                            Ready to collect! Open camera to capture avatar.
                          </span>
                        </span>
                      ) : isInCollectionRadius && checkpointChallenge ? (
                        <span className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-2">
                            <span className="text-amber-400 text-base">!</span>
                            <span className="font-medium text-amber-200">
                              You&apos;re in range, but you need to join the
                              active challenge above before collecting avatars.
                            </span>
                          </span>
                          <span className="text-[10px] text-amber-300/80">
                            Join the challenge, then come back to this spot to
                            capture and have it count toward winning.
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
                          : canCollectAvatar
                          ? "bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-500 hover:to-emerald-500 shadow-green-500/30"
                          : "bg-slate-700 text-slate-400 cursor-not-allowed opacity-60"
                      }`}
                      aria-disabled={!canCollectAvatar || isAlreadyCollected}
                      onClick={(e) => {
                        if (!canCollectAvatar || isAlreadyCollected) {
                          e.preventDefault();
                        }
                      }}
                    >
                      {isAlreadyCollected
                        ? "✓ Collected"
                        : canCollectAvatar
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
                        {publicKey ? (
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

          {!user && (
            <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-center">
              <p className="text-xs text-slate-400">
                Sign in to create or join challenges
              </p>
            </div>
          )}

          {/* Pending Invites Notification */}
          {pendingInvites.length > 0 && publicKey && (
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
                      if (!publicKey) {
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
                    disabled={!publicKey}
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
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {userActiveChallenge
                  ? "Your Active Challenge"
                  : "Active Challenges"}
              </h2>
              <div className="flex items-center gap-2">
                {userActiveChallenge && (
                  <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    You're in this challenge
                  </span>
                )}
                <Link
                  href="/history"
                  className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 transition-colors"
                  title="View Challenge History"
                >
                  📜 History
                </Link>
              </div>
            </div>
            {challengesLoading || firestoreChallengesLoading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-4">
                <div className="w-12 h-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
                <p className="text-xs text-slate-400">Loading challenges...</p>
              </div>
            ) : userActiveChallenge ? (
              // Only show user's active challenge
              <>
                {/* User's Active Challenge - On-chain */}
                {userActiveChallenge.publicKey &&
                  (() => {
                    const challenge = userActiveChallenge as ChallengeAccount;
                    const challengeId = challenge.publicKey.toBase58();
                    const firestoreData = firestoreChallenges.find(
                      (fc) =>
                        fc.id === challengeId || fc.challengePda === challengeId
                    );

                    const isParticipant = challenge.participants?.some(
                      (p: any) => {
                        const pAddress =
                          p instanceof PublicKey
                            ? p.toBase58()
                            : typeof p === "string"
                            ? p
                            : p &&
                              typeof p === "object" &&
                              "toBase58" in p &&
                              typeof (p as any).toBase58 === "function"
                            ? (p as any).toBase58()
                            : undefined;
                        return pAddress === publicKey?.toBase58();
                      }
                    );
                    const isOrganizer = (() => {
                      const orgAddress =
                        challenge.organizer instanceof PublicKey
                          ? challenge.organizer.toBase58()
                          : typeof challenge.organizer === "string"
                          ? challenge.organizer
                          : challenge.organizer &&
                            typeof challenge.organizer === "object" &&
                            "toBase58" in challenge.organizer
                          ? (
                              challenge.organizer as { toBase58: () => string }
                            ).toBase58()
                          : "";
                      return publicKey?.toBase58() === orgAddress;
                    })();

                    const userProgress =
                      user && firestoreData?.progress
                        ? firestoreData.progress.get(user.uid)
                        : null;
                    const spotsCaptured =
                      userProgress?.spotsCaptured.length || 0;
                    const isEnded =
                      Number(challenge.endTs) < Math.floor(Date.now() / 1000);

                    // Get escrow balance
                    const [escrowPda] = PublicKey.findProgramAddressSync(
                      [Buffer.from("escrow"), challenge.publicKey.toBuffer()],
                      new PublicKey(SOLSTEP_PROGRAM_ID_STRING)
                    );

                    return (
                      <div
                        key={challenge.publicKey.toBase58()}
                        className="rounded-2xl border-2 border-emerald-500/50 bg-emerald-950/20 p-4 space-y-3 shadow-lg shadow-emerald-500/20"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">⭐</span>
                          <span className="text-xs font-semibold text-emerald-300">
                            Your Active Challenge
                          </span>
                        </div>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-semibold text-slate-50">
                                🏆{" "}
                                {firestoreData?.title ||
                                  challenge.title ||
                                  "10-Spot Challenge"}
                              </p>
                            </div>
                            <p className="text-xs text-slate-400 mb-2">
                              by {firestoreData?.organizerName || "Anonymous"}
                              {Number(challenge.stakeAmount) > 0 && (
                                <span className="ml-2 text-emerald-400 font-semibold">
                                  •{" "}
                                  {(
                                    Number(challenge.stakeAmount) /
                                    LAMPORTS_PER_SOL
                                  ).toFixed(2)}{" "}
                                  SOL stake
                                </span>
                              )}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-slate-300">
                              <div className="flex items-center gap-1">
                                <span className="text-slate-400">👥</span>
                                <span>
                                  {challenge.participantCount}/
                                  {challenge.maxParticipants}
                                </span>
                              </div>
                              {!isEnded && (
                                <div className="flex items-center gap-1 text-emerald-400 font-medium">
                                  <span>⏱️</span>
                                  <span>
                                    {Math.floor(
                                      (Number(challenge.endTs) -
                                        Date.now() / 1000) /
                                        3600
                                    )}
                                    h{" "}
                                    {Math.floor(
                                      ((Number(challenge.endTs) -
                                        Date.now() / 1000) %
                                        3600) /
                                        60
                                    )}
                                    m
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <span className="px-2.5 py-1 rounded-full text-[0.65rem] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            Active
                          </span>
                        </div>

                        {/* Escrow Vault Display */}
                        <div className="pt-2 border-t border-emerald-500/30">
                          <div className="bg-slate-800/50 rounded-lg p-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-slate-300">
                                💰 Escrow Vault
                              </p>
                              <p className="text-xs text-cyan-400 font-bold">
                                {(() => {
                                  const actualBalance = escrowBalances.get(
                                    challenge.publicKey.toBase58()
                                  );
                                  const displayBalance =
                                    actualBalance !== undefined
                                      ? (
                                          actualBalance / LAMPORTS_PER_SOL
                                        ).toFixed(2)
                                      : (
                                          Number(challenge.totalStake) /
                                          LAMPORTS_PER_SOL
                                        ).toFixed(2);
                                  return `${displayBalance} SOL`;
                                })()}
                              </p>
                            </div>
                            <p className="text-[0.7rem] text-slate-400">
                              {(() => {
                                const actualBalance = escrowBalances.get(
                                  challenge.publicKey.toBase58()
                                );
                                if (actualBalance !== undefined) {
                                  return `Actual balance: ${(
                                    actualBalance / LAMPORTS_PER_SOL
                                  ).toFixed(2)} SOL`;
                                }
                                return `Expected: ${
                                  challenge.participantCount
                                } × ${(
                                  Number(challenge.stakeAmount) /
                                  LAMPORTS_PER_SOL
                                ).toFixed(2)} SOL`;
                              })()}
                            </p>
                          </div>
                        </div>

                        {/* Progress */}
                        {isParticipant && userProgress && (
                          <div className="pt-2 border-t border-emerald-500/30">
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
                                style={{
                                  width: `${(spotsCaptured / 10) * 100}%`,
                                }}
                              />
                            </div>
                            {spotsCaptured === 10 && !firestoreData?.winner && (
                              <p className="text-xs text-yellow-400 font-medium animate-pulse">
                                🎉 You captured all 10 spots! You're the winner!
                              </p>
                            )}
                          </div>
                        )}

                        <div className="pt-2 border-t border-emerald-500/30 flex gap-2">
                          <button
                            onClick={() =>
                              setSelectedChallengeForDetails({
                                spots: firestoreData?.spots || [],
                                progress: firestoreData?.progress || new Map(),
                                title: firestoreData?.title || challenge.title,
                                endTs: Number(challenge.endTs),
                                stakeAmount:
                                  Number(challenge.stakeAmount) /
                                  LAMPORTS_PER_SOL,
                                winner: firestoreData?.winner,
                                publicKey: challenge.publicKey,
                                organizer: challenge.organizer,
                                startTs: Number(challenge.startTs),
                                maxParticipants: challenge.maxParticipants,
                                participantCount: challenge.participantCount,
                                totalStake:
                                  Number(challenge.totalStake) /
                                  LAMPORTS_PER_SOL,
                                isFinalized: challenge.isFinalized,
                                participants: challenge.participants,
                              } as any)
                            }
                            className="flex-1 px-3 py-2 rounded-full bg-emerald-500/90 text-slate-950 text-xs font-semibold hover:bg-emerald-500 transition-colors"
                          >
                            View Details
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSharingChallenge({
                                ...challenge,
                                spots: firestoreData?.spots || [],
                                progress: firestoreData?.progress || new Map(),
                                title: firestoreData?.title || challenge.title,
                              } as any);
                            }}
                            className="px-3 py-2 rounded-full bg-purple-500/90 text-white text-xs font-semibold hover:bg-purple-500 transition-colors"
                            title="Share challenge"
                          >
                            📤 Share
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                {/* User's Active Challenge - Firestore */}
                {userActiveChallenge &&
                  !userActiveChallenge.publicKey &&
                  (() => {
                    const challenge = userActiveChallenge as any;
                    const isParticipant =
                      user && challenge.participants?.includes(user.uid);
                    const isOrganizer =
                      user && challenge.organizer === user.uid;
                    const userProgress = user
                      ? challenge.progress.get(user.uid)
                      : null;
                    const spotsCaptured =
                      userProgress?.spotsCaptured.length || 0;
                    const isEnded =
                      Number(challenge.endTs) < Math.floor(Date.now() / 1000);

                    return (
                      <div
                        key={challenge.id}
                        className="rounded-2xl border-2 border-emerald-500/50 bg-emerald-950/20 p-4 space-y-3 shadow-lg shadow-emerald-500/20"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">⭐</span>
                          <span className="text-xs font-semibold text-emerald-300">
                            Your Active Challenge
                          </span>
                        </div>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-semibold text-slate-50">
                                🏆 {challenge.title || "10-Spot Challenge"}
                              </p>
                            </div>
                            <p className="text-xs text-slate-400 mb-2">
                              by {challenge.organizerName || "Anonymous"}
                              {challenge.stakeAmount > 0 && (
                                <span className="ml-2 text-emerald-400 font-semibold">
                                  • {challenge.stakeAmount} SOL stake
                                </span>
                              )}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-slate-300">
                              <div className="flex items-center gap-1">
                                <span className="text-slate-400">👥</span>
                                <span>
                                  {challenge.participantCount}/
                                  {challenge.maxParticipants}
                                </span>
                              </div>
                              {!isEnded && (
                                <div className="flex items-center gap-1 text-emerald-400 font-medium">
                                  <span>⏱️</span>
                                  <span>
                                    {Math.floor(
                                      (Number(challenge.endTs) -
                                        Date.now() / 1000) /
                                        3600
                                    )}
                                    h{" "}
                                    {Math.floor(
                                      ((Number(challenge.endTs) -
                                        Date.now() / 1000) %
                                        3600) /
                                        60
                                    )}
                                    m
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <span className="px-2.5 py-1 rounded-full text-[0.65rem] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            Active
                          </span>
                        </div>

                        {/* Escrow Vault Display */}
                        {challenge.stakeAmount > 0 && (
                          <div className="pt-2 border-t border-emerald-500/30">
                            <div className="bg-slate-800/50 rounded-lg p-3">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold text-slate-300">
                                  💰 Escrow Vault
                                </p>
                                <p className="text-xs text-cyan-400 font-bold">
                                  {(
                                    challenge.stakeAmount *
                                    challenge.participantCount
                                  ).toFixed(2)}{" "}
                                  SOL
                                </p>
                              </div>
                              <p className="text-[0.7rem] text-slate-400">
                                Total funds locked: {challenge.participantCount}{" "}
                                × {challenge.stakeAmount} SOL
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Progress */}
                        {isParticipant && userProgress && (
                          <div className="pt-2 border-t border-emerald-500/30">
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
                                style={{
                                  width: `${(spotsCaptured / 10) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="pt-2 border-t border-emerald-500/30 flex gap-2">
                          <button
                            onClick={() =>
                              setSelectedChallengeForDetails(challenge)
                            }
                            className="flex-1 px-3 py-2 rounded-full bg-emerald-500/90 text-slate-950 text-xs font-semibold hover:bg-emerald-500 transition-colors"
                          >
                            View Details
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSharingChallenge(challenge as any);
                            }}
                            className="px-3 py-2 rounded-full bg-purple-500/90 text-white text-xs font-semibold hover:bg-purple-500 transition-colors"
                            title="Share challenge"
                          >
                            📤 Share
                          </button>
                        </div>
                      </div>
                    );
                  })()}
              </>
            ) : firestoreChallenges.length === 0 && challenges.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <p className="text-xs text-slate-400">
                  No active challenges yet. Be the first to create one!
                </p>
                <p className="text-[0.7rem] text-slate-500">
                  Create a challenge from the Map tab to get started
                </p>
              </div>
            ) : (
              <>
                {/* Show all challenges if user is not in any */}
                {/* On-chain Challenges */}
                {challenges.length > 0 &&
                  challenges.map((challenge) => {
                    const challengeId = challenge.publicKey.toBase58();
                    // Get Firestore data for this challenge if it exists
                    const firestoreData = firestoreChallenges.find(
                      (fc) =>
                        fc.id === challengeId || fc.challengePda === challengeId
                    );

                    const isParticipant = challenge.participants?.some(
                      (p: any) => {
                        const pAddress =
                          p instanceof PublicKey
                            ? p.toBase58()
                            : typeof p === "string"
                            ? p
                            : p &&
                              typeof p === "object" &&
                              "toBase58" in p &&
                              typeof (p as any).toBase58 === "function"
                            ? (p as any).toBase58()
                            : undefined;
                        return pAddress === publicKey?.toBase58();
                      }
                    );
                    const isOrganizer = (() => {
                      const orgAddress =
                        challenge.organizer instanceof PublicKey
                          ? challenge.organizer.toBase58()
                          : typeof challenge.organizer === "string"
                          ? challenge.organizer
                          : challenge.organizer &&
                            typeof challenge.organizer === "object" &&
                            "toBase58" in challenge.organizer
                          ? (
                              challenge.organizer as { toBase58: () => string }
                            ).toBase58()
                          : "";
                      return publicKey?.toBase58() === orgAddress;
                    })();

                    // Get user progress from Firestore
                    const userProgress =
                      user && firestoreData?.progress
                        ? firestoreData.progress.get(user.uid)
                        : null;
                    const spotsCaptured =
                      userProgress?.spotsCaptured.length || 0;
                    const isEnded =
                      Number(challenge.endTs) < Math.floor(Date.now() / 1000);
                    const canJoin =
                      publicKey &&
                      !isParticipant &&
                      !isEnded &&
                      challenge.participantCount < challenge.maxParticipants;

                    return (
                      <div
                        key={challenge.publicKey.toBase58()}
                        className={`rounded-2xl border p-4 space-y-3 transition-all cursor-pointer ${
                          isParticipant
                            ? "border-2 border-emerald-500/50 bg-emerald-950/20 shadow-lg shadow-emerald-500/20"
                            : "border-slate-800 bg-slate-900/70 hover:border-slate-700"
                        }`}
                        onClick={() =>
                          setSelectedChallengeForDetails({
                            ...challenge,
                            spots: firestoreData?.spots || [],
                            progress: firestoreData?.progress || new Map(),
                            title: firestoreData?.title || challenge.title,
                            endTs: Number(challenge.endTs),
                            stakeAmount:
                              Number(challenge.stakeAmount) / LAMPORTS_PER_SOL,
                            startTs: Number(challenge.startTs),
                            totalStake:
                              Number(challenge.totalStake) / LAMPORTS_PER_SOL,
                            winner: firestoreData?.winner,
                          } as any)
                        }
                      >
                        {isParticipant && (
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">⭐</span>
                            <span className="text-xs font-semibold text-emerald-300">
                              Your Active Challenge
                            </span>
                          </div>
                        )}
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-semibold text-slate-50">
                                🏆{" "}
                                {firestoreData?.title ||
                                  challenge.title ||
                                  "10-Spot Challenge"}
                              </p>
                              {firestoreData?.winner && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
                                  Winner: {firestoreData?.winner?.slice(0, 8)}
                                  ...
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 mb-2">
                              by {firestoreData?.organizerName || "Anonymous"}
                              {Number(challenge.stakeAmount) > 0 && (
                                <span className="ml-2 text-emerald-400 font-semibold">
                                  •{" "}
                                  {(
                                    Number(challenge.stakeAmount) /
                                    LAMPORTS_PER_SOL
                                  ).toFixed(2)}{" "}
                                  SOL stake
                                </span>
                              )}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-slate-300">
                              <div className="flex items-center gap-1">
                                <span className="text-slate-400">👥</span>
                                <span>
                                  {challenge.participantCount}/
                                  {challenge.maxParticipants}
                                </span>
                              </div>
                              {!isEnded && (
                                <div className="flex items-center gap-1 text-emerald-400 font-medium">
                                  <span>⏱️</span>
                                  <span>
                                    {Math.floor(
                                      (Number(challenge.endTs) -
                                        Date.now() / 1000) /
                                        3600
                                    )}
                                    h{" "}
                                    {Math.floor(
                                      ((Number(challenge.endTs) -
                                        Date.now() / 1000) %
                                        3600) /
                                        60
                                    )}
                                    m
                                  </span>
                                </div>
                              )}
                            </div>
                            <p className="text-[0.7rem] text-slate-500 italic mt-1">
                              Click to view details
                            </p>
                          </div>
                          <span
                            className={`px-2.5 py-1 rounded-full text-[0.65rem] font-semibold ${
                              firestoreData?.winner
                                ? "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40"
                                : isEnded
                                ? "bg-red-500/20 text-red-300 border border-red-500/40"
                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            }`}
                          >
                            {firestoreData?.winner
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
                                style={{
                                  width: `${(spotsCaptured / 10) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="pt-2 border-t border-slate-700/50 flex gap-2">
                          {canJoin && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await handleJoinChallenge(
                                    challenge.publicKey
                                  );
                                } catch (e: any) {
                                  setTxStatus({
                                    type: "error",
                                    message:
                                      e?.message || "Failed to join challenge",
                                  });
                                }
                              }}
                              className="flex-1 px-3 py-2 rounded-full bg-emerald-500/90 text-slate-950 text-xs font-semibold disabled:opacity-50 hover:bg-emerald-500 transition-colors"
                              disabled={
                                !publicKey || joinChallengeMutation.isPending
                              }
                            >
                              {joinChallengeMutation.isPending
                                ? "Joining..."
                                : `Join Challenge (${(
                                    Number(challenge.stakeAmount) /
                                    LAMPORTS_PER_SOL
                                  ).toFixed(2)} SOL)`}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                {/* Firestore Challenges */}
                {firestoreChallenges.length > 0 &&
                  firestoreChallenges.map((challenge) => {
                    const isParticipant =
                      user && challenge.participants?.includes(user.uid);
                    const isOrganizer =
                      user && challenge.organizer === user.uid;
                    const isOnChainChallenge = !!challenge.publicKey;
                    const userProgress = user
                      ? challenge.progress.get(user.uid)
                      : null;
                    const spotsCaptured =
                      userProgress?.spotsCaptured.length || 0;
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
                        className={`rounded-2xl border p-4 space-y-3 transition-all cursor-pointer ${
                          isParticipant
                            ? "border-2 border-emerald-500/50 bg-emerald-950/20 shadow-lg shadow-emerald-500/20"
                            : "border-slate-800 bg-slate-900/70 hover:border-slate-700"
                        }`}
                        onClick={() =>
                          setSelectedChallengeForDetails(challenge)
                        }
                      >
                        {isParticipant && (
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">⭐</span>
                            <span className="text-xs font-semibold text-emerald-300">
                              Your Active Challenge
                            </span>
                          </div>
                        )}
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-semibold text-slate-50">
                                🏆{" "}
                                {(challenge as any).title ||
                                  "10-Spot Challenge"}
                              </p>
                              {(challenge as any).winner && (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
                                  Winner:{" "}
                                  {(challenge as any).winner?.slice(0, 8)}...
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
                                    (Number(challenge.endTs) -
                                      Date.now() / 1000) /
                                      3600
                                  )}
                                  h{" "}
                                  {Math.floor(
                                    ((Number(challenge.endTs) -
                                      Date.now() / 1000) %
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
                                style={{
                                  width: `${(spotsCaptured / 10) * 100}%`,
                                }}
                              />
                            </div>
                            {spotsCaptured === 10 && !challenge.winner && (
                              <div className="space-y-2">
                                <p className="text-xs text-yellow-400 font-medium animate-pulse">
                                  🎉 You captured all 10 spots! You're the
                                  winner!
                                </p>
                                {challenge.publicKey && isOrganizer && (
                                  <button
                                    onClick={async () => {
                                      try {
                                        // Find the loser (first other participant)
                                        const otherParticipants =
                                          challenge.participants
                                            ?.filter((p: any) => {
                                              // Handle both PublicKey objects and strings
                                              const pAddress =
                                                p instanceof PublicKey
                                                  ? p.toBase58()
                                                  : typeof p === "string"
                                                  ? p
                                                  : p &&
                                                    typeof p === "object" &&
                                                    "toBase58" in p &&
                                                    typeof (p as any)
                                                      .toBase58 === "function"
                                                  ? (p as any).toBase58()
                                                  : undefined;
                                              return (
                                                pAddress !==
                                                publicKey?.toBase58()
                                              );
                                            })
                                            .map((p: any) => {
                                              // Convert to PublicKey if needed
                                              if (p instanceof PublicKey)
                                                return p;
                                              if (typeof p === "string")
                                                return new PublicKey(p);
                                              return new PublicKey(
                                                p.toBase58?.() || p
                                              );
                                            }) || [];

                                        if (otherParticipants.length === 0) {
                                          toast.error(
                                            "No other participants to settle with"
                                          );
                                          return;
                                        }

                                        const winner = publicKey!;
                                        const loser = otherParticipants[0];

                                        // Ensure organizer is a PublicKey
                                        const organizer =
                                          challenge.organizer instanceof
                                          PublicKey
                                            ? challenge.organizer
                                            : new PublicKey(
                                                typeof challenge.organizer ===
                                                "string"
                                                  ? challenge.organizer
                                                  : challenge.organizer?.toBase58?.() ||
                                                    challenge.organizer
                                              );

                                        await settleChallengeMutation.mutateAsync(
                                          {
                                            challenge: challenge.publicKey,
                                            organizer,
                                            winner,
                                            loser,
                                          }
                                        );

                                        toast.success(
                                          "Challenge settled! Rewards distributed."
                                        );
                                      } catch (e: any) {
                                        toast.error(
                                          e?.message ||
                                            "Failed to settle challenge"
                                        );
                                      }
                                    }}
                                    disabled={settleChallengeMutation.isPending}
                                    className="w-full px-3 py-1.5 rounded-full bg-yellow-500/90 text-slate-950 text-xs font-semibold disabled:opacity-50"
                                  >
                                    {settleChallengeMutation.isPending
                                      ? "Settling..."
                                      : "💰 Settle Challenge & Distribute Rewards"}
                                  </button>
                                )}
                              </div>
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
                              onClick={async (e) => {
                                e.stopPropagation(); // Prevent modal from opening
                                // For on-chain challenges, use on-chain join
                                if (challenge.publicKey) {
                                  try {
                                    await handleJoinChallenge(
                                      challenge.publicKey
                                    );
                                  } catch (e: any) {
                                    setTxStatus({
                                      type: "error",
                                      message:
                                        e?.message ||
                                        "Failed to join challenge",
                                    });
                                  }
                                } else if (challenge.id) {
                                  // Legacy Firestore challenge - create progress entry
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
                                        e?.message ||
                                        "Failed to join challenge",
                                    });
                                  }
                                }
                              }}
                              className="flex-1 px-3 py-2 rounded-full bg-emerald-500/90 text-slate-950 text-xs font-semibold disabled:opacity-50 hover:bg-emerald-500 transition-colors"
                              disabled={!publicKey && !user}
                            >
                              {challenge.publicKey
                                ? "Join Challenge (On-chain)"
                                : "Join Challenge"}
                            </button>
                          )}
                          {isParticipant && (
                            <span className="px-3 py-2 rounded-full bg-blue-500/20 text-blue-300 text-xs font-medium border border-blue-500/40">
                              ✓ Joined
                            </span>
                          )}
                          {isOrganizer &&
                            challenge.publicKey &&
                            spotsCaptured === 10 &&
                            !(challenge as any).winner && (
                              <button
                                onClick={async () => {
                                  try {
                                    // Find the loser (first other participant)
                                    const otherParticipants =
                                      challenge.participants
                                        ?.filter((p: any) => {
                                          // Handle both PublicKey objects and strings
                                          const pAddress =
                                            p instanceof PublicKey
                                              ? p.toBase58()
                                              : typeof p === "string"
                                              ? p
                                              : p &&
                                                typeof p === "object" &&
                                                "toBase58" in p &&
                                                typeof (p as any).toBase58 ===
                                                  "function"
                                              ? (p as any).toBase58()
                                              : undefined;
                                          return (
                                            pAddress !== publicKey?.toBase58()
                                          );
                                        })
                                        .map((p: any) => {
                                          // Convert to PublicKey if needed
                                          if (p instanceof PublicKey) return p;
                                          if (typeof p === "string")
                                            return new PublicKey(p);
                                          return new PublicKey(
                                            p.toBase58?.() || p
                                          );
                                        }) || [];

                                    if (otherParticipants.length === 0) {
                                      toast.error(
                                        "No other participants to settle with"
                                      );
                                      return;
                                    }

                                    const winner = publicKey!;
                                    const loser = otherParticipants[0];

                                    // Ensure organizer is a PublicKey
                                    const organizer =
                                      challenge.organizer instanceof PublicKey
                                        ? challenge.organizer
                                        : new PublicKey(
                                            typeof challenge.organizer ===
                                            "string"
                                              ? challenge.organizer
                                              : challenge.organizer?.toBase58?.() ||
                                                challenge.organizer
                                          );

                                    await settleChallengeMutation.mutateAsync({
                                      challenge: challenge.publicKey,
                                      organizer,
                                      winner,
                                      loser,
                                    });

                                    toast.success(
                                      "Challenge settled! Rewards distributed."
                                    );
                                  } catch (e: any) {
                                    toast.error(
                                      e?.message || "Failed to settle challenge"
                                    );
                                  }
                                }}
                                disabled={settleChallengeMutation.isPending}
                                className="px-3 py-2 rounded-full bg-yellow-500/90 text-slate-950 text-xs font-semibold disabled:opacity-50"
                              >
                                {settleChallengeMutation.isPending
                                  ? "Settling..."
                                  : "💰 Settle"}
                              </button>
                            )}
                          {isOrganizer && (
                            <span className="px-3 py-2 rounded-full bg-amber-500/20 text-amber-300 text-xs font-medium border border-amber-500/40">
                              👑 Organizer
                            </span>
                          )}
                          {/* Share Button - Always visible */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent opening challenge details modal
                              setSharingChallenge(challenge as any);
                            }}
                            className="px-3 py-2 rounded-full bg-purple-500/90 text-white text-xs font-semibold hover:bg-purple-500 transition-colors"
                            title="Share challenge"
                          >
                            📤 Share
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </>
            )}
          </div>
        </section>
      )}

      {sharingChallenge && (
        <ShareChallengeModal
          challenge={sharingChallenge as ChallengeWithProgress}
          publicKey={publicKey}
          inviteWalletAddress={inviteWalletAddress}
          invitingChallenge={invitingChallenge}
          onInviteAddressChange={setInviteWalletAddress}
          onSendInvite={handleSendInvite}
          onClose={() => {
            setSharingChallenge(null);
            setInviteWalletAddress("");
          }}
          setTxStatus={setTxStatus}
        />
      )}

      <CreateChallengeModal
        isOpen={showChallengeModal}
        onClose={handleCloseCreateModal}
        challengeTitle={challengeTitle}
        setChallengeTitle={setChallengeTitle}
        stakeSol={stakeSol}
        setStakeSol={setStakeSol}
        durationHours={durationHours}
        setDurationHours={setDurationHours}
        maxParticipants={maxParticipants}
        setMaxParticipants={setMaxParticipants}
        txStatus={txStatus}
        checkpointsState={checkpointsState as any}
        creatingChallenge={creatingChallenge}
        publicKey={publicKey}
        dailyChallengeCount={dailyChallengeCount}
        handleCreateChallenge={handleCreateChallenge}
        setSelectedSpots={setSelectedSpots}
        resetStake={resetStake}
      />

      {/* Challenge Details Modal */}
      {selectedChallengeForDetails && (
        <ChallengeDetailsModal
          challenge={selectedChallengeForDetails as any}
          isOpen={!!selectedChallengeForDetails}
          onClose={() => setSelectedChallengeForDetails(null)}
          userPublicKey={publicKey}
          userProgress={
            user && selectedChallengeForDetails.progress
              ? selectedChallengeForDetails.progress.get(user.uid) || undefined
              : undefined
          }
        />
      )}
    </main>
  );
}
