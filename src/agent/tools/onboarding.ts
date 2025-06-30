import { getCurrentAgent } from "agents";
import { tool } from "ai";
import { z } from "zod";
import type { AppAgent, AppAgentState } from "../AppAgent";

/**
 * Generic onboarding tools for basic agent configuration
 */

/**
 * Tool for saving basic agent settings during onboarding
 */
export const saveSettings = tool({
  description:
    "Save basic agent settings and music preferences during the onboarding process",
  parameters: z.object({
    language: z.string().optional().describe("Agent language preference"),
    operatorName: z
      .string()
      .optional()
      .describe("Name of the primary operator"),
    operatorEmail: z
      .string()
      .optional()
      .describe("Email of the primary operator"),
    adminContactName: z
      .string()
      .optional()
      .describe("Name of the admin contact"),
    adminContactEmail: z
      .string()
      .optional()
      .describe("Email of the admin contact"),
    // Music preferences and goals
    musicGoals: z
      .array(z.string())
      .optional()
      .describe(
        "What the user wants to accomplish with music (e.g., 'create family playlists', 'discover new genres')"
      ),
    playlistTypes: z
      .array(z.string())
      .optional()
      .describe(
        "Types of playlists they want (e.g., 'workout', 'study', 'multilingual kids music')"
      ),
    musicUsage: z
      .array(z.string())
      .optional()
      .describe(
        "How they use music (e.g., 'parties', 'relaxation', 'commuting')"
      ),
    preferredGenres: z
      .array(z.string())
      .optional()
      .describe("Genres they're interested in"),
    preferredLanguages: z
      .array(z.string())
      .optional()
      .describe("Languages for music content"),
    specificInterests: z
      .array(z.string())
      .optional()
      .describe("Specific artists, eras, or themes"),
    discoveryGoals: z
      .array(z.string())
      .optional()
      .describe("What they want to discover or explore musically"),
  }),
  execute: async ({
    language,
    operatorName,
    operatorEmail,
    adminContactName,
    adminContactEmail,
    musicGoals,
    playlistTypes,
    musicUsage,
    preferredGenres,
    preferredLanguages,
    specificInterests,
    discoveryGoals,
  }) => {
    const { agent } = getCurrentAgent<AppAgent>();

    if (!agent) {
      return "Error: Could not get agent reference";
    }

    try {
      const currentState = agent.state as AppAgentState;
      const currentSettings = currentState.settings || {
        language: "en",
        operators: [],
        adminContact: { name: "", email: "" },
      };

      // Update settings with provided values
      const updatedSettings = {
        ...currentSettings,
        language: language || currentSettings.language,
        adminContact: {
          name: adminContactName || currentSettings.adminContact.name,
          email: adminContactEmail || currentSettings.adminContact.email,
        },
        operators: operatorName
          ? [
              {
                name: operatorName,
                role: "primary",
                email: operatorEmail,
              },
              ...currentSettings.operators.filter(
                (op) => op.role !== "primary"
              ),
            ]
          : currentSettings.operators,
      };

      // Update music preferences if provided
      const currentMusicPreferences = currentState.musicPreferences || {
        goals: [],
        playlistTypes: [],
        musicUsage: [],
        preferredGenres: [],
        preferredLanguages: [],
        specificInterests: [],
        discoveryGoals: [],
      };

      const updatedMusicPreferences = {
        goals: musicGoals || currentMusicPreferences.goals,
        playlistTypes: playlistTypes || currentMusicPreferences.playlistTypes,
        musicUsage: musicUsage || currentMusicPreferences.musicUsage,
        preferredGenres:
          preferredGenres || currentMusicPreferences.preferredGenres,
        preferredLanguages:
          preferredLanguages || currentMusicPreferences.preferredLanguages,
        specificInterests:
          specificInterests || currentMusicPreferences.specificInterests,
        discoveryGoals:
          discoveryGoals || currentMusicPreferences.discoveryGoals,
      };

      await agent.setState({
        ...currentState,
        settings: updatedSettings,
        musicPreferences: updatedMusicPreferences,
      });

      return "Settings and music preferences saved successfully.";
    } catch (error) {
      console.error("Error saving settings:", error);
      return `Error saving settings: ${error}`;
    }
  },
});

/**
 * Tool for completing the onboarding process
 */
export const completeOnboarding = tool({
  description: "Mark the onboarding process as complete",
  parameters: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<AppAgent>();

    if (!agent) {
      return "Error: Could not get agent reference";
    }

    try {
      const currentState = agent.state as AppAgentState;

      await agent.setState({
        ...currentState,
        isOnboardingComplete: true,
      });

      return "Onboarding completed successfully! The agent is now ready for use.";
    } catch (error) {
      console.error("Error completing onboarding:", error);
      return `Error completing onboarding: ${error}`;
    }
  },
});

/**
 * Tool for checking onboarding status
 */
export const getOnboardingStatus = tool({
  description: "Get the current onboarding status and configuration",
  parameters: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<AppAgent>();

    if (!agent) {
      return "Error: Could not get agent reference";
    }

    try {
      const currentState = agent.state as AppAgentState;
      const settings = currentState.settings;

      return {
        isComplete: currentState.isOnboardingComplete,
        settings: {
          language: settings?.language || "en",
          hasOperators: (settings?.operators?.length || 0) > 0,
          hasAdminContact: !!settings?.adminContact?.name,
        },
        message: currentState.isOnboardingComplete
          ? "Onboarding is complete"
          : "Onboarding is in progress",
      };
    } catch (error) {
      console.error("Error getting onboarding status:", error);
      return `Error getting onboarding status: ${error}`;
    }
  },
});

/**
 * Tool for checking existing configuration
 */
export const checkExistingConfig = tool({
  description: "Check if the agent has existing configuration",
  parameters: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<AppAgent>();

    if (!agent) {
      return "Error: Could not get agent reference";
    }

    try {
      const currentState = agent.state as AppAgentState;
      const hasConfig =
        currentState.isOnboardingComplete && currentState.settings;

      return {
        hasExistingConfig: !!hasConfig,
        isOnboardingComplete: currentState.isOnboardingComplete,
        message: hasConfig
          ? "Agent has existing configuration"
          : "No existing configuration found",
      };
    } catch (error) {
      console.error("Error checking existing config:", error);
      return `Error checking existing config: ${error}`;
    }
  },
});

/**
 * Tool for getting current music preferences during onboarding
 */
export const getMusicPreferences = tool({
  description:
    "Get the current music preferences and goals that have been gathered during onboarding",
  parameters: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<AppAgent>();

    if (!agent) {
      return "Error: Could not get agent reference";
    }

    try {
      const currentState = agent.state as AppAgentState;
      const musicPreferences = currentState.musicPreferences;

      return {
        hasPreferences: !!musicPreferences,
        preferences: musicPreferences || {
          goals: [],
          playlistTypes: [],
          musicUsage: [],
          preferredGenres: [],
          preferredLanguages: [],
          specificInterests: [],
          discoveryGoals: [],
        },
        message: musicPreferences
          ? "Music preferences have been gathered"
          : "No music preferences set yet",
      };
    } catch (error) {
      console.error("Error getting music preferences:", error);
      return `Error getting music preferences: ${error}`;
    }
  },
});
