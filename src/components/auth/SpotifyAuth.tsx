import { useEffect, useState } from "react";
import { Button } from "@/components/button/Button";

interface SpotifyAuthProps {
  onAuthSuccess: (tokens: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  }) => void;
  onAuthError: (error: string) => void;
}

export function SpotifyAuth({ onAuthSuccess, onAuthError }: SpotifyAuthProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Check for OAuth session callback from server
    const checkOAuthCallback = () => {
      console.log("Checking for OAuth callback parameters...");
      console.log("Current URL:", window.location.href);
      console.log("Search params:", window.location.search);

      const urlParams = new URLSearchParams(window.location.search);
      const sessionToken = urlParams.get("session");
      const userId = urlParams.get("user");
      const authStatus = urlParams.get("auth");
      const error = urlParams.get("error");
      const errorDescription = urlParams.get("error_description");

      const sessionParams = {
        hasSession: !!sessionToken,
        userId,
        authStatus,
        error,
        errorDescription,
      };

      console.log("OAuth session params:", sessionParams);

      if (error) {
        console.error("Spotify OAuth error:", error, errorDescription);
        onAuthError(`${error}: ${errorDescription || "Unknown error"}`);
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }

      if (sessionToken && userId && authStatus === "success") {
        console.log("OAuth session callback detected:", { sessionToken, userId });
        handleSessionCallback(sessionToken, userId);
        return;
      }

      console.log("No OAuth session callback parameters found");
    };

    // Listen for spotify-auth-success event from app.tsx
    const handleSpotifyAuthSuccess = (event: CustomEvent) => {
      const { tokens } = event.detail;
      console.log("[SpotifyAuth] Received spotify-auth-success event:", tokens);

      setIsConnected(true);
      setIsLoading(false);
      onAuthSuccess(tokens);
    };

    window.addEventListener("spotify-auth-success", handleSpotifyAuthSuccess as EventListener);
    checkOAuthCallback();

    return () => {
      window.removeEventListener("spotify-auth-success", handleSpotifyAuthSuccess as EventListener);
    };
  }, [onAuthSuccess, onAuthError]);

  const logout = async () => {
    try {
      // Get current session data from localStorage
      const authData = localStorage.getItem("llmdj_spotify_auth");
      if (authData) {
        const parsed = JSON.parse(authData);

        // Call server logout endpoint if we have session data
        if (parsed.session_token && parsed.user_id) {
          await fetch("/api/spotify/logout", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sessionToken: parsed.session_token,
              userId: parsed.user_id
            }),
          });
        }
      }
    } catch (error) {
      console.warn("Failed to logout from server:", error);
    }

    // Always clear localStorage regardless of server response
    localStorage.removeItem("llmdj_spotify_auth");

    // Reload the page to reset auth state
    window.location.reload();
  };

  const initiateSpotifyAuth = () => {
    console.log("[SpotifyAuth] Initiating server-side OAuth flow");
    setIsLoading(true);

    // Simply redirect to server-side OAuth endpoint
    window.location.href = "/auth/spotify";
  };

  const handleSessionCallback = async (sessionToken: string, userId: string) => {
    console.log("[SpotifyAuth] handleSessionCallback called:", {
      sessionToken,
      userId,
    });
    setIsLoading(true);

    try {
      // Validate session token with the server
      const response = await fetch("/api/spotify/validate-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionToken, userId }),
      });

      console.log(
        "[SpotifyAuth] Session validation response status:",
        response.status,
        response.ok
      );

      if (!response.ok) {
        console.error("[SpotifyAuth] Session validation failed");
        throw new Error("Failed to validate Spotify session");
      }

      const sessionData = (await response.json()) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
      };

      console.log("[SpotifyAuth] Session validation successful:", sessionData);

      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      console.log("[SpotifyAuth] Cleaned up URL");

      setIsConnected(true);
      console.log("[SpotifyAuth] Calling onAuthSuccess with session data...");
      onAuthSuccess(sessionData);
    } catch (error) {
      console.error("[SpotifyAuth] Error handling session callback:", error);
      onAuthError(
        error instanceof Error
          ? error.message
          : "Failed to complete Spotify session validation"
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (isConnected) {
    return (
      <div className="flex items-center justify-between gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <span className="text-green-700 dark:text-green-300 font-medium">
            Spotify Connected Successfully
          </span>
        </div>
        <Button
          onClick={logout}
          variant="secondary"
          className="border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-800 px-3 py-1 text-sm"
        >
          Sign Out
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-[#1DB954] rounded-full flex items-center justify-center">
          <svg
            className="w-5 h-5 text-white"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.84-.179-.84-.66 0-.359.24-.66.54-.779 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.78.242 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z" />
          </svg>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Connect to Spotify
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Link your Spotify account to enable music control and personalized
            recommendations
          </p>
        </div>
      </div>

      <Button
        onClick={initiateSpotifyAuth}
        className="w-full bg-[#1DB954] hover:bg-[#1ed760] text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isLoading}
      >
        {isLoading ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Connecting...
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.84-.179-.84-.66 0-.359.24-.66.54-.779 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.78.242 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            Connect Spotify Account
          </div>
        )}
      </Button>

      <div className="text-xs text-gray-500 dark:text-gray-400">
        <p>• Requires Spotify Premium for full playback control</p>
        <p>• Safe & secure - we only access music data you allow</p>
        <p>• You can disconnect anytime from your Spotify account settings</p>
      </div>
    </div>
  );
}
