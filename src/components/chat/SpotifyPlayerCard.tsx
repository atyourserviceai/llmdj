import { Card } from "@/components/card/Card";
import { useEffect, useRef, useState } from "react";

// TypeScript declarations for Spotify iframe API
declare global {
  interface Window {
    SpotifyApi?: any;
    onSpotifyIframeApiReady?: (api: any) => void;
  }
}

type SpotifyPlayerCardProps = {
  uri: string;
  title?: string;
  description?: string;
  reason?: string; // Why we're showing this card (e.g., "No active device found")
};

export function SpotifyPlayerCard({
  uri,
  title = "Spotify Player",
  description,
  reason,
}: SpotifyPlayerCardProps) {
  const embedRef = useRef<HTMLDivElement>(null);
  const [isApiReady, setIsApiReady] = useState(false);
  const [controller, setController] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<string | null>(null);

  // Load Spotify Embed API
  useEffect(() => {
    // Check if script is already loaded
    if (window.SpotifyApi) {
      setIsApiReady(true);
      return;
    }

    // Load the Spotify Embed API script
    const script = document.createElement("script");
    script.src = "https://open.spotify.com/embed/iframe-api/v1";
    script.async = true;

    // Define the callback for when API is ready
    window.onSpotifyIframeApiReady = (IFrameAPI: any) => {
      window.SpotifyApi = IFrameAPI;
      setIsApiReady(true);
    };

    document.body.appendChild(script);

    return () => {
      // Cleanup if needed
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  // Create Spotify embed when API is ready
  useEffect(() => {
    if (isApiReady && embedRef.current && window.SpotifyApi && !controller) {
      const options = {
        width: "100%",
        height: "352", // Standard Spotify embed height
        uri: uri,
        theme: "dark",
      };

      const callback = (EmbedController: any) => {
        setController(EmbedController);

        // Add event listeners for playback state
        EmbedController.addListener("ready", () => {
          console.log("Spotify Card Embed ready");
        });

        EmbedController.addListener("playback_update", (e: any) => {
          setIsPlaying(!e.data.isPaused);
          setCurrentTrack(e.data.track?.name || null);
        });

        console.log("Spotify Card Controller ready");
      };

      try {
        window.SpotifyApi.createController(embedRef.current, options, callback);
      } catch (error) {
        console.error("Error creating Spotify card embed:", error);
      }
    }
  }, [isApiReady, controller, uri]);

  return (
    <Card className="overflow-hidden max-w-md mx-auto">
      {/* Clean header with playback status */}
      <div className="p-3 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-[#1DB954]"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-label="Spotify logo"
            >
              <title>Spotify</title>
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.84-.179-.84-.66 0-.359.24-.66.54-.779 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.78.242 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z" />
            </svg>
            <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Spotify Player
            </h3>
          </div>
          {controller && (
            <div className="flex items-center gap-1">
              <div
                className={`w-2 h-2 rounded-full ${isPlaying ? "bg-[#1DB954]" : "bg-neutral-400"}`}
              />
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {isPlaying ? "Playing" : "Ready"}
              </span>
            </div>
          )}
        </div>
        {currentTrack && (
          <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1 truncate">
            {isPlaying ? "🎵 " : "⏸️ "}
            {currentTrack}
          </p>
        )}
      </div>

      {/* Spotify Embed */}
      <div className="relative">
        {!isApiReady ? (
          <div className="flex items-center justify-center h-[300px] bg-neutral-50 dark:bg-neutral-900">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1DB954] mx-auto mb-4" />
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Loading Spotify player...
              </p>
            </div>
          </div>
        ) : (
          <>
            <div ref={embedRef} className="w-full h-[300px]" />
          </>
        )}
      </div>
    </Card>
  );
}
