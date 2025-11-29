"use client";

import { useEffect, useState } from "react";
import type { LatLng } from "@/utils/types";

type GeolocationState =
  | { status: "idle"; position: null; error: null }
  | { status: "locating"; position: null; error: null }
  | { status: "ready"; position: LatLng; error: null }
  | { status: "error"; position: LatLng | null; error: string };

export function useGeolocation(enableWatch: boolean = true) {
  const [state, setState] = useState<GeolocationState>({
    status: "idle",
    position: null,
    error: null,
  });

  useEffect(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setState({
        status: "error",
        position: null,
        error: "Geolocation is not supported in this browser.",
      });
      return;
    }

    let watchId: number | null = null;

    setState((prev) => ({ ...prev, status: "locating" }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const pos: LatLng = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setState({ status: "ready", position: pos, error: null });

        if (enableWatch) {
          watchId = navigator.geolocation.watchPosition(
            (p) => {
              const next: LatLng = {
                lat: p.coords.latitude,
                lng: p.coords.longitude,
              };
              setState({ status: "ready", position: next, error: null });
            },
            (err) => {
              setState((prev) => ({
                ...prev,
                status: "error",
                error: err.message,
              }));
            },
            { enableHighAccuracy: true, distanceFilter: 5 },
          );
        }
      },
      (err) => {
        setState({
          status: "error",
          position: null,
          error: err.message,
        });
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );

    return () => {
      if (watchId != null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [enableWatch]);

  return state;
}


