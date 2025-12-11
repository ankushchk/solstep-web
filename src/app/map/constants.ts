export const COLLECTION_RADIUS_METERS = 100;

export const PLACE_TYPES = [
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

export const containerStyle = {
  width: "100%",
  height: "60vh",
};

export const mapStyles = [
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

export const MIN_SPOT_DISTANCE_CANDIDATES = [200, 150, 100];

