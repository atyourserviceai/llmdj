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

      console.log("[debugSpotifyState] Checking spotify_tokens table...");

      // Check spotify_tokens table
      const tokenResult = await agent.sql`
        SELECT user_id, access_token, refresh_token, expires_at, token_type, scope, created_at
        FROM spotify_tokens
        ORDER BY created_at DESC
      `;

      console.log("[debugSpotifyState] Checking spotify_profiles table...");

      // Check spotify_profiles table
      const profileResult = await agent.sql`
        SELECT id, spotifyUserId, displayName, email, country, product, isConnected, lastSyncAt, createdAt
        FROM spotify_profiles
        ORDER BY createdAt DESC
      `;

      console.log("[debugSpotifyState] Debug results:", {
        tokenCount: tokenResult?.length || 0,
        profileCount: profileResult?.length || 0,
        tokens: tokenResult?.map(t => ({
          user_id: t.user_id,
          hasAccessToken: !!t.access_token,
          hasRefreshToken: !!t.refresh_token,
          expires_at: t.expires_at,
          created_at: t.created_at
        })) || [],
        profiles: profileResult?.map(p => ({
          id: p.id,
          spotifyUserId: p.spotifyUserId,
          displayName: p.displayName,
          isConnected: p.isConnected,
          lastSyncAt: p.lastSyncAt
        })) || []
      });

      return {
        success: true,
        tokenCount: tokenResult?.length || 0,
        profileCount: profileResult?.length || 0,
        tokens: tokenResult?.map(t => ({
          user_id: t.user_id,
          hasAccessToken: !!t.access_token,
          hasRefreshToken: !!t.refresh_token,
          expires_at: t.expires_at,
          created_at: t.created_at
        })) || [],
        profiles: profileResult?.map(p => ({
          id: p.id,
          spotifyUserId: p.spotifyUserId,
          displayName: p.displayName,
          isConnected: p.isConnected,
          lastSyncAt: p.lastSyncAt
        })) || []
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
