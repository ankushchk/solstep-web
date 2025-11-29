import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const radius = searchParams.get("radius") || "1000";
    const types = searchParams.get("types"); // Comma-separated list of types

    if (!lat || !lng) {
      return NextResponse.json(
        { error: "Missing lat/lng parameters" },
        { status: 400 }
      );
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Google Maps API key not configured" },
        { status: 500 }
      );
    }

    // Build type parameter - use provided types or default to point_of_interest
    const typeList = types && types.length > 0 
      ? types.split(",").filter(t => t.trim().length > 0)
      : ["point_of_interest"];

    // Google Places API only allows one type per request, so we need to make multiple requests
    // and combine results
    const allPlaces: any[] = [];
    const seenPlaceIds = new Set<string>();

    // Make requests for each type
    for (const type of typeList) {
      const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type.trim()}&key=${apiKey}`;

      try {
        const response = await fetch(url);
        if (!response.ok) {
          console.warn(`Places API request failed for type ${type}`);
          continue;
        }

        const data = await response.json();

        if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
          console.warn(`Places API error for type ${type}: ${data.status}`);
          continue;
        }

        // Add unique places (avoid duplicates)
        (data.results || []).forEach((place: any) => {
          if (!seenPlaceIds.has(place.place_id)) {
            seenPlaceIds.add(place.place_id);
            allPlaces.push(place);
          }
        });
      } catch (error) {
        console.warn(`Error fetching places for type ${type}:`, error);
        continue;
      }
    }

    // Filter and format results
    const places = allPlaces
      .filter((place: any) => {
        // Filter by rating and review count
        const rating = place.rating || 0;
        const userRatingsTotal = place.user_ratings_total || 0;
        return rating >= 3.5 && userRatingsTotal >= 10;
      })
      .slice(0, 20) // Increase limit since we're combining multiple types
      .map((place: any) => ({
        id: place.place_id,
        name: place.name,
        position: {
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
        },
        rating: place.rating || 0,
        userRatingsTotal: place.user_ratings_total || 0,
        address: place.vicinity,
        photoReference: place.photos?.[0]?.photo_reference,
        types: place.types || [], // Include place types for filtering
      }));

    return NextResponse.json({ places });
  } catch (error: any) {
    console.error("Places API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch places" },
      { status: 500 }
    );
  }
}

