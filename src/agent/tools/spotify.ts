/**
 * Spotify Web API Tools for LLMDJ Agent
 * Provides comprehensive Spotify integration including search, playback control,
 * playlist management, and music analysis capabilities.
 */

import { getCurrentAgent } from "agents";
import { tool } from "ai";
import { z } from "zod";
import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import type { AppAgent, AppAgentState } from "../AppAgent";
import {
  storeSpotifyProfile,
  getSpotifyProfile,
  getConnectedSpotifyProfile,
  storeMusicPreferences,
  getMusicPreferences,
  addListeningRecord,
  storeCurrentSession,
  getCurrentSession,
} from "../storage/entities";
import {
  addMusicSessionEntry,
  addRecommendationEntry,
  addDiscoveryEntry,
} from "../storage/history";

// =====================================
// Spotify API Initialization
// =====================================

/**
 * Initialize Spotify SDK with user credentials
 */
async function getSpotifySDK(
  agent: AppAgent,
  userId?: string
): Promise<SpotifyApi | null> {
  try {
    // Get user's Spotify profile from storage
    if (!userId) {
      console.error("User ID required for Spotify API access");
      return null;
    }

    const profile = await getSpotifyProfile(agent, userId);
    if (!profile || !profile.isConnected || !profile.accessToken) {
      console.error("User not connected to Spotify or missing access token");
      return null;
    }

    // Initialize Spotify SDK with stored access token
    const spotifySDK = SpotifyApi.withAccessToken(agent.env.SPOTIFY_CLIENT_ID, {
      access_token: profile.accessToken,
      token_type: "Bearer",
      expires_in: profile.tokenExpiresAt
        ? Math.floor((profile.tokenExpiresAt.getTime() - Date.now()) / 1000)
        : 3600,
      refresh_token: profile.refreshToken || "",
    });

    return spotifySDK;
  } catch (error) {
    console.error("Error initializing Spotify SDK:", error);
    return null;
  }
}

// =====================================
// Authentication & Profile Tools
// =====================================

/**
 * Show Spotify authentication UI to user
 */
export const showSpotifyAuth = tool({
  description:
    "Display the Spotify authentication interface to the user. Use this when the user needs to connect their Spotify account. This will show an OAuth login button.",
  parameters: z.object({
    message: z
      .string()
      .optional()
      .describe("Optional message to display with the auth interface"),
  }),
  execute: async ({ message }) => {
    // This tool doesn't actually execute OAuth - it triggers the UI
    // The React component will handle the actual OAuth flow
    return {
      type: "spotify_auth_ui",
      message: message || "Please connect your Spotify account to continue",
      action_required: true,
    };
  },
});

/**
 * Connect user's Spotify account using tokens from completed OAuth authentication
 * Stores authentication in agent state for immediate availability
 */
