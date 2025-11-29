import { NextRequest, NextResponse } from "next/server";

const GOOGLE_FIT_SCOPES = [
  "https://www.googleapis.com/auth/fitness.activity.read",
  "https://www.googleapis.com/auth/fitness.location.read",
].join(" ");

export async function GET(request: NextRequest) {
  try {
    // Get uid from query param (passed from client)
    const uid = request.nextUrl.searchParams.get("uid");
    if (!uid) {
      return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/google-fit/callback`;
    const clientId = process.env.GOOGLE_FIT_CLIENT_ID;

    if (!clientId) {
      return NextResponse.json(
        { error: "Google Fit client ID not configured" },
        { status: 500 }
      );
    }

    const state = Buffer.from(JSON.stringify({ uid })).toString("base64url");
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: GOOGLE_FIT_SCOPES,
      access_type: "offline",
      prompt: "consent",
      state,
    })}`;

    return NextResponse.json({ authUrl });
  } catch (error: any) {
    console.error("Google Fit auth error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to initiate OAuth" },
      { status: 500 }
    );
  }
}

