/**
 * Music-specific history tracking for LLMDJ Agent.
 * Tracks music sessions, playlist creation, and recommendation history.
 */

import type { AppAgent } from "../AppAgent";

// =====================================
// Music History Types
// =====================================

/**
 * Music session activity tracking
 */
export interface MusicSessionEntry {
  id: string;
  userId: string;
  sessionId: string;

  // Activity details
  timestamp: string;
  activityType:
    | "session_start"
    | "session_end"
    | "track_play"
    | "track_skip"
    | "track_like"
    | "track_dislike"
    | "playlist_create"
    | "playlist_modify"
    | "recommendation_accept"
    | "recommendation_reject"
    | "device_switch"
    | "mood_change";

  // Context data
  trackId?: string;
  trackName?: string;
  artistName?: string;
  playlistId?: string;
  playlistName?: string;
  deviceId?: string;
  deviceName?: string;
  mood?: string;
  context?: string; // What the user was doing

  // Performance metrics
  duration?: number; // Seconds for plays, or session duration
  skipPosition?: number; // Where in the track they skipped
  userRating?: number; // 1-5 if they rated something

  createdAt: Date;
}

/**
 * Playlist creation and modification history
 */
export interface PlaylistHistoryEntry {
  id: string;
  userId: string;
  playlistId: string;

  // Change details
  timestamp: string;
  action:
    | "created"
    | "renamed"
    | "description_changed"
    | "track_added"
    | "track_removed"
    | "track_reordered"
    | "shared"
    | "privacy_changed"
    | "collaborated";

  // Change data
  trackId?: string; // For track operations
  trackName?: string;
  artistName?: string;
  oldValue?: string; // Previous name, description, etc.
  newValue?: string; // New name, description, etc.
  position?: number; // For reordering

  // Context
  reason?: string; // Why the change was made
  source: "user" | "agent" | "recommendation" | "automated";

  createdAt: Date;
}

/**
 * Music recommendation tracking
 */
export interface RecommendationHistoryEntry {
  id: string;
  userId: string;
  sessionId?: string;

  // Recommendation details
  timestamp: string;
  type: "track" | "artist" | "album" | "playlist" | "genre";
  recommendationId: string; // Spotify ID of recommended item
  recommendationName: string;
  artistName?: string; // For tracks/albums

  // Recommendation logic
  reason: string; // Why this was recommended
  basedOn: Array<{
    type:
      | "track"
      | "artist"
      | "playlist"
      | "mood"
      | "context"
      | "time"
      | "weather"
      | "user_history";
    value: string;
  }>;

  // User response
  userAction?:
    | "accepted"
    | "rejected"
    | "played"
    | "skipped"
    | "saved"
    | "added_to_playlist"
    | "ignored";
  responseTime?: number; // How long before user responded
  playDuration?: number; // How long they listened if played

  // Success metrics
  wasSuccessful?: boolean; // Did they seem to like it?
  confidence: number; // 0-1 how confident the algorithm was

  createdAt: Date;
}

/**
 * User music discovery journey tracking
 */
export interface DiscoveryHistoryEntry {
  id: string;
  userId: string;

  // Discovery event
  timestamp: string;
  discoveryType:
    | "new_genre"
    | "new_artist"
    | "new_track"
    | "new_feature"
    | "mood_exploration"
    | "context_exploration";

  // What was discovered
  genreName?: string;
  artistId?: string;
  artistName?: string;
  trackId?: string;
  trackName?: string;
  featureName?: string; // Spotify feature like 'valence', 'energy'

  // How it was discovered
  discoveryMethod:
    | "search"
    | "recommendation"
    | "playlist"
    | "radio"
    | "browse"
    | "conversation";
  sourceContext?: string; // What led to this discovery

  // User engagement
  engagementLevel: "high" | "medium" | "low"; // Based on interaction patterns
  followUpActions: string[]; // What they did after discovering

  createdAt: Date;
}

// =====================================
// History Storage Functions
// =====================================

/**
 * Music Session Activity Tracking
 */
