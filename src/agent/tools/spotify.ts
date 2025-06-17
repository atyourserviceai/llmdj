/**
 * Spotify Web API Tools for LLMDJ Agent
 * Provides comprehensive Spotify integration including search, playback control,
 * playlist management, and music analysis capabilities.
 */

import { tool } from "ai";
import { z } from "zod";
import { SpotifyApi } from "@spotify/web-api-ts-sdk";
import type { AppAgent } from "../AppAgent";
import {
  storeSpotifyProfile,
  getSpotifyProfile,
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
 * Connect user's Spotify account and store profile
 */
export const connectSpotifyAccount = tool({
  description:
    "Connect user's Spotify account and store their profile information. This should be used during onboarding to establish Spotify integration.",
  parameters: z.object({
    userId: z.string().describe("User ID to associate with Spotify account"),
    accessToken: z.string().describe("Spotify access token from OAuth flow"),
    refreshToken: z
      .string()
      .optional()
      .describe("Spotify refresh token for token renewal"),
    expiresIn: z
      .number()
      .optional()
      .describe("Token expiration time in seconds"),
  }),
  execute: async ({ userId, accessToken, refreshToken, expiresIn }) => {
    try {
      // Initialize Spotify SDK to get user profile
      const tempSDK = SpotifyApi.withAccessToken(
        process.env.SPOTIFY_CLIENT_ID || "",
        {
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: expiresIn || 3600,
          refresh_token: refreshToken || "",
        }
      );

      // Fetch user profile from Spotify
      const userProfile = await tempSDK.currentUser.profile();

      // Calculate token expiration
      const tokenExpiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000)
        : new Date(Date.now() + 3600 * 1000); // Default 1 hour

      // Store Spotify profile in database
      const spotifyProfile = {
        id: crypto.randomUUID(),
        spotifyUserId: userProfile.id,
        displayName: userProfile.display_name || userProfile.id,
        email: userProfile.email,
        country: userProfile.country,
        product: userProfile.product || "free",
        images: userProfile.images,
        followers: userProfile.followers?.total,
        isConnected: true,
        accessToken,
        refreshToken,
        tokenExpiresAt,
        lastSyncAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await storeSpotifyProfile(this as unknown as AppAgent, spotifyProfile);

      // Track connection event
      await addMusicSessionEntry(this as unknown as AppAgent, {
        userId: userProfile.id,
        sessionId: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        activityType: "session_start",
        context: "spotify_connection",
      });

      return {
        success: true,
        message: `Successfully connected Spotify account for ${userProfile.display_name}`,
        profile: {
          displayName: userProfile.display_name,
          product: userProfile.product,
          country: userProfile.country,
        },
      };
    } catch (error) {
      console.error("Error connecting Spotify account:", error);
      return {
        success: false,
        message: `Failed to connect Spotify account: ${error.message}`,
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
      const profile = await getSpotifyProfile(
        this as unknown as AppAgent,
        userId
      );

      if (!profile) {
        return {
          connected: false,
          message:
            "No Spotify account connected. Please connect your account first.",
        };
      }

      const isTokenValid = profile.tokenExpiresAt
        ? profile.tokenExpiresAt.getTime() > Date.now()
        : false;

      return {
        connected: profile.isConnected,
        tokenValid: isTokenValid,
        profile: {
          displayName: profile.displayName,
          product: profile.product,
          country: profile.country,
          lastSync: profile.lastSyncAt,
        },
        needsReauth: !isTokenValid,
      };
    } catch (error) {
      console.error("Error checking Spotify connection:", error);
      return {
        connected: false,
        message: `Error checking connection: ${error.message}`,
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
      const recommendationParams: any = {
        limit,
        market,
        seed_tracks: seedTracks?.slice(0, 5),
        seed_artists: seedArtists?.slice(0, 5),
        seed_genres: seedGenres?.slice(0, 5),
      };

      // Add audio feature targets if provided
      if (audioFeatureTargets) {
        Object.entries(audioFeatureTargets).forEach(([key, value]) => {
          if (value !== undefined) {
            recommendationParams[`target_${key}`] = value;
          }
        });
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
  description:
    "Control Spotify playback with various actions like play, pause, skip, previous, shuffle, and repeat",
  parameters: z.object({
    userId: z.string().describe("User ID for Spotify access"),
    action: z
      .enum(["play", "pause", "next", "previous", "shuffle", "repeat"])
      .describe("Playback action to perform"),
    deviceId: z
      .string()
      .optional()
      .describe("Specific device ID to control (optional)"),
    // Additional parameters for specific actions
    shuffleState: z
      .boolean()
      .optional()
      .describe("Shuffle state (for shuffle action)"),
    repeatState: z
      .enum(["off", "track", "context"])
      .optional()
      .describe("Repeat state (for repeat action)"),
  }),
  execute: async ({ userId, action, deviceId, shuffleState, repeatState }) => {
    try {
      const spotifySDK = await getSpotifySDK(
        this as unknown as AppAgent,
        userId
      );
      if (!spotifySDK) {
        return { success: false, message: "Spotify not connected" };
      }

      let result;
      let message;

      switch (action) {
        case "play":
          await spotifySDK.player.startResumePlayback(deviceId);
          message = "Playback started";
          break;

        case "pause":
          await spotifySDK.player.pausePlayback(deviceId);
          message = "Playback paused";
          break;

        case "next":
          await spotifySDK.player.skipToNext(deviceId);
          message = "Skipped to next track";
          break;

        case "previous":
          await spotifySDK.player.skipToPrevious(deviceId);
          message = "Skipped to previous track";
          break;

        case "shuffle":
          if (shuffleState === undefined) {
            return {
              success: false,
              message: "Shuffle state required for shuffle action",
            };
          }
          await spotifySDK.player.togglePlaybackShuffle(shuffleState, deviceId);
          message = `Shuffle ${shuffleState ? "enabled" : "disabled"}`;
          break;

        case "repeat":
          if (!repeatState) {
            return {
              success: false,
              message: "Repeat state required for repeat action",
            };
          }
          await spotifySDK.player.setRepeatMode(repeatState, deviceId);
          message = `Repeat mode set to ${repeatState}`;
          break;

        default:
          return { success: false, message: "Invalid action" };
      }

      // Track the control action
      await addMusicSessionEntry(this as unknown as AppAgent, {
        userId,
        sessionId: crypto.randomUUID(), // This should be managed per session
        timestamp: new Date().toISOString(),
        activityType:
          action === "next"
            ? "track_skip"
            : action === "play"
              ? "track_play"
              : (action as any),
        deviceId,
        context: `playback_control_${action}`,
      });

      return {
        success: true,
        action,
        message,
        device_id: deviceId,
      };
    } catch (error) {
      console.error("Error controlling Spotify playback:", error);
      return {
        success: false,
        message: `Playback control failed: ${error.message}`,
      };
    }
  },
});

// Export all tools for registry
export const spotifyTools = {
  connectSpotifyAccount,
  getSpotifyConnectionStatus,
  searchSpotifyContent,
  getTrackDetails,
  getSpotifyRecommendations,
  getSpotifyDevices,
  getCurrentPlayback,
  controlSpotifyPlayback,
};
