"use client";

import { useEffect, useState } from "react";
import type { Checkpoint, LatLng } from "@/utils/types";
import { distanceBetween } from "@/utils/location";
import { generateCheckpoints } from "@/services/places";

type CheckpointsState =
  | { status: "idle"; data: Checkpoint[]; error: null }
  | { status: "loading"; data: Checkpoint[]; error: null }
  | { status: "ready"; data: Checkpoint[]; error: null }
  | { status: "error"; data: Checkpoint[]; error: string };

export function useCheckpoints(
  userPosition: LatLng | null,
  radiusMeters: number = 1000,
  types?: string[], // Array of place types to filter by
) {
  const [state, setState] = useState<CheckpointsState>({
    status: "idle",
    data: [],
    error: null,
  });

  useEffect(() => {
    if (!userPosition || state.status === "loading") return;

    setState({ status: "loading", data: [], error: null });

    generateCheckpoints(userPosition, radiusMeters, types)
      .then((checkpoints) => {
        const withDistances = checkpoints.map((cp) => ({
          ...cp,
          distanceMeters: distanceBetween(userPosition, cp.position),
        }));
        setState({ status: "ready", data: withDistances, error: null });
      })
      .catch((err) => {
        setState({
          status: "error",
          data: [],
          error: err?.message ?? "Failed to load checkpoints",
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPosition?.lat, userPosition?.lng, radiusMeters, types?.join(",")]);

  useEffect(() => {
    if (!userPosition || state.status !== "ready") return;

    setState((prev) => {
      if (prev.status !== "ready") return prev;
      const updated = prev.data.map((cp) => ({
        ...cp,
        distanceMeters: distanceBetween(userPosition, cp.position),
      }));
      return { ...prev, data: updated };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userPosition?.lat, userPosition?.lng]);

  return state;
}


