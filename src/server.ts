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

    if (url.pathname === "/auth/callback") {
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

      // Success - redirect back to main app with the authorization code
      // The SpotifyAuth component will handle the token exchange
      // Use the base domain from SPOTIFY_REDIRECT_URI to ensure we redirect to the correct domain
      const baseUrl = env.SPOTIFY_REDIRECT_URI.replace("/auth/callback", "/");
      const redirectUrl = new URL(baseUrl);
      redirectUrl.searchParams.set("code", code);
      redirectUrl.searchParams.set("state", state);

      return Response.redirect(redirectUrl.toString(), 302);
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
