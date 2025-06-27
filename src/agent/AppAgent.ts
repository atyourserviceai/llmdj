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
const getOpenAI = (env: Env, apiKey?: string) => {
  if (!apiKey) {
    throw new Error("API key is required for AI requests");
  }
  return createOpenAI({
    apiKey: apiKey,
    baseURL: `${env.GATEWAY_BASE_URL}/v1/openai`,
  });
};

/*
// AI @ Your Service Gateway configuration for Anthropic
const getAnthropic = (env: Env, apiKey?: string) => {
  if (!apiKey) {
    throw new Error("API key is required for AI requests");
  }
  return createAnthropic({
    apiKey: apiKey,
    baseURL: `${env.GATEWAY_BASE_URL}/v1/anthropic`,
  });
};
*/

/*
// AI @ Your Service Gateway configuration for Gemini
const getGemini = (env: Env, apiKey?: string) => {
  if (!apiKey) {
    throw new Error("API key is required for AI requests");
  }
  return createGoogleGenerativeAI({
    apiKey: apiKey,
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

  // User authentication info (from OAuth)
  userInfo?: {
    id: string;
    email: string;
    credits: number;
    payment_method: string;
    api_key?: string; // User's AtYourService.ai API key
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

  // Spotify authentication state
  spotifyAuth?: {
    isConnected: boolean;
    profile: {
      id: string;
      displayName: string;
      email?: string;
      country?: string;
      product: "premium" | "free";
      followers?: number;
    };
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt: string; // ISO string
    connectedAt: string; // ISO string
  };

  // Optional metadata
  _lastModeChange?: string;
}

/**
 * Generic Agent implementation with multiple operational modes
 * Can operate as a planning assistant, action executor, or general purpose agent
 */
export class AppAgent extends AIChatAgent<Env> {
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

