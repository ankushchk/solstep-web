import { NextRequest, NextResponse } from "next/server";

// Note: This route exchanges the OAuth code for tokens server-side
// (to keep client secret secure), then redirects to client to store tokens

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/profile?error=${encodeURIComponent(error)}`
      );
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/profile?error=missing_params`
      );
    }

    const { uid } = JSON.parse(Buffer.from(state, "base64url").toString());

    // Exchange code for tokens
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/google-fit/callback`;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_FIT_CLIENT_ID!,
        client_secret: process.env.GOOGLE_FIT_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Token exchange error:", errorData);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/profile?error=token_exchange_failed`
      );
    }

    const tokens = await tokenResponse.json();

    // Encode tokens in URL hash (will be handled client-side)
    // Note: In production, consider using a temporary storage (Redis/DB) instead
    const tokensEncoded = Buffer.from(JSON.stringify({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in * 1000),
    })).toString("base64url");

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/profile?googleFit=connected&tokens=${tokensEncoded}`
    );
  } catch (error: any) {
    console.error("Google Fit callback error:", error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/profile?error=${encodeURIComponent(error.message)}`
    );
  }
}

