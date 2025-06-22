import { routeAgentRequest } from "agents";
import { AppAgent } from "./agent";

export { AppAgent };

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/check-open-ai-key") {
      const hasApiKey = !!env.GATEWAY_API_KEY;
      return Response.json({ success: hasApiKey });
    }

    if (url.pathname === "/config") {
      return Response.json(
        {
          SPOTIFY_CLIENT_ID: env.SPOTIFY_CLIENT_ID,
          SPOTIFY_REDIRECT_URI: env.SPOTIFY_REDIRECT_URI,
        },
        {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }
      );
    }

    // OAuth initiation - redirect to Spotify
    if (url.pathname === "/auth/spotify" && request.method === "GET") {
      const state = crypto.randomUUID();

      const scopes = [
        "user-read-playback-state",
        "user-modify-playback-state",
        "user-read-currently-playing",
        "playlist-read-private",
        "playlist-modify-public",
        "playlist-modify-private",
        "user-top-read",
        "user-library-read",
        "user-library-modify",
        "streaming",
        "user-read-email",
        "user-read-private",
      ].join(" ");

      const params = new URLSearchParams({
        response_type: "code",
        client_id: env.SPOTIFY_CLIENT_ID,
        scope: scopes,
        redirect_uri: env.SPOTIFY_REDIRECT_URI,
        state: state,
      });

      const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
      return Response.redirect(authUrl, 302);
    }

    // OAuth callback - exchange code for tokens and redirect with session
    if (url.pathname === "/auth/callback" && request.method === "GET") {
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      const baseUrl = env.SPOTIFY_REDIRECT_URI.replace("/auth/callback", "/");

      if (error || !code) {
        const redirectUrl = new URL(baseUrl);
        redirectUrl.searchParams.set("error", error || "missing_code");
        return Response.redirect(redirectUrl.toString(), 302);
      }

      try {
        // Exchange code for tokens
        const tokenResponse = await fetch(
          "https://accounts.spotify.com/api/token",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
            },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code: code,
              redirect_uri: env.SPOTIFY_REDIRECT_URI,
            }),
          }
        );

        if (!tokenResponse.ok) {
          throw new Error(`Token exchange failed: ${tokenResponse.status}`);
        }

        const tokens = (await tokenResponse.json()) as {
          access_token: string;
          refresh_token: string;
          expires_in: number;
        };

        // Get user profile
        const profileResponse = await fetch("https://api.spotify.com/v1/me", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });

        if (!profileResponse.ok) {
          throw new Error(`Profile fetch failed: ${profileResponse.status}`);
        }

        const profile = (await profileResponse.json()) as {
          id: string;
          display_name: string;
        };

        // Generate session token and store in user's room
        const sessionToken = crypto.randomUUID();
        const userRoom = `spotify-user-${profile.id}`;

        const sessionData = {
          sessionToken,
          userId: profile.id,
          displayName: profile.display_name,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          tokenExpiresAt: new Date(
            Date.now() + tokens.expires_in * 1000
          ).toISOString(),
        };

        const storeResponse = await fetch(
          new URL(`/agents/app-agent/${userRoom}/store-session`, request.url),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(sessionData),
          }
        );

        if (!storeResponse.ok) {
          throw new Error("Failed to store session");
        }

        // Redirect with session cookie and user ID
        const redirectUrl = new URL(baseUrl);

        // Create headers with multiple Set-Cookie entries
        const headers = new Headers();
        headers.set("Location", redirectUrl.toString());
        headers.append(
          "Set-Cookie",
          `llmdj_session=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`
        );
        headers.append(
          "Set-Cookie",
          `llmdj_user_id=${profile.id}; Secure; SameSite=Lax; Path=/; Max-Age=86400`
        );

        return new Response(null, {
          status: 302,
          headers: headers,
        });
      } catch (error) {
        console.error("[OAuth] Error:", error);
        const redirectUrl = new URL(baseUrl);
        redirectUrl.searchParams.set("error", "auth_failed");
        return Response.redirect(redirectUrl.toString(), 302);
      }
    }

    // Session validation API
    if (url.pathname === "/api/auth/validate" && request.method === "POST") {
      try {
        const { sessionToken, userId } = (await request.json()) as {
          sessionToken: string;
          userId: string;
        };
        const userRoom = `spotify-user-${userId}`;

        const response = await fetch(
          new URL(
            `/agents/app-agent/${userRoom}/validate-session`,
            request.url
          ),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sessionToken }),
          }
        );

        if (!response.ok) {
          return Response.json({ error: "Invalid session" }, { status: 401 });
        }

        const sessionData = (await response.json()) as {
          success: boolean;
          user: {
            accessToken: string;
            refreshToken?: string;
            tokenExpiresAt: string;
          };
        };

        if (!sessionData.success) {
          return Response.json({ error: "Invalid session" }, { status: 401 });
        }

        return Response.json({
          access_token: sessionData.user.accessToken,
          refresh_token: sessionData.user.refreshToken,
          expires_in: Math.floor(
            (new Date(sessionData.user.tokenExpiresAt).getTime() - Date.now()) /
              1000
          ),
        });
      } catch (error) {
        return Response.json({ error: "Validation failed" }, { status: 500 });
      }
    }

    // Route all other requests to the agent
    return (
      (await routeAgentRequest(request, env, { cors: true })) ||
      new Response("Not found", { status: 404 })
    );
  },
};
