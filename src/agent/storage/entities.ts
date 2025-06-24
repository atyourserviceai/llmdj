/**
 * Music-specific data persistence layer for LLMDJ Agent.
 * This handles Spotify profile data, music preferences, listening history, and playlist management.
 */

import type { AppAgent } from "../AppAgent";

// =====================================
// Music-Specific Data Structures
// =====================================

/**
 * Spotify user profile information and connection status
 */
export interface SpotifyProfile {
  id: string;
  spotifyUserId: string;
  displayName: string;
  email?: string;
  country?: string;
  product: "premium" | "free"; // Spotify subscription type
  images?: Array<{
    url: string;
    height?: number;
    width?: number;
  }>;
  followers?: number;

  // Connection status
  isConnected: boolean;
  accessToken?: string; // Should be encrypted in production
  refreshToken?: string; // Should be encrypted in production
  tokenExpiresAt?: Date;

  // Last activity
  lastSyncAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User's music preferences and taste profile
 */
export interface MusicPreferences {
  id: string;
  userId: string;

  // Genre preferences (weighted scores 0-1)
  favoriteGenres: Array<{
    genre: string;
    score: number; // 0-1 preference strength
  }>;

  // Audio feature preferences
  audioFeaturePreferences: {
    energy: { min: number; max: number; preferred: number }; // 0-1
    valence: { min: number; max: number; preferred: number }; // 0-1 (mood)
    danceability: { min: number; max: number; preferred: number }; // 0-1
    tempo: { min: number; max: number; preferred: number }; // BPM
    acousticness: { min: number; max: number; preferred: number }; // 0-1
    instrumentalness: { min: number; max: number; preferred: number }; // 0-1
  };

  // Listening context preferences
  contextPreferences: Array<{
    context:
      | "workout"
      | "study"
      | "party"
      | "relaxation"
      | "commute"
      | "work"
      | "sleep"
      | "other";
    preferredGenres: string[];
    preferredFeatures: Partial<MusicPreferences["audioFeaturePreferences"]>;
  }>;

  // Time-based preferences
  timePreferences: {
    morning?: string[]; // Preferred genres for morning
    afternoon?: string[];
    evening?: string[];
    night?: string[];
  };

  // Discovery preferences
  discoverySettings: {
    openToNewGenres: boolean;
    preferenceForPopular: number; // 0-1, 0=niche, 1=mainstream
    explicitContent: boolean;
    languagePreferences: string[]; // Language codes
  };

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Track listening history and user interaction data
 */
export interface ListeningHistory {
  id: string;
  userId: string;
  spotifyTrackId: string;

  // Track info (cached for performance)
  trackName: string;
  artistName: string;
  albumName: string;
  genres: string[];
  audioFeatures?: {
    energy: number;
    valence: number;
    danceability: number;
    tempo: number;
    acousticness: number;
    instrumentalness: number;
  };

  // Listening data
  playedAt: Date;
  context?: "playlist" | "album" | "artist" | "search" | "recommendation";
  contextId?: string; // Playlist ID, album ID, etc.
  playDuration?: number; // Seconds played
  skipped: boolean;
  liked: boolean;

  // Interaction context
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
  listeningContext?:
    | "workout"
    | "study"
    | "party"
    | "relaxation"
    | "commute"
    | "work"
    | "sleep"
    | "other";
  mood?: string; // User-specified or inferred mood

  createdAt: Date;
}

/**
 * Custom playlist data and management
 */
export interface PlaylistData {
  id: string;
  userId: string;
  spotifyPlaylistId?: string; // If synced to Spotify

  // Playlist metadata
  name: string;
  description?: string;
  isPublic: boolean;
  collaborative: boolean;

  // Playlist strategy and goals
  purpose?:
    | "workout"
    | "study"
    | "party"
    | "relaxation"
    | "commute"
    | "work"
    | "sleep"
    | "discovery"
    | "other";
  targetMood?: string;
  targetGenres: string[];
  targetAudioFeatures?: Partial<MusicPreferences["audioFeaturePreferences"]>;

  // Track management
  tracks: Array<{
    spotifyTrackId: string;
    addedAt: Date;
    addedBy: "user" | "agent" | "recommendation";
    order: number;
  }>;

  // Performance tracking
  metrics: {
    totalPlays: number;
    averageSkipRate: number;
    userRating?: number; // 1-5 user rating
    lastPlayedAt?: Date;
  };

  // Version control for collaborative editing
  version: number;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Music session data to maintain conversation context
 */
export interface MusicSession {
  id: string;
  userId: string;

