import { createOpenAI } from "@ai-sdk/openai";
// import { createAnthropic } from "@ai-sdk/anthropic";
// import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { Schedule } from "agents";
import type { AgentContext } from "agents";
import type { Connection } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  type StreamTextOnFinishCallback,
  type ToolSet,
  createDataStreamResponse,
  generateId,
  streamText,
} from "ai";
import type { Message } from "@ai-sdk/ui-utils";
import { getUnifiedSystemPrompt } from "./prompts/index";
import { executions, tools } from "./tools/registry";
import { processToolCalls } from "./utils/tool-utils";
import {
  exportAgentData,
  importAgentData,
  type ImportRequest,
  type DatabaseExportResult,
} from "./utils/export-import-utils";
import type {
  Operator,
  AdminContact,
  TestResult,
  ToolDocumentation,
  TestReport,
  TransitionRecommendation,
  TypedRecord,
} from "./types/generic";
import { DEBUG_TOOLS } from "../utils/tool-registry";

// AI @ Your Service Gateway configuration
const getOpenAI = (env: Env) => {
  return createOpenAI({
    apiKey: env.GATEWAY_API_KEY,
    baseURL: `${env.GATEWAY_BASE_URL}/v1/openai`,
  });
};

/*
// AI @ Your Service Gateway configuration for Anthropic
const getAnthropic = (env: Env) => {
  return createAnthropic({
    apiKey: env.GATEWAY_API_KEY,
    baseURL: `${env.GATEWAY_BASE_URL}/v1/anthropic`,
  });
};
*/

/*
// AI @ Your Service Gateway configuration for Gemini
const getGemini = (env: Env) => {
  return createGoogleGenerativeAI({
    apiKey: env.GATEWAY_API_KEY,
    baseURL: `${env.GATEWAY_BASE_URL}/v1/google-ai-studio`,
  });
};
*/

// Helper function to filter out empty messages for AI provider compatibility
const filterEmptyMessages = (messages: Message[]) => {
  return messages.filter((message, index) => {
    // Allow empty content only for the final assistant message
    const isLastMessage = index === messages.length - 1;
    const isAssistant = message.role === "assistant";
    const hasEmptyContent =
      !message.content ||
      (typeof message.content === "string" && message.content.trim() === "") ||
      (Array.isArray(message.content) && message.content.length === 0);

    // Keep the message if it has content, or if it's the final assistant message
    return !hasEmptyContent || (isLastMessage && isAssistant);
  });
};

