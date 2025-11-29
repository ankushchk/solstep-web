import { NextRequest, NextResponse } from "next/server";

// Note: This route can be simplified to work client-side
// Keeping server-side for now to protect client secret during token refresh

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_FIT_CLIENT_ID!,
      client_secret: process.env.GOOGLE_FIT_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh token");
  }

  const data = await response.json();
  return data.access_token;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { uid, googleFit } = body;
    
    if (!uid || !googleFit) {
      return NextResponse.json(
        { error: "Missing uid or googleFit data" },
        { status: 400 }
      );
    }

    if (!googleFit?.refreshToken) {
      return NextResponse.json(
        { error: "Google Fit not connected" },
        { status: 400 }
      );
    }

    // Refresh access token if needed
    let accessToken = googleFit.accessToken;
    let updatedTokens = null;
    if (Date.now() >= googleFit.expiresAt) {
      accessToken = await refreshAccessToken(googleFit.refreshToken);
      updatedTokens = {
        accessToken,
        expiresAt: Date.now() + (3600 * 1000), // 1 hour
      };
    }

    // Fetch steps data from Google Fit API
    const now = Date.now();
    const startTime = now - (24 * 60 * 60 * 1000); // Last 24 hours (1 day)
    const endTime = now;

    const datasetId = `${startTime}-${endTime}`;

    // Get steps data
    const stepsResponse = await fetch(
      `https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          aggregateBy: [
            {
              dataTypeName: "com.google.step_count.delta",
              dataSourceId: "derived:com.google.step_count.delta:com.google.android.gms:estimated_steps",
            },
          ],
          bucketByTime: { durationMillis: 3600000 }, // 1 hour buckets for daily view
          startTimeMillis: startTime,
          endTimeMillis: endTime,
        }),
      }
    );

    if (!stepsResponse.ok) {
      const errorText = await stepsResponse.text();
      console.error("Google Fit API error:", errorText);
      return NextResponse.json(
        { error: "Failed to fetch steps data" },
        { status: 500 }
      );
    }

    const stepsData = await stepsResponse.json();
    let totalSteps = 0;

    if (stepsData.bucket) {
      stepsData.bucket.forEach((bucket: any) => {
        if (bucket.dataset?.[0]?.point) {
          bucket.dataset[0].point.forEach((point: any) => {
            if (point.value?.[0]?.intVal) {
              totalSteps += point.value[0].intVal;
            }
          });
        }
      });
    }

    // Get distance data
    let totalDistance = 0;
    const distanceResponse = await fetch(
      `https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          aggregateBy: [
            {
              dataTypeName: "com.google.distance.delta",
              dataSourceId: "derived:com.google.distance.delta:com.google.android.gms:merge_distance_delta",
            },
          ],
          bucketByTime: { durationMillis: 86400000 },
          startTimeMillis: startTime,
          endTimeMillis: endTime,
        }),
      }
    );

    if (distanceResponse.ok) {
      const distanceData = await distanceResponse.json();
      if (distanceData.bucket) {
        distanceData.bucket.forEach((bucket: any) => {
          if (bucket.dataset?.[0]?.point) {
            bucket.dataset[0].point.forEach((point: any) => {
              if (point.value?.[0]?.fpVal) {
                totalDistance += point.value[0].fpVal; // meters
              }
            });
          }
        });
      }
    }

    // Get calories data
    let totalCalories = 0;
    const caloriesResponse = await fetch(
      `https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          aggregateBy: [
            {
              dataTypeName: "com.google.calories.expended",
              dataSourceId: "derived:com.google.calories.expended:com.google.android.gms:merge_calories_expended",
            },
          ],
          bucketByTime: { durationMillis: 86400000 },
          startTimeMillis: startTime,
          endTimeMillis: endTime,
        }),
      }
    );

    if (caloriesResponse.ok) {
      const caloriesData = await caloriesResponse.json();
      if (caloriesData.bucket) {
        caloriesData.bucket.forEach((bucket: any) => {
          if (bucket.dataset?.[0]?.point) {
            bucket.dataset[0].point.forEach((point: any) => {
              if (point.value?.[0]?.fpVal) {
                totalCalories += point.value[0].fpVal;
              }
            });
          }
        });
      }
    }

    // Get active minutes (moderate + vigorous activity)
    let activeMinutes = 0;
    const activityResponse = await fetch(
      `https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          aggregateBy: [
            {
              dataTypeName: "com.google.active_minutes",
              dataSourceId: "derived:com.google.active_minutes:com.google.android.gms:merge_active_minutes",
            },
          ],
          bucketByTime: { durationMillis: 86400000 },
          startTimeMillis: startTime,
          endTimeMillis: endTime,
        }),
      }
    );

    if (activityResponse.ok) {
      const activityData = await activityResponse.json();
      if (activityData.bucket) {
        activityData.bucket.forEach((bucket: any) => {
          if (bucket.dataset?.[0]?.point) {
            bucket.dataset[0].point.forEach((point: any) => {
              if (point.value?.[0]?.intVal) {
                activeMinutes += point.value[0].intVal;
              }
            });
          }
        });
      }
    }

    // Get heart rate (average)
    let heartRateSum = 0;
    let heartRateCount = 0;
    const heartRateResponse = await fetch(
      `https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          aggregateBy: [
            {
              dataTypeName: "com.google.heart_rate.bpm",
              dataSourceId: "derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm",
            },
          ],
          bucketByTime: { durationMillis: 86400000 },
          startTimeMillis: startTime,
          endTimeMillis: endTime,
        }),
      }
    );

    if (heartRateResponse.ok) {
      const heartRateData = await heartRateResponse.json();
      if (heartRateData.bucket) {
        heartRateData.bucket.forEach((bucket: any) => {
          if (bucket.dataset?.[0]?.point) {
            bucket.dataset[0].point.forEach((point: any) => {
              if (point.value?.[0]?.fpVal) {
                heartRateSum += point.value[0].fpVal;
                heartRateCount++;
              }
            });
          }
        });
      }
    }

    // Return synced data (client will update Firestore)
    return NextResponse.json({
      success: true,
      steps: totalSteps,
      distanceMeters: totalDistance,
      calories: Math.round(totalCalories),
      activeMinutes,
      averageHeartRate: heartRateCount > 0 ? Math.round(heartRateSum / heartRateCount) : null,
      updatedTokens, // Include if token was refreshed
    });
  } catch (error: any) {
    console.error("Google Fit sync error:", error);
    return NextResponse.json(
      { error: error.message || "Sync failed" },
      { status: 500 }
    );
  }
}

