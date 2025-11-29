import type { Avatar, UserStats } from "./types";

export function computeStatsFromAvatars(avatars: Avatar[]): UserStats {
  const checkpointsVisited = new Set(
    avatars.map((a) => a.checkpointId),
  ).size;

  const avatarsCollected = avatars.length;

  // Placeholders for now; can be computed once you track activity.
  const streakDays = 0;
  const totalDistanceMeters = 0;

  return {
    checkpointsVisited,
    avatarsCollected,
    streakDays,
    totalDistanceMeters,
  };
}