export async function addMusicSessionEntry(
  agent: AppAgent,
  entry: Omit<MusicSessionEntry, "id" | "createdAt">
): Promise<MusicSessionEntry> {
  const fullEntry: MusicSessionEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date(),
  };

  console.log(
    `Adding music session entry: ${fullEntry.activityType} for user ${fullEntry.userId}`
  );

  try {
    await agent.sql`
      INSERT INTO music_session_history (
        id, user_id, session_id, timestamp, activity_type,
        track_id, track_name, artist_name, playlist_id, playlist_name,
        device_id, device_name, mood, context, duration,
        skip_position, user_rating, created_at
      ) VALUES (
        ${fullEntry.id}, ${fullEntry.userId}, ${fullEntry.sessionId},
        ${fullEntry.timestamp}, ${fullEntry.activityType},
        ${fullEntry.trackId || null}, ${fullEntry.trackName || null}, ${fullEntry.artistName || null},
        ${fullEntry.playlistId || null}, ${fullEntry.playlistName || null},
        ${fullEntry.deviceId || null}, ${fullEntry.deviceName || null},
        ${fullEntry.mood || null}, ${fullEntry.context || null}, ${fullEntry.duration || null},
        ${fullEntry.skipPosition || null}, ${fullEntry.userRating || null}, ${fullEntry.createdAt.toISOString()}
      )
    `;
  } catch (error) {
    console.error("Error adding music session entry:", error);
  }

  return fullEntry;
}

export async function getSessionHistory(
  agent: AppAgent,
  sessionId: string,
  limit = 100
): Promise<MusicSessionEntry[]> {
  try {
    const result = await agent.sql`
      SELECT * FROM music_session_history
      WHERE session_id = ${sessionId}
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    return result.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      userId: String(row.user_id),
      sessionId: String(row.session_id),
      timestamp: String(row.timestamp),
      activityType: String(
        row.activity_type
      ) as MusicSessionEntry["activityType"],
      trackId: row.track_id ? String(row.track_id) : undefined,
      trackName: row.track_name ? String(row.track_name) : undefined,
      artistName: row.artist_name ? String(row.artist_name) : undefined,
      playlistId: row.playlist_id ? String(row.playlist_id) : undefined,
      playlistName: row.playlist_name ? String(row.playlist_name) : undefined,
      deviceId: row.device_id ? String(row.device_id) : undefined,
      deviceName: row.device_name ? String(row.device_name) : undefined,
      mood: row.mood ? String(row.mood) : undefined,
      context: row.context ? String(row.context) : undefined,
      duration: row.duration ? Number(row.duration) : undefined,
      skipPosition: row.skip_position ? Number(row.skip_position) : undefined,
      userRating: row.user_rating ? Number(row.user_rating) : undefined,
      createdAt: new Date(String(row.created_at)),
    }));
  } catch (error) {
    console.error("Error getting session history:", error);
    return [];
  }
}

/**
 * Playlist History Tracking
 */
export async function addPlaylistHistoryEntry(
  agent: AppAgent,
  entry: Omit<PlaylistHistoryEntry, "id" | "createdAt">
): Promise<PlaylistHistoryEntry> {
  const fullEntry: PlaylistHistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date(),
  };

  console.log(
    `Adding playlist history: ${fullEntry.action} for playlist ${fullEntry.playlistId}`
  );

  try {
    await agent.sql`
      INSERT INTO playlist_history (
        id, user_id, playlist_id, timestamp, action,
        track_id, track_name, artist_name, old_value, new_value,
        position, reason, source, created_at
      ) VALUES (
        ${fullEntry.id}, ${fullEntry.userId}, ${fullEntry.playlistId},
        ${fullEntry.timestamp}, ${fullEntry.action},
        ${fullEntry.trackId || null}, ${fullEntry.trackName || null}, ${fullEntry.artistName || null},
        ${fullEntry.oldValue || null}, ${fullEntry.newValue || null},
        ${fullEntry.position || null}, ${fullEntry.reason || null},
        ${fullEntry.source}, ${fullEntry.createdAt.toISOString()}
      )
    `;
  } catch (error) {
    console.error("Error adding playlist history entry:", error);
  }

  return fullEntry;
}

export async function getPlaylistHistory(
  agent: AppAgent,
  playlistId: string,
  limit = 50
): Promise<PlaylistHistoryEntry[]> {
  try {
    const result = await agent.sql`
      SELECT * FROM playlist_history
      WHERE playlist_id = ${playlistId}
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    return result.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      userId: String(row.user_id),
      playlistId: String(row.playlist_id),
      timestamp: String(row.timestamp),
      action: String(row.action) as PlaylistHistoryEntry["action"],
      trackId: row.track_id ? String(row.track_id) : undefined,
      trackName: row.track_name ? String(row.track_name) : undefined,
      artistName: row.artist_name ? String(row.artist_name) : undefined,
      oldValue: row.old_value ? String(row.old_value) : undefined,
      newValue: row.new_value ? String(row.new_value) : undefined,
      position: row.position ? Number(row.position) : undefined,
      reason: row.reason ? String(row.reason) : undefined,
      source: String(row.source) as PlaylistHistoryEntry["source"],
      createdAt: new Date(String(row.created_at)),
    }));
  } catch (error) {
    console.error("Error getting playlist history:", error);
    return [];
  }
}