    // Initialize database tables and load user info
    this.initialize()
      .then(() => {
        // Only load user info after database is initialized
        return this.loadUserInfo();
      })
      .catch((error) => {
        console.error("Failed to initialize database or load user info:", error);
      });
  }

  /**
   * Get AI provider using user-specific API key if available
   */
  getAIProvider() {
    const state = this.state as AppAgentState;
    const userApiKey = state.userInfo?.api_key;

    if (userApiKey) {
      console.log(
        `[AppAgent] Using user-specific API key for user: ${state.userInfo?.id}`
      );
      return getOpenAI(this.env, userApiKey);
    }
    const errorMsg =
      "No user API key available. User must be authenticated to use AI features.";
    console.error(`[AppAgent] ${errorMsg}`);
    throw new Error(errorMsg);
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

        const openai = this.getAIProvider();
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
        CREATE TABLE IF NOT EXISTS user_info (
          user_id TEXT PRIMARY KEY,
          api_key TEXT NOT NULL,
          email TEXT NOT NULL,
          credits REAL NOT NULL,
          payment_method TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
          user_id TEXT PRIMARY KEY,
          access_token TEXT NOT NULL,
          refresh_token TEXT,
          expires_at TEXT NOT NULL,
          token_type TEXT DEFAULT 'Bearer',
          scope TEXT,
          created_at TEXT NOT NULL
        )
      `;

      // Spotify user profiles and connection data
      await this.sql`
        CREATE TABLE IF NOT EXISTS spotify_profiles (
          id TEXT PRIMARY KEY,
          spotify_user_id TEXT UNIQUE NOT NULL,
          display_name TEXT NOT NULL,
          email TEXT,
          country TEXT,
          product TEXT NOT NULL,
          images TEXT,
          followers INTEGER,
          is_connected BOOLEAN NOT NULL DEFAULT 1,
          access_token TEXT,
          refresh_token TEXT,
          token_expires_at TEXT,
          last_sync_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
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

    // Extract OAuth token from request and ensure user info is loaded
    const token = url.searchParams.get("token");
    const currentState = this.state as AppAgentState;

    if (token && !currentState.userInfo) {
      console.log(
        "[AppAgent] No user info in state, attempting to load from database or OAuth"
      );
      await this.loadUserInfo(token);
    }

    // Handle internal user info storage request
    if (
      url.pathname.endsWith("/store-user-info") &&
      request.method === "POST"
    ) {
      try {
        const userInfo = (await request.json()) as {
          user_id: string;
          api_key: string;
          email: string;
          credits: number;
          payment_method: string;
        };

        console.log(
          `[AppAgent] Storing user info for user: ${userInfo.user_id}`
        );

        // Store user info in database for persistence
        await this.sql`
          INSERT OR REPLACE INTO user_info (
            user_id, api_key, email, credits, payment_method, updated_at
          ) VALUES (
            ${userInfo.user_id},
            ${userInfo.api_key},
            ${userInfo.email},
            ${userInfo.credits},
            ${userInfo.payment_method},
            ${new Date().toISOString()}
          )
        `;

        // Also update agent state for immediate use
        const updatedState: AppAgentState = {
          ...currentState,
          userInfo: {
            id: userInfo.user_id,
            email: userInfo.email,
            credits: userInfo.credits,
            payment_method: userInfo.payment_method,
            api_key: userInfo.api_key,
          },
        };

        this.setState(updatedState);

        console.log(
          `[AppAgent] Successfully stored user info in database for user: ${userInfo.user_id}`
        );
        return new Response("OK");
      } catch (error) {
        console.error("[AppAgent] Error storing user info:", error);
        return new Response("Error storing user info", { status: 500 });
      }
    }

    // Handle user info clearing request (for logout)
    if (
      url.pathname.endsWith("/clear-user-info") &&
      request.method === "POST"
    ) {
      try {
        console.log("[AppAgent] Clearing cached user info");

        // Clear user info from database
        await this.sql`DELETE FROM user_info`;

        // Clear user info from agent state
        const updatedState: AppAgentState = {
          ...currentState,
          userInfo: undefined,
        };

        this.setState(updatedState);

        console.log("[AppAgent] Successfully cleared cached user info");
        return new Response("OK");
      } catch (error) {
        console.error("[AppAgent] Error clearing user info:", error);
        return new Response("Error clearing user info", { status: 500 });
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

        // Extract user ID from URL path: /agents/app-agent/{userId}/store-spotify-tokens
        const pathParts = url.pathname.split("/");
        const userId = pathParts[3]; // Index 3 should be the user ID

        console.log(
          "[AppAgent] Storing Spotify tokens in database for user:",
          userId
        );
        const result = await this.storeSpotifyTokens({
          user_id: userId,
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
   * Handle new client connections
   */
  async onConnect(connection: Connection) {
    console.log(`[AppAgent] New client connection: ${connection.id}`);

    // Send a connection-ready event to signal that setup is complete
    // The client can listen for this to know when to check for messages
    connection.send(
      JSON.stringify({
        type: "connection-ready",
        timestamp: new Date().toISOString(),
      })
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
    user_id: string; // This is the AtYourService.ai user ID from URL path
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
  }) {
    try {
      // First, fetch the Spotify user profile to get the Spotify user ID
      const profileResponse = await fetch("https://api.spotify.com/v1/me", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });

      if (!profileResponse.ok) {
        throw new Error(
          `Failed to fetch Spotify profile: ${profileResponse.status}`
        );
      }

      const spotifyProfile = (await profileResponse.json()) as {
        id: string;
        display_name: string;
        email?: string;
        country?: string;
        product: string;
        followers?: { total: number };
      };

      console.log(
        "[AppAgent] Fetched Spotify profile for user:",
        spotifyProfile.id
      );

      // Calculate token expiration
      const expiresAt = tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : new Date(Date.now() + 3600 * 1000); // Default 1 hour

      // Store tokens in the database using the Spotify user ID
      await this.sql`
        INSERT OR REPLACE INTO spotify_tokens (
          user_id, access_token, refresh_token, expires_at, token_type, scope, created_at
        ) VALUES (
          ${spotifyProfile.id}, ${tokens.access_token}, ${tokens.refresh_token || ""},
          ${expiresAt.toISOString()}, ${tokens.token_type || "Bearer"},
          ${tokens.scope || ""}, ${new Date().toISOString()}
        )
      `;

      console.log(
        "[AppAgent] Spotify tokens stored successfully for Spotify user:",
        spotifyProfile.id
      );

      // Also update the agent state with Spotify profile info
      const state = this.state as AppAgentState;
      const updatedState: AppAgentState = {
        ...state,
        spotifyAuth: {
          isConnected: true,
          profile: {
            id: spotifyProfile.id,
            displayName: spotifyProfile.display_name,
            email: spotifyProfile.email,
            country: spotifyProfile.country,
            product: spotifyProfile.product as "premium" | "free",
            followers: spotifyProfile.followers?.total,
          },
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: expiresAt.toISOString(),
          connectedAt: new Date().toISOString(),
        },
      };

      this.setState(updatedState);

      return {
        success: true,
        message: "Spotify tokens stored successfully",
        spotifyUserId: spotifyProfile.id,
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
    const state = this.state as AppAgentState;
    const userApiKey = state.userInfo?.api_key;

    if (userApiKey) {
      return userApiKey;
    }

    throw new Error(
      "No user API key available for browser rendering service. User must be authenticated."
    );
  }

  /**
   * Get Browser API base URL for the external browser rendering service
   */
  getBrowserApiBaseUrl() {
    return this.env.GATEWAY_BASE_URL;
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
   * Fetch user info from OAuth provider
   */
  async fetchUserInfoFromOAuth(token: string): Promise<void> {
    try {
      // Use the OAuth provider URL (website) for token verification
      const oauthProviderUrl =
        this.env.OAUTH_PROVIDER_BASE_URL || "https://atyourservice.ai";
      const verifyEndpoint = `${oauthProviderUrl}/oauth/verify`;

      console.log(
        `[AppAgent] Fetching user info from OAuth provider: ${verifyEndpoint}`
      );

      const response = await fetch(verifyEndpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `[AppAgent] OAuth verification failed: ${response.status} - ${errorText}`
        );
        return;
      }

      const userInfo = (await response.json()) as {
        id: string;
        email: string;
        credits: number;
        payment_method: string;
      };

      console.log(
        `[AppAgent] Fetched user info from OAuth for user: ${userInfo.id}`
      );

      // Store in database for future use
      // OAuth token IS the gateway API key
      await this.sql`
        INSERT OR REPLACE INTO user_info (
          user_id, api_key, email, credits, payment_method, updated_at
        ) VALUES (
          ${userInfo.id},
          ${token},
          ${userInfo.email},
          ${userInfo.credits},
          ${userInfo.payment_method},
          ${new Date().toISOString()}
        )
      `;

      // Update agent state
      const state = this.state as AppAgentState;
      const updatedState: AppAgentState = {
        ...state,
        userInfo: {
          id: userInfo.id,
          api_key: token,
          email: userInfo.email,
          credits: userInfo.credits,
          payment_method: userInfo.payment_method,
        },
      };

      this.setState(updatedState);
      console.log(
        `[AppAgent] Successfully fetched and stored user info for user: ${userInfo.id}`
      );
    } catch (error) {
      console.error("[AppAgent] Error fetching user info from OAuth:", error);
    }
  }

  /**
   * Load user info from database if available, or fetch from OAuth if needed
   */
  async loadUserInfo(oauthToken?: string) {
    try {
      const userInfoResults = await this.sql`
        SELECT * FROM user_info LIMIT 1
      `;

      if (userInfoResults && userInfoResults.length > 0) {
        const userInfo = userInfoResults[0] as {
          user_id: string;
          api_key: string;
          email: string;
          credits: number;
          payment_method: string;
        };

        // Check if the stored API key matches the current OAuth token
        if (oauthToken && userInfo.api_key !== oauthToken) {
          console.log(
            "[AppAgent] Stored API key doesn't match current token, fetching fresh user info from OAuth"
          );
          await this.fetchUserInfoFromOAuth(oauthToken);
          return;
        }

        const state = this.state as AppAgentState;
        const updatedState: AppAgentState = {
          ...state,
          userInfo: {
            id: userInfo.user_id,
            api_key: userInfo.api_key,
            email: userInfo.email,
            credits: userInfo.credits,
            payment_method: userInfo.payment_method,
          },
        };

        this.setState(updatedState);
        console.log(
          `[AppAgent] Loaded user info from database for user: ${userInfo.user_id}`
        );
      } else {
        console.log("[AppAgent] No user info found in database");

        if (oauthToken) {
          await this.fetchUserInfoFromOAuth(oauthToken);
        }
      }
    } catch (error) {
      console.error("[AppAgent] Error loading user info from database:", error);
    }
  }
}