export const connectSpotifyAccount = tool({
  description:
    "Connect user's Spotify account using tokens from completed OAuth authentication. Call this when user indicates they've completed Spotify OAuth. This retrieves stored tokens from the database and establishes the Spotify integration.",
  parameters: z.object({
    userId: z.string().describe("User ID to associate with Spotify account"),
  }),
  execute: async ({ userId }) => {
    console.log(
      "[connectSpotifyAccount] Tool execution started for userId:",
      userId
    );
    try {
      const { agent } = getCurrentAgent<AppAgent>();

      if (!agent) {
        console.error("[connectSpotifyAccount] Could not get agent reference");
        return {
          success: false,
          message: "Error: Could not get agent reference",
        };
      }

      console.log(
        "[connectSpotifyAccount] Agent reference obtained, checking for Spotify connection..."
      );

      // Look for any valid Spotify tokens in the database
      // Since we store tokens with Spotify user ID, we need to find any valid tokens first
      const tokenResult = await agent.sql`
        SELECT user_id, access_token, refresh_token, expires_at, token_type, scope
        FROM spotify_tokens
        WHERE expires_at > ${new Date().toISOString()}
        ORDER BY created_at DESC
        LIMIT 1
      `;

      console.log("[connectSpotifyAccount] Database query result:", {
        hasResults: !!tokenResult,
        resultCount: tokenResult?.length || 0,
      });

      if (!tokenResult || tokenResult.length === 0) {
        console.log("[connectSpotifyAccount] No tokens found in database");
        return {
          success: false,
          message:
            "No Spotify authentication tokens found. Please use the 'Connect to Spotify' button in the authentication interface to complete OAuth authentication first. Simply saying you've authenticated doesn't actually authenticate - you need to click the button and go through Spotify's OAuth flow.",
        };
      }

      const tokenData = tokenResult[0] as {
        user_id: string;
        access_token: string;
        refresh_token: string;
        expires_at: string;
        token_type: string;
        scope: string;
      };

      const spotifyUserId = tokenData.user_id;
      console.log(
        "[connectSpotifyAccount] Found valid token for Spotify user:",
        spotifyUserId
      );

      console.log("[connectSpotifyAccount] Token data retrieved:", {
        hasAccessToken: !!tokenData.access_token,
        hasRefreshToken: !!tokenData.refresh_token,
        expiresAt: tokenData.expires_at,
        tokenType: tokenData.token_type,
        scope: tokenData.scope,
      });

      // Check if tokens are still valid (not expired)
      const expiresAt = new Date(tokenData.expires_at);
      const now = new Date();
      console.log("[connectSpotifyAccount] Token expiration check:", {
        expiresAt: expiresAt.toISOString(),
        now: now.toISOString(),
        isExpired: expiresAt <= now,
      });

      if (expiresAt <= new Date()) {
        console.log("[connectSpotifyAccount] Tokens have expired");
        return {
          success: false,
          message:
            "Authentication tokens have expired. Please use the 'Connect to Spotify' button to re-authenticate with Spotify OAuth.",
        };
      }

      // Get Spotify client ID from environment
      const clientId = agent.env.SPOTIFY_CLIENT_ID;
      console.log("[connectSpotifyAccount] Spotify client ID check:", {
        hasClientId: !!clientId,
      });

      if (!clientId) {
        console.error(
          "[connectSpotifyAccount] Spotify client ID not configured"
        );
        return {
          success: false,
          message: "Spotify client ID not configured",
        };
      }

      console.log("[connectSpotifyAccount] Initializing Spotify SDK...");

      // Initialize Spotify SDK to get user profile
      const tempSDK = SpotifyApi.withAccessToken(clientId, {
        access_token: tokenData.access_token,
        token_type: tokenData.token_type || "Bearer",
        expires_in: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
        refresh_token: tokenData.refresh_token || "",
      });

      console.log(
        "[connectSpotifyAccount] Fetching user profile from Spotify API..."
      );

      // Fetch user profile from Spotify
      const userProfile = await tempSDK.currentUser.profile();

      console.log(
        "[connectSpotifyAccount] User profile fetched successfully:",
        {
          id: userProfile.id,
          displayName: userProfile.display_name,
          email: userProfile.email,
          country: userProfile.country,
          product: userProfile.product,
        }
      );

      // Store Spotify auth in agent state instead of database
      console.log(
        "[connectSpotifyAccount] Storing auth data in agent state..."
      );
      const currentState = agent.state;
      const newState = {
        ...currentState,
        spotifyAuth: {
          isConnected: true,
          profile: {
            id: userProfile.id,
            displayName: userProfile.display_name || userProfile.id,
            email: userProfile.email,
            country: userProfile.country,
            product: (userProfile.product === "premium"
              ? "premium"
              : "free") as "premium" | "free",
            followers: userProfile.followers?.total,
          },
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          tokenExpiresAt: expiresAt.toISOString(),
          connectedAt: new Date().toISOString(),
        },
      };

      // Update agent state
      await agent.setState(newState);

      // Clean up the tokens from the temporary storage table
      console.log("[connectSpotifyAccount] Cleaning up temporary tokens...");
      await agent.sql`DELETE FROM spotify_tokens WHERE user_id = ${spotifyUserId}`;

      console.log(
        "[connectSpotifyAccount] Tool execution completed successfully"
      );
      return {
        success: true,
        message: `Successfully connected to Spotify account: ${userProfile.display_name || userProfile.id} (${userProfile.product} user)`,
        profile: {
          id: userProfile.id,
          displayName: userProfile.display_name,
          email: userProfile.email,
          country: userProfile.country,
          product: userProfile.product,
          followers: userProfile.followers?.total,
        },
      };
    } catch (error) {
      console.error(
        "[connectSpotifyAccount] Error during tool execution:",
        error
      );
      return {
        success: false,
        message: `Failed to connect Spotify account: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

/**
 * Get current user's Spotify profile and connection status
 */
export const getSpotifyConnectionStatus = tool({
  description:
    "Check if user's Spotify account is connected and get profile information",
  parameters: z.object({
    userId: z.string().describe("User ID to check Spotify connection for"),
  }),
  execute: async ({ userId }) => {
    try {
      const { agent } = getCurrentAgent<AppAgent>();

      if (!agent) {
        console.error(
          "[getSpotifyConnectionStatus] Could not get agent reference"
        );
        return {
          success: false,
          message: "Error: Could not get agent reference",
        };
      }

      const spotifyAuth = agent.state.spotifyAuth;

      if (!spotifyAuth || !spotifyAuth.isConnected) {
        return {
          connected: false,
          message:
            "No Spotify account connected. Please connect your account first.",
        };
      }

      const tokenExpiresAt = new Date(spotifyAuth.tokenExpiresAt);
      const isTokenValid = tokenExpiresAt.getTime() > Date.now();

      return {
        connected: spotifyAuth.isConnected,
        tokenValid: isTokenValid,
        profile: {
          displayName: spotifyAuth.profile.displayName,
          product: spotifyAuth.profile.product,
          country: spotifyAuth.profile.country,
          lastSync: spotifyAuth.connectedAt,
        },
        needsReauth: !isTokenValid,
      };
    } catch (error) {
      console.error("Error checking Spotify connection:", error);
      return {
        connected: false,
        message: `Error checking connection: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// =====================================
// Search & Discovery Tools
// =====================================

/**
 * Search Spotify catalog for tracks, artists, albums, and playlists
 */
export const searchSpotifyContent = tool({
  description:
    "Search Spotify catalog for music content including tracks, artists, albums, and playlists",
  parameters: z.object({
    userId: z.string().describe("User ID for Spotify access"),
    query: z
      .string()
      .describe(
        "Search query (can include filters like 'artist:Beatles track:Help')"
      ),
    types: z
      .array(z.enum(["track", "artist", "album", "playlist"]))
      .default(["track"])
      .describe("Types of content to search for"),
    limit: z
      .number()
      .min(1)
      .max(50)
      .default(20)
      .describe("Maximum number of results per type"),
    market: z
      .string()
      .optional()
      .describe("Market/country code for regional availability"),
  }),
  execute: async ({ userId, query, types, limit, market }) => {
    try {
      const spotifySDK = await getSpotifySDK(
        this as unknown as AppAgent,
        userId
      );
      if (!spotifySDK) {
        return { success: false, message: "Spotify not connected" };
      }

      const searchResults = await spotifySDK.search(
        query,
        types,
        market,
        limit
      );

      // Track discovery event
      await addDiscoveryEntry(this as unknown as AppAgent, {
        userId,
        timestamp: new Date().toISOString(),
        discoveryType: "new_track", // This could be more specific based on results
        discoveryMethod: "search",
        sourceContext: `Search: "${query}"`,
        engagementLevel: "medium",
        followUpActions: [],
      });

      // Format results for better usability
      const formattedResults = {
        tracks:
          searchResults.tracks?.items.map((track) => ({
            id: track.id,
            name: track.name,
            artists: track.artists.map((artist) => artist.name).join(", "),
            album: track.album.name,
            duration: Math.floor(track.duration_ms / 1000),
            preview_url: track.preview_url,
            external_urls: track.external_urls,
            popularity: track.popularity,
          })) || [],

        artists:
          searchResults.artists?.items.map((artist) => ({
            id: artist.id,
            name: artist.name,
            genres: artist.genres,
            popularity: artist.popularity,
            followers: artist.followers.total,
            external_urls: artist.external_urls,
          })) || [],

        albums:
          searchResults.albums?.items.map((album) => ({
            id: album.id,
            name: album.name,
            artists: album.artists.map((artist) => artist.name).join(", "),
            release_date: album.release_date,
            total_tracks: album.total_tracks,
            external_urls: album.external_urls,
          })) || [],

        playlists:
          searchResults.playlists?.items.map((playlist) => ({
            id: playlist.id,
            name: playlist.name,
            description: playlist.description,
            owner: playlist.owner.display_name,
            tracks_total: playlist.tracks.total,
            external_urls: playlist.external_urls,
          })) || [],
      };

      return {
        success: true,
        query,
        results: formattedResults,
        total_results: {
          tracks: searchResults.tracks?.total || 0,
          artists: searchResults.artists?.total || 0,
          albums: searchResults.albums?.total || 0,
          playlists: searchResults.playlists?.total || 0,
        },
      };
    } catch (error) {
      console.error("Error searching Spotify:", error);
      return {
        success: false,
        message: `Search failed: ${error.message}`,
      };
    }
  },
});

/**
 * Get detailed information about a specific track including audio features
 */
export const getTrackDetails = tool({
  description:
    "Get comprehensive information about a specific Spotify track including audio features, which is useful for understanding the song's characteristics",
  parameters: z.object({
    userId: z.string().describe("User ID for Spotify access"),
    trackId: z.string().describe("Spotify track ID"),
    includeAudioFeatures: z
      .boolean()
      .default(true)
      .describe("Whether to include audio features analysis"),
  }),
  execute: async ({ userId, trackId, includeAudioFeatures }) => {
    try {
      const spotifySDK = await getSpotifySDK(
        this as unknown as AppAgent,
        userId
      );
      if (!spotifySDK) {
        return { success: false, message: "Spotify not connected" };
      }

      // Get track details
      const track = await spotifySDK.tracks.get(trackId);

      // Get audio features if requested
      let audioFeatures = null;
      if (includeAudioFeatures) {
        audioFeatures = await spotifySDK.tracks.audioFeatures(trackId);
      }

      const trackDetails = {
        id: track.id,
        name: track.name,
        artists: track.artists.map((artist) => ({
          id: artist.id,
          name: artist.name,
        })),
        album: {
          id: track.album.id,
          name: track.album.name,
          release_date: track.album.release_date,
        },
        duration_ms: track.duration_ms,
        duration_formatted: `${Math.floor(track.duration_ms / 60000)}:${String(Math.floor((track.duration_ms % 60000) / 1000)).padStart(2, "0")}`,
        popularity: track.popularity,
        preview_url: track.preview_url,
        external_urls: track.external_urls,
        available_markets: track.available_markets?.length || 0,

        // Audio features for music analysis
        audio_features: audioFeatures
          ? {
              energy: audioFeatures.energy,
              valence: audioFeatures.valence,
              danceability: audioFeatures.danceability,
              acousticness: audioFeatures.acousticness,
              instrumentalness: audioFeatures.instrumentalness,
              liveness: audioFeatures.liveness,
              speechiness: audioFeatures.speechiness,
              tempo: audioFeatures.tempo,
              time_signature: audioFeatures.time_signature,
              key: audioFeatures.key,
              mode: audioFeatures.mode,
              loudness: audioFeatures.loudness,
            }
          : null,
      };

      return {
        success: true,
        track: trackDetails,
      };
    } catch (error) {
      console.error("Error getting track details:", error);
      return {
        success: false,
        message: `Failed to get track details: ${error.message}`,
      };
    }
  },
});

/**
 * Get music recommendations based on seed tracks, artists, or audio features
 */
export const getSpotifyRecommendations = tool({
  description:
    "Get personalized music recommendations from Spotify based on seed tracks, artists, genres, or audio features",
  parameters: z.object({
    userId: z.string().describe("User ID for Spotify access"),
    seedTracks: z
      .array(z.string())
      .optional()
      .describe("Spotify track IDs to base recommendations on (max 5)"),
    seedArtists: z
      .array(z.string())
      .optional()
      .describe("Spotify artist IDs to base recommendations on (max 5)"),
    seedGenres: z
      .array(z.string())
      .optional()
      .describe("Genres to base recommendations on (max 5)"),
    limit: z
      .number()
      .min(1)
      .max(100)
      .default(20)
      .describe("Number of recommendations to return"),
    market: z.string().optional().describe("Market/country code"),
    audioFeatureTargets: z
      .object({
        energy: z.number().min(0).max(1).optional(),
        valence: z.number().min(0).max(1).optional(),
        danceability: z.number().min(0).max(1).optional(),
        acousticness: z.number().min(0).max(1).optional(),
        instrumentalness: z.number().min(0).max(1).optional(),
        tempo: z.number().optional(),
      })
      .optional()
      .describe("Target audio feature values for recommendations"),
  }),
  execute: async ({
    userId,
    seedTracks,
    seedArtists,
    seedGenres,
    limit,
    market,
    audioFeatureTargets,
  }) => {
    try {
      const spotifySDK = await getSpotifySDK(
        this as unknown as AppAgent,
        userId
      );
      if (!spotifySDK) {
        return { success: false, message: "Spotify not connected" };
      }

      // Validate that we have at least one seed
      const totalSeeds =
        (seedTracks?.length || 0) +
        (seedArtists?.length || 0) +
        (seedGenres?.length || 0);
      if (totalSeeds === 0) {
        return {
          success: false,
          message:
            "At least one seed (track, artist, or genre) is required for recommendations",
        };
      }

      // Build recommendation parameters
      const recommendationParams: Record<string, unknown> = {
        limit,
        market,
        seed_tracks: seedTracks?.slice(0, 5),
        seed_artists: seedArtists?.slice(0, 5),
        seed_genres: seedGenres?.slice(0, 5),
      };

      // Add audio feature targets if provided
      if (audioFeatureTargets) {
        for (const [key, value] of Object.entries(audioFeatureTargets)) {
          if (value !== undefined) {
            recommendationParams[`target_${key}`] = value;
          }
        }
      }

      const recommendations =
        await spotifySDK.recommendations.get(recommendationParams);

      // Format recommendations
      const formattedRecommendations = recommendations.tracks.map((track) => ({
        id: track.id,
        name: track.name,
        artists: track.artists.map((artist) => artist.name).join(", "),
        album: track.album.name,
        duration: Math.floor(track.duration_ms / 1000),
        popularity: track.popularity,
        preview_url: track.preview_url,
        external_urls: track.external_urls,
      }));

      // Track each recommendation in history
      for (const track of formattedRecommendations) {
        await addRecommendationEntry(this as unknown as AppAgent, {
          userId,
          timestamp: new Date().toISOString(),
          type: "track",
          recommendationId: track.id,
          recommendationName: track.name,
          artistName: track.artists,
          reason: "Spotify recommendations API",
          basedOn: [
            ...(seedTracks?.map((id) => ({
              type: "track" as const,
              value: id,
            })) || []),
            ...(seedArtists?.map((id) => ({
              type: "artist" as const,
              value: id,
            })) || []),
            ...(seedGenres?.map((genre) => ({
              type: "genre" as const,
              value: genre,
            })) || []),
            ...(audioFeatureTargets
              ? [
                  {
                    type: "features" as const,
                    value: JSON.stringify(audioFeatureTargets),
                  },
                ]
              : []),
          ],
          confidence: 0.8, // Spotify's recommendations are generally high quality
        });
      }

      return {
        success: true,
        recommendations: formattedRecommendations,
        seed_info: {
          tracks: seedTracks?.length || 0,
          artists: seedArtists?.length || 0,
          genres: seedGenres?.length || 0,
        },
        total_found: recommendations.tracks.length,
      };
    } catch (error) {
      console.error("Error getting Spotify recommendations:", error);
      return {
        success: false,
        message: `Failed to get recommendations: ${error.message}`,
      };
    }
  },
});

// =====================================
// Playback Control Tools
// =====================================

/**
 * Get available Spotify devices for playback
 */
export const getSpotifyDevices = tool({
  description: "Get list of available Spotify devices for playback control",
  parameters: z.object({
    userId: z.string().describe("User ID for Spotify access"),
  }),
  execute: async ({ userId }) => {
    try {
      const spotifySDK = await getSpotifySDK(
        this as unknown as AppAgent,
        userId
      );
      if (!spotifySDK) {
        return { success: false, message: "Spotify not connected" };
      }

      const devices = await spotifySDK.player.getAvailableDevices();

      const formattedDevices = devices.devices.map((device) => ({
        id: device.id,
        name: device.name,
        type: device.type,
        is_active: device.is_active,
        is_private_session: device.is_private_session,
        is_restricted: device.is_restricted,
        volume_percent: device.volume_percent,
        supports_volume: device.supports_volume,
      }));

      return {
        success: true,
        devices: formattedDevices,
        active_device: formattedDevices.find((device) => device.is_active),
        total_devices: formattedDevices.length,
      };
    } catch (error) {
      console.error("Error getting Spotify devices:", error);
      return {
        success: false,
        message: `Failed to get devices: ${error.message}`,
      };
    }
  },
});

/**
 * Get current playback state
 */
export const getCurrentPlayback = tool({
  description:
    "Get information about the user's current Spotify playback including track, device, and playback state",
  parameters: z.object({
    userId: z.string().describe("User ID for Spotify access"),
    market: z.string().optional().describe("Market/country code"),
  }),
  execute: async ({ userId, market }) => {
    try {
      const spotifySDK = await getSpotifySDK(
        this as unknown as AppAgent,
        userId
      );
      if (!spotifySDK) {
        return { success: false, message: "Spotify not connected" };
      }

      const playbackState =
        await spotifySDK.player.getCurrentlyPlayingTrack(market);

      if (!playbackState || !playbackState.item) {
        return {
          success: true,
          is_playing: false,
          message: "No track currently playing",
        };
      }

      const currentTrack = playbackState.item;
      const device = playbackState.device;

      const playbackInfo = {
        is_playing: playbackState.is_playing,
        progress_ms: playbackState.progress_ms,
        shuffle_state: playbackState.shuffle_state,
        repeat_state: playbackState.repeat_state,

        track: {
          id: currentTrack.id,
          name: currentTrack.name,
          artists: currentTrack.artists.map((artist) => artist.name).join(", "),
          album: currentTrack.album.name,
          duration_ms: currentTrack.duration_ms,
          popularity: currentTrack.popularity,
          external_urls: currentTrack.external_urls,
        },

        device: device
          ? {
              id: device.id,
              name: device.name,
              type: device.type,
              volume_percent: device.volume_percent,
            }
          : null,

        context: playbackState.context
          ? {
              type: playbackState.context.type,
              uri: playbackState.context.uri,
            }
          : null,
      };

      // Track current playback in session
      if (playbackState.is_playing && currentTrack) {
        await addMusicSessionEntry(this as unknown as AppAgent, {
          userId,
          sessionId: crypto.randomUUID(), // This should be managed per session
          timestamp: new Date().toISOString(),
          activityType: "track_play",
          trackId: currentTrack.id,
          trackName: currentTrack.name,
          artistName: currentTrack.artists.map((a) => a.name).join(", "),
          deviceId: device?.id,
          deviceName: device?.name,
          duration: Math.floor((playbackState.progress_ms || 0) / 1000),
        });
      }

      return {
        success: true,
        playback: playbackInfo,
      };
    } catch (error) {
      console.error("Error getting current playback:", error);
      return {
        success: false,
        message: `Failed to get playback state: ${error.message}`,
      };
    }
  },
});

/**
 * Control Spotify playback (play, pause, skip, etc.)
 */
export const controlSpotifyPlayback = tool({
  name: "controlSpotifyPlayback",
  description:
    "Control Spotify playback including play, pause, skip, seek, and volume control",
  parameters: z.object({
    action: z
      .enum(["play", "pause", "skip_next", "skip_previous", "seek", "volume"])
      .describe("The playback action to perform"),
    deviceId: z
      .string()
      .optional()
      .describe("Specific device ID to control (optional)"),
    trackUris: z
      .array(z.string())
      .optional()
      .describe("Track URIs to play (for play action)"),
    contextUri: z
      .string()
      .optional()
      .describe("Playlist or album URI to play (for play action)"),
    positionMs: z
      .number()
      .optional()
      .describe("Position in track to seek to in milliseconds"),
    volumePercent: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe("Volume level as percentage (0-100)"),
  }),
  execute: async ({
    action,
    deviceId,
    trackUris,
    contextUri,
    positionMs,
    volumePercent,
  }) => {
    try {
      const { agent } = getCurrentAgent<AppAgent>();

      if (!agent) {
        console.error("[controlSpotifyPlayback] Could not get agent reference");
        return {
          success: false,
          message: "Error: Could not get agent reference",
        };
      }

      // Get Spotify profile to access tokens
      const profile = await getConnectedSpotifyProfile(agent);
      if (!profile || !profile.isConnected || !profile.accessToken) {
        return {
          success: false,
          message:
            "Spotify account not connected. Please connect your Spotify account first.",
        };
      }

      const clientId = agent.env.SPOTIFY_CLIENT_ID;
      if (!clientId) {
        return {
          success: false,
          message: "Spotify client ID not configured",
        };
      }

      // Initialize Spotify SDK
      const spotify = SpotifyApi.withAccessToken(clientId, {
        access_token: profile.accessToken,
        token_type: "Bearer",
        expires_in: Math.floor(
          (profile.tokenExpiresAt!.getTime() - Date.now()) / 1000
        ),
        refresh_token: profile.refreshToken || "",
      });

      let result: unknown;
      switch (action) {
        case "play":
          if (trackUris || contextUri) {
            await spotify.player.startResumePlayback(
              deviceId,
              contextUri,
              trackUris
            );
            result = `Started playback${deviceId ? ` on device ${deviceId}` : ""}`;
          } else {
            await spotify.player.startResumePlayback(deviceId);
            result = `Resumed playback${deviceId ? ` on device ${deviceId}` : ""}`;
          }
          break;

        case "pause":
          await spotify.player.pausePlayback(deviceId);
          result = `Paused playback${deviceId ? ` on device ${deviceId}` : ""}`;
          break;

        case "skip_next":
          await spotify.player.skipToNext(deviceId);
          result = `Skipped to next track${deviceId ? ` on device ${deviceId}` : ""}`;
          break;

        case "skip_previous":
          await spotify.player.skipToPrevious(deviceId);
          result = `Skipped to previous track${deviceId ? ` on device ${deviceId}` : ""}`;
          break;

        case "seek":
          if (positionMs === undefined) {
            return {
              success: false,
              message: "Position in milliseconds is required for seek action",
            };
          }
          await spotify.player.seekToPosition(positionMs, deviceId);
          result = `Seeked to position ${Math.floor(positionMs / 1000)}s${deviceId ? ` on device ${deviceId}` : ""}`;
          break;

        case "volume":
          if (volumePercent === undefined) {
            return {
              success: false,
              message: "Volume percentage is required for volume action",
            };
          }
          await spotify.player.setPlaybackVolume(volumePercent, deviceId);
          result = `Set volume to ${volumePercent}%${deviceId ? ` on device ${deviceId}` : ""}`;
          break;

        default:
          return {
            success: false,
            message: `Unknown action: ${action}`,
          };
      }

      // Track the action in music session history
      await addMusicSessionEntry(this as unknown as AppAgent, {
        userId: profile.spotifyUserId,
        sessionId: crypto.randomUUID(), // TODO: Use actual session tracking
        timestamp: new Date().toISOString(),
        activityType:
          action === "play"
            ? "track_play"
            : action === "skip_next" || action === "skip_previous"
              ? "track_skip"
              : "session_start",
        context: "playback_control",
      });

      return {
        success: true,
        message: result,
        action,
        deviceId,
      };
    } catch (error) {
      console.error("[controlSpotifyPlayback] Error:", error);
      return {
        success: false,
        message: `Failed to control playback: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

export const getUserTopTracks = tool({
  name: "getUserTopTracks",
  description:
    "Get user's top tracks from Spotify to analyze their music preferences",
  parameters: z.object({
    timeRange: z
      .enum(["short_term", "medium_term", "long_term"])
      .default("medium_term")
      .describe(
        "Time range for top tracks: short_term (4 weeks), medium_term (6 months), long_term (several years)"
      ),
    limit: z
      .number()
      .min(1)
      .max(50)
      .default(20)
      .describe("Number of top tracks to retrieve (1-50)"),
  }),
  execute: async ({ timeRange = "medium_term", limit = 20 }) => {
    try {
      const { agent } = getCurrentAgent<AppAgent>();

      if (!agent) {
        console.error("[getUserTopTracks] Could not get agent reference");
        return {
          success: false,
          message: "Error: Could not get agent reference",
        };
      }

      // Get Spotify profile to access tokens
      const profile = await getConnectedSpotifyProfile(agent);
      if (!profile || !profile.isConnected || !profile.accessToken) {
        return {
          success: false,
          message:
            "Spotify account not connected. Please connect your Spotify account first.",
        };
      }

      const clientId = agent.env.SPOTIFY_CLIENT_ID;
      if (!clientId) {
        return {
          success: false,
          message: "Spotify client ID not configured",
        };
      }

      // Initialize Spotify SDK
      const spotify = SpotifyApi.withAccessToken(clientId, {
        access_token: profile.accessToken,
        token_type: "Bearer",
        expires_in: Math.floor(
          (profile.tokenExpiresAt!.getTime() - Date.now()) / 1000
        ),
        refresh_token: profile.refreshToken || "",
      });

      // Get user's top tracks
      const topTracks = await spotify.currentUser.topItems(
        "tracks",
        timeRange,
        limit
      );

      // Format track data for analysis
      const tracks = topTracks.items.map((track) => ({
        id: track.id,
        name: track.name,
        artists: track.artists.map((artist) => ({
          id: artist.id,
          name: artist.name,
        })),
        album: {
          id: track.album.id,
          name: track.album.name,
          releaseDate: track.album.release_date,
        },
        popularity: track.popularity,
        duration: track.duration_ms,
        explicit: track.explicit,
        previewUrl: track.preview_url,
        uri: track.uri,
      }));

      // Analyze genres and audio features
      const artistIds = Array.from(
        new Set(tracks.flatMap((track) => track.artists.map((a) => a.id)))
      );
      const artists = await spotify.artists.get(artistIds);

      const genres = artists.flatMap((artist) => artist.genres);
      const genreCounts = genres.reduce(
        (acc, genre) => {
          acc[genre] = (acc[genre] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const topGenres = Object.entries(genreCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([genre, count]) => ({ genre, count }));

      return {
        success: true,
        timeRange,
        totalTracks: tracks.length,
        tracks,
        topGenres,
        analysis: {
          mostPopularTrack: tracks.reduce((max, track) =>
            track.popularity > max.popularity ? track : max
          ),
          averagePopularity:
            tracks.reduce((sum, track) => sum + track.popularity, 0) /
            tracks.length,
          explicitContentPercentage:
            (tracks.filter((track) => track.explicit).length / tracks.length) *
            100,
        },
      };
    } catch (error) {
      console.error("[getUserTopTracks] Error:", error);
      return {
        success: false,
        message: `Failed to get top tracks: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

export const getUserTopArtists = tool({
  name: "getUserTopArtists",
  description:
    "Get user's top artists from Spotify to analyze their music preferences",
  parameters: z.object({
    timeRange: z
      .enum(["short_term", "medium_term", "long_term"])
      .default("medium_term")
      .describe(
        "Time range for top artists: short_term (4 weeks), medium_term (6 months), long_term (several years)"
      ),
    limit: z
      .number()
      .min(1)
      .max(50)
      .default(20)
      .describe("Number of top artists to retrieve (1-50)"),
  }),
  execute: async ({ timeRange = "medium_term", limit = 20 }) => {
    try {
      const { agent } = getCurrentAgent<AppAgent>();

      if (!agent) {
        console.error("[getUserTopArtists] Could not get agent reference");
        return {
          success: false,
          message: "Error: Could not get agent reference",
        };
      }

      // Get Spotify profile to access tokens
      const profile = await getConnectedSpotifyProfile(agent);
      if (!profile || !profile.isConnected || !profile.accessToken) {
        return {
          success: false,
          message:
            "Spotify account not connected. Please connect your Spotify account first.",
        };
      }

      const clientId = agent.env.SPOTIFY_CLIENT_ID;
      if (!clientId) {
        return {
          success: false,
          message: "Spotify client ID not configured",
        };
      }

      // Initialize Spotify SDK
      const spotify = SpotifyApi.withAccessToken(clientId, {
        access_token: profile.accessToken,
        token_type: "Bearer",
        expires_in: Math.floor(
          (profile.tokenExpiresAt!.getTime() - Date.now()) / 1000
        ),
        refresh_token: profile.refreshToken || "",
      });

      // Get user's top artists
      const topArtists = await spotify.currentUser.topItems(
        "artists",
        timeRange,
        limit
      );

      // Format artist data for analysis
      const artists = topArtists.items.map((artist) => ({
        id: artist.id,
        name: artist.name,
        genres: artist.genres,
        popularity: artist.popularity,
        followers: artist.followers.total,
        images: artist.images,
        uri: artist.uri,
      }));

      // Analyze genres
      const allGenres = artists.flatMap((artist) => artist.genres);
      const genreCounts = allGenres.reduce(
        (acc, genre) => {
          acc[genre] = (acc[genre] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const topGenres = Object.entries(genreCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 15)
        .map(([genre, count]) => ({ genre, count }));

      // Calculate popularity distribution
      const popularityRanges = {
        mainstream: artists.filter((a) => a.popularity >= 70).length,
        popular: artists.filter((a) => a.popularity >= 50 && a.popularity < 70)
          .length,
        emerging: artists.filter((a) => a.popularity >= 30 && a.popularity < 50)
          .length,
        underground: artists.filter((a) => a.popularity < 30).length,
      };

      return {
        success: true,
        timeRange,
        totalArtists: artists.length,
        artists,
        topGenres,
        analysis: {
          mostPopularArtist: artists.reduce((max, artist) =>
            artist.popularity > max.popularity ? artist : max
          ),
          averagePopularity:
            artists.reduce((sum, artist) => sum + artist.popularity, 0) /
            artists.length,
          popularityDistribution: popularityRanges,
          genreDiversity: topGenres.length,
        },
      };
    } catch (error) {
      console.error("[getUserTopArtists] Error:", error);
      return {
        success: false,
        message: `Failed to get top artists: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

export const getUserPlaylists = tool({
  name: "getUserPlaylists",
  description:
    "Get user's Spotify playlists to analyze their music organization and preferences",
  parameters: z.object({
    limit: z
      .number()
      .min(1)
      .max(50)
      .default(20)
      .describe("Number of playlists to retrieve (1-50)"),
    includeTrackCounts: z
      .boolean()
      .default(true)
      .describe("Whether to include track counts for each playlist"),
  }),
  execute: async ({ limit = 20, includeTrackCounts = true }) => {
    try {
      const { agent } = getCurrentAgent<AppAgent>();

      if (!agent) {
        console.error("[getUserPlaylists] Could not get agent reference");
        return {
          success: false,
          message: "Error: Could not get agent reference",
        };
      }

      // Get Spotify profile to access tokens
      const profile = await getConnectedSpotifyProfile(agent);
      if (!profile || !profile.isConnected || !profile.accessToken) {
        return {
          success: false,
          message:
            "Spotify account not connected. Please connect your Spotify account first.",
        };
      }

      const clientId = agent.env.SPOTIFY_CLIENT_ID;
      if (!clientId) {
        return {
          success: false,
          message: "Spotify client ID not configured",
        };
      }

      // Initialize Spotify SDK
      const spotify = SpotifyApi.withAccessToken(clientId, {
        access_token: profile.accessToken,
        token_type: "Bearer",
        expires_in: Math.floor(
          (profile.tokenExpiresAt!.getTime() - Date.now()) / 1000
        ),
        refresh_token: profile.refreshToken || "",
      });

      // Get user's playlists
      const userPlaylists =
        await spotify.currentUser.playlists.playlists(limit);

      // Format playlist data
      const playlists = userPlaylists.items.map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
        description: playlist.description,
        isPublic: playlist.public,
        collaborative: playlist.collaborative,
        owner: {
          id: playlist.owner.id,
          name: playlist.owner.display_name,
        },
        trackCount: includeTrackCounts ? playlist.tracks.total : undefined,
        images: playlist.images,
        uri: playlist.uri,
        createdBy:
          playlist.owner.id === profile.spotifyUserId ? "user" : "other",
      }));

      // Analyze playlist patterns
      const userPlaylists_filtered = playlists.filter(
        (p) => p.createdBy === "user"
      );
      const followedPlaylists = playlists.filter(
        (p) => p.createdBy === "other"
      );

      const analysis = {
        totalPlaylists: playlists.length,
        userCreatedPlaylists: userPlaylists_filtered.length,
        followedPlaylists: followedPlaylists.length,
        averageTracksPerPlaylist: includeTrackCounts
          ? Math.round(
              playlists
                .filter((p) => p.trackCount !== undefined)
                .reduce((sum, p) => sum + (p.trackCount || 0), 0) /
                playlists.length
            )
          : undefined,
        collaborativePlaylists: playlists.filter((p) => p.collaborative).length,
        publicPlaylists: playlists.filter((p) => p.isPublic).length,
      };

      return {
        success: true,
        totalPlaylists: playlists.length,
        playlists,
        analysis,
      };
    } catch (error) {
      console.error("[getUserPlaylists] Error:", error);
      return {
        success: false,
        message: `Failed to get user playlists: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

export const analyzeMusicTaste = tool({
  name: "analyzeMusicTaste",
  description:
    "Comprehensive analysis of user's music taste by combining top tracks, artists, and playlists data",
  parameters: z.object({
    timeRange: z
      .enum(["short_term", "medium_term", "long_term"])
      .default("medium_term")
      .describe(
        "Time range for analysis: short_term (4 weeks), medium_term (6 months), long_term (several years)"
      ),
    includePlaylistAnalysis: z
      .boolean()
      .default(true)
      .describe(
        "Whether to include playlist analysis in the comprehensive report"
      ),
  }),
  execute: async ({
    timeRange = "medium_term",
    includePlaylistAnalysis = true,
  }) => {
    try {
      const { agent } = getCurrentAgent<AppAgent>();

      if (!agent) {
        console.error("[analyzeMusicTaste] Could not get agent reference");
        return {
          success: false,
          message: "Error: Could not get agent reference",
        };
      }

      // Get Spotify auth from agent state instead of database
      const spotifyAuth = agent.state.spotifyAuth;
      if (
        !spotifyAuth ||
        !spotifyAuth.isConnected ||
        !spotifyAuth.accessToken
      ) {
        return {
          success: false,
          message:
            "Spotify account not connected. Please connect your Spotify account first.",
        };
      }

      const clientId = agent.env.SPOTIFY_CLIENT_ID;
      if (!clientId) {
        return {
          success: false,
          message: "Spotify client ID not configured",
        };
      }

      // Check if token is still valid
      const tokenExpiresAt = new Date(spotifyAuth.tokenExpiresAt);
      const now = new Date();
      if (tokenExpiresAt <= now) {
        return {
          success: false,
          message:
            "Spotify tokens have expired. Please reconnect your account.",
        };
      }

      // Initialize Spotify SDK
      const spotify = SpotifyApi.withAccessToken(clientId, {
        access_token: spotifyAuth.accessToken,
        token_type: "Bearer",
        expires_in: Math.floor(
          (tokenExpiresAt.getTime() - now.getTime()) / 1000
        ),
        refresh_token: spotifyAuth.refreshToken || "",
      });

      console.log(
        "[analyzeMusicTaste] Starting comprehensive music taste analysis..."
      );

      // Parallel data fetching for performance
      const [topTracks, topArtists, playlists] = await Promise.all([
        spotify.currentUser.topItems("tracks", timeRange, 20),
        spotify.currentUser.topItems("artists", timeRange, 20),
        includePlaylistAnalysis
          ? spotify.currentUser.playlists.playlists(20)
          : Promise.resolve({ items: [] }),
      ]);

      // Process top tracks
      const tracks = topTracks.items.map((track) => ({
        id: track.id,
        name: track.name,
        artists: track.artists.map((artist) => ({
          id: artist.id,
          name: artist.name,
        })),
        popularity: track.popularity,
        explicit: track.explicit,
        durationMs: track.duration_ms,
      }));

      // Process top artists with genre analysis
      const artists = topArtists.items.map((artist) => ({
        id: artist.id,
        name: artist.name,
        genres: artist.genres,
        popularity: artist.popularity,
        followers: artist.followers.total,
      }));

      // Analyze genres from artists
      const allGenres = artists.flatMap((artist) => artist.genres);
      const genreCounts = allGenres.reduce(
        (acc, genre) => {
          acc[genre] = (acc[genre] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const topGenres = Object.entries(genreCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([genre, count]) => ({
          genre,
          count,
          percentage: (count / allGenres.length) * 100,
        }));

      // Analyze playlist behavior if included
      let playlistAnalysis = null;
      if (includePlaylistAnalysis && playlists.items.length > 0) {
        const userCreatedPlaylists = playlists.items.filter(
          (playlist) => playlist.owner.id === spotifyAuth.profile.id
        );

        playlistAnalysis = {
          totalPlaylists: playlists.items.length,
          userCreatedPlaylists: userCreatedPlaylists.length,
          followedPlaylists:
            playlists.items.length - userCreatedPlaylists.length,
          averageTracksPerPlaylist: Math.round(
            playlists.items.reduce((sum, p) => sum + p.tracks.total, 0) /
              playlists.items.length
          ),
          playlistNames: userCreatedPlaylists.slice(0, 10).map((p) => p.name),
        };
      }

      // Calculate music taste insights
      const musicProfile = {
        // Popularity preferences
        popularityProfile: {
          averageTrackPopularity: Math.round(
            tracks.reduce((sum, track) => sum + track.popularity, 0) /
              tracks.length
          ),
          averageArtistPopularity: Math.round(
            artists.reduce((sum, artist) => sum + artist.popularity, 0) /
              artists.length
          ),
          mainstreamVsUnderground:
            artists.filter((a) => a.popularity >= 70).length >
            artists.length / 2
              ? "mainstream"
              : "underground",
        },

        // Content preferences
        contentProfile: {
          explicitContentPercentage: Math.round(
            (tracks.filter((t) => t.explicit).length / tracks.length) * 100
          ),
          averageTrackDuration: Math.round(
            tracks.reduce((sum, track) => sum + track.durationMs, 0) /
              tracks.length /
              1000
          ), // in seconds
        },

        // Diversity metrics
        diversityMetrics: {
          genreDiversity: topGenres.length,
          artistRecurrence:
            tracks.length -
            new Set(tracks.flatMap((t) => t.artists.map((a) => a.id))).size,
          topGenreConcentration: topGenres[0]?.percentage || 0,
        },

        // Key artists and tracks
        favorites: {
          topArtist: artists[0]?.name,
          topTrack: tracks[0]?.name,
          dominantGenre: topGenres[0]?.genre,
        },
      };

      // Generate music taste summary
      const tasteSummary = {
        primaryGenres: topGenres.slice(0, 3).map((g) => g.genre),
        listeningPersonality:
          musicProfile.popularityProfile.mainstreamVsUnderground,
        diversityLevel:
          musicProfile.diversityMetrics.genreDiversity > 15
            ? "high"
            : musicProfile.diversityMetrics.genreDiversity > 8
              ? "medium"
              : "low",
        contentPreference:
          musicProfile.contentProfile.explicitContentPercentage > 30
            ? "explicit-friendly"
            : "clean-preferred",
        playlistBehavior: playlistAnalysis
          ? playlistAnalysis.userCreatedPlaylists > 5
            ? "active-curator"
            : "casual-listener"
          : "unknown",
      };

      return {
        success: true,
        timeRange,
        profile: {
          displayName: spotifyAuth.profile.displayName,
          spotifyUserId: spotifyAuth.profile.id,
          accountType: spotifyAuth.profile.product,
        },
        musicProfile,
        tasteSummary,
        topGenres,
        favoriteArtists: artists.slice(0, 5),
        favoriteTracks: tracks.slice(0, 5),
        playlistAnalysis,
        insights: {
          totalTracksAnalyzed: tracks.length,
          totalArtistsAnalyzed: artists.length,
          totalGenresIdentified: topGenres.length,
          analysisDate: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error("[analyzeMusicTaste] Error:", error);
      return {
        success: false,
        message: `Failed to analyze music taste: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

// Export all tools for registry
export const spotifyTools = {
  showSpotifyAuth,
  connectSpotifyAccount,
  getSpotifyConnectionStatus,
  searchSpotifyContent,
  getTrackDetails,
  getSpotifyRecommendations,
  getSpotifyDevices,
  getCurrentPlayback,
  controlSpotifyPlayback,
  getUserTopTracks,
  getUserTopArtists,
  getUserPlaylists,
  analyzeMusicTaste,
};
