import React, { useState, useEffect } from "react";
import { SpotifyAuth } from "./SpotifyAuth";

interface AuthGuardProps {
  children: React.ReactNode;
  onAuthenticated?: (spotifyUserId: string, sessionToken: string) => void;
}

interface SpotifyUserData {
  id: string;
  display_name: string;
  email?: string;
  images?: Array<{ url: string }>;
  product: string;
}

export function AuthGuard({ children, onAuthenticated }: AuthGuardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userData, setUserData] = useState<SpotifyUserData | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Check for OAuth error first
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("error")) {
      setAuthError(`Authentication failed: ${urlParams.get("error")}`);
      setIsLoading(false);
      return;
    }

    // Check existing authentication (including successful OAuth callback)
    checkAuthentication();
  }, []);

  const getCookie = (name: string): string | null => {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
    return null;
  };

  const checkAuthentication = async () => {
    try {
      const sessionToken = getCookie("llmdj_session");
      const userId = getCookie("llmdj_user_id");

      if (!sessionToken || !userId) {
        setIsLoading(false);
        return;
      }

      // Validate session with server
      const response = await fetch("/api/auth/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, userId }),
      });

      if (response.ok) {
        const { access_token } = (await response.json()) as {
          access_token: string;
        };

        // Get user profile
        const profileResponse = await fetch("https://api.spotify.com/v1/me", {
          headers: { Authorization: `Bearer ${access_token}` },
        });

        if (profileResponse.ok) {
          const profile = (await profileResponse.json()) as SpotifyUserData;
          setUserData(profile);
          setIsAuthenticated(true);
          onAuthenticated?.(profile.id, sessionToken);
        }
      }
    } catch (error) {
      console.error("Auth check failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthSuccess = () => {
    // Store user ID for session validation
    // This would be set by the OAuth callback in a real implementation
    checkAuthentication();
  };

  const handleLogout = () => {
    document.cookie =
      "llmdj_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie =
      "llmdj_user_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    setIsAuthenticated(false);
    setUserData(null);
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
              onAuthSuccess={handleAuthSuccess}
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

  return (
    <div className="min-h-screen">
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
      {children}
    </div>
  );
}
