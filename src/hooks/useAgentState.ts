import { useEffect, useCallback, useState, useRef } from "react";
import type { AgentMode, AppAgentState } from "../agent/AppAgent";
import { useAgent } from "agents/react";

export function useAgentState(initialMode: AgentMode = "onboarding") {
  const [agentState, setAgentState] = useState<AppAgentState | null>(null);
  const [agentMode, setAgentMode] = useState<AgentMode>(initialMode);

  // Add ref to track initial agent state load
  const initialStateLoaded = useRef(false);

  // Move getNameFromURL to a useCallback to avoid dependency issues
  const getNameFromURL = useCallback(() => {
    // Extract name from URL
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("room");
  }, []);

  const [agentConfig, setAgentConfig] = useState(() => {
    // Get initial config from URL or wait for authentication
    const name = getNameFromURL() || null; // Don't default to auth-pending
    console.log(`[UI] Initial agent config: ${name || "waiting for auth"}`);
    return {
      agent: "app-agent",
      name: name || "auth-waiting", // Use a special state for waiting
    };
  });

  // Update agent configuration with proper typing
  const changeAgentConfig = useCallback(
    (agent: string, newName: string | null) => {
      // Skip operation if newName is null
      if (!newName) return;

      console.log(`[UI] Changing agent config: ${agent} -> ${newName}`);
      setAgentConfig({ agent, name: newName });
    },
    []
  );

  // Listen for URL changes and update agent config when room param changes
  useEffect(() => {
    const handleURLChange = () => {
      const newName = getNameFromURL();
      if (newName !== agentConfig.name) {
        changeAgentConfig(agentConfig.agent, newName);
      }
    };

    window.addEventListener("popstate", handleURLChange);
    return () => {
      window.removeEventListener("popstate", handleURLChange);
    };
  }, [agentConfig.agent, agentConfig.name, changeAgentConfig, getNameFromURL]);

  // Initialize the agent EARLY to get mode info as soon as possible
  const agent = useAgent({
    agent: agentConfig.agent,
    name: agentConfig.name === "auth-waiting" ? undefined : agentConfig.name, // Don't connect during auth-waiting
    onStateUpdate: (newState: AppAgentState) => {
      console.log("[UI] Agent state updated:", newState);

      // Critical: On initial state load, force agentMode to match agent state
      if (!initialStateLoaded.current && newState?.mode) {
        console.log(
          `[UI] INITIAL STATE LOAD: Forcing mode to ${newState.mode} from agent state`
        );
        setAgentMode(newState.mode);
        initialStateLoaded.current = true;
      }

      setAgentState(newState);
    },
  });

  // Initialize agentMode from agent state when it changes
  useEffect(() => {
    if (agentState?.mode) {
      // Skip immediate sync if this is initial load (handled by onStateUpdate)
      if (initialStateLoaded.current && agentMode !== agentState.mode) {
        console.log(
          `[UI] Syncing UI mode state (${agentMode}) with agent state (${agentState.mode})`
        );
        setAgentMode(agentState.mode);
      } else if (agentState.mode !== agentMode) {
        console.log(
          `[UI] NOT syncing UI mode. Conditions: initialLoaded=${initialStateLoaded.current}, modesDiffer=${agentMode !== agentState.mode}`
        );
      }
    }
  }, [agentState, agentMode]);

  // Debug effect to detect state sync issues
  useEffect(() => {
    if (agentState && agentMode !== agentState.mode) {
      console.warn(
        `[UI] State sync issue detected: UI mode (${agentMode}) doesn't match agent state mode (${agentState.mode})`
      );
    }
  }, [agentState, agentMode]);

  // Function to change the agent mode
  const changeAgentMode = async (
    newMode: AgentMode,
    force = false,
    isAfterClearHistory = false
  ) => {
    try {
      // Don't change if already in this mode and not forcing and not after clearing history
      if (agentMode === newMode && !force && !isAfterClearHistory) {
        console.log(`Already in ${newMode} mode`);
        return;
      }

      // Show some UI feedback that we're changing modes
      let actionDescription = "Changing to";
      if (force) actionDescription = "Force re-setting";
      if (isAfterClearHistory)
        actionDescription = "Restoring after history clear";
      if (agentMode === newMode) actionDescription = "Refreshing";

      console.log(`${actionDescription} ${newMode} mode...`);

      // Update local state first to prevent UI flicker
      setAgentMode(newMode);

      // Instead of directly updating state, call the agent's setMode method
      // which will properly inject transition messages
      if (agent) {
        // Log the endpoint URL we're actually using
        const setModeUrl = `/agents/${agentConfig.agent}/${agentConfig.name}/set-mode`;
        console.log(
          `[UI] Calling agent's setMode method to ${actionDescription.toLowerCase()} ${agentMode} to ${newMode}`
        );
        console.log(`[UI] Using endpoint URL: ${setModeUrl}`);

        // Extended debugging
        const fullUrl = new URL(setModeUrl, window.location.origin);
        console.log(`[UI] Full absolute URL: ${fullUrl.toString()}`);

        const response = await fetch(setModeUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mode: newMode,
            force,
            isAfterClearHistory,
          }),
        });

        console.log(
          `[UI] Set mode request status: ${response.status} ${response.statusText}`
        );

        if (!response.ok) {
          throw new Error(`Failed to change mode: ${response.statusText}`);
        }

        // Try to parse the response to see what the server is saying
        try {
          const responseData = (await response.clone().json()) as {
            success?: boolean;
          };
          console.log("[UI] Set mode response:", responseData);

          // Force sync the UI when setMode API is used successfully
          if (responseData.success && agentMode !== newMode) {
            console.log(
              `[UI] Force updating UI mode to ${newMode} after successful setMode API call`
            );
            setAgentMode(newMode);
          }
        } catch (e) {
          console.log("[UI] Unable to parse response as JSON");
        }

        console.log("[UI] Successfully called setMode endpoint");
        return;
      }

      // If agent is not available, show an error
      console.error("[UI] Unable to change mode: agent not available");
    } catch (error) {
      console.error("Error changing agent mode:", error);
    }
  };

  // Function to navigate to a specific room
  const navigateToRoom = (roomName: string) => {
    changeAgentConfig(agentConfig.agent, roomName);
  };

  // Secure function to connect to user's room after authentication
  const connectToUserRoom = useCallback(
    async (spotifyUserId: string, accessToken: string) => {
      console.log(
        `[UI] Connecting to authenticated user room: ${spotifyUserId}`
      );

      // Validate the token and userId match with Spotify API before switching rooms
      try {
        const response = await fetch("https://api.spotify.com/v1/me", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          throw new Error("Invalid access token");
        }

        const userData = (await response.json()) as { id: string };
        if (userData.id !== spotifyUserId) {
          throw new Error("Token does not match user ID");
        }

        // Token is valid and matches user - now switch to their room
        const userRoom = `spotify-user-${spotifyUserId}`;
        console.log(`[UI] Token validated, switching to room: ${userRoom}`);

        // Store tokens in the user-specific room
        const storeTokensUrl = `/agents/${agentConfig.agent}/${userRoom}/store-spotify-tokens`;
        const storeResponse = await fetch(storeTokensUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            access_token: accessToken,
            user_id: spotifyUserId,
          }),
        });

        if (!storeResponse.ok) {
          throw new Error("Failed to store tokens in user room");
        }

        // Successfully stored tokens - now switch to the room
        changeAgentConfig(agentConfig.agent, userRoom);

        console.log(`[UI] Successfully connected to user room: ${userRoom}`);
        return true;
      } catch (error) {
        console.error("[UI] Failed to connect to user room:", error);
        return false;
      }
    },
    [agentConfig.agent, changeAgentConfig]
  );

  return {
    agent,
    agentState,
    agentMode,
    agentConfig,
    changeAgentConfig,
    changeAgentMode,
    navigateToRoom,
    connectToUserRoom,
  };
}