/**
 * Recommendation History Tracking
 */
export async function addRecommendationEntry(
  agent: AppAgent,
  entry: Omit<RecommendationHistoryEntry, "id" | "createdAt">
): Promise<RecommendationHistoryEntry> {
  const fullEntry: RecommendationHistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date(),
  };

  console.log(
    `Adding recommendation: ${fullEntry.type} ${fullEntry.recommendationName} for user ${fullEntry.userId}`
  );

  try {
    await agent.sql`
      INSERT INTO recommendation_history (
        id, user_id, session_id, timestamp, type, recommendation_id,
        recommendation_name, artist_name, reason, based_on, user_action,
        response_time, play_duration, was_successful, confidence, created_at
      ) VALUES (
        ${fullEntry.id}, ${fullEntry.userId}, ${fullEntry.sessionId || null},
        ${fullEntry.timestamp}, ${fullEntry.type}, ${fullEntry.recommendationId},
        ${fullEntry.recommendationName}, ${fullEntry.artistName || null},
        ${fullEntry.reason}, ${JSON.stringify(fullEntry.basedOn)},
        ${fullEntry.userAction || null}, ${fullEntry.responseTime || null},
        ${fullEntry.playDuration || null}, ${fullEntry.wasSuccessful || null},
        ${fullEntry.confidence}, ${fullEntry.createdAt.toISOString()}
      )
    `;
  } catch (error) {
    console.error("Error adding recommendation entry:", error);
  }

  return fullEntry;
}

