import type { Message } from "@ai-sdk/react";
import { useAgentChat } from "agents/ai-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ToolTypes } from "./agent/tools/types";
import { useAgentState } from "./hooks/useAgentState";
import { useErrorHandling } from "./hooks/useErrorHandling";
import { useMessageEditing } from "./hooks/useMessageEditing";

import { AuthGuard } from "./components/auth/AuthGuard";
// OAuth imports
import { AuthProvider, useAuth } from "./components/auth/AuthProvider";
import { ErrorBoundary } from "./components/error/ErrorBoundary";
import { useAgentAuth } from "./hooks/useAgentAuth";

import { ActionButtons } from "@/components/action-buttons/ActionButtons";
import { Avatar } from "@/components/avatar/Avatar";
// Component imports
import { Card } from "@/components/card/Card";
import { ChatContainer } from "@/components/chat/ChatContainer";
import { ChatMessage } from "@/components/chat/ChatMessage";

import { EmptyChat } from "@/components/chat/EmptyChat";
import { ErrorMessage } from "@/components/chat/ErrorMessage";
import { LoadingIndicator } from "@/components/chat/LoadingIndicator";
import { MissingResponseIndicator } from "@/components/chat/MissingResponseIndicator";
import { PlaybookContainer } from "@/components/chat/PlaybookContainer";
import { SpotifyPlayerCard } from "@/components/chat/SpotifyPlayerCard";
import { MemoizedMarkdown } from "@/components/memoized-markdown";
import { ToolInvocationCard } from "@/components/tool-invocation-card/ToolInvocationCard";

// Define agent data interface for typing
interface AgentData {
  connectionStatus?: "connected" | "disconnected" | "error" | "reconnecting";
  [key: string]: unknown;
}

// List of tools that require human confirmation
const toolsRequiringConfirmation: (keyof ToolTypes)[] = [
  "getWeatherInformation",
  // Do not add suggestActions here as we want it to display without confirmation
];

// Add this new component to show suggested actions above the chat input
function SuggestedActions({
  messages,
  addToolResult,
  reload,
}: {
  messages: Message[];
  addToolResult: (args: { toolCallId: string; result: string }) => void;
  reload: () => void;
}) {
  // SAFETY: Ensure messages is an array before processing
  const safeMessages = Array.isArray(messages) ? messages : [];

  // Find the latest message with suggestActions
  const lastAssistantMessage = [...safeMessages]
    .reverse()
    .find((msg) => msg.role === "assistant");

  if (!lastAssistantMessage) return null;

  // Find the suggestActions tool invocation in the message parts
  const suggestActionsPart = lastAssistantMessage.parts?.find(
    (part) =>
      part.type === "tool-invocation" &&
      "toolInvocation" in part &&
      part.toolInvocation.toolName === "suggestActions"
  );

  if (!suggestActionsPart || !("toolInvocation" in suggestActionsPart))
    return null;

  const toolInvocation = suggestActionsPart.toolInvocation;

  // Get the actions based on the state - they could be in args or result
  let actions: Array<{
    label: string;
    value: string;
    primary?: boolean;
    isOther?: boolean;
  }> = [];

  if (toolInvocation.state === "call") {
    // Handle call state - get actions from args
    actions =
      (toolInvocation.args.actions as Array<{
        label: string;
        value: string;
        primary?: boolean;
        isOther?: boolean;
      }>) || [];
  } else if (toolInvocation.state === "result" && toolInvocation.result) {
    // Handle result state - get actions from result
    // This ensures we can handle both cases where the tool execution may have modified the actions
    if (typeof toolInvocation.result === "string") {
      try {
        const parsedResult = JSON.parse(toolInvocation.result);
        if (parsedResult.actions) {
          actions = parsedResult.actions;
        }
      } catch (e) {
        console.error("Failed to parse suggestActions result", e);
      }
    } else if (toolInvocation.result && "actions" in toolInvocation.result) {
      actions = toolInvocation.result.actions as Array<{
        label: string;
        value: string;
        primary?: boolean;
        isOther?: boolean;
      }>;
    }
  }

  if (actions.length === 0) return null;

  // Added margin-bottom to ensure space between buttons and input
  return (
    <div className="w-full mb-16 mt-2 px-2 flex justify-end">
      <ActionButtons
        actions={actions}
        onActionClick={(value, isOther) => {
          // Complete the tool call only if it's still in call state
          if (toolInvocation.state === "call") {
            addToolResult({
              toolCallId: toolInvocation.toolCallId,
              result: JSON.stringify({
                success: true,
                selectedAction: value,
                message: "User selected an action",
                actions,
              }),
            });
          }

          // Then dispatch the event for the app to handle
          const event = new CustomEvent("action-button-clicked", {
            detail: {
              text: value,
              isOther: isOther,
            },
          });
          window.dispatchEvent(event);
        }}
      />
    </div>
  );
}

