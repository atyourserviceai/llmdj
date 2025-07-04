import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthProvider";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { authMethod, login, isLoading } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);

  // Check for auth errors in URL and localStorage
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get("error");
    if (error) {
      switch (error) {
        case "invalid_state":
          setAuthError("Authentication failed: Invalid state parameter");
          break;
        case "token_exchange_failed":
          setAuthError("Authentication failed: Could not exchange token");
          break;
        default:
          setAuthError(`Authentication failed: ${error}`);
      }
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Check for invalid token flag
    const invalidToken = localStorage.getItem("auth_invalid_token");
    if (invalidToken) {
      setAuthError(
        "You were automatically signed out due to an invalid token. Please sign in again."
      );
      localStorage.removeItem("auth_invalid_token");
    }

    // Check for expired token flag
    const expiredToken = localStorage.getItem("auth_expired_token");
    if (expiredToken) {
      setAuthError(
        "Your session has expired. Please sign in again to continue using LLMDJ."
      );
      localStorage.removeItem("auth_expired_token");
    }
  }, []);

  // Show loading spinner while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4" />
          <p className="text-white/80">Loading...</p>
        </div>
      </div>
    );
  }

  if (!authMethod) {
    return (
      <div
        className="overflow-y-auto overflow-x-hidden"
        style={{ height: "calc(var(--vh, 1vh) * 100)" }}
      >
        <div
          className="flex flex-col justify-center p-4 pb-20"
          style={{ minHeight: "calc(var(--vh, 1vh) * 100)" }}
        >
          <div className="max-w-md w-full mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-white mb-3 leading-tight max-w-lg mx-auto">
                LLMDJ
              </h1>
              <p className="text-green-400 text-lg mb-1">
                ✨ AI Playlist Curator & DJ ✨
              </p>
              <p className="text-gray-400 text-sm mt-2">
                Ask and get a song played or a playlist curated by AI
              </p>
            </div>

            <div className="bg-black/50 backdrop-blur-sm rounded-xl p-6 border border-green-500/20">
              <div className="text-center mb-6">
                <h2 className="text-xl font-semibold text-white mb-3">
                  Musical Intelligence That Gets It
                </h2>
                <p className="text-gray-300 text-sm leading-relaxed mb-4">
                  <strong>
                    "Create a workout playlist with high-energy tracks from the
                    2000s rock revival"
                  </strong>{" "}
                  or{" "}
                  <strong>
                    "Find that Radiohead song about technology and alienation"
                  </strong>{" "}
                  — LLMDJ understands music, context, and meaning.
                </p>

                <div className="inline-flex items-center bg-green-500/20 text-green-300 px-3 py-1 rounded-full text-xs mb-4">
                  <span className="mr-1">✓</span>
                  Free credits to get you started
                </div>
              </div>

              {authError && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                  <p className="text-red-400 text-sm">{authError}</p>
                </div>
              )}

              <button
                type="button"
                onClick={login}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2 hover:cursor-pointer mb-6"
              >
                <span>🎵</span>
                <span>Sign in with AI @ Your Service</span>
              </button>

              <div className="text-center mb-6">
                <p className="text-gray-400 text-xs">
                  We'll securely connect to your music accounts and provide AI
                  services. Your data is protected and never shared.
                </p>
              </div>

              <div className="border-t border-green-500/20 pt-6">
                <h3 className="text-center text-white font-medium mb-4 text-sm">
                  What makes LLMDJ different?
                </h3>
                <div className="space-y-3 text-xs text-gray-300">
                  <div className="flex items-center">
                    <span className="text-green-400 mr-2">🎯</span>
                    <span>
                      <strong className="text-white">
                        Contextual Understanding:
                      </strong>{" "}
                      "Play something chill for studying" — gets the vibe
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-green-400 mr-2">🧠</span>
                    <span>
                      <strong className="text-white">Musical Knowledge:</strong>{" "}
                      "Artists similar to Thom Yorke's solo work" — deep
                      understanding
                    </span>
                  </div>
                  <div className="flex items-center">
                    <span className="text-green-400 mr-2">💬</span>
                    <span>
                      <strong className="text-white">
                        Personal Discovery:
                      </strong>{" "}
                      "Suggest something I've never heard but would love"
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
