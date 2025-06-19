import { useState } from "react";
import { Button } from "@/components/button/Button";

interface SpotifyAuthProps {
  onAuthSuccess: () => void;
  onAuthError: (error: string) => void;
}

export function SpotifyAuth({ onAuthSuccess, onAuthError }: SpotifyAuthProps) {
  const [isLoading, setIsLoading] = useState(false);

  console.log("🎵 SpotifyAuth component rendered, isLoading:", isLoading);

  const initiateSpotifyAuth = () => {
    console.log("🎵 Button clicked - initiating Spotify auth");
    setIsLoading(true);

    // Log current location for debugging
    console.log("Current location:", window.location.href);
    console.log("Redirecting to:", "/auth/spotify");

    // Redirect to server-side OAuth endpoint
    window.location.href = "/auth/spotify";
  };

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

      <button
        onClick={initiateSpotifyAuth}
        className="w-full bg-[#1DB954] hover:bg-[#1ed760] text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isLoading}
      >
        {isLoading ? (
          <div className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            Connecting...
          </div>
        ) : (
          "Connect Spotify Account"
        )}
      </button>
    </div>
  );
}
