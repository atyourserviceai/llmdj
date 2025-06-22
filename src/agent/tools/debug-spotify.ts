import { getCurrentAgent } from "agents";
import { AppAgent } from "../AppAgent";
import { generateObject } from "ai";
import { z } from "zod";

export const debugSpotifyState = {
  name: "debugSpotifyState",
  description:
    "Debug tool to check the current state of Spotify authentication and tokens",
  parameters: z.object({}),
  execute: async () => {
    console.log("[debugSpotifyState] Starting debug check...");
    try {
      const { agent } = getCurrentAgent<AppAgent>();

      if (!agent) {
        console.error("[debugSpotifyState] Could not get agent reference");
        return {
          success: false,
          message: "Error: Could not get agent reference",
        };
      }

      // Get the room name to determine the user ID
      const roomName = (agent as any).roomName || "default";
      const actualUserId = roomName.startsWith("spotify-user-")
        ? roomName.replace("spotify-user-", "")
        : "default";

      console.log(
        `[debugSpotifyState] Checking for user: ${actualUserId} (room: ${roomName})`
      );
      console.log("[debugSpotifyState] Checking spotify_tokens table...");

      // Check spotify_tokens table for the specific user
      const tokenResult = await agent.sql`
        SELECT user_id, access_token, refresh_token, expires_at, token_type, scope, created_at
        FROM spotify_tokens
        WHERE user_id = ${actualUserId}
        ORDER BY created_at DESC
      `;

      console.log("[debugSpotifyState] Checking spotify_profiles table...");

      // Check spotify_profiles table
      const profileResult = await agent.sql`
        SELECT id, spotify_user_id, display_name, email, country, product, is_connected, last_sync_at, created_at
        FROM spotify_profiles
        ORDER BY created_at DESC
      `;

      console.log("[debugSpotifyState] Debug results:", {
        tokenCount: tokenResult?.length || 0,
        profileCount: profileResult?.length || 0,
        tokens:
          tokenResult?.map((t) => ({
            user_id: t.user_id,
            hasAccessToken: !!t.access_token,
            hasRefreshToken: !!t.refresh_token,
            expires_at: t.expires_at,
            created_at: t.created_at,
          })) || [],
        profiles:
          profileResult?.map((p) => ({
            id: p.id,
            spotifyUserId: p.spotify_user_id,
            displayName: p.display_name,
            isConnected: p.is_connected,
            lastSyncAt: p.last_sync_at,
          })) || [],
      });

      return {
        success: true,
        tokenCount: tokenResult?.length || 0,
        profileCount: profileResult?.length || 0,
        tokens:
          tokenResult?.map((t) => ({
            user_id: t.user_id,
            hasAccessToken: !!t.access_token,
            hasRefreshToken: !!t.refresh_token,
            expires_at: t.expires_at,
            created_at: t.created_at,
          })) || [],
        profiles:
          profileResult?.map((p) => ({
            id: p.id,
            spotifyUserId: p.spotify_user_id,
            displayName: p.display_name,
            isConnected: p.is_connected,
            lastSyncAt: p.last_sync_at,
          })) || [],
      };
    } catch (error) {
      console.error("[debugSpotifyState] Error during debug:", error);
      return {
        success: false,
        message: `Debug failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
};
