import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthProvider";

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { authMethod, login, isLoading } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);

  // Check for auth errors in URL
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
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">LLMDJ </h1>
            <p className="text-green-400 text-lg mb-1">
              ✨ AI Spotify DJ Agent ✨
            </p>
            <p className="text-gray-300 text-sm">
              Powered by{" "}
              <a
                href="https://atyourservice.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-400 hover:text-green-300"
              >
                AI @ Your Service
              </a>{" "}
              for intelligent music control and discovery
            </p>
          </div>

          <div className="bg-black/50 backdrop-blur-sm rounded-xl p-6 border border-green-500/20">
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold text-white mb-2">
                Start Your Musical Journey
              </h2>
              <p className="text-gray-300 text-sm">
                Sign in to unlock AI-powered music discovery and control
              </p>
            </div>

            <div className="mb-6 space-y-3 text-sm text-gray-300">
              <div className="flex items-center">
                <span className="text-green-400 mr-2">✓</span>
                Get $0.50 in free credits to start
              </div>
              <div className="flex items-center">
                <span className="text-green-400 mr-2">✓</span>
                Connect to your Spotify account
              </div>
              <div className="flex items-center">
                <span className="text-green-400 mr-2">✓</span>
                AI-powered music recommendations
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
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2 hover:cursor-pointer"
            >
              <span>🎵</span>
              <span>Sign in with AI @ Your Service</span>
            </button>

            <div className="mt-6 text-center">
              <p className="text-gray-400 text-xs">
                We'll securely connect to your music accounts and provide AI
                services. Your data is protected and never shared.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
