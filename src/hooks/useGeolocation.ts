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

    setState((prev) => ({
      ...prev,
      status: "locating",
      position: null,
      error: null,
    }));

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
              // Provide more user-friendly error messages
              let errorMessage =
                "Position update is unavailable. Please enable location services.";
              if (err.code === err.PERMISSION_DENIED) {
                errorMessage =
                  "Location permission denied. Please enable location access in your browser settings.";
              } else if (err.code === err.POSITION_UNAVAILABLE) {
                errorMessage =
                  "Location unavailable. Please check your device's location settings.";
              } else if (err.code === err.TIMEOUT) {
                errorMessage = "Location request timed out. Please try again.";
              }
              setState((prev) => ({
                ...prev,
                status: "error",
                error: errorMessage,
              }));
            },
            { enableHighAccuracy: true }
          );
        }
      },
      (err) => {
        // Provide more user-friendly error messages
        let errorMessage =
          "Unable to get your location. Please enable location services.";
        if (err.code === err.PERMISSION_DENIED) {
          errorMessage =
            "Location permission denied. Please enable location access in your browser settings.";
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          errorMessage =
            "Location unavailable. Please check your device's location settings.";
        } else if (err.code === err.TIMEOUT) {
          errorMessage = "Location request timed out. Please try again.";
        }
        setState({
          status: "error",
          position: null,
          error: errorMessage,
        });
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );

    return () => {
      if (watchId != null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [enableWatch]);

  return state;
}
