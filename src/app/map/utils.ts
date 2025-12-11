import { distanceBetween } from "@/utils/location";
import type { Checkpoint } from "@/utils/types";

export function selectSpacedCheckpoints(
  checkpoints: Checkpoint[],
  requiredCount: number,
  minDistanceMeters: number
): Checkpoint[] {
  if (checkpoints.length === 0) return [];

  const shuffled = [...checkpoints].sort(() => Math.random() - 0.5);
  const selected: Checkpoint[] = [];

  for (const candidate of shuffled) {
    if (selected.length === 0) {
      selected.push(candidate);
      continue;
    }

    const tooClose = selected.some((spot) => {
      return (
        distanceBetween(spot.position, candidate.position) < minDistanceMeters
      );
    });

    if (!tooClose) {
      selected.push(candidate);
    }

    if (selected.length >= requiredCount) {
      break;
    }
  }

  return selected;
}