export async function getRecommendationHistory(
  agent: AppAgent,
  userId: string,
  limit = 50
): Promise<RecommendationHistoryEntry[]> {
  try {
    const result = await agent.sql`
      SELECT * FROM recommendation_history
      WHERE user_id = ${userId}
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    return result.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      userId: String(row.user_id),
      sessionId: row.session_id ? String(row.session_id) : undefined,
      timestamp: String(row.timestamp),
      type: String(row.type) as RecommendationHistoryEntry["type"],
      recommendationId: String(row.recommendation_id),
      recommendationName: String(row.recommendation_name),
      artistName: row.artist_name ? String(row.artist_name) : undefined,
      reason: String(row.reason),
      basedOn: JSON.parse(String(row.based_on)),
      userAction: row.user_action
        ? (String(row.user_action) as RecommendationHistoryEntry["userAction"])
        : undefined,
      responseTime: row.response_time ? Number(row.response_time) : undefined,
      playDuration: row.play_duration ? Number(row.play_duration) : undefined,
      wasSuccessful:
        row.was_successful !== null ? Boolean(row.was_successful) : undefined,
      confidence: Number(row.confidence),
      createdAt: new Date(String(row.created_at)),
    }));
  } catch (error) {
    console.error("Error getting recommendation history:", error);
    return [];
  }
}

/**
 * Discovery Journey Tracking
 */
export async function addDiscoveryEntry(
  agent: AppAgent,
  entry: Omit<DiscoveryHistoryEntry, "id" | "createdAt">
): Promise<DiscoveryHistoryEntry> {
  const fullEntry: DiscoveryHistoryEntry = {
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date(),
  };

  console.log(
    `Adding discovery entry: ${fullEntry.discoveryType} for user ${fullEntry.userId}`
  );

  try {
    await agent.sql`
      INSERT INTO discovery_history (
        id, user_id, timestamp, discovery_type, genre_name,
        artist_id, artist_name, track_id, track_name, feature_name,
        discovery_method, source_context, engagement_level, follow_up_actions, created_at
      ) VALUES (
        ${fullEntry.id}, ${fullEntry.userId}, ${fullEntry.timestamp},
        ${fullEntry.discoveryType}, ${fullEntry.genreName || null},
        ${fullEntry.artistId || null}, ${fullEntry.artistName || null},
        ${fullEntry.trackId || null}, ${fullEntry.trackName || null}, ${fullEntry.featureName || null},
        ${fullEntry.discoveryMethod}, ${fullEntry.sourceContext || null},
        ${fullEntry.engagementLevel}, ${JSON.stringify(fullEntry.followUpActions)}, ${fullEntry.createdAt.toISOString()}
      )
    `;
  } catch (error) {
    console.error("Error adding discovery entry:", error);
  }

  return fullEntry;
}

export async function getUserDiscoveryHistory(
  agent: AppAgent,
  userId: string,
  limit = 100
): Promise<DiscoveryHistoryEntry[]> {
  try {
    const result = await agent.sql`
      SELECT * FROM discovery_history
      WHERE user_id = ${userId}
      ORDER BY timestamp DESC
      LIMIT ${limit}
    `;

    return result.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      userId: String(row.user_id),
      timestamp: String(row.timestamp),
      discoveryType: String(
        row.discovery_type
      ) as DiscoveryHistoryEntry["discoveryType"],
      genreName: row.genre_name ? String(row.genre_name) : undefined,
      artistId: row.artist_id ? String(row.artist_id) : undefined,
      artistName: row.artist_name ? String(row.artist_name) : undefined,
      trackId: row.track_id ? String(row.track_id) : undefined,
      trackName: row.track_name ? String(row.track_name) : undefined,
      featureName: row.feature_name ? String(row.feature_name) : undefined,
      discoveryMethod: String(
        row.discovery_method
      ) as DiscoveryHistoryEntry["discoveryMethod"],
      sourceContext: row.source_context
        ? String(row.source_context)
        : undefined,
      engagementLevel: String(
        row.engagement_level
      ) as DiscoveryHistoryEntry["engagementLevel"],
      followUpActions: JSON.parse(String(row.follow_up_actions)),
      createdAt: new Date(String(row.created_at)),
    }));
  } catch (error) {
    console.error("Error getting discovery history:", error);
    return [];
  }
}

/**
 * Analytics and Insights Functions
 */

/**
 * Get user's music engagement patterns
 */
export async function getMusicEngagementInsights(
  agent: AppAgent,
  userId: string,
  days = 30
): Promise<{
  totalSessions: number;
  totalPlaytime: number;
  averageSessionDuration: number;
  topGenres: Array<{ genre: string; count: number }>;
  skipRate: number;
  discoveryRate: number;
}> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // This would need complex SQL queries to calculate insights
    // Placeholder implementation
    console.log(
      `Calculating music engagement insights for user ${userId} over ${days} days`
    );

    return {
      totalSessions: 0,
      totalPlaytime: 0,
      averageSessionDuration: 0,
      topGenres: [],
      skipRate: 0,
      discoveryRate: 0,
    };
  } catch (error) {
    console.error("Error getting engagement insights:", error);
    return {
      totalSessions: 0,
      totalPlaytime: 0,
      averageSessionDuration: 0,
      topGenres: [],
      skipRate: 0,
      discoveryRate: 0,
    };
  }
}

/**
 * Get recommendation effectiveness metrics
 */
export async function getRecommendationEffectiveness(
  agent: AppAgent,
  userId: string,
  days = 30
): Promise<{
  totalRecommendations: number;
  acceptanceRate: number;
  averageConfidence: number;
  topSuccessfulReasons: Array<{ reason: string; successRate: number }>;
}> {
  try {
    console.log(
      `Calculating recommendation effectiveness for user ${userId} over ${days} days`
    );

    // This would calculate from recommendation_history table
    // Placeholder implementation
    return {
      totalRecommendations: 0,
      acceptanceRate: 0,
      averageConfidence: 0,
      topSuccessfulReasons: [],
    };
  } catch (error) {
    console.error("Error getting recommendation effectiveness:", error);
    return {
      totalRecommendations: 0,
      acceptanceRate: 0,
      averageConfidence: 0,
      topSuccessfulReasons: [],
    };
  }
}
