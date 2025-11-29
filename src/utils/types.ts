export type LatLng = {
  lat: number;
  lng: number;
};

export type Checkpoint = {
  id: string;
  name: string;
  position: LatLng;
  rating: number;
  userRatingsTotal?: number;
  address?: string;
  distanceMeters?: number;
};

export type Avatar = {
  id: string;
  checkpointId: string;
  checkpointName: string;
  imageDataUrl: string;
  location: LatLng;
  collectedAt: string;
  nftMintAddress?: string;
};

export type UserStats = {
  checkpointsVisited: number;
  avatarsCollected: number;
  streakDays: number;
  totalDistanceMeters: number;
};


