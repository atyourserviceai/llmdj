import { useState, useEffect } from "react";
import { Button } from "@/components/button/Button";

interface SpotifyConfig {
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_REDIRECT_URI: string;
}

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
  const [config, setConfig] = useState<SpotifyConfig | null>(null);

  console.log("[SpotifyAuth] Component rendered, state:", {
    isLoading,
    isConnected,
    config: !!config,
  });

  // Fetch Spotify configuration from server
  useEffect(() => {
    const fetchConfig = async () => {
      console.log("[SpotifyAuth] Starting config fetch...");
      try {
        const response = await fetch("/spotify/config");
        console.log(
          "[SpotifyAuth] Config response:",
          response.status,
          response.ok
        );
        if (response.ok) {
          const configData = (await response.json()) as SpotifyConfig;
          console.log("[SpotifyAuth] Config loaded successfully:", configData);
          setConfig(configData);
        } else {
          console.error(
            "[SpotifyAuth] Config response not ok:",
            response.status,
            response.statusText
          );
          onAuthError("Failed to load Spotify configuration");
        }
      } catch (error) {
        console.error("[SpotifyAuth] Error fetching config:", error);
        onAuthError("Failed to load Spotify configuration");
      }
    };

    // Check if we're returning from OAuth callback
    const checkOAuthCallback = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      const state = urlParams.get("state");
      const error = urlParams.get("error");
      const errorDescription = urlParams.get("error_description");

      if (error) {
        onAuthError(
          `Spotify authentication failed: ${errorDescription || error}`
        );
        // Clean up URL
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
        return;
      }

      if (code && state) {
        // We have authorization code, proceed with token exchange
        handleAuthCallback(code, state);
        // Clean up URL
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
        return;
      }
    };

    fetchConfig();
    // Note: OAuth callback handling is now done at the app level in app.tsx
    // checkOAuthCallback();
  }, [onAuthError]);

  // Check if we're handling an OAuth callback - but only after config is loaded
  useEffect(() => {
    console.log(
      "[SpotifyAuth] OAuth callback effect running, config loaded:",
      !!config
    );

    // Only proceed if config is loaded
    if (!config) {
      console.log(
        "[SpotifyAuth] Config not loaded yet, skipping OAuth callback check"
      );
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const error = urlParams.get("error");
    const state = urlParams.get("state");

    console.log("[SpotifyAuth] URL params check:", {
      hasCode: !!code,
      hasError: !!error,
      hasState: !!state,
      url: window.location.href,
    });

    if (error) {
      console.error("[SpotifyAuth] OAuth error in URL:", error);
      onAuthError(`Spotify authentication failed: ${error}`);
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (code && state) {
      console.log(
        "[SpotifyAuth] Found OAuth callback parameters, starting token exchange..."
      );
      handleAuthCallback(code, state);
    } else {
      console.log("[SpotifyAuth] No OAuth callback parameters found");
    }
  }, [config, onAuthError]); // Depend on config so this only runs after config is loaded

  const generateRandomString = (length: number): string => {
    const possible =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let text = "";
    for (let i = 0; i < length; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  };

  const generateCodeChallenge = async (
    codeVerifier: string
  ): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  };

  const initiateSpotifyAuth = async () => {
    console.log(
      "[SpotifyAuth] initiateSpotifyAuth called, current config:",
      config
    );
    setIsLoading(true);

    try {
      // Generate PKCE parameters
      const codeVerifier = generateRandomString(128);
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const state = generateRandomString(16);

      console.log("[SpotifyAuth] Generated PKCE parameters:", {
        codeVerifierLength: codeVerifier.length,
        state,
        codeChallenge: `${codeChallenge.substring(0, 10)}...`,
      });

      // Store PKCE verifier and state in sessionStorage
      sessionStorage.setItem("spotify_code_verifier", codeVerifier);
      sessionStorage.setItem("spotify_state", state);
      console.log("[SpotifyAuth] Stored PKCE parameters in sessionStorage");

      // Get configuration from server
      if (!config) {
        console.error(
          "[SpotifyAuth] Config is null when trying to initiate auth"
        );
        throw new Error("Spotify configuration not loaded");
      }

      const { SPOTIFY_CLIENT_ID: clientId, SPOTIFY_REDIRECT_URI: redirectUri } =
        config;

      console.log("[SpotifyAuth] Using config:", { clientId, redirectUri });

      // Spotify OAuth scopes needed for full functionality
      const scopes = [
        "user-read-playback-state",
        "user-modify-playback-state",
        "user-read-currently-playing",
        "playlist-read-private",
        "playlist-modify-public",
        "playlist-modify-private",
        "user-top-read",
        "user-library-read",
        "user-library-modify",
        "streaming",
        "user-read-email",
        "user-read-private",
      ].join(" ");

      // Build Spotify authorization URL
      const params = new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        scope: scopes,
        redirect_uri: redirectUri,
        state: state,
        code_challenge_method: "S256",
        code_challenge: codeChallenge,
      });

      const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;
      console.log("[SpotifyAuth] Redirecting to Spotify OAuth URL:", authUrl);

      // Redirect to Spotify for authorization
      window.location.href = authUrl;
    } catch (error) {
      console.error("[SpotifyAuth] Error initiating Spotify auth:", error);
      onAuthError(
        error instanceof Error
          ? error.message
          : "Failed to initiate Spotify authentication"
      );
      setIsLoading(false);
    }
  };

  const handleAuthCallback = async (code: string, state: string) => {
    console.log("[SpotifyAuth] handleAuthCallback called:", {
      codeLength: code?.length,
      state: `${state?.substring(0, 8)}...`,
    });
    setIsLoading(true);

    try {
      // Verify state parameter
      const storedState = sessionStorage.getItem("spotify_state");
      console.log("[SpotifyAuth] State verification:", {
        receivedState: `${state?.substring(0, 8)}...`,
        storedState: `${storedState?.substring(0, 8)}...`,
        match: state === storedState,
      });

      if (state !== storedState) {
        console.error("[SpotifyAuth] State mismatch - possible CSRF attack");
        throw new Error("Invalid state parameter");
      }

      // Get stored PKCE verifier
      const codeVerifier = sessionStorage.getItem("spotify_code_verifier");
      console.log("[SpotifyAuth] Code verifier check:", {
        hasCodeVerifier: !!codeVerifier,
        length: codeVerifier?.length,
      });

      if (!codeVerifier) {
        console.error("[SpotifyAuth] Missing PKCE code verifier");
        throw new Error("Missing PKCE code verifier");
      }

      // Exchange authorization code for tokens
      if (!config) {
        console.error("[SpotifyAuth] Config is null during token exchange");
        throw new Error("Spotify configuration not loaded");
      }

      const { SPOTIFY_CLIENT_ID: clientId, SPOTIFY_REDIRECT_URI: redirectUri } =
        config;

      console.log("[SpotifyAuth] Starting token exchange with Spotify API...");
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
            redirect_uri: redirectUri,
            client_id: clientId,
            code_verifier: codeVerifier,
          }),
        }
      );

      console.log(
        "[SpotifyAuth] Token response status:",
        tokenResponse.status,
        tokenResponse.ok
      );

      if (!tokenResponse.ok) {
        const errorData = (await tokenResponse.json()) as {
          error?: string;
          error_description?: string;
        };
        console.error(
          "[SpotifyAuth] Token exchange error response:",
          errorData
        );
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

      console.log("[SpotifyAuth] Token exchange successful:", {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresIn: tokens.expires_in,
        tokenType: tokens.token_type,
        scope: tokens.scope,
      });

      // Clean up stored PKCE parameters
      sessionStorage.removeItem("spotify_code_verifier");
      sessionStorage.removeItem("spotify_state");
      console.log(
        "[SpotifyAuth] Cleaned up PKCE parameters from sessionStorage"
      );

      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      console.log("[SpotifyAuth] Cleaned up URL");

      setIsConnected(true);
      console.log("[SpotifyAuth] Calling onAuthSuccess with tokens...");
      onAuthSuccess(tokens);
    } catch (error) {
      console.error("[SpotifyAuth] Error handling auth callback:", error);
      onAuthError(
        error instanceof Error
          ? error.message
          : "Failed to complete Spotify authentication"
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (isConnected) {
    return (
      <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <div className="w-3 h-3 bg-green-500 rounded-full" />
        <span className="text-green-700 dark:text-green-300 font-medium">
          Spotify Connected Successfully
        </span>
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
            aria-label="Spotify logo"
          >
            <title>Spotify logo</title>
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
        onClick={() => {
          console.log(
            "[SpotifyAuth] Connect to Spotify button clicked - initiating OAuth flow"
          );
          initiateSpotifyAuth();
        }}
        className="w-full bg-[#1DB954] hover:bg-[#1ed760] text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isLoading || !config}
      >
        {!config ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Loading configuration...
          </div>
        ) : isLoading ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Connecting...
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-label="Spotify logo"
            >
              <title>Spotify logo</title>
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
