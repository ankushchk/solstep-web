import type { Checkpoint, LatLng } from "@/utils/types";
import { distanceBetween } from "@/utils/location";

const MOCK_NAMES = [
  "Sunrise Café",
  "Central Park Fountain",
  "Old Town Library",
  "Riverside Gym",
  "Skyline Lookout",
  "Greenleaf Garden",
  "City Hall Plaza",
  "River Bridge",
  "Art District Mural",
  "Lakeside Pier",
];

// Fallback to mock data if Places API fails
export async function generateMockCheckpoints(
  origin: LatLng,
  count: number = 10,
  maxRadiusMeters: number = 1000,
): Promise<Checkpoint[]> {
  const checkpoints: Checkpoint[] = [];

  for (let i = 0; i < count; i++) {
    const bearing = (Math.random() * 360 * Math.PI) / 180;
    const distance = Math.random() * maxRadiusMeters;

    const latOffset = (distance / 111320) * Math.cos(bearing);
    const lngOffset =
      (distance /
        (111320 * Math.cos((origin.lat * Math.PI) / 180))) *
      Math.sin(bearing);

    const position: LatLng = {
      lat: origin.lat + latOffset,
      lng: origin.lng + lngOffset,
    };

    const distanceMeters = distanceBetween(origin, position);

    checkpoints.push({
      id: `mock-${i}`,
      name: MOCK_NAMES[i % MOCK_NAMES.length],
      position,
      rating: 4 + Math.random(),
      userRatingsTotal: 50 + Math.floor(Math.random() * 200),
      distanceMeters,
    });
  }

  return checkpoints;
}

// Real Google Places API integration
export async function generateCheckpoints(
  origin: LatLng,
  maxRadiusMeters: number = 1000,
  types?: string[], // Array of place types to filter by
): Promise<Checkpoint[]> {
  try {
    const typesParam = types && types.length > 0 ? types.join(",") : "";
    const url = `/api/places?lat=${origin.lat}&lng=${origin.lng}&radius=${maxRadiusMeters}${
      typesParam ? `&types=${encodeURIComponent(typesParam)}` : ""
    }`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Places API request failed");
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error);
    }

    // Convert Places API results to Checkpoint format
    const checkpoints: Checkpoint[] = (data.places || []).map((place: any) => ({
      id: place.id,
      name: place.name,
      position: place.position,
      rating: place.rating,
      userRatingsTotal: place.userRatingsTotal,
      address: place.address,
      distanceMeters: distanceBetween(origin, place.position),
    }));

    // If we got results, return them
    if (checkpoints.length > 0) {
      return checkpoints;
    }

    // Fallback to mock if no results
    console.warn("No places found, using mock data");
    return generateMockCheckpoints(origin, 10, maxRadiusMeters);
  } catch (error) {
    console.error("Error fetching places:", error);
    // Fallback to mock data on error
    return generateMockCheckpoints(origin, 10, maxRadiusMeters);
  }
}


