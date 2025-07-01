import { Agent, routeAgentRequest } from "agents";
import { AppAgent } from "./agent";
import { getServerOAuthConfig } from "./config/oauth";

export { AppAgent };

interface UserInfo {
  id: string;
  email: string;
  credits: number;
  payment_method: string;
}

interface TokenData {
  access_token: string;
  user_info: UserInfo;
}

// Token verification function
async function verifyOAuthToken(
  token: string,
  env: Env
): Promise<UserInfo | null> {
  try {
    // Use the OAuth provider URL (website) for token verification
    const oauthProviderUrl =
      env.OAUTH_PROVIDER_BASE_URL || "https://atyourservice.ai";
    const verifyEndpoint = `${oauthProviderUrl}/oauth/verify`;

    console.log(`[Auth] Verifying token at: ${verifyEndpoint}`);

    const response = await fetch(verifyEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    console.log(`[Auth] Verification response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[Auth] Verification failed: ${response.status} - ${errorText}`
      );
      return null;
    }

    const userInfo = (await response.json()) as UserInfo;
    console.log(`[Auth] Verification successful for user: ${userInfo.id}`);
    return userInfo;
  } catch (error) {
    console.error("Token verification failed:", error);
    return null;
  }
}

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

    // Handle OAuth callback directly on the server
    if (url.pathname === "/auth/callback") {
      return handleOAuthCallback(request, env);
    }

    // Handle Spotify OAuth callback
    if (url.pathname === "/spotify/callback") {
      return handleSpotifyCallback(request, env);
    }

    // Handle OAuth token exchange
    if (url.pathname === "/api/oauth/token-exchange") {
      console.log(
        "[DEBUG] Token exchange endpoint hit, method:",
        request.method
      );
      return handleTokenExchange(request, env);
    }

    // OAuth configuration endpoint
    if (url.pathname === "/api/oauth/config") {
      const oauthConfig = getServerOAuthConfig(env);
      return new Response(
        JSON.stringify({
          client_id: oauthConfig.client_id,
          auth_url: oauthConfig.auth_url,
          token_url: oauthConfig.token_url,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Spotify configuration endpoint
    if (url.pathname === "/spotify/config") {
      return new Response(
        JSON.stringify({
          SPOTIFY_CLIENT_ID: env.SPOTIFY_CLIENT_ID,
          SPOTIFY_REDIRECT_URI: env.SPOTIFY_REDIRECT_URI,
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        }
      );
    }

    // User info proxy endpoint
    if (url.pathname === "/api/user/info") {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: "Missing Authorization header" }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          }
        );
      }

      const gatewayResponse = await fetch(
        `${env.GATEWAY_BASE_URL}/v1/user/info`,
        {
          method: "GET",
          headers: { Authorization: authHeader },
        }
      );

      return new Response(await gatewayResponse.text(), {
        status: gatewayResponse.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
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
      // Try to route to agent first
      const agentResponse = await routeAgentRequest(request, env, {
        cors: true,
        onBeforeConnect: async (request) => {
          const url = new URL(request.url);
          const token = url.searchParams.get("token");

          // CRITICAL SECURITY: Always require authentication for WebSocket connections
          if (!token) {
            return new Response(
              JSON.stringify({ error: "Authentication required" }),
              {
                status: 401,
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*",
                },
              }
            );
          }

          const redactedToken = `${token.substring(0, 20)}...${token.substring(-8)}`;
          console.log(`[Auth] Current token: ${redactedToken}`);

          // If token provided, verify it
          const userInfo = await verifyOAuthToken(token, env);
          if (!userInfo) {
            return new Response(
              JSON.stringify({ error: "Invalid auth token" }),
              {
                status: 403,
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*",
                },
              }
            );
          }

          console.log(`[Auth] ✅ Token validated for user: ${userInfo.id}`);

          // Ensure user can only access their own agent instance
          const pathMatch = url.pathname.match(
            /\/agents\/([^\/]+)\/([^\/\?]+)/
          );
          if (pathMatch) {
            const [, , roomName] = pathMatch;
            if (roomName !== userInfo.id) {
              return new Response(
                JSON.stringify({ error: "Access denied: User ID mismatch" }),
                {
                  status: 403,
                  headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                  },
                }
              );
            }
          }

          // Store the current token in a way the agent can access it during onConnect
          // We'll use the connection context to pass the fresh token to the agent
          console.log(
            `[Auth] Current token will be passed to agent during connection for user: ${userInfo.id}`
          );

          return undefined; // Continue to agent
        },
        onBeforeRequest: async (request) => {
          const url = new URL(request.url);

          // CRITICAL SECURITY: All HTTP requests to agent endpoints MUST be authenticated
          // Extract token from Authorization header or query params
          const authHeader = request.headers.get("authorization");
          const token = authHeader?.startsWith("Bearer ")
            ? authHeader.slice(7)
            : url.searchParams.get("token");

          if (!token) {
            return new Response(
              JSON.stringify({ error: "Authentication required" }),
              {
                status: 401,
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*",
                },
              }
            );
          }

          // Verify the token
          const userInfo = await verifyOAuthToken(token, env);
          if (!userInfo) {
            return new Response(
              JSON.stringify({ error: "Invalid auth token" }),
              {
                status: 403,
                headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": "*",
                },
              }
            );
          }

          // Ensure user can only access their own agent instance
          const pathMatch = url.pathname.match(
            /\/agents\/([^\/]+)\/([^\/\?]+)/
          );
          if (pathMatch) {
            const [, , roomName] = pathMatch;
            if (roomName !== userInfo.id) {
              return new Response(
                JSON.stringify({ error: "Access denied: User ID mismatch" }),
                {
                  status: 403,
                  headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                  },
                }
              );
            }
          }

          return undefined; // Continue to agent
        },
      });

      if (agentResponse) {
        return agentResponse;
      }

      // For the root route and other non-API routes, serve a simple HTML page
      if (
        url.pathname === "/" ||
        (!url.pathname.includes("/api/") && !url.pathname.includes("."))
      ) {
        return new Response(getMainHTML(), {
          headers: {
            "Content-Type": "text/html",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // For other requests, return 404
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      console.error("Error routing request:", error);

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

/**
 * Handle OAuth callback directly on the server
 */
async function handleOAuthCallback(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  console.log("[OAuth Callback] Called with:", {
    code_preview: code ? code.substring(0, 20) + "..." : null,
    state,
    error,
    url: url.toString(),
  });

  if (error) {
    console.error("OAuth error:", error);
    return new Response(
      getCallbackHTML(`Authentication failed: ${error}`, null),
      {
        headers: { "Content-Type": "text/html" },
      }
    );
  }

  if (!code || !state) {
    console.error("Missing OAuth parameters");
    return new Response(
      getCallbackHTML("Authentication failed: Missing parameters", null),
      {
        headers: { "Content-Type": "text/html" },
      }
    );
  }

  try {
    console.log("[OAuth Callback] Exchanging authorization code for token...");

    // Exchange code for token directly
    const tokenData = await exchangeCodeForToken(code, env);

    if (!tokenData) {
      throw new Error("Token exchange failed: No token data returned");
    }

    console.log(
      `[OAuth Callback] Token exchange successful for user: ${tokenData.user_info.id}`
    );

    // User info will be loaded by the agent when it initializes using the OAuth token
    console.log(
      `[OAuth Callback] Authentication successful for user: ${tokenData.user_info.id}`
    );

    return new Response(getCallbackHTML(null, tokenData), {
      headers: { "Content-Type": "text/html" },
    });
  } catch (err) {
    console.error("Token exchange failed:", err);
    return new Response(
      getCallbackHTML("Authentication failed: Could not exchange token", null),
      {
        headers: { "Content-Type": "text/html" },
      }
    );
  }
}

/**
 * Handle Spotify OAuth callback
 */
async function handleSpotifyCallback(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    console.error("Spotify OAuth error:", error);
    return new Response(
      getSpotifyCallbackHTML(`Spotify authentication failed: ${error}`, null),
      {
        headers: { "Content-Type": "text/html" },
      }
    );
  }

  if (!code || !state) {
    console.error("Missing Spotify OAuth parameters");
    return new Response(
      getSpotifyCallbackHTML(
        "Spotify authentication failed: Missing parameters",
        null
      ),
      {
        headers: { "Content-Type": "text/html" },
      }
    );
  }

  try {
    console.log(
      "[Spotify Callback] Received authorization code, returning success page"
    );

    // Return a success page that passes the code and state to the frontend
    // The frontend will handle the actual token exchange with Spotify
    return new Response(getSpotifyCallbackHTML(null, { code, state }), {
      headers: { "Content-Type": "text/html" },
    });
  } catch (error) {
    console.error("Spotify callback error:", error);
    return new Response(
      getSpotifyCallbackHTML(
        error instanceof Error ? error.message : "Unknown error occurred",
        null
      ),
      {
        headers: { "Content-Type": "text/html" },
      }
    );
  }
}

async function exchangeCodeForToken(
  code: string,
  env: Env
): Promise<TokenData | null> {
  const startTime = Date.now();
  try {
    console.log(
      "[DEBUG] exchangeCodeForToken called with code:",
      code.substring(0, 20) + "...",
      "at",
      new Date().toISOString()
    );

    // Exchange code for token with the OAuth provider
    const oauthConfig = getServerOAuthConfig(env);

    const requestBody = {
      code,
      client_id: oauthConfig.client_id,
      client_secret: oauthConfig.client_secret,
      redirect_uri: env.ATYOURSERVICE_OAUTH_REDIRECT_URI,
      grant_type: "authorization_code",
    };

    console.log("[DEBUG] Token exchange request:", {
      url: oauthConfig.token_url,
      client_id: requestBody.client_id,
      code_preview: code.substring(0, 20) + "...",
      redirect_uri: requestBody.redirect_uri,
      grant_type: requestBody.grant_type,
      has_client_secret: !!requestBody.client_secret,
    });

    console.log("[DEBUG] Sending token exchange request...");
    const tokenResponse = await fetch(oauthConfig.token_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    console.log("[DEBUG] Token exchange response:", {
      status: tokenResponse.status,
      statusText: tokenResponse.statusText,
      headers: Object.fromEntries(tokenResponse.headers.entries()),
      ok: tokenResponse.ok,
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      const elapsedTime = Date.now() - startTime;
      console.error(
        `[DEBUG] OAuth token exchange failed - Status: ${tokenResponse.status}, Response: ${errorText}, Elapsed: ${elapsedTime}ms`
      );

      // Try to parse the error response for more details
      try {
        const errorObj = JSON.parse(errorText);
        console.error("[DEBUG] Parsed error object:", errorObj);
      } catch (e) {
        console.error("[DEBUG] Error response is not valid JSON");
      }

      return null;
    }

    const tokenData = (await tokenResponse.json()) as TokenData;
    const elapsedTime = Date.now() - startTime;
    console.log("[DEBUG] Successfully received token data:", {
      has_access_token: !!tokenData.access_token,
      has_user_info: !!tokenData.user_info,
      user_id: tokenData.user_info?.id || "unknown",
      elapsed_ms: elapsedTime,
    });
    return tokenData;
  } catch (error) {
    console.error("Token exchange error:", error);
    return null;
  }
}

async function handleTokenExchange(request: Request, env: Env) {
  console.log("[DEBUG] handleTokenExchange called, method:", request.method);
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  try {
    const body = (await request.json()) as { code: string; grant_type: string };
    const { code, grant_type } = body;

    if (grant_type !== "authorization_code" || !code) {
      return new Response(JSON.stringify({ error: "invalid_request" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const tokenData = await exchangeCodeForToken(code, env);

    if (!tokenData) {
      return new Response(JSON.stringify({ error: "token_exchange_failed" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(tokenData), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Token exchange error:", error);
    return new Response(JSON.stringify({ error: "internal_server_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

/**
 * Generate HTML for OAuth callback handling
 */
function getCallbackHTML(
  error: string | null,
  tokenData: TokenData | null
): string {
  if (error) {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Failed</title>
  <style>
    body { font-family: system-ui; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .container { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
    .error { color: #e53e3e; margin-bottom: 1rem; }
    button { background: #3182ce; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Authentication Failed</h2>
    <p class="error">${error}</p>
    <button onclick="window.location.href = '/'">Try Again</button>
  </div>
</body>
</html>`;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Successful</title>
  <style>
    body { font-family: system-ui; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .container { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
    .success { color: #38a169; margin-bottom: 1rem; }
    .spinner { border: 2px solid #f3f3f3; border-top: 2px solid #3182ce; border-radius: 50%; width: 20px; height: 20px; animation: spin 1s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h2>Authentication Successful!</h2>
    <p class="success">Redirecting to your LLMDJ agent...</p>
  </div>
  <script>
    // Store auth data and redirect
    localStorage.setItem('auth_method', JSON.stringify({
      type: 'atyourservice',
      apiKey: ${JSON.stringify(tokenData?.access_token)},
      userInfo: ${JSON.stringify(tokenData?.user_info)}
    }));

    // Redirect to main app
    setTimeout(() => {
      window.location.href = '/';
    }, 1500);
  </script>
</body>
</html>`;
}

function getSpotifyCallbackHTML(
  error: string | null,
  tokenData: { code: string; state: string } | null
): string {
  if (error) {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Spotify Authentication Failed</title>
  <style>
    body { font-family: system-ui; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .container { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
    .error { color: #e53e3e; margin-bottom: 1rem; }
    button { background: #3182ce; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="container">
    <h2>Spotify Authentication Failed</h2>
    <p class="error">${error}</p>
    <button onclick="window.location.href = '/'">Try Again</button>
  </div>
</body>
</html>`;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Spotify Authentication Successful</title>
  <style>
    body { font-family: system-ui; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background: #f5f5f5; }
    .container { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
    .success { color: #38a169; margin-bottom: 1rem; }
    .spinner { border: 2px solid #f3f3f3; border-top: 2px solid #3182ce; border-radius: 50%; width: 20px; height: 20px; animation: spin 1s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <div class="spinner"></div>
    <h2>Spotify Authentication Successful!</h2>
    <p class="success">Redirecting to your LLMDJ agent...</p>
  </div>
  <script>
    // Store Spotify auth data in a separate key to avoid overwriting main auth
    localStorage.setItem('spotify_callback_data', JSON.stringify({
      code: ${JSON.stringify(tokenData?.code)},
      state: ${JSON.stringify(tokenData?.state)}
    }));

    // Redirect to main app
    setTimeout(() => {
      window.location.href = '/';
    }, 1500);
  </script>
</body>
</html>`;
}

function getMainHTML(): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LLMDJ - AI Spotify DJ</title>
    <script type="module" crossorigin src="/src/client.tsx"></script>
</head>
<body>
    <div id="root"></div>
</body>
</html>`;
}
