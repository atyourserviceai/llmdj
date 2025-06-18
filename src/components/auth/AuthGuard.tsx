import React, { useState, useEffect } from "react";
import { SpotifyAuth } from "./SpotifyAuth";

interface AuthGuardProps {
  children: React.ReactNode;
  onAuthenticated?: (spotifyUserId: string, accessToken: string) => void;
}

interface SpotifyUserData {
  id: string;
  display_name: string;
  email?: string;
  country?: string;
  product: string;
  images?: Array<{ url: string }>;
  followers?: { total: number };
}

export function AuthGuard({ children, onAuthenticated }: AuthGuardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserData] = useState<SpotifyUserData | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  console.log("[AuthGuard] Component rendered, current state:", {
    isLoading,
    isAuthenticated,
    hasUserData: !!userData,
    userDataId: userData?.id,
  });

  // Check for existing authentication on mount
  useEffect(() => {
    console.log("[AuthGuard] Initial mount, checking existing auth");
    checkExistingAuth();

    // Listen for successful authentication events
    const handleAuthSuccess = () => {
      console.log(
        "[AuthGuard] Received auth success event, re-checking authentication"
      );
      checkExistingAuth();
    };

    // Listen for the spotify-auth-success event
    window.addEventListener("spotify-auth-success", handleAuthSuccess);

    // Listen for the auth-complete event from OAuth flow
    window.addEventListener("auth-complete", handleAuthSuccess);

    // Also listen for storage changes in case auth data is updated
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "llmdj_spotify_auth") {
        console.log(
          "[AuthGuard] localStorage auth data changed, re-checking authentication"
        );
        checkExistingAuth();
      }
    };

    window.addEventListener("storage", handleStorageChange);

    return () => {
      window.removeEventListener("spotify-auth-success", handleAuthSuccess);
      window.removeEventListener("auth-complete", handleAuthSuccess);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, []);

  const checkExistingAuth = async () => {
    console.log("[AuthGuard] checkExistingAuth called");
    try {
      // Check if we have stored authentication data
      const storedAuth = localStorage.getItem("llmdj_spotify_auth");
      console.log(
        "[AuthGuard] Stored auth data:",
        storedAuth ? "found" : "not found"
      );
      if (!storedAuth) {
        setIsLoading(false);
        return;
      }

      const authData = JSON.parse(storedAuth);
      console.log("[AuthGuard] Parsed auth data:", {
        hasAccessToken: !!authData.access_token,
        hasUserId: !!authData.user_id,
        hasExpiresAt: !!authData.expires_at,
      });

      // Validate stored auth data has required fields
      if (!authData.access_token || !authData.expires_at || !authData.user_id) {
        console.log("[AuthGuard] Invalid auth data, clearing");
        localStorage.removeItem("llmdj_spotify_auth");
        setIsLoading(false);
        return;
      }

      // Check if token is expired
      const expiresAt = new Date(authData.expires_at);
      console.log("[AuthGuard] Token expiration check:", {
        expiresAt: expiresAt.toISOString(),
        now: new Date().toISOString(),
        isExpired: expiresAt <= new Date(),
      });
      if (expiresAt <= new Date()) {
        console.log("[AuthGuard] Stored token expired, clearing auth");
        localStorage.removeItem("llmdj_spotify_auth");
        setIsLoading(false);
        return;
      }

      // Verify token is still valid by making a test API call
      console.log("[AuthGuard] Validating token with Spotify API...");
      const response = await fetch("https://api.spotify.com/v1/me", {
        headers: {
          Authorization: `Bearer ${authData.access_token}`,
        },
      });

      console.log(
        "[AuthGuard] Spotify API response:",
        response.status,
        response.ok
      );
      if (response.ok) {
        const spotifyUser = (await response.json()) as SpotifyUserData;
        console.log("[AuthGuard] User data from API:", {
          id: spotifyUser.id,
          display_name: spotifyUser.display_name,
        });
        setUserData(spotifyUser);
        setIsAuthenticated(true);
        onAuthenticated?.(spotifyUser.id, authData.access_token);
        console.log(
          "[AuthGuard] Successfully restored authentication for user:",
          spotifyUser.id
        );
      } else {
        // Token is invalid, clear stored auth
        console.log("[AuthGuard] Stored token invalid, clearing auth");
        localStorage.removeItem("llmdj_spotify_auth");
      }
    } catch (error) {
      console.error("[AuthGuard] Error checking existing auth:", error);
      localStorage.removeItem("llmdj_spotify_auth");
    } finally {
      console.log(
        "[AuthGuard] checkExistingAuth completed, setting isLoading to false"
      );
      setIsLoading(false);
    }
  };

  const handleAuthSuccess = async (authData: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    user_data: SpotifyUserData;
  }) => {
    try {
      // Calculate expiration time
      const expiresAt = new Date(Date.now() + authData.expires_in * 1000);

      // Store authentication data securely
      const authStorage = {
        access_token: authData.access_token,
        refresh_token: authData.refresh_token,
        expires_at: expiresAt.toISOString(),
        user_id: authData.user_data.id,
        user_data: authData.user_data,
      };

      localStorage.setItem("llmdj_spotify_auth", JSON.stringify(authStorage));

      setUserData(authData.user_data);
      setIsAuthenticated(true);
      setAuthError(null);

      // Notify parent with Spotify user ID for room creation
      onAuthenticated?.(authData.user_data.id, authData.access_token);

      console.log(
        "[AuthGuard] Authentication successful for user:",
        authData.user_data.id
      );
    } catch (error) {
      console.error("[AuthGuard] Error handling auth success:", error);
      setAuthError("Failed to store authentication data");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("llmdj_spotify_auth");
    setIsAuthenticated(false);
    setUserData(null);
    setAuthError(null);

    // Reload the page to reset agent state
    window.location.reload();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-black to-green-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500 mx-auto mb-4"></div>
          <p className="text-green-400 text-lg">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-900 via-black to-green-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">🎵 LLMDJ</h1>
            <p className="text-green-400 text-lg mb-1">AI Spotify DJ Agent</p>
            <p className="text-gray-300 text-sm">
              Your personal music assistant powered by AI
            </p>
          </div>

          <div className="bg-black/50 backdrop-blur-sm rounded-xl p-6 border border-green-500/20">
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold text-white mb-2">
                Connect Your Spotify
              </h2>
              <p className="text-gray-300 text-sm">
                Sign in with Spotify to start controlling your music with AI
              </p>
            </div>

            {authError && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                <p className="text-red-400 text-sm">{authError}</p>
              </div>
            )}

            <SpotifyAuth
              onAuthSuccess={async (tokens) => {
                // Need to fetch user data with the access token
                try {
                  const response = await fetch(
                    "https://api.spotify.com/v1/me",
                    {
                      headers: {
                        Authorization: `Bearer ${tokens.access_token}`,
                      },
                    }
                  );

                  if (response.ok) {
                    const userData = (await response.json()) as SpotifyUserData;
                    await handleAuthSuccess({
                      ...tokens,
                      expires_in: tokens.expires_in || 3600,
                      user_data: userData,
                    });
                  } else {
                    setAuthError("Failed to fetch user profile from Spotify");
                  }
                } catch (error) {
                  setAuthError("Failed to complete authentication");
                }
              }}
              onAuthError={(error: string) => setAuthError(error)}
            />

            <div className="mt-6 text-center">
              <p className="text-gray-400 text-xs">
                We'll only access your Spotify data to provide music
                recommendations and control playback. Your data is secure and
                never shared.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // User is authenticated, show main app with user info header
  return (
    <div className="min-h-screen">
      {/* User info header */}
      <div className="bg-black/20 backdrop-blur-sm border-b border-green-500/20 px-4 py-2">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
              {userData?.images?.[0] ? (
                <img
                  src={userData.images[0].url}
                  alt="Profile"
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <span className="text-black font-semibold text-sm">
                  {userData?.display_name?.charAt(0) || "U"}
                </span>
              )}
            </div>
            <div>
              <p className="text-white font-medium text-sm">
                {userData?.display_name}
              </p>
              <p className="text-green-400 text-xs">
                Spotify {userData?.product}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Main app content */}
      {children}
    </div>
  );
}