  // Current session state
  isActive: boolean;
  currentTrack?: {
    spotifyTrackId: string;
    name: string;
    artist: string;
    startedAt: Date;
  };
  currentContext?: "playlist" | "album" | "artist" | "radio" | "queue";
  currentContextId?: string;
  currentMood?: string;
  currentActivity?: string;

  // Session preferences
  sessionGenres: string[];
  sessionPreferences: Partial<MusicPreferences["audioFeaturePreferences"]>;

  // Recommendation tracking
  recommendations: Array<{
    trackId: string;
    recommendedAt: Date;
    accepted: boolean;
    reason: string; // Why this was recommended
  }>;

  // Device information
  activeDeviceId?: string;
  deviceName?: string;

  startedAt: Date;
  endedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// =====================================
// Storage Functions
// =====================================

/**
 * Spotify Profile Management
 */
export async function storeSpotifyProfile(
  agent: AppAgent,
  profile: SpotifyProfile
): Promise<void> {
  console.log(`Storing Spotify profile for user ${profile.spotifyUserId}`);
  try {
    await agent.sql`
      INSERT INTO spotify_profiles (
        id, spotify_user_id, display_name, email, country, product,
        images, followers, is_connected, access_token, refresh_token, token_expires_at, last_sync_at,
        created_at, updated_at
      ) VALUES (
        ${profile.id}, ${profile.spotifyUserId}, ${profile.displayName},
        ${profile.email || null}, ${profile.country || null}, ${profile.product},
        ${JSON.stringify(profile.images || null)}, ${profile.followers || null},
        ${profile.isConnected}, ${profile.accessToken || null}, ${profile.refreshToken || null}, ${profile.tokenExpiresAt?.toISOString() || null},
        ${profile.lastSyncAt.toISOString()}, ${profile.createdAt.toISOString()},
        ${profile.updatedAt.toISOString()}
      )
      ON CONFLICT (spotify_user_id) DO UPDATE SET
        id = EXCLUDED.id,
        display_name = EXCLUDED.display_name,
        email = EXCLUDED.email,
        country = EXCLUDED.country,
        product = EXCLUDED.product,
        images = EXCLUDED.images,
        followers = EXCLUDED.followers,
        is_connected = EXCLUDED.is_connected,
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        token_expires_at = EXCLUDED.token_expires_at,
        last_sync_at = EXCLUDED.last_sync_at,
        updated_at = EXCLUDED.updated_at
    `;
    console.log(
      `Successfully stored/updated Spotify profile for user ${profile.spotifyUserId}`
    );
  } catch (error) {
    console.error("Error storing Spotify profile:", error);
    throw error;
  }

  // Debug: Always verify what was stored, regardless of errors above
  try {
    console.log("[storeSpotifyProfile] Verifying stored profile...");
    const verifyResult = await agent.sql`
      SELECT id, spotify_user_id, display_name, is_connected, access_token, refresh_token
      FROM spotify_profiles
      WHERE spotify_user_id = ${profile.spotifyUserId}
    `;
    console.log("[storeSpotifyProfile] Verification result:", {
      found: verifyResult.length > 0,
      count: verifyResult.length,
      data:
        verifyResult.length > 0
          ? {
              id: verifyResult[0].id,
              spotify_user_id: verifyResult[0].spotify_user_id,
              display_name: verifyResult[0].display_name,
              is_connected: verifyResult[0].is_connected,
              has_access_token: !!verifyResult[0].access_token,
              has_refresh_token: !!verifyResult[0].refresh_token,
            }
          : null,
    });
  } catch (verifyError) {
    console.error("[storeSpotifyProfile] Verification failed:", verifyError);
  }
}

export async function getSpotifyProfile(
  agent: AppAgent,
  userId: string
): Promise<SpotifyProfile | null> {
  try {
    const result = await agent.sql`
      SELECT * FROM spotify_profiles WHERE spotify_user_id = ${userId}
    `;

    if (result.length === 0) return null;

    // biome-ignore lint/suspicious/noExplicitAny: SQLite results are dynamic
    const row = result[0] as any;
    return {
      id: String(row.id),
      spotifyUserId: String(row.spotify_user_id),
      displayName: String(row.display_name),
      email: row.email ? String(row.email) : undefined,
      country: row.country ? String(row.country) : undefined,
      product: String(row.product) as "premium" | "free",
      images:
        row.images && row.images !== "null"
          ? JSON.parse(String(row.images))
          : undefined,
      followers: row.followers ? Number(row.followers) : undefined,
      isConnected: Boolean(row.is_connected),
      tokenExpiresAt: row.token_expires_at
        ? new Date(String(row.token_expires_at))
        : undefined,
      lastSyncAt: new Date(String(row.last_sync_at)),
      createdAt: new Date(String(row.created_at)),
      updatedAt: new Date(String(row.updated_at)),
    };
  } catch (error) {
    console.error("Error getting Spotify profile:", error);
    return null;
  }
}

/**
 * Get the connected Spotify profile for the app user (since this is a single-user agent)
 * This is a helper function that finds the first connected Spotify profile
 */
export async function getConnectedSpotifyProfile(
  agent: AppAgent
): Promise<SpotifyProfile | null> {
  try {
    console.log("[getConnectedSpotifyProfile] Starting database query...");

    const result = await agent.sql`
      SELECT * FROM spotify_profiles
      WHERE is_connected = 1
      ORDER BY last_sync_at DESC
      LIMIT 1
    `;

    console.log("[getConnectedSpotifyProfile] Query result:", {
      resultCount: result.length,
      hasResults: result.length > 0,
    });

    if (result.length === 0) {
      console.log("[getConnectedSpotifyProfile] No connected profiles found");
      return null;
    }

    // biome-ignore lint/suspicious/noExplicitAny: SQLite results are dynamic
    const row = result[0] as any;
    console.log("[getConnectedSpotifyProfile] Raw row data:", {
      id: row.id,
      spotify_user_id: row.spotify_user_id,
      display_name: row.display_name,
      is_connected: row.is_connected,
      has_access_token: !!row.access_token,
      has_refresh_token: !!row.refresh_token,
    });

    const profile = {
      id: String(row.id),
      spotifyUserId: String(row.spotify_user_id),
      displayName: String(row.display_name),
      email: row.email ? String(row.email) : undefined,
      country: row.country ? String(row.country) : undefined,
      product: String(row.product) as "premium" | "free",
      images:
        row.images && row.images !== "null"
          ? JSON.parse(String(row.images))
          : undefined,
      followers: row.followers ? Number(row.followers) : undefined,
      isConnected: Boolean(row.is_connected),
      accessToken: row.access_token ? String(row.access_token) : undefined,
      refreshToken: row.refresh_token ? String(row.refresh_token) : undefined,
      tokenExpiresAt: row.token_expires_at
        ? new Date(String(row.token_expires_at))
        : undefined,
      lastSyncAt: new Date(String(row.last_sync_at)),
      createdAt: new Date(String(row.created_at)),
      updatedAt: new Date(String(row.updated_at)),
    };

    console.log("[getConnectedSpotifyProfile] Mapped profile data:", {
      id: profile.id,
      spotifyUserId: profile.spotifyUserId,
      displayName: profile.displayName,
      isConnected: profile.isConnected,
      hasAccessToken: !!profile.accessToken,
      hasRefreshToken: !!profile.refreshToken,
      tokenExpiresAt: profile.tokenExpiresAt?.toISOString(),
    });

    return profile;
  } catch (error) {
    console.error("Error getting connected Spotify profile:", error);
    return null;
  }
}

/**
 * Music Preferences Management
 */
export async function storeMusicPreferences(
  agent: AppAgent,
  preferences: MusicPreferences
): Promise<void> {
  console.log(`Storing music preferences for user ${preferences.userId}`);
  try {
    await agent.sql`
      INSERT INTO music_preferences (
        id, user_id, favorite_genres, audio_feature_preferences,
        context_preferences, time_preferences, discovery_settings,
        created_at, updated_at
      ) VALUES (
        ${preferences.id}, ${preferences.userId},
        ${JSON.stringify(preferences.favoriteGenres)},
        ${JSON.stringify(preferences.audioFeaturePreferences)},
        ${JSON.stringify(preferences.contextPreferences)},
        ${JSON.stringify(preferences.timePreferences)},
        ${JSON.stringify(preferences.discoverySettings)},
        ${preferences.createdAt.toISOString()}, ${preferences.updatedAt.toISOString()}
      )
      ON CONFLICT (id) DO UPDATE SET
        favorite_genres = EXCLUDED.favorite_genres,
        audio_feature_preferences = EXCLUDED.audio_feature_preferences,
        context_preferences = EXCLUDED.context_preferences,
        time_preferences = EXCLUDED.time_preferences,
        discovery_settings = EXCLUDED.discovery_settings,
        updated_at = EXCLUDED.updated_at
    `;
  } catch (error) {
    console.error("Error storing music preferences:", error);
    throw error;
  }
}

export async function getMusicPreferences(
  agent: AppAgent,
  userId: string
): Promise<MusicPreferences | null> {
  try {
    const result = await agent.sql`
      SELECT * FROM music_preferences WHERE user_id = ${userId}
    `;

    if (result.length === 0) return null;

    const row = result[0];
    return {
      id: row.id,
      userId: row.user_id,
      favoriteGenres: JSON.parse(row.favorite_genres),
      audioFeaturePreferences: JSON.parse(row.audio_feature_preferences),
      contextPreferences: JSON.parse(row.context_preferences),
      timePreferences: JSON.parse(row.time_preferences),
      discoverySettings: JSON.parse(row.discovery_settings),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  } catch (error) {
    console.error("Error getting music preferences:", error);
    return null;
  }
}

/**
 * Listening History Management
 */
export async function addListeningRecord(
  agent: AppAgent,
  record: ListeningHistory
): Promise<void> {
  console.log(`Adding listening record for track ${record.spotifyTrackId}`);
  try {
    await agent.sql`
      INSERT INTO listening_history (
        id, user_id, spotify_track_id, track_name, artist_name, album_name,
        genres, audio_features, played_at, context, context_id, play_duration,
        skipped, liked, time_of_day, listening_context, mood, created_at
      ) VALUES (
        ${record.id}, ${record.userId}, ${record.spotifyTrackId},
        ${record.trackName}, ${record.artistName}, ${record.albumName},
        ${JSON.stringify(record.genres)}, ${JSON.stringify(record.audioFeatures)},
        ${record.playedAt.toISOString()}, ${record.context}, ${record.contextId},
        ${record.playDuration}, ${record.skipped}, ${record.liked},
        ${record.timeOfDay}, ${record.listeningContext}, ${record.mood},
        ${record.createdAt.toISOString()}
      )
    `;
  } catch (error) {
    console.error("Error adding listening record:", error);
    throw error;
  }
}

export async function getRecentListeningHistory(
  agent: AppAgent,
  userId: string,
  limit = 50
): Promise<ListeningHistory[]> {
  try {
    const result = await agent.sql`
      SELECT * FROM listening_history
      WHERE user_id = ${userId}
      ORDER BY played_at DESC
      LIMIT ${limit}
    `;

    return result.map((row) => ({
      id: row.id,
      userId: row.user_id,
      spotifyTrackId: row.spotify_track_id,
      trackName: row.track_name,
      artistName: row.artist_name,
      albumName: row.album_name,
      genres: JSON.parse(row.genres || "[]"),
      audioFeatures: row.audio_features
        ? JSON.parse(row.audio_features)
        : undefined,
      playedAt: new Date(row.played_at),
      context: row.context,
      contextId: row.context_id,
      playDuration: row.play_duration,
      skipped: row.skipped,
      liked: row.liked,
      timeOfDay: row.time_of_day,
      listeningContext: row.listening_context,
      mood: row.mood,
      createdAt: new Date(row.created_at),
    }));
  } catch (error) {
    console.error("Error getting listening history:", error);
    return [];
  }
}

/**
 * Playlist Data Management
 */
export async function storePlaylistData(
  agent: AppAgent,
  playlist: PlaylistData
): Promise<void> {
  console.log(`Storing playlist data for ${playlist.name}`);
  try {
    await agent.sql`
      INSERT INTO playlist_data (
        id, user_id, spotify_playlist_id, name, description, is_public,
        collaborative, purpose, target_mood, target_genres, target_audio_features,
        tracks, metrics, version, created_at, updated_at
      ) VALUES (
        ${playlist.id}, ${playlist.userId}, ${playlist.spotifyPlaylistId},
        ${playlist.name}, ${playlist.description}, ${playlist.isPublic},
        ${playlist.collaborative}, ${playlist.purpose}, ${playlist.targetMood},
        ${JSON.stringify(playlist.targetGenres)}, ${JSON.stringify(playlist.targetAudioFeatures)},
        ${JSON.stringify(playlist.tracks)}, ${JSON.stringify(playlist.metrics)},
        ${playlist.version}, ${playlist.createdAt.toISOString()}, ${playlist.updatedAt.toISOString()}
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        is_public = EXCLUDED.is_public,
        collaborative = EXCLUDED.collaborative,
        target_mood = EXCLUDED.target_mood,
        target_genres = EXCLUDED.target_genres,
        target_audio_features = EXCLUDED.target_audio_features,
        tracks = EXCLUDED.tracks,
        metrics = EXCLUDED.metrics,
        version = EXCLUDED.version,
        updated_at = EXCLUDED.updated_at
    `;
  } catch (error) {
    console.error("Error storing playlist data:", error);
    throw error;
  }
}

export async function getUserPlaylists(
  agent: AppAgent,
  userId: string
): Promise<PlaylistData[]> {
  try {
    const result = await agent.sql`
      SELECT * FROM playlist_data
      WHERE user_id = ${userId}
      ORDER BY updated_at DESC
    `;

    return result.map((row) => ({
      id: row.id,
      userId: row.user_id,
      spotifyPlaylistId: row.spotify_playlist_id,
      name: row.name,
      description: row.description,
      isPublic: row.is_public,
      collaborative: row.collaborative,
      purpose: row.purpose,
      targetMood: row.target_mood,
      targetGenres: JSON.parse(row.target_genres || "[]"),
      targetAudioFeatures: row.target_audio_features
        ? JSON.parse(row.target_audio_features)
        : undefined,
      tracks: JSON.parse(row.tracks || "[]"),
      metrics: JSON.parse(row.metrics || "{}"),
      version: row.version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    }));
  } catch (error) {
    console.error("Error getting user playlists:", error);
    return [];
  }
}

/**
 * Music Session Management
 */
export async function storeCurrentSession(
  agent: AppAgent,
  session: MusicSession
): Promise<void> {
  console.log(`Storing music session for user ${session.userId}`);
  try {
    await agent.sql`
      INSERT INTO music_sessions (
        id, user_id, is_active, current_track, current_context, current_context_id,
        current_mood, current_activity, session_genres, session_preferences,
        recommendations, active_device_id, device_name, started_at, ended_at,
        created_at, updated_at
      ) VALUES (
        ${session.id}, ${session.userId}, ${session.isActive},
        ${JSON.stringify(session.currentTrack)}, ${session.currentContext}, ${session.currentContextId},
        ${session.currentMood}, ${session.currentActivity}, ${JSON.stringify(session.sessionGenres)},
        ${JSON.stringify(session.sessionPreferences)}, ${JSON.stringify(session.recommendations)},
        ${session.activeDeviceId}, ${session.deviceName}, ${session.startedAt.toISOString()},
        ${session.endedAt?.toISOString()}, ${session.createdAt.toISOString()}, ${session.updatedAt.toISOString()}
      )
      ON CONFLICT (id) DO UPDATE SET
        is_active = EXCLUDED.is_active,
        current_track = EXCLUDED.current_track,
        current_context = EXCLUDED.current_context,
        current_context_id = EXCLUDED.current_context_id,
        current_mood = EXCLUDED.current_mood,
        current_activity = EXCLUDED.current_activity,
        session_preferences = EXCLUDED.session_preferences,
        recommendations = EXCLUDED.recommendations,
        active_device_id = EXCLUDED.active_device_id,
        device_name = EXCLUDED.device_name,
        ended_at = EXCLUDED.ended_at,
        updated_at = EXCLUDED.updated_at
    `;
  } catch (error) {
    console.error("Error storing music session:", error);
    throw error;
  }
}

export async function getCurrentSession(
  agent: AppAgent,
  userId: string
): Promise<MusicSession | null> {
  try {
    const result = await agent.sql`
      SELECT * FROM music_sessions
      WHERE user_id = ${userId} AND is_active = true
      ORDER BY started_at DESC
      LIMIT 1
    `;

    if (result.length === 0) return null;

    const row = result[0];
    return {
      id: row.id,
      userId: row.user_id,
      isActive: row.is_active,
      currentTrack: row.current_track
        ? JSON.parse(row.current_track)
        : undefined,
      currentContext: row.current_context,
      currentContextId: row.current_context_id,
      currentMood: row.current_mood,
      currentActivity: row.current_activity,
      sessionGenres: JSON.parse(row.session_genres || "[]"),
      sessionPreferences: JSON.parse(row.session_preferences || "{}"),
      recommendations: JSON.parse(row.recommendations || "[]"),
      activeDeviceId: row.active_device_id,
      deviceName: row.device_name,
      startedAt: new Date(row.started_at),
      endedAt: row.ended_at ? new Date(row.ended_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  } catch (error) {
    console.error("Error getting current session:", error);
    return null;
  }
}