// Function to get a detailed error message
export function getErrorMessage(error: unknown): string {
  if (error == null) {
    return "unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return JSON.stringify(error);
}

// Agent operating modes
export type AgentMode = "onboarding" | "integration" | "plan" | "act";

// Define AppAgentState interface for proper typing
export interface AppAgentState {
  mode: AgentMode;
  settings?: {
    language: string; // Main language for the agent (e.g., "en", "es", "fr")
    operators: Operator[];
    adminContact: AdminContact;
    currentUser?: string; // ID of the current operator
  };

  // Onboarding mode state
  onboardingStep?: string;
  isOnboardingComplete: boolean;

  // Integration mode state
  testResults?: TypedRecord<string, TestResult>;
  toolDocumentation?: TypedRecord<string, ToolDocumentation>;
  testReport?: TestReport;
  isIntegrationComplete?: boolean;
  transitionRecommendation?: TransitionRecommendation;

  // Current authenticated user (populated from server-side validation)
  currentUser?: {
    spotifyId: string;
    displayName: string;
    email?: string;
    country?: string;
    product: "premium" | "free";
    followers?: number;
  };

  // Optional metadata
  _lastModeChange?: string;
}

/**
 * Generic Agent implementation with multiple operational modes
 * Can operate as a planning assistant, action executor, or general purpose agent
 */
export class AppAgent extends AIChatAgent<Env> {
  private roomName?: string;

  // Define initial agent state including the current mode
  initialState: AppAgentState = {
    mode: "onboarding" as AgentMode,
    settings: {
      language: "en",
      operators: [],
      adminContact: {
        name: "",
        email: "",
      },
    },
    onboardingStep: "start",
    isOnboardingComplete: false,
    // Integration state
    testResults: {},
    toolDocumentation: {},
    isIntegrationComplete: false,
  };

  // Ensure the current state matches the latest schema, merging in any missing fields
  ensureStateSchema(inputState: AppAgentState | undefined): AppAgentState {
    // Create a local copy of the state to avoid parameter reassignment
    const state = inputState ? { ...inputState } : ({} as AppAgentState);

    // Always ensure a valid mode is set
    if (
      !state ||
      !state.mode ||
      !["onboarding", "integration", "plan", "act"].includes(state.mode)
    ) {
      console.log(
        "[AppAgent] No valid mode found in state, defaulting to onboarding mode"
      );
      state.mode = "onboarding";
    }

    // Ensure settings exists
    if (!state.settings) {
      state.settings = this.initialState.settings;
    } else {
      // Merge settings properties
      if (!state.settings.language)
        state.settings.language = this.initialState.settings?.language || "en";
      if (!state.settings.operators)
        state.settings.operators = this.initialState.settings?.operators || [];
      if (!state.settings.adminContact)
        state.settings.adminContact = this.initialState.settings
          ?.adminContact || { name: "", email: "" };
    }

    return state;
  }

  constructor(ctx: AgentContext, env: Env) {
    super(ctx, env);
    // Load initial state and ensure schema
    const state = this.state as AppAgentState;
    const updatedState = this.ensureStateSchema(state);
    this.setState(updatedState);

    // Initialize database tables
    this.initialize().catch((error) => {
      console.error("Failed to initialize database:", error);
    });
  }

  /**
   * Get system prompt for the agent
   */
  getSystemPrompt() {
    // Use the unified system prompt for all modes
    return getUnifiedSystemPrompt();
  }

  /**
   * Get the appropriate tools based on the current agent mode
   */
  async getToolsForMode() {
    const state = this.state as AppAgentState;
    const mode = state.mode;

    console.log(`[AppAgent] Getting tools for mode: ${mode}`);

    // Base tools available in all modes
    const baseTools = {
      // Context tools
      getWeatherInformation: tools.getWeatherInformation,
      getLocalTime: tools.getLocalTime,

      // Browser tools
      browseWebPage: tools.browseWebPage,
      browseWithBrowserbase: tools.browseWithBrowserbase,
      fetchWebPage: tools.fetchWebPage,

      // Scheduling tools
      scheduleTask: tools.scheduleTask,
      getScheduledTasks: tools.getScheduledTasks,
      cancelScheduledTask: tools.cancelScheduledTask,

      // State tools
      getAgentState: tools.getAgentState,
      setMode: tools.setMode,

      // Messaging tools
      suggestActions: tools.suggestActions,

      // Search tools
      runResearch: tools.runResearch,
    };

    // Mode-specific tools
    switch (mode) {
      case "onboarding":
        // Onboarding mode - enable configuration tools and Spotify connection
        return {
          ...baseTools,
          saveSettings: tools.saveSettings,
          completeOnboarding: tools.completeOnboarding,
          checkExistingConfig: tools.checkExistingConfig,
          getOnboardingStatus: tools.getOnboardingStatus,
          // Spotify connection tools for setup
          showSpotifyAuth: tools.showSpotifyAuth,
          connectSpotifyAccount: tools.connectSpotifyAccount,
          getSpotifyConnectionStatus: tools.getSpotifyConnectionStatus,
          getUserTopTracks: tools.getUserTopTracks,
          getUserTopArtists: tools.getUserTopArtists,
          getUserPlaylists: tools.getUserPlaylists,
          analyzeMusicTaste: tools.analyzeMusicTaste,
          debugSpotifyState: DEBUG_TOOLS[0], // Add debug tool for troubleshooting
        } as ToolSet;

      case "integration":
        // Integration mode - enable testing and documentation tools including all Spotify tools for testing
        return {
          ...baseTools,
          recordTestResult: tools.recordTestResult,
          documentTool: tools.documentTool,
          generateTestReport: tools.generateTestReport,
          completeIntegrationTesting: tools.completeIntegrationTesting,
          testErrorTool: tools.testErrorTool,
          // All Spotify tools for comprehensive testing
          connectSpotifyAccount: tools.connectSpotifyAccount,
          getSpotifyConnectionStatus: tools.getSpotifyConnectionStatus,
          searchSpotifyContent: tools.searchSpotifyContent,
          getTrackDetails: tools.getTrackDetails,
          getSpotifyRecommendations: tools.getSpotifyRecommendations,
          getSpotifyDevices: tools.getSpotifyDevices,
          getCurrentPlayback: tools.getCurrentPlayback,
          controlSpotifyPlayback: tools.controlSpotifyPlayback,
        } as ToolSet;

      case "act":
        // Action mode - enable all tools for execution including full Spotify control
        return {
          ...baseTools,
          testErrorTool: tools.testErrorTool,
          // Full Spotify control for live music operations
          getSpotifyConnectionStatus: tools.getSpotifyConnectionStatus,
          searchSpotifyContent: tools.searchSpotifyContent,
          getTrackDetails: tools.getTrackDetails,
          getSpotifyRecommendations: tools.getSpotifyRecommendations,
          getSpotifyDevices: tools.getSpotifyDevices,
          getCurrentPlayback: tools.getCurrentPlayback,
          controlSpotifyPlayback: tools.controlSpotifyPlayback,
        } as ToolSet;

      default:
        // Planning mode - music discovery and planning tools
        return {
          ...baseTools,
          // Spotify discovery tools for music planning
          getSpotifyConnectionStatus: tools.getSpotifyConnectionStatus,
          searchSpotifyContent: tools.searchSpotifyContent,
          getTrackDetails: tools.getTrackDetails,
          getSpotifyRecommendations: tools.getSpotifyRecommendations,
          getCurrentPlayback: tools.getCurrentPlayback, // Read-only access to see what's playing
        } as ToolSet;
    }
  }

  /**
   * Handles incoming chat messages and manages the response stream
   * @param onFinish - Callback function executed when streaming completes
   * @param options - Optional parameters including abortSignal
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    options?: { abortSignal?: AbortSignal }
  ) {
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    const dataStreamResponse = createDataStreamResponse({
      execute: async (dataStream) => {
        // Get the current mode's tools
        const modeTools = await this.getToolsForMode();
        const state = this.state as AppAgentState;
        const currentMode = state.mode;

        console.log(
          `[AppAgent] Processing chat message in ${currentMode} mode`
        );

        // We don't have MCP implementation yet, so just use mode tools
        // In the future, we can add MCP tools:
        // const allTools = {
        //   ...modeTools,
        //   ...this.mcp.unstable_getAITools(),
        // };
        const allTools = modeTools;

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: this.messages,
          dataStream,
          tools: allTools,
          executions,
        });

        // Filter out empty messages for AI provider compatibility
        const filteredMessages = filterEmptyMessages(processedMessages);

        const openai = getOpenAI(this.env);
        const model = openai("gpt-4.1-2025-04-14");
        /*
        const anthropic = getAnthropic(this.env);
        const model = anthropic("claude-3-5-sonnet-20241022");
        const gemini = getGemini(this.env);
        const model = gemini("gemini-2.0-flash");
        */

        // Get system prompt based on current mode
        const systemPrompt = this.getSystemPrompt();

        // Stream the AI response
        const result = streamText({
          model,
          system: systemPrompt,
          messages: filteredMessages,
          tools: allTools,
          onFinish: async (args) => {
            // Log a message indicating the completion of the request
            console.log(
              `[AppAgent] Completed processing message in ${currentMode} mode`
            );

            // Pass args directly to onFinish callback
            onFinish(
              args as Parameters<StreamTextOnFinishCallback<ToolSet>>[0]
            );
          },
          onError: (error) => {
            console.error("Error while streaming:", error);
          },
          maxSteps: 10,
        });

        // Merge the AI response stream with tool execution outputs
        result.mergeIntoDataStream(dataStream);
      },
      onError: getErrorMessage,
    });

    return dataStreamResponse;
  }

  /**
   * Execute a scheduled task
   */
  async executeTask(description: string, task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        content: `Running scheduled task: ${description}`,
        createdAt: new Date(),
      },
    ]);
  }

  /**
   * Initialize database tables and other setup
   */
  async initialize() {
    // Create tables for storing data
    try {
      await this.sql`
        CREATE TABLE IF NOT EXISTS settings (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT
        )
      `;

      await this.sql`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          status TEXT NOT NULL,
          last_updated TEXT NOT NULL
        )
      `;

      await this.sql`
        CREATE TABLE IF NOT EXISTS interaction_history (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          action TEXT NOT NULL,
          result TEXT NOT NULL,
          FOREIGN KEY(task_id) REFERENCES tasks(id)
        )
      `;

      await this.sql`
        CREATE TABLE IF NOT EXISTS spotify_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          access_token TEXT NOT NULL,
          refresh_token TEXT,
          expires_at TEXT NOT NULL,
          token_type TEXT DEFAULT 'Bearer',
          scope TEXT,
          created_at TEXT NOT NULL
        )
      `;

      await this.sql`
        CREATE TABLE IF NOT EXISTS spotify_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          spotify_user_id TEXT UNIQUE NOT NULL,
          display_name TEXT,
          email TEXT,
          country TEXT,
          product TEXT,
          followers INTEGER,
          is_connected BOOLEAN DEFAULT true,
          last_sync_at TEXT,
          created_at TEXT NOT NULL
        )
      `;

      await this.sql`
        CREATE TABLE IF NOT EXISTS auth_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_token TEXT UNIQUE NOT NULL,
          user_id TEXT NOT NULL,
          display_name TEXT NOT NULL,
          access_token TEXT NOT NULL,
          refresh_token TEXT,
          expires_at TEXT NOT NULL,
          token_expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `;

      // User music preferences and taste profiles
      await this.sql`
        CREATE TABLE IF NOT EXISTS music_preferences (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          favorite_genres TEXT NOT NULL,
          audio_feature_preferences TEXT NOT NULL,
          context_preferences TEXT NOT NULL,
          time_preferences TEXT NOT NULL,
          discovery_settings TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `;

      // Listening history and track interactions
      await this.sql`
        CREATE TABLE IF NOT EXISTS listening_history (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          spotify_track_id TEXT NOT NULL,
          track_name TEXT NOT NULL,
          artist_name TEXT NOT NULL,
          album_name TEXT NOT NULL,
          genres TEXT NOT NULL,
          audio_features TEXT,
          played_at TEXT NOT NULL,
          context TEXT,
          context_id TEXT,
          play_duration INTEGER,
          skipped BOOLEAN NOT NULL,
          liked BOOLEAN NOT NULL,
          time_of_day TEXT NOT NULL,
          listening_context TEXT,
          mood TEXT,
          created_at TEXT NOT NULL
        )
      `;

      // Custom playlists and playlist management
      await this.sql`
        CREATE TABLE IF NOT EXISTS playlist_data (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          spotify_playlist_id TEXT,
          name TEXT NOT NULL,
          description TEXT,
          is_public BOOLEAN NOT NULL DEFAULT 0,
          collaborative BOOLEAN NOT NULL DEFAULT 0,
          purpose TEXT,
          target_mood TEXT,
          target_genres TEXT NOT NULL,
          target_audio_features TEXT,
          tracks TEXT NOT NULL,
          metrics TEXT NOT NULL,
          version INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `;

      // Music sessions for conversation context
      await this.sql`
        CREATE TABLE IF NOT EXISTS music_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT 1,
          current_track TEXT,
          current_context TEXT,
          current_context_id TEXT,
          current_mood TEXT,
          current_activity TEXT,
          session_genres TEXT NOT NULL,
          session_preferences TEXT NOT NULL,
          recommendations TEXT NOT NULL,
          active_device_id TEXT,
          device_name TEXT,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `;

      // Music session activity history
      await this.sql`
        CREATE TABLE IF NOT EXISTS music_session_history (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          activity_type TEXT NOT NULL,
          track_id TEXT,
          track_name TEXT,
          artist_name TEXT,
          playlist_id TEXT,
          playlist_name TEXT,
          device_id TEXT,
          device_name TEXT,
          mood TEXT,
          context TEXT,
          duration INTEGER,
          skip_position INTEGER,
          user_rating INTEGER,
          created_at TEXT NOT NULL
        )
      `;

      // Playlist change history
      await this.sql`
        CREATE TABLE IF NOT EXISTS playlist_history (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          playlist_id TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          action TEXT NOT NULL,
          track_id TEXT,
          track_name TEXT,
          artist_name TEXT,
          old_value TEXT,
          new_value TEXT,
          position INTEGER,
          reason TEXT,
          source TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `;

      // Recommendation tracking history
      await this.sql`
        CREATE TABLE IF NOT EXISTS recommendation_history (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          session_id TEXT,
          timestamp TEXT NOT NULL,
          type TEXT NOT NULL,
          recommendation_id TEXT NOT NULL,
          recommendation_name TEXT NOT NULL,
          artist_name TEXT,
          reason TEXT NOT NULL,
          based_on TEXT NOT NULL,
          user_action TEXT,
          response_time INTEGER,
          play_duration INTEGER,
          was_successful BOOLEAN,
          confidence REAL NOT NULL,
          created_at TEXT NOT NULL
        )
      `;

      // Music discovery history
      await this.sql`
        CREATE TABLE IF NOT EXISTS discovery_history (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          discovery_type TEXT NOT NULL,
          genre_name TEXT,
          artist_id TEXT,
          artist_name TEXT,
          track_id TEXT,
          track_name TEXT,
          feature_name TEXT,
          discovery_method TEXT NOT NULL,
          source_context TEXT,
          engagement_level TEXT NOT NULL,
          follow_up_actions TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `;

      console.log("Database tables initialized successfully");
    } catch (error) {
      console.error("Error initializing database tables:", error);
    }
  }

  /**
   * Handle direct HTTP requests to the agent
   * This is used for actions like setting the mode
   */
  async onRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    console.log("Incoming agent request", {
      url: url.toString(),
      pathname: url.pathname,
    });

    // Extract and store room name from URL path
    // URL structure: /agents/{agent-type}/{room-name}/{endpoint}
    const pathParts = url.pathname.split("/");
    if (pathParts.length >= 4) {
      const extractedRoomName = pathParts[3]; // room-name is the 4th part (index 3)
      if (extractedRoomName && extractedRoomName !== this.roomName) {
        console.log(`[AppAgent] Setting room name: ${extractedRoomName}`);
        this.roomName = extractedRoomName;
      }
    }

    // Handle mode change requests
    if (url.pathname.includes("/set-mode")) {
      console.log(`[AppAgent] Detected set-mode request: ${url.pathname}`);

      try {
        // Only accept POST requests for mode changes
        if (request.method !== "POST") {
          console.log(
            "[AppAgent] Method not allowed for set-mode:",
            request.method
          );
          return Response.json(
            {
              success: false,
              error: "Method not allowed, use POST",
            },
            { status: 405 }
          );
        }

        const body = await request.json();
        const {
          mode: newModeString,
          force: forceFlag,
          isAfterClearHistory: clearHistoryFlag,
        } = body as {
          mode?: string;
          force?: boolean;
          isAfterClearHistory?: boolean;
        };
        const newMode = newModeString as AgentMode;
        const force = forceFlag === true;
        const isAfterClearHistory = clearHistoryFlag === true;

        if (
          !newMode ||
          !["onboarding", "integration", "plan", "act"].includes(newMode)
        ) {
          return Response.json(
            {
              success: false,
              error: "Invalid mode specified",
            },
            { status: 400 }
          );
        }

        // Call the setMode method to change modes and inject transition messages
        console.log(
          `[AppAgent] Processing mode change request: mode=${newMode}, force=${force}, isAfterClearHistory=${isAfterClearHistory}`
        );
        const result = await this.setMode(newMode, force, isAfterClearHistory);

        return Response.json(result);
      } catch (error) {
        console.error("[AppAgent] Error processing mode change:", error);
        return Response.json(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          { status: 500 }
        );
      }
    }

    // Handle Spotify token storage requests
    if (url.pathname.includes("/store-spotify-tokens")) {
      console.log(
        `[AppAgent] Detected store-spotify-tokens request: ${url.pathname}`
      );

      try {
        // Only accept POST requests
        if (request.method !== "POST") {
          console.log(
            "[AppAgent] Method not allowed for store-spotify-tokens:",
            request.method
          );
          return Response.json(
            {
              success: false,
              error: "Method not allowed, use POST",
            },
            { status: 405 }
          );
        }

        const body = (await request.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_in?: number;
          token_type?: string;
          scope?: string;
        };

        const { access_token, refresh_token, expires_in, token_type, scope } =
          body;

        if (!access_token) {
          return Response.json(
            {
              success: false,
              error: "Missing access_token",
            },
            { status: 400 }
          );
        }

        // Store tokens in the database
        console.log("[AppAgent] Storing Spotify tokens in database");
        const result = await this.storeSpotifyTokens({
          access_token,
          refresh_token,
          expires_in,
          token_type,
          scope,
        });

        return Response.json(result);
      } catch (error) {
        console.error("[AppAgent] Error storing Spotify tokens:", error);
        return Response.json(
          {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
          { status: 500 }
        );
      }
    }

    // Handle session management endpoints
    if (url.pathname.includes("/store-session")) {
      console.log("[AppAgent] Storing authentication session");

      try {
        if (request.method !== "POST") {
          return Response.json(
            { success: false, error: "Method not allowed, use POST" },
            { status: 405 }
          );
        }

        const sessionData = (await request.json()) as {
          sessionToken: string;
          userId: string;
          displayName: string;
          accessToken: string;
          refreshToken?: string;
          expiresAt: string;
          tokenExpiresAt: string;
        };

        const now = new Date().toISOString();

        // Store session in database
        await this.sql`
          INSERT OR REPLACE INTO auth_sessions (
            session_token, user_id, display_name, access_token,
            refresh_token, expires_at, token_expires_at, created_at
          ) VALUES (
            ${sessionData.sessionToken}, ${sessionData.userId}, ${sessionData.displayName},
            ${sessionData.accessToken}, ${sessionData.refreshToken || null},
            ${sessionData.expiresAt}, ${sessionData.tokenExpiresAt}, ${now}
          )
        `;

        console.log(
          `[AppAgent] Session stored for user: ${sessionData.userId}`
        );

        return Response.json({ success: true });
      } catch (error) {
        console.error("[AppAgent] Error storing session:", error);
        return Response.json(
          { success: false, error: "Failed to store session" },
          { status: 500 }
        );
      }
    }

    if (url.pathname.includes("/validate-session")) {
      console.log("[AppAgent] Validating authentication session");

      try {
        if (request.method !== "POST") {
          return Response.json(
            { success: false, error: "Method not allowed, use POST" },
            { status: 405 }
          );
        }

        const { sessionToken } = (await request.json()) as {
          sessionToken: string;
        };

        // Look up session in database
        const sessions = await this.sql`
          SELECT session_token, user_id, display_name, access_token,
                 refresh_token, expires_at, token_expires_at, created_at
          FROM auth_sessions
          WHERE session_token = ${sessionToken}
        `;
        const session = sessions[0];

        if (!session) {
          return Response.json(
            { success: false, error: "Invalid session token" },
            { status: 401 }
          );
        }

        // Check if session is expired
        const expiresAt = new Date(session.expires_at as string);
        if (expiresAt < new Date()) {
          // Clean up expired session
          await this
            .sql`DELETE FROM auth_sessions WHERE session_token = ${sessionToken}`;
          return Response.json(
            { success: false, error: "Session expired" },
            { status: 401 }
          );
        }

        console.log(`[AppAgent] Valid session for user: ${session.user_id}`);

        return Response.json({
          success: true,
          user: {
            id: session.user_id,
            displayName: session.display_name,
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            tokenExpiresAt: session.token_expires_at,
          },
        });
      } catch (error) {
        console.error("[AppAgent] Error validating session:", error);
        return Response.json(
          { success: false, error: "Failed to validate session" },
          { status: 500 }
        );
      }
    }

    if (url.pathname.includes("/logout")) {
      console.log("[AppAgent] Logout requested");

      try {
        if (request.method !== "POST") {
          return Response.json(
            { success: false, error: "Method not allowed, use POST" },
            { status: 405 }
          );
        }

        const { sessionToken } = (await request.json()) as {
          sessionToken: string;
        };

        // Validate session before logout (ensure user can only logout their own session)
        const sessions = await this.sql`
          SELECT session_token, user_id
          FROM auth_sessions
          WHERE session_token = ${sessionToken}
        `;
        const session = sessions[0];

        if (!session) {
          return Response.json(
            { success: false, error: "Invalid session token" },
            { status: 401 }
          );
        }

        // Delete the session from database
        await this
          .sql`DELETE FROM auth_sessions WHERE session_token = ${sessionToken}`;

        console.log(`[AppAgent] Logged out user: ${session.user_id}`);

        return Response.json({ success: true });
      } catch (error) {
        console.error("[AppAgent] Error during logout:", error);
        return Response.json(
          { success: false, error: "Failed to logout" },
          { status: 500 }
        );
      }
    }

    // For API endpoints requesting messages
    if (url.pathname.endsWith("/get-messages")) {
      console.log("[AppAgent] Handling /get-messages request");
      const messageCount = Array.isArray(this.messages)
        ? this.messages.length
        : 0;
      console.log(
        `[AppAgent] /get-messages returning ${messageCount} messages`
      );
    }

    // Export endpoint to export the entire Agent data
    if (url.pathname.endsWith("/export")) {
      console.log("[AppAgent] Data export requested");

      // Use the utility function to handle export
      const exportResult = await exportAgentData(this);

      // Return the full database export as pretty-formatted JSON
      return new Response(JSON.stringify(exportResult, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="agent-export-${Date.now()}.json"`,
        },
      });
    }

    // Import endpoint to restore data from a previous export
    if (url.pathname.endsWith("/import")) {
      // Only accept POST requests for import
      if (request.method !== "POST") {
        return Response.json(
          {
            success: false,
            error: "Method not allowed, use POST",
          },
          { status: 405 }
        );
      }

      console.log("[AppAgent] Data import requested");

      // Check content type to determine how to handle the request
      const contentType = request.headers.get("Content-Type") || "";
      let importRequest: ImportRequest;

      if (contentType.includes("multipart/form-data")) {
        // Handle multipart/form-data with file upload
        console.log("[AppAgent] Processing multipart form data upload");

        const formData = await request.formData();
        const file = formData.get("file");

        if (!file || !(file instanceof File)) {
          return Response.json(
            {
              success: false,
              error:
                "No file provided in the request. Please upload a backup file.",
            },
            { status: 400 }
          );
        }

        // Read the file content
        const fileContent = await file.text();
        let importData: DatabaseExportResult;

        try {
          importData = JSON.parse(fileContent) as DatabaseExportResult;
        } catch (parseError) {
          return Response.json(
            {
              success: false,
              error:
                "Invalid JSON file format. Could not parse the backup file.",
            },
            { status: 400 }
          );
        }

        // Validate the imported data
        if (!importData.metadata || !importData.tables) {
          return Response.json(
            {
              success: false,
              error:
                "Invalid backup file structure. Missing metadata or tables.",
            },
            { status: 400 }
          );
        }

        // Parse options from form data
        const preserveAgentId = formData.get("preserveAgentId") === "true";
        const includeMessages = formData.get("includeMessages") !== "false"; // Default to true
        const includeScheduledTasks =
          formData.get("includeScheduledTasks") !== "false"; // Default to true

        importRequest = {
          options: {
            preserveAgentId,
            includeMessages,
            includeScheduledTasks,
          },
          data: importData,
        };
      } else {
        console.log("[AppAgent] Processing JSON payload import");

        interface ImportRequestBody {
          options?: {
            preserveAgentId?: boolean;
            includeMessages?: boolean;
            includeScheduledTasks?: boolean;
          };
          data: {
            metadata: {
              exportedAt: string;
              agentId: string;
              state: AppAgentState;
            };
            tables: Record<string, Record<string, unknown>>;
          };
        }

        const body = (await request.json()) as ImportRequestBody;

        // Validate that the request has the required fields
        if (!body.data || !body.data.metadata || !body.data.tables) {
          return Response.json(
            {
              success: false,
              error:
                "Invalid import data format. Expected {options, data} structure.",
            },
            { status: 400 }
          );
        }

        importRequest = {
          options: body.options || {},
          data: body.data as unknown as DatabaseExportResult,
        };
      }

      // Process import
      const importResult = await importAgentData(this, importRequest);
      return Response.json(importResult);
    }

    // For all other cases, let the regular chat flow handle it
    return super.onRequest(request);
  }

  /**
   * Handle state updates and log the entire state for debugging
   */
  onStateUpdate(state: AppAgentState, source: "server" | Connection) {
    // Get message count to help with debugging
    const messageCount = this.messages?.length || 0;
    const lastMessageId =
      messageCount > 0 ? this.messages?.[messageCount - 1]?.id : "none";

    console.log("[AppAgent] State updated:", {
      mode: state?.mode,
      source: typeof source === "string" ? source : "client",
      timestamp: new Date().toISOString(),
      messageCount,
      lastMessageId,
    });
  }

  /**
   * Handle new client connections with robust database token validation
   * SECURITY: Validates stored tokens with Spotify API + token refresh support
   * PERSISTENCE: Room name extracted from URL path ensures data persistence
   */
  async onConnect(connection: Connection) {
    console.log(`[AppAgent] New client connection: ${connection.id}`);

    // Use the stored room name (extracted from URL path) for persistence
    const roomName = this.roomName || "default";
    console.log(`[AppAgent] Connection to room: ${roomName}`);

    // Check if this is a user-specific room that requires authentication
    if (roomName.startsWith("spotify-user-")) {
      const expectedUserId = roomName.replace("spotify-user-", "");
      console.log(
        `[AppAgent] Spotify user room detected for user: ${expectedUserId}`
      );

      // SECURITY: Extract and validate session token from WebSocket connection
      let sessionToken: string | null = null;

      try {
        // Get session token from connection request URL
        const connectionRequest = (connection as any).request;
        if (connectionRequest && connectionRequest.url) {
          const url = new URL(connectionRequest.url, "http://localhost");
          sessionToken = url.searchParams.get("session");
        }

        if (!sessionToken) {
          console.log(
            `[AppAgent] No session token provided for user room: ${expectedUserId}`
          );
          connection.close(
            1008,
            "Authentication required - please provide valid session token"
          );
          return;
        }

        console.log(
          `[AppAgent] Validating session token for user: ${expectedUserId}`
        );

        // SECURITY: Validate session token and get user data
        const sessions = await this.sql`
          SELECT session_token, user_id, display_name, access_token,
                 refresh_token, expires_at, token_expires_at, created_at
          FROM auth_sessions
          WHERE session_token = ${sessionToken}
        `;
        const session = sessions[0];

        if (!session) {
          console.log(`[AppAgent] Invalid session token`);
          connection.close(1008, "Invalid session token");
          return;
        }

        // Check if session is expired
        const expiresAt = new Date(session.expires_at as string);
        if (expiresAt < new Date()) {
          console.log(`[AppAgent] Session expired`);
          // Clean up expired session
          await this
            .sql`DELETE FROM auth_sessions WHERE session_token = ${sessionToken}`;
          connection.close(1008, "Session expired");
          return;
        }

        // SECURITY: Ensure the session user matches the expected room owner
        if (session.user_id !== expectedUserId) {
          console.log(
            `[AppAgent] Access denied: session for ${session.user_id} doesn't match room ${expectedUserId}`
          );
          connection.close(1008, "Access denied - user mismatch");
          return;
        }

        console.log(
          `[AppAgent] Successfully authenticated user: ${session.display_name} (${session.user_id})`
        );

        // Store validated user in connection context
        (connection as any).authenticatedUser = {
          id: session.user_id,
          display_name: session.display_name,
          access_token: session.access_token,
          refresh_token: session.refresh_token,
        };
        (connection as any).authValidatedAt = new Date();
      } catch (error) {
        console.error(`[AppAgent] Session validation failed:`, error);
        connection.close(1008, "Authentication validation failed");
        return;
      }
    } else {
      // Public/legacy room - no authentication required
      console.log(`[AppAgent] Public/legacy room: ${roomName}`);
    }

    // Send connection-ready event
    connection.send(
      JSON.stringify({
        type: "connection-ready",
        timestamp: new Date().toISOString(),
        authenticated: roomName.startsWith("spotify-user-"),
        roomType: roomName.startsWith("spotify-user-")
          ? "authenticated"
          : "public",
      })
    );

    console.log(
      `[AppAgent] Connection authenticated and ready: ${connection.id}`
    );
  }

  /**
   * Set the agent's operating mode
   *
   * @param mode The mode to set
   * @param force If true, will override validation checks
   * @param isAfterClearHistory If true, indicates this is after clearing history
   */
  async setMode(mode: AgentMode, force = false, isAfterClearHistory = false) {
    const currentState = this.state as AppAgentState;
    const previousMode = currentState.mode;

    // Check if mode is actually changing
    if (previousMode !== mode || force) {
      console.log(`[AppAgent] Updating state: ${previousMode} → ${mode}`);

      // Simple state update, no message manipulation
      await this.setState({
        ...currentState,
        mode,
        _lastModeChange: new Date().toISOString(),
      });

      console.log(`[AppAgent] Mode changed to ${mode}`);
    }

    return {
      success: true,
      previousMode,
      currentMode: mode,
    };
  }

  /**
   * Store Spotify OAuth tokens in the database
   */
  async storeSpotifyTokens(tokens: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
    user_id?: string;
  }) {
    try {
      // Extract user ID from room name instead of relying on request body
      const roomName = this.roomName || "default";
      const userId = roomName.startsWith("spotify-user-")
        ? roomName.replace("spotify-user-", "")
        : "default";

      console.log(
        `[AppAgent] Storing tokens for user: ${userId} (room: ${roomName})`
      );

      // Calculate token expiration
      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : new Date(Date.now() + 3600 * 1000); // Default 1 hour

      // Store tokens in the database
      await this.sql`
        INSERT OR REPLACE INTO spotify_tokens (
          user_id, access_token, refresh_token, expires_at, token_type, scope, created_at
        ) VALUES (
          ${userId}, ${tokens.access_token}, ${tokens.refresh_token || ""},
          ${expiresAt.toISOString()}, ${tokens.token_type || "Bearer"},
          ${tokens.scope || ""}, ${new Date().toISOString()}
        )
      `;

      console.log("[AppAgent] Spotify tokens stored successfully");

      return {
        success: true,
        message: "Spotify tokens stored successfully",
      };
    } catch (error) {
      console.error("[AppAgent] Error storing Spotify tokens:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get Browserbase API key safely for use in tools
   */
  getBrowserbaseApiKey() {
    return this.env.BROWSERBASE_API_KEY;
  }

  /**
   * Get Browser API key for the external browser rendering service
   */
  getBrowserApiKey() {
    return this.env.GATEWAY_API_KEY;
  }

  /**
   * Get Browser API base URL for the external browser rendering service
   */
  getBrowserApiBaseUrl() {
    return this.env.GATEWAY_BASE_URL;
  }

  /**
   * Get Spotify client ID safely for use in tools
   */
  getSpotifyClientId() {
    return this.env.SPOTIFY_CLIENT_ID;
  }

  /**
   * Get table description for export/import
   * Get a description of a table based on its name
   * Used for the database export feature
   */
  getTableDescription(tableName: string): string {
    const descriptions: Record<string, string> = {
      settings: "Stores agent settings and configuration",
      tasks: "Stores task data",
      interaction_history: "Stores history of interactions",
    };
    return descriptions[tableName] || "Unknown table";
  }

  /**
   * Override persistMessages to handle edge cases where messages might not be iterable
   * This prevents the "TypeError: messages is not iterable" error
   */
  async persistMessages(messages: any) {
    try {
      // Safety check: ensure messages is iterable before calling parent method
      if (!messages || !Array.isArray(messages)) {
        console.warn(
          "[AppAgent] persistMessages called with non-array messages:",
          typeof messages
        );
        return;
      }

      // Call the parent implementation if messages is valid
      return await super.persistMessages(messages);
    } catch (error) {
      console.error("[AppAgent] Error in persistMessages:", error);
      // Don't throw the error to prevent cascading failures
    }
  }
}