function Chat() {
  // Handle mobile viewport height issues with URL bar
  useEffect(() => {
    const setMobileViewportHeight = () => {
      // Always use current viewport height - this allows input to sit on keyboard
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };

    // Set initial value
    setMobileViewportHeight();

    // Update on resize (handles URL bar and keyboard)
    window.addEventListener("resize", setMobileViewportHeight);

    // Handle orientation changes
    window.addEventListener("orientationchange", () => {
      setTimeout(setMobileViewportHeight, 100);
    });

    // Visual viewport API for better keyboard handling
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", setMobileViewportHeight);
    }

    // Cleanup
    return () => {
      window.removeEventListener("resize", setMobileViewportHeight);
      window.removeEventListener("orientationchange", setMobileViewportHeight);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener(
          "resize",
          setMobileViewportHeight
        );
      }
    };
  }, []);

  // Add global error handlers for better error handling
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason);

      // Check if it's a JSON parsing error
      if (event.reason?.message?.includes("JSON")) {
        console.error("JSON parsing error detected:", event.reason);
        // Prevent the error from causing a blank screen
        event.preventDefault();
      }
    };

    const handleError = (event: ErrorEvent) => {
      console.error("Global error caught:", event.error);

      // Check if it's a JSON parsing error
      if (event.error?.message?.includes("JSON")) {
        console.error("JSON parsing error detected:", event.error);
      }
    };

    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleError);

    return () => {
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection
      );
      window.removeEventListener("error", handleError);
    };
  }, []);

  // Get authenticated agent configuration
  const agentConfig = useAgentAuth();

  // Use the agent configuration (only available when authenticated)
  if (!agentConfig) {
    // This should never happen inside AuthGuard, but just in case
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-900 via-black to-green-900 dark:from-green-900 dark:via-black dark:to-green-900">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-4">Loading...</h1>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto" />
        </div>
      </div>
    );
  }

  // UI-related state
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    // Check localStorage first, default to dark if not found
    const savedTheme = localStorage.getItem("theme");
    return (savedTheme as "dark" | "light") || "dark";
  });
  const [showDebug, setShowDebug] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Add temporary loading state for smoother mode transitions
  const [temporaryLoading, setTemporaryLoading] = useState(false);
  // Get auth context for token expiration checks (must be at top level due to Rules of Hooks)
  const auth = useAuth();

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
  };

  useEffect(() => {
    // Apply theme class on mount and when theme changes
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }

    // Save theme preference to localStorage
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Use the agent state hook with authenticated config
  const {
    agent,
    agentState,
    agentMode,
    agentConfig: finalAgentConfig,
    changeAgentMode,
  } = useAgentState(agentConfig!, "onboarding"); // Non-null assertion: agentConfig is guaranteed to exist here due to AuthGuard

  // Use the error handling hook
  const { isErrorMessage, parseErrorData, formatErrorForMessage } =
    useErrorHandling();

  // Removed excessive debug logging that was cluttering console on every render

  // IMPORTANT: Check for auth errors BEFORE calling useAgentChat
  // This prevents the hook from trying to process error objects
  const {
    messages: agentMessagesRaw,
    input: agentInput,
    handleInputChange: handleAgentInputChange,
    handleSubmit: handleAgentSubmit,
    addToolResult,
    clearHistory,
    data: agentData,
    setInput,
    setMessages,
    reload,
    isLoading,
  } = useAgentChat({
    agent,
    maxSteps: 5,
    onError: (error) => {
      console.error("Error while streaming:", error);
      console.log(
        "[ERROR HANDLER] Error details:",
        JSON.stringify(error, null, 2)
      );
      console.log("[ERROR HANDLER] Error type:", typeof error);
      console.log(
        "[ERROR HANDLER] Error keys:",
        error ? Object.keys(error) : "no keys"
      );
      console.log(
        "[ERROR HANDLER] Error message:",
        error instanceof Error ? error.message : String(error)
      );
      console.log(
        "[ERROR HANDLER] Error stack:",
        error instanceof Error ? error.stack : "no stack"
      );

      // Use values from the editing hook for error handling
      console.log(
        `[Error] Error handler triggered, current messages length: ${agentMessages.length}, currentEditIndex: ${currentEditIndex}`
      );
      console.log(
        `[Error] Original values - length: ${originalMessagesLengthRef.current}, editIndex: ${originalEditIndexRef.current}`
      );

      // Create a new assistant message with the error
      const errorMessage = formatErrorForMessage(error);

      // Initialize with current messages
      let currentMessages = [...agentMessages];

      // If we have an original edit index from a recent edit
      if (
        originalEditIndexRef.current !== null &&
        editedMessageContentRef.current
      ) {
        console.log(
          `[Error] Using original edit context, index: ${originalEditIndexRef.current}`
        );
        console.log(
          `[Error] Using stored edited content: "${editedMessageContentRef.current.substring(0, 30)}..."`
        );

        // We had an edit in progress - truncate to before the edit using ORIGINAL values
        const originalLength = currentMessages.length;
        const editIndex = originalEditIndexRef.current;

        currentMessages =
          editIndex > 0 ? agentMessages.slice(0, editIndex) : [];

        console.log(
          `[Error] Truncated from ${originalLength} to ${currentMessages.length} messages`
        );

        // Add the stored edited message (rather than whatever might be in the input)
        const editedMessageText = editedMessageContentRef.current;
        console.log(
          `[Error] Adding edited message: "${editedMessageText.substring(0, 30)}..."`
        );
        currentMessages.push({
          id: crypto.randomUUID(),
          role: "user" as const,
          createdAt: new Date(),
          content: editedMessageText,
          parts: [
            {
              type: "text" as const,
              text: editedMessageText,
            },
          ],
        });

        // Reset original refs
        originalEditIndexRef.current = null;
        originalMessagesLengthRef.current = 0;
        editedMessageContentRef.current = "";
      } else if (currentEditIndex !== null) {
        // Fallback to current edit index (for retry operations)
        console.log(
          `[Error] Using current edit context, index: ${currentEditIndex}`
        );

        // We're in the middle of editing - truncate to before the edit
        const originalLength = currentMessages.length;
        currentMessages =
          currentEditIndex > 0 ? agentMessages.slice(0, currentEditIndex) : [];

        console.log(
          `[Error] Truncated from ${originalLength} to ${currentMessages.length} messages`
        );

        // Also add the message being edited (from input)
        const editedMessageText = agentInput.trim();
        if (editedMessageText) {
          console.log(
            `[Error] Adding edited message from input: "${editedMessageText.substring(0, 30)}..."`
          );
          currentMessages.push({
            id: crypto.randomUUID(),
            role: "user" as const,
            createdAt: new Date(),
            content: editedMessageText,
            parts: [
              {
                type: "text" as const,
                text: editedMessageText,
              },
            ],
          });
        }

        // Reset editing state
        setCurrentEditIndex(null);
      } else {
        // For regular messages, make sure the user message is included
        const lastUserInput = agentInput.trim();
        const lastMessageIsUser =
          currentMessages.length > 0 &&
          currentMessages[currentMessages.length - 1].role === "user";

        if (lastUserInput && !lastMessageIsUser) {
          console.log(
            `[Error] Adding user message: "${lastUserInput.substring(0, 30)}..."`
          );
          // Add the user message that caused the error
          currentMessages.push({
            id: crypto.randomUUID(),
            role: "user" as const,
            createdAt: new Date(),
            content: lastUserInput,
            parts: [
              {
                type: "text" as const,
                text: lastUserInput,
              },
            ],
          });
        }
      }

      // Create a new error message with required format
      const newErrorMessage = {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        createdAt: new Date(),
        content: errorMessage,
        parts: [
          {
            type: "text" as const,
            text: errorMessage,
          },
        ],
      };

      console.log(
        `[Error] Setting ${currentMessages.length + 1} messages (${currentMessages.length} + error message)`
      );

      // Add the error message to the messages
      setMessages([...currentMessages, newErrorMessage]);

      // Reset retry state
      setIsRetrying(false);

      // Clear any refs
      originalEditIndexRef.current = null;
      originalMessagesLengthRef.current = 0;
      editedMessageContentRef.current = "";
    },
  });

  // SAFETY: Ensure agentMessages is always an array to prevent "messages.map is not a function" errors
  // Also detect API errors and throw proper auth errors for the Error Boundary to catch
  const hasApiError =
    agentMessagesRaw &&
    typeof agentMessagesRaw === "object" &&
    !Array.isArray(agentMessagesRaw) &&
    "error" in agentMessagesRaw;

  if (hasApiError) {
    const errorMessage =
      (agentMessagesRaw as { error?: string })?.error || "Unknown API error";
    const authError = new Error(
      `Authentication failed: ${errorMessage}`
    ) as Error & { isAuthError?: boolean };
    authError.isAuthError = true; // Mark as auth error
    throw authError; // Throw immediately - prevents .map() from being called
  }

  // The backend now guarantees arrays, but this is a safety measure
  const agentMessages = Array.isArray(agentMessagesRaw) ? agentMessagesRaw : [];

  // Use the message editing hook to manage message editing and retry logic
  const {
    editingMessageId,
    editingValue,
    currentEditIndex,
    isRetrying,
    originalMessagesLengthRef,
    originalEditIndexRef,
    editedMessageContentRef,
    setEditingValue,
    setCurrentEditIndex,
    setIsRetrying,
    startEditing,
    cancelEditing,
    handleEditMessage,
    handleRetry,
    handleRetryLastUserMessage,
  } = useMessageEditing(agentMessages, setMessages, agentInput, reload);

  // Handle custom event for setting chat input from PlaybookPanel
  useEffect(() => {
    // Function to set input and switch to chat tab if needed
    function handleSetChatInput(event: CustomEvent) {
      if (event.detail) {
        setInput(event.detail.text || "");
      }
    }

    // Add event listener
    window.addEventListener(
      "set-chat-input",
      handleSetChatInput as EventListener
    );

    // Cleanup
    return () => {
      window.removeEventListener(
        "set-chat-input",
        handleSetChatInput as EventListener
      );
    };
  }, [setInput]);

  // Handle OAuth token exchange
  const handleOAuthTokenExchange = useCallback(
    async (code: string, state: string) => {
      try {
        console.log("[DEBUG] Starting OAuth token exchange...");
        console.log("[DEBUG] Received state:", `${state?.substring(0, 10)}...`);

        // Get the stored code verifier and state from sessionStorage
        const storedCodeVerifier = sessionStorage.getItem(
          "spotify_code_verifier"
        );
        const storedState = sessionStorage.getItem("spotify_state");

        console.log(
          "[DEBUG] Stored state:",
          `${storedState?.substring(0, 10)}...`
        );
        console.log("[DEBUG] Code verifier exists:", !!storedCodeVerifier);
        console.log(
          "[DEBUG] Code verifier length:",
          storedCodeVerifier?.length
        );

        if (!storedCodeVerifier || storedState !== state) {
          console.error("[DEBUG] Invalid OAuth state or missing code verifier");
          console.error("[DEBUG] State match:", storedState === state);
          console.error("[DEBUG] Code verifier exists:", !!storedCodeVerifier);
          console.error(
            "[DEBUG] Expected state:",
            `${storedState?.substring(0, 10)}...`
          );
          console.error(
            "[DEBUG] Received state:",
            `${state?.substring(0, 10)}...`
          );
          return;
        }

        console.log(
          "[DEBUG] PKCE validation passed, proceeding with token exchange"
        );

        // Get Spotify config
        console.log("[DEBUG] Fetching Spotify config...");
        const configResponse = await fetch("/spotify/config");
        if (!configResponse.ok) {
          throw new Error("Failed to load Spotify configuration");
        }
        const config = (await configResponse.json()) as {
          SPOTIFY_CLIENT_ID: string;
          SPOTIFY_REDIRECT_URI: string;
        };
        console.log("[DEBUG] Spotify config loaded:", config);

        // Exchange authorization code for tokens
        console.log("[DEBUG] Exchanging code for tokens with Spotify API...");
        const tokenResponse = await fetch(
          "https://accounts.spotify.com/api/token",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code: code,
              redirect_uri: config.SPOTIFY_REDIRECT_URI,
              client_id: config.SPOTIFY_CLIENT_ID,
              code_verifier: storedCodeVerifier,
            }),
          }
        );

        console.log(
          "[DEBUG] Spotify token response status:",
          tokenResponse.status,
          tokenResponse.ok
        );

        if (!tokenResponse.ok) {
          const errorData = (await tokenResponse.json()) as {
            error?: string;
            error_description?: string;
          };
          console.error("[DEBUG] Spotify token exchange error:", errorData);
          throw new Error(
            `Token exchange failed: ${errorData.error_description || errorData.error}`
          );
        }

        const tokens = (await tokenResponse.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_in?: number;
          token_type?: string;
          scope?: string;
        };
        console.log("[DEBUG] Token exchange successful, tokens received:", {
          hasAccessToken: !!tokens.access_token,
          hasRefreshToken: !!tokens.refresh_token,
          expiresIn: tokens.expires_in,
          scope: tokens.scope,
        });

        // Clean up sessionStorage
        sessionStorage.removeItem("spotify_code_verifier");
        sessionStorage.removeItem("spotify_state");
        console.log("[DEBUG] Cleaned up sessionStorage");

        // Dispatch the success event with tokens
        console.log("[DEBUG] Dispatching spotify-auth-success event");
        const event = new CustomEvent("spotify-auth-success", {
          detail: { tokens },
        });
        window.dispatchEvent(event);
      } catch (error) {
        console.error("[DEBUG] OAuth token exchange failed:", error);
      }
    },
    []
  );

  // Handle Spotify authentication success
  useEffect(() => {
    function handleSpotifyAuthSuccess(event: CustomEvent) {
      const { tokens } = event.detail;
      console.log("[DEBUG] handleSpotifyAuthSuccess called with tokens:", {
        hasAccessToken: !!tokens?.access_token,
        hasRefreshToken: !!tokens?.refresh_token,
        expiresIn: tokens?.expires_in,
        tokenType: tokens?.token_type,
        scope: tokens?.scope,
      });

      // Call the agent endpoint to store tokens securely
      const storeTokens = async () => {
        console.log("[DEBUG] Starting token storage process...");
        try {
          // Get the user's AtYourService.ai OAuth token for authentication
          const authMethodStr = localStorage.getItem("auth_method");
          console.log(
            "[DEBUG] Auth method from localStorage:",
            !!authMethodStr
          );

          if (!authMethodStr) {
            throw new Error("No authentication found. Please sign in first.");
          }

          const authMethod = JSON.parse(authMethodStr);
          console.log("[DEBUG] Parsed auth method:", {
            hasApiKey: !!authMethod?.apiKey,
            type: authMethod?.type,
            hasUserInfo: !!authMethod?.userInfo,
          });

          if (!authMethod?.apiKey) {
            throw new Error(
              "Invalid authentication data. Please sign in again."
            );
          }

          const endpoint = `/agents/${finalAgentConfig.agent}/${finalAgentConfig.name}/store-spotify-tokens`;
          console.log("[DEBUG] Calling endpoint:", endpoint);

          const requestBody = {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expires_in: tokens.expires_in,
            token_type: tokens.token_type,
            scope: tokens.scope,
          };
          console.log("[DEBUG] Request body:", {
            hasAccessToken: !!requestBody.access_token,
            hasRefreshToken: !!requestBody.refresh_token,
            expiresIn: requestBody.expires_in,
            tokenType: requestBody.token_type,
            scope: requestBody.scope,
          });

          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authMethod.apiKey}`,
            },
            body: JSON.stringify(requestBody),
          });

          console.log(
            "[DEBUG] Store tokens response:",
            response.status,
            response.ok
          );

          if (!response.ok) {
            console.error(
              "[DEBUG] Store tokens response not ok:",
              response.status,
              response.statusText
            );
            throw new Error(`Failed to store tokens: ${response.statusText}`);
          }

          const result = await response.json();
          console.log("[DEBUG] Tokens stored successfully:", result);

          // Create a user message indicating authentication completed
          const authMessage =
            "I've successfully completed Spotify authentication.";

          console.log("[DEBUG] Creating user message:", authMessage);

          const newMessage = {
            id: crypto.randomUUID(),
            role: "user" as const,
            createdAt: new Date(),
            content: authMessage,
            parts: [
              {
                type: "text" as const,
                text: authMessage,
              },
            ],
          };

          // Add the message to the chat
          console.log(
            "[DEBUG] Adding message to chat and triggering reload..."
          );
          setMessages([...agentMessages, newMessage]);

          // Trigger the agent to respond
          setTimeout(() => {
            reload();
          }, 100);
        } catch (error) {
          console.error("[DEBUG] Error storing Spotify tokens:", error);
          // Show error message to user
          const errorMessage = `Failed to store Spotify authentication. Error: ${error instanceof Error ? error.message : String(error)}`;

          console.log("[DEBUG] Creating error message:", errorMessage);

          const newMessage = {
            id: crypto.randomUUID(),
            role: "user" as const,
            createdAt: new Date(),
            content: errorMessage,
            parts: [
              {
                type: "text" as const,
                text: errorMessage,
              },
            ],
          };

          setMessages([...agentMessages, newMessage]);
          setTimeout(() => {
            reloadWithTokenCheck();
          }, 100);
        }
      };

      storeTokens();
    }

    window.addEventListener(
      "spotify-auth-success",
      handleSpotifyAuthSuccess as EventListener
    );

    return () => {
      window.removeEventListener(
        "spotify-auth-success",
        handleSpotifyAuthSuccess as EventListener
      );
    };
  }, [setMessages, agentMessages, reload, finalAgentConfig]);

  // Separate effect for OAuth callback check - only run once on mount
  useEffect(() => {
    const checkOAuthCallback = () => {
      console.log("[DEBUG] Checking for OAuth callback...");

      // Check URL parameters (for direct OAuth returns)
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const state = urlParams.get("state");
      const error = urlParams.get("error");
      const errorDescription = urlParams.get("error_description");

      // Check for Spotify-specific callback parameters
      const spotifyCode = urlParams.get("spotify_code");
      const spotifyState = urlParams.get("spotify_state");
      const spotifyCallback = urlParams.get("spotify_callback");

      console.log("[DEBUG] URL parameters:", {
        code: `${code?.substring(0, 10)}...`,
        state: `${state?.substring(0, 10)}...`,
        error,
        errorDescription,
        spotifyCode: `${spotifyCode?.substring(0, 10)}...`,
        spotifyState: `${spotifyState?.substring(0, 10)}...`,
        spotifyCallback,
      });

      // Check localStorage for Spotify callback data (from server callback - backup method)
      const storedSpotifyData = localStorage.getItem("spotify_callback_data");
      console.log(
        "[DEBUG] Spotify callback data in localStorage:",
        storedSpotifyData
      );

      // Handle Spotify OAuth callback (URL parameters method)
      if (spotifyCallback === "true" && spotifyCode && spotifyState) {
        console.log(
          "[DEBUG] Spotify OAuth callback detected via URL parameters"
        );

        // Clean up URL parameters
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete("spotify_code");
        newUrl.searchParams.delete("spotify_state");
        newUrl.searchParams.delete("spotify_callback");
        window.history.replaceState({}, "", newUrl.toString());

        // Process the OAuth callback
        handleOAuthTokenExchange(spotifyCode, spotifyState);
        return;
      }

      // Handle Spotify OAuth callback (localStorage method - fallback)
      if (storedSpotifyData) {
        console.log("[DEBUG] Spotify OAuth callback detected via localStorage");
        try {
          const { code: storedCode, state: storedState } =
            JSON.parse(storedSpotifyData);
          localStorage.removeItem("spotify_callback_data");
          handleOAuthTokenExchange(storedCode, storedState);
          return;
        } catch (error) {
          console.error("[DEBUG] Error parsing stored Spotify data:", error);
        }
      }

      // Handle AtYourService.ai OAuth callback
      if (code && state && !spotifyCallback) {
        console.log("[DEBUG] AtYourService.ai OAuth callback detected");
        handleOAuthTokenExchange(code, state);
        return;
      }

      console.log(
        "[DEBUG] No OAuth callback data found in URL or localStorage"
      );
    };

    checkOAuthCallback();
  }, []); // Empty dependency array ensures this runs only once on mount

  // Handle action button clicks from the suggestActions tool
  useEffect(() => {
    function handleActionButtonClick(event: CustomEvent) {
      if (event.detail && event.detail.text !== undefined) {
        const selectedText = event.detail.text;
        const isOther = event.detail.isOther === true;

        // If the user selects the "Other" option, just focus the input field
        if (isOther) {
          // Focus the input field for custom entry
          setTimeout(() => {
            // Find the textarea element directly (more reliable than using ref)
            const textareas = document.querySelectorAll("textarea");
            if (textareas.length > 0) {
              const textarea = textareas[0];
              textarea.focus();
              // Optional: Add a slight delay to ensure focus works after UI updates
              setTimeout(() => {
                textarea.focus();
              }, 100);
            }
          }, 50);
          return;
        }

        // For non-Other options, directly add a user message with the selected text
        if (selectedText) {
          // Set the input value first (needed for compatibility with input validation)
          setInput(selectedText);

          // Then create a synthetic form submit event
          setTimeout(() => {
            // Create a new user message
            const newMessage = {
              id: crypto.randomUUID(),
              role: "user" as const,
              createdAt: new Date(),
              content: selectedText,
              parts: [
                {
                  type: "text" as const,
                  text: selectedText,
                },
              ],
            };

            // Add the message to the chat
            setMessages([...agentMessages, newMessage]);

            // Clear the input field
            setInput("");

            // Trigger the agent to respond
            setTimeout(() => {
              reloadWithTokenCheck();
            }, 50);
          }, 10);
        }
      }
    }

    // Add event listener
    window.addEventListener(
      "action-button-clicked",
      handleActionButtonClick as EventListener
    );

    // Cleanup
    return () => {
      window.removeEventListener(
        "action-button-clicked",
        handleActionButtonClick as EventListener
      );
    };
  }, [setMessages, agentMessages, setInput]);

  // Reset textarea height when input is empty
  useEffect(() => {
    if (agentInput === "" && textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [agentInput]);

  const pendingToolCallConfirmation = agentMessages.some((m: Message) =>
    m.parts?.some(
      (part) =>
        part.type === "tool-invocation" &&
        part.toolInvocation.state === "call" &&
        toolsRequiringConfirmation.includes(
          part.toolInvocation.toolName as keyof ToolTypes
        )
    )
  );

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  // Handle message rendering loop
  const renderMessages = () => {
    // SAFETY: Double-check that agentMessages is a valid array
    if (!Array.isArray(agentMessages) || agentMessages.length === 0) {
      return <EmptyChat />;
    }

    // Render all regular messages
    const messageElements = agentMessages.map((message: Message, index) => {
      // Common variable setup
      const isUser = message.role === "user";
      const isMessageError = isErrorMessage(message);
      const isEditing = editingMessageId === message.id;
      const isSystemMessage = message.role === "system";

      // Special handling for error messages
      if (isMessageError && !isUser) {
        const errorData = parseErrorData(message);

        return (
          <div key={message.id}>
            <ErrorMessage
              errorData={errorData}
              onRetry={() => handleRetryWithTokenCheck(index)}
              isLoading={isLoading}
              formatTime={formatTime}
              createdAt={message.createdAt}
            />
          </div>
        );
      }

      // For user messages or system messages, use our ChatMessage component
      if (isUser || isSystemMessage) {
        return (
          <ChatMessage
            key={message.id}
            message={message}
            index={index}
            isEditing={isEditing}
            editingValue={editingValue}
            onStartEditing={startEditing}
            onCancelEditing={cancelEditing}
            onSaveEdit={handleEditMessage}
            onEditingValueChange={setEditingValue}
            formatTime={formatTime}
            showDebug={showDebug}
          />
        );
      }

      // For assistant messages with multiple parts
      return (
        <div key={message.id} className="mb-4">
          {showDebug && (
            <pre className="text-sm text-muted-foreground overflow-scroll mb-2">
              {JSON.stringify(message, null, 2)}
            </pre>
          )}

          <div className="flex justify-start">
            <div className="flex gap-2 max-w-[85%] flex-row">
              <Avatar username={"AI"} />

              <div className="space-y-3">
                {/* Render each part in sequence */}
                {message.parts?.map((part, i) => {
                  // For text parts
                  if (part.type === "text") {
                    return (
                      <div
                        key={`${message.id}-text-${part.text?.substring(0, 10) || i}`}
                      >
                        <Card className="p-3 rounded-md bg-neutral-100 dark:bg-neutral-900 rounded-bl-none border-assistant-border">
                          <div className="text-base markdown-content">
                            <MemoizedMarkdown
                              id={`${message.id}-${i}`}
                              content={part.text || ""}
                            />
                          </div>
                        </Card>
                      </div>
                    );
                  }

                  // For tool invocation parts
                  if (part.type === "tool-invocation") {
                    const toolInvocation = part.toolInvocation;
                    const toolCallId = toolInvocation.toolCallId;
                    const needsConfirmation =
                      toolsRequiringConfirmation.includes(
                        toolInvocation.toolName as keyof ToolTypes
                      ) && toolInvocation.state === "call";

                    // Skip suggestActions invocations since they are handled separately
                    if (toolInvocation.toolName === "suggestActions") {
                      return null;
                    }

                    // Check if this tool result has embedded player data
                    const hasEmbeddedPlayer =
                      toolInvocation.state === "result" &&
                      toolInvocation.result &&
                      typeof toolInvocation.result === "object" &&
                      "showEmbeddedPlayer" in toolInvocation.result &&
                      toolInvocation.result.showEmbeddedPlayer === true &&
                      "embeddedPlayerData" in toolInvocation.result &&
                      toolInvocation.result.embeddedPlayerData &&
                      typeof toolInvocation.result.embeddedPlayerData ===
                        "object";

                    return (
                      <div key={`${message.id}-tool-${toolCallId}`}>
                        <ToolInvocationCard
                          agentState={agentState}
                          toolInvocation={toolInvocation}
                          toolCallId={toolCallId}
                          needsConfirmation={needsConfirmation}
                          addToolResult={addToolResult}
                        />

                        {/* Render Spotify player directly in chat when available */}
                        {hasEmbeddedPlayer && (
                          <div className="mt-3">
                            <SpotifyPlayerCard
                              uri={
                                (toolInvocation.result as any)
                                  .embeddedPlayerData.uri
                              }
                              title={
                                (toolInvocation.result as any)
                                  .embeddedPlayerData.title
                              }
                              description={
                                (toolInvocation.result as any)
                                  .embeddedPlayerData.description
                              }
                              reason={
                                (toolInvocation.result as any)
                                  .embeddedPlayerData.reason
                              }
                            />
                          </div>
                        )}
                      </div>
                    );
                  }

                  return null;
                })}

                {/* Timestamp for the entire message */}
                <p className="text-xs text-muted-foreground mt-1 text-left">
                  {formatTime(new Date(message.createdAt as unknown as string))}
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    });

    // Check if the last message is from the user with no assistant response
    if (!isLoading && !isRetrying && agentMessages.length > 0) {
      const lastMessage = agentMessages[agentMessages.length - 1];
      const isLastMessageFromUser = lastMessage.role === "user";

      if (isLastMessageFromUser) {
        messageElements.push(
          <div key="missing-response">
            <MissingResponseIndicator
              onTryAgain={handleRetryLastUserMessageWithTokenCheck}
              isLoading={isLoading}
              formatTime={formatTime}
            />
          </div>
        );
      }
    }

    // Check if there's an assistant message currently being streamed
    const isCurrentlyStreaming =
      agentMessages.length > 0 &&
      agentMessages[agentMessages.length - 1].role === "assistant" &&
      (agentMessages[agentMessages.length - 1].parts?.find(
        (part) => part.type === "text"
      )?.text?.length || 0) > 0;

    // If we're loading (waiting for a response), show a typing indicator
    // But only if we're not already streaming an assistant message
    if ((isLoading || temporaryLoading) && !isCurrentlyStreaming) {
      // Show loading indicator when isLoading is true or temporaryLoading is set
      // but not when there's already an assistant message being streamed
      messageElements.push(
        <div key="loading-indicator">
          <LoadingIndicator formatTime={formatTime} />
        </div>
      );
    }

    // Add warning for disconnected state
    const typedAgentData = agentData as unknown as AgentData;
    if (
      typeof typedAgentData?.connectionStatus === "string" &&
      (typedAgentData.connectionStatus === "disconnected" ||
        typedAgentData.connectionStatus === "error" ||
        typedAgentData.connectionStatus === "reconnecting")
    ) {
      messageElements.push(
        <div key="connection-warning" className="flex justify-center my-4">
          <div className="bg-red-100 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm flex items-center gap-2 text-red-800 dark:text-red-300 max-w-md">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
              className="w-6 h-6"
              role="img"
              aria-label="Warning icon"
            >
              <title>Warning</title>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>
              {typedAgentData.connectionStatus === "disconnected" &&
                "Connection lost. Trying to reconnect..."}
              {typedAgentData.connectionStatus === "error" &&
                "Connection error. Trying to reconnect..."}
              {typedAgentData.connectionStatus === "reconnecting" &&
                "Reconnecting..."}
            </span>
          </div>
        </div>
      );
    }

    // Add suggested actions at the end of messages
    messageElements.push(
      <SuggestedActions
        key="suggested-actions"
        messages={agentMessages}
        addToolResult={addToolResult}
        reload={reloadWithTokenCheck}
      />
    );

    return messageElements;
  };

  // Update the clearHistory function to properly handle post-clear welcome messages
  const handleClearHistory = () => {
    // Clear the history first
    clearHistory();

    // Reset retrying state
    setIsRetrying(false);

    // Use a temporary loading indicator for better UX
    // We need this because clearing history doesn't naturally trigger the isLoading state
    // This gives visual feedback that something is happening
    setTemporaryLoading(true);
    setTimeout(() => setTemporaryLoading(false), 1500);

    // After clearing, force refresh the current mode to generate a welcome message
    if (changeAgentMode) {
      console.log("[UI] Refreshing mode after clearing history");

      // Pass true for both force and isAfterClearHistory
      // The isAfterClearHistory flag is critical to ensure proper behavior:
      // - On page reload, the agent's onConnect method ensures a welcome message
      // - When clearing history, we don't trigger onConnect, so we need this flag
      // - This makes the mode transition create a fresh welcome message
      // - Without this flag, clearing history would leave an empty chat with no welcome message
      changeAgentMode(agentMode, true, true);
    }
  };

  // Wrapper for reload with token expiration check
  const reloadWithTokenCheck = useCallback(() => {
    // Check for token expiration before reloading (with safety check)
    if (auth?.checkTokenExpiration()) {
      return; // Token expired, user will be prompted to re-authenticate
    }
    reload();
  }, [auth, reload]);

  // Update retry handlers to check token expiration
  const handleRetryWithTokenCheck = (index: number) => {
    // Check for token expiration before retrying (with safety check)
    if (auth?.checkTokenExpiration()) {
      return; // Token expired, user will be prompted to re-authentication
    }
    handleRetry(index);
  };

  const handleRetryLastUserMessageWithTokenCheck = () => {
    // Check for token expiration before retrying (with safety check)
    if (auth?.checkTokenExpiration()) {
      return; // Token expired, user will be prompted to re-authenticate
    }

    handleRetryLastUserMessage();
  };

  // Update handleSubmitWithRetry to properly handle options
  const handleSubmitWithRetry = (e: React.FormEvent) => {
    // Check for token expiration before submitting (with safety check)
    if (auth?.checkTokenExpiration()) {
      return; // Token expired, user will be prompted to re-authenticate
    }

    setIsRetrying(false); // Clear retrying state when sending a new message
    handleAgentSubmit(e);
  };

  // Handle empty chat state with a loading indicator
  useEffect(() => {
    // If we have no messages but the agent is connected, show a loading indicator
    // This helps with the initial loading experience for new chatrooms
    if (
      agent &&
      Array.isArray(agentMessages) &&
      agentMessages.length === 0 &&
      !isLoading
    ) {
      setTemporaryLoading(true);

      // Set a timeout to clear the loading state if no messages arrive
      const timeout = setTimeout(() => {
        setTemporaryLoading(false);
      }, 2000);

      return () => clearTimeout(timeout);
    }
  }, [agent, agentMessages, isLoading]);

  // Single simplified auto-response for system messages (welcome or transition)
  useEffect(() => {
    if (
      Array.isArray(agentMessages) &&
      agentMessages.length > 0 &&
      !isLoading &&
      !temporaryLoading
    ) {
      const lastMessage = agentMessages[agentMessages.length - 1];

      // Check if last message is a system message with isModeMessage data
      if (lastMessage.role === "system") {
        const messageData = lastMessage.data;
        const isModeMessage =
          messageData &&
          typeof messageData === "object" &&
          "isModeMessage" in messageData;

        if (isModeMessage) {
          console.log(
            `[UI] Auto-triggering AI response for ${messageData.modeType} message`
          );
          // Trigger AI response just like a user sent a message
          reloadWithTokenCheck();
        }
      }
    }
  }, [agentMessages, isLoading, temporaryLoading, reloadWithTokenCheck]);

  return (
    <div
      className="w-full p-2 md:p-4 flex justify-center items-center bg-fixed overflow-hidden"
      style={{
        height: "calc(var(--vh, 1vh) * 100)",
        minHeight: "calc(var(--vh, 1vh) * 100)",
      }}
    >
      {/* Main Container - Responsive layout with chat and playbook */}
      <div
        className="w-full mx-auto max-w-7xl flex flex-col md:flex-row md:space-x-4 space-y-4 md:space-y-0"
        style={{
          height: "calc(var(--vh, 1vh) * 100 - 1rem)",
          maxHeight: "calc(var(--vh, 1vh) * 100 - 1rem)",
        }}
      >
        {/* Chat UI - Full width on mobile, shared width on desktop */}
        <ChatContainer
          theme={theme}
          showDebug={showDebug}
          agentMode={agentMode}
          inputValue={agentInput}
          isLoading={isLoading}
          pendingConfirmation={pendingToolCallConfirmation}
          onToggleTheme={toggleTheme}
          onToggleDebug={() => setShowDebug((prev) => !prev)}
          onChangeMode={(newMode) => {
            // Use a temporary loading indicator for better UX
            // We need this because mode changes don't naturally trigger the isLoading state
            // since they don't involve an AI response - they're just UI state changes
            // This gives visual feedback that something is happening
            setTemporaryLoading(true);
            setTimeout(() => setTemporaryLoading(false), 1500);
            changeAgentMode(newMode);
          }}
          onClearHistory={handleClearHistory}
          onInputChange={handleAgentInputChange}
          onInputSubmit={(e) => {
            handleSubmitWithRetry(e);
          }}
        >
          {renderMessages()}
        </ChatContainer>

        {/* Playbook Panel - Desktop only */}
        <div className="hidden md:block">
          <PlaybookContainer
            agentMode={agentMode}
            agentState={agentState}
            showDebug={showDebug}
          />
        </div>
      </div>
    </div>
  );
}

// Main App component with authentication
export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-black to-green-900 dark:from-green-900 dark:via-black dark:to-green-900">
      <ErrorBoundary>
        <AuthProvider>
          <AuthGuard>
            <Chat />
          </AuthGuard>
        </AuthProvider>
      </ErrorBoundary>
    </div>
  );
}
