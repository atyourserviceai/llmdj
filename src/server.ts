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
      return Response.json({
        success: hasApiKey,
      });
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

    if (url.pathname === "/auth/spotify" && request.method === "GET") {
      // Server-side OAuth initiation endpoint
      const state = crypto.randomUUID();

      // Spotify OAuth scopes needed for full functionality
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

      // Build Spotify authorization URL for server-side flow
      const params = new URLSearchParams({
        response_type: "code",
        client_id: env.SPOTIFY_CLIENT_ID,
        scope: scopes,
        redirect_uri: env.SPOTIFY_REDIRECT_URI,
        state: state,
      });

      const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
      console.log(`[OAuth] Redirecting to Spotify for authorization: ${authUrl}`);

      return Response.redirect(authUrl, 302);
    }

    if (url.pathname === "/auth/callback" && request.method === "GET") {
      // Handle Spotify OAuth callback
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        // Spotify OAuth error - redirect back to main app with error
        const baseUrl = env.SPOTIFY_REDIRECT_URI.replace("/auth/callback", "/");
        const redirectUrl = new URL(baseUrl);
        redirectUrl.searchParams.set("error", error);
        redirectUrl.searchParams.set(
          "error_description",
          url.searchParams.get("error_description") || ""
        );

        return Response.redirect(redirectUrl.toString(), 302);
      }

      if (!code || !state) {
        // Missing required parameters
        const baseUrl = env.SPOTIFY_REDIRECT_URI.replace("/auth/callback", "/");
        const redirectUrl = new URL(baseUrl);
        redirectUrl.searchParams.set("error", "invalid_request");
        redirectUrl.searchParams.set(
          "error_description",
          "Missing authorization code or state"
        );

        return Response.redirect(redirectUrl.toString(), 302);
      }

      try {
        // SECURITY: Exchange authorization code for tokens server-side
        console.log("[OAuth] Exchanging authorization code for tokens...");

        const tokenBody = new URLSearchParams({
          grant_type: "authorization_code",
          code: code,
          redirect_uri: env.SPOTIFY_REDIRECT_URI,
        });

        console.log(`[OAuth] Token request details:`, {
          url: "https://accounts.spotify.com/api/token",
          grant_type: "authorization_code",
          redirect_uri: env.SPOTIFY_REDIRECT_URI,
          code_length: code.length,
          has_client_secret: !!env.SPOTIFY_CLIENT_SECRET,
        });

        const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Basic ${btoa(`${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`)}`,
          },
          body: tokenBody,
        });

        if (!tokenResponse.ok) {
          // Get detailed error from Spotify
          let errorDetails = "Unknown error";
          try {
            const errorData = await tokenResponse.json();
            errorDetails = JSON.stringify(errorData);
            console.error(`[OAuth] Spotify token exchange error:`, errorData);
          } catch (e) {
            console.error(`[OAuth] Failed to parse error response:`, e);
          }
          throw new Error(`Token exchange failed: ${tokenResponse.status} - ${errorDetails}`);
        }

        const tokens = await tokenResponse.json() as {
          access_token: string;
          refresh_token: string;
          expires_in: number;
          token_type: string;
          scope: string;
        };

        // Get user profile to identify the user
        const profileResponse = await fetch("https://api.spotify.com/v1/me", {
          headers: {
            "Authorization": `Bearer ${tokens.access_token}`,
          },
        });

        if (!profileResponse.ok) {
          throw new Error(`Profile fetch failed: ${profileResponse.status}`);
        }

        const profile = await profileResponse.json() as {
          id: string;
          display_name: string;
          email?: string;
        };

        console.log(`[OAuth] Successfully authenticated user: ${profile.display_name} (${profile.id})`);

        // Generate secure session token
        const sessionToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // SECURITY: Store session data in user's own room, not default room
        const userRoom = `spotify-user-${profile.id}`;
        const storeSessionUrl = new URL(`/agents/app-agent/${userRoom}/store-session`, request.url);

        const sessionData = {
          sessionToken,
          userId: profile.id,
          displayName: profile.display_name,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          expiresAt: expiresAt.toISOString(),
          tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        };

        const storeResponse = await fetch(storeSessionUrl.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(sessionData),
        });

        if (!storeResponse.ok) {
          throw new Error("Failed to store session data");
        }

        console.log(`[OAuth] Session stored successfully in user room: ${userRoom}`);

        // Create a minimal redirect page that stores session data and redirects immediately
        const redirectScript = `
          <script>
            // Store session data and redirect immediately - no delays
            (function() {
              try {
                const sessionData = {
                  sessionToken: '${sessionToken}',
                  userId: '${profile.id}',
                  authStatus: 'success',
                  timestamp: new Date().toISOString()
                };
                localStorage.setItem('llmdj_oauth_callback', JSON.stringify(sessionData));

                // Immediate redirect
                const baseUrl = '${env.SPOTIFY_REDIRECT_URI.replace("/auth/callback", "/")}';
                window.location.replace(baseUrl);
              } catch (error) {
                // Fallback redirect with URL parameters
                const baseUrl = '${env.SPOTIFY_REDIRECT_URI.replace("/auth/callback", "/")}';
                const redirectUrl = new URL(baseUrl);
                redirectUrl.searchParams.set('session', '${sessionToken}');
                redirectUrl.searchParams.set('user', '${profile.id}');
                redirectUrl.searchParams.set('auth', 'success');
                window.location.replace(redirectUrl.toString());
              }
            })();
          </script>
        `;

        const redirectPage = `
          <!DOCTYPE html>
          <html>
          <head>
            <title>LLMDJ - Authenticating...</title>
            <meta charset="UTF-8">
            <meta http-equiv="refresh" content="0;url=${env.SPOTIFY_REDIRECT_URI.replace("/auth/callback", "/")}">
            <style>
              body {
                font-family: system-ui, -apple-system, sans-serif;
                background: linear-gradient(135deg, #1db954, #191414);
                color: white;
                margin: 0;
                padding: 0;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                text-align: center;
              }
              .container {
                background: rgba(255,255,255,0.1);
                padding: 2rem;
                border-radius: 16px;
                backdrop-filter: blur(10px);
                box-shadow: 0 8px 32px rgba(0,0,0,0.3);
                opacity: 0;
                animation: fadeIn 0.3s ease-in-out forwards;
              }
              @keyframes fadeIn {
                to { opacity: 1; }
              }
              .spinner {
                border: 3px solid rgba(255,255,255,0.3);
                border-top: 3px solid #1db954;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                animation: spin 1s linear infinite;
                margin: 20px auto;
              }
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
              h2 { margin: 0 0 1rem 0; font-size: 1.5rem; }
              p { margin: 0; opacity: 0.8; }
            </style>
            ${redirectScript}
          </head>
          <body>
            <div class="container">
              <h2>🎵 Connected to Spotify!</h2>
              <div class="spinner"></div>
              <p>Loading LLMDJ...</p>
            </div>
          </body>
          </html>
        `;

        return new Response(redirectPage, {
          status: 200,
          headers: {
            "Content-Type": "text/html",
          },
        });

      } catch (error) {
        console.error("[OAuth] Token exchange failed:", error);

        // Redirect with error
        const baseUrl = env.SPOTIFY_REDIRECT_URI.replace("/auth/callback", "/");
        const redirectUrl = new URL(baseUrl);

        // Provide more specific error messages
        if (error instanceof Error && error.message.includes("invalid_grant")) {
          redirectUrl.searchParams.set("error", "invalid_authorization_code");
          redirectUrl.searchParams.set("error_description", "The authorization code is invalid or has expired. Please try authenticating again.");
        } else if (error instanceof Error && error.message.includes("invalid_client")) {
          redirectUrl.searchParams.set("error", "configuration_error");
          redirectUrl.searchParams.set("error_description", "Spotify application configuration error. Please contact support.");
        } else {
          redirectUrl.searchParams.set("error", "token_exchange_failed");
          redirectUrl.searchParams.set("error_description", "Failed to exchange authorization code for tokens. Please try again.");
        }

        return Response.redirect(redirectUrl.toString(), 302);
      }
    }

    if (url.pathname.startsWith("/session/")) {
      // These endpoints are deprecated and insecure - use direct agent endpoints instead
      return Response.json({ error: "Deprecated endpoint - use direct agent endpoints" }, { status: 410 });
    }

    if (url.pathname === "/api/spotify/validate-session" && request.method === "POST") {
      try {
        const { sessionToken, userId } = await request.json() as { sessionToken: string; userId: string };

        // SECURITY: Route to user's specific room, not default room
        const userRoom = `spotify-user-${userId}`;
        const agentUrl = new URL(`/agents/app-agent/${userRoom}/validate-session`, request.url);

        const response = await fetch(agentUrl.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionToken }),
        });

        if (!response.ok) {
          return Response.json({ error: "Session validation failed" }, { status: 401 });
        }

        const sessionData = await response.json() as {
          success: boolean;
          user: {
            id: string;
            displayName: string;
            accessToken: string;
            refreshToken?: string;
            tokenExpiresAt: string;
          };
        };

        if (!sessionData.success) {
          return Response.json({ error: "Invalid session" }, { status: 401 });
        }

        // Return tokens in format expected by client
        return Response.json({
          access_token: sessionData.user.accessToken,
          refresh_token: sessionData.user.refreshToken,
          expires_in: Math.floor((new Date(sessionData.user.tokenExpiresAt).getTime() - Date.now()) / 1000),
        });

      } catch (error) {
        console.error("[Server] Session validation error:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
      }
    }

    if (url.pathname === "/api/spotify/logout" && request.method === "POST") {
      try {
        const { sessionToken, userId } = await request.json() as { sessionToken: string; userId: string };

        // SECURITY: Route to user's specific room
        const userRoom = `spotify-user-${userId}`;
        const agentUrl = new URL(`/agents/app-agent/${userRoom}/logout`, request.url);

        const response = await fetch(agentUrl.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sessionToken }),
        });

        if (!response.ok) {
          return Response.json({ error: "Logout failed" }, { status: 500 });
        }

        return Response.json({ success: true });

      } catch (error) {
        console.error("[Server] Logout error:", error);
        return Response.json({ error: "Internal server error" }, { status: 500 });
      }
    }

    if (!env.GATEWAY_API_KEY) {
      console.error(
        "GATEWAY_API_KEY is not set, don't forget to set it locally in .dev.vars, and use `wrangler secret bulk .dev.vars` to upload it to production"
      );
      return new Response("GATEWAY_API_KEY is not set", { status: 500 });
    }

    // Check if this is a request for an unknown agent namespace before routing
    if (url.pathname.includes("/agents/")) {
      const pathParts = url.pathname.split("/");
      const agentName = pathParts[2]; // /agents/{agentName}/...

      if (agentName && agentName !== "app-agent") {
        return new Response(
          JSON.stringify({
            error: "Agent not found",
            message: `Agent '${agentName}' does not exist. Available agent: 'app-agent'`,
            availableAgents: ["app-agent"],
          }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
          }
        );
      }
    }

    try {
      return (
        // Route the request to our agent or return 404 if not found
        (await routeAgentRequest(request, env, { cors: true })) ||
        new Response("Not found", { status: 404 })
      );
    } catch (error) {
      console.error("Error routing agent request:", error);

      // For other errors, return a generic error response
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          message: "An unexpected error occurred while processing the request",
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }
  },
} satisfies ExportedHandler<Env>;
