import { Card } from "@/components/card/Card";
import type { AgentMode, AppAgentState } from "../../agent/AppAgent";
import { ModeInfoCard } from "./ModeInfoCard";

type PlaybookContainerProps = {
  agentMode: AgentMode;
  agentState: AppAgentState | null;
  showDebug: boolean;
};

export function PlaybookContainer({
  agentMode,
  agentState,
  showDebug,
}: PlaybookContainerProps) {
  // Initialize a default state if agentState is null
  const defaultState: AppAgentState = {
    mode: agentMode,
    onboardingStep: "start",
    isOnboardingComplete: false,
  };

  // Use the provided state or the default state
  const safeAgentState = agentState || defaultState;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "Unknown";
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return "Invalid date";
    }
  };

  const formatCredits = (credits?: number) => {
    if (typeof credits !== "number") return "0.00";
    return credits.toFixed(4);
  };

  return (
    <div className="h-full w-full md:w-2/5 lg:w-2/5 md:max-w-[600px] flex-shrink-0 shadow-xl rounded-md overflow-hidden relative border border-neutral-300 dark:border-neutral-800">
      <div className="h-full flex flex-col">
        {/* Mode Info Card - Desktop only */}
        <div className="hidden md:block p-4">
          <Card className="p-4 bg-neutral-100 dark:bg-neutral-900">
            <ModeInfoCard agentMode={agentMode} />
          </Card>
        </div>

        {/* Agent State Information */}
        <div className="flex-1 overflow-y-auto">
          <div className="h-full bg-neutral-50 dark:bg-neutral-900 flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-blue-500"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  aria-label="Agent info"
                >
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="flex-1">
                  <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
                    Agent Status
                  </h3>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Current session information
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    Connected
                  </span>
                </div>
              </div>
            </div>

            {/* Agent State Content */}
            <div className="flex-1 p-4 space-y-4">
              {/* User Information */}
              {safeAgentState.userInfo && (
                <Card className="p-4">
                  <h4 className="font-medium text-neutral-900 dark:text-neutral-100 mb-3 flex items-center gap-2">
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                        clipRule="evenodd"
                      />
                    </svg>
                    User Account
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-neutral-600 dark:text-neutral-400">
                        Email:
                      </span>
                      <span className="text-neutral-900 dark:text-neutral-100 font-mono text-xs">
                        {safeAgentState.userInfo.email}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-600 dark:text-neutral-400">
                        Credits:
                      </span>
                      <span className="text-neutral-900 dark:text-neutral-100 font-mono">
                        {formatCredits(safeAgentState.userInfo.credits)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-600 dark:text-neutral-400">
                        Payment:
                      </span>
                      <span className="text-neutral-900 dark:text-neutral-100 capitalize">
                        {safeAgentState.userInfo.payment_method}
                      </span>
                    </div>
                  </div>
                </Card>
              )}

              {/* Spotify Connection */}
              <Card className="p-4">
                <h4 className="font-medium text-neutral-900 dark:text-neutral-100 mb-3 flex items-center gap-2">
                  <svg
                    className="w-4 h-4 text-[#1DB954]"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.84-.179-.84-.66 0-.359.24-.66.54-.779 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.78.242 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z" />
                  </svg>
                  Spotify Integration
                </h4>
                {safeAgentState.spotifyAuth?.isConnected ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-neutral-600 dark:text-neutral-400">
                        Status:
                      </span>
                      <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        Connected
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-600 dark:text-neutral-400">
                        User:
                      </span>
                      <span className="text-neutral-900 dark:text-neutral-100">
                        {safeAgentState.spotifyAuth.profile.displayName}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-neutral-600 dark:text-neutral-400">
                        Plan:
                      </span>
                      <span className="text-neutral-900 dark:text-neutral-100 capitalize">
                        {safeAgentState.spotifyAuth.profile.product}
                      </span>
                    </div>
                    {safeAgentState.spotifyAuth.profile.country && (
                      <div className="flex justify-between">
                        <span className="text-neutral-600 dark:text-neutral-400">
                          Country:
                        </span>
                        <span className="text-neutral-900 dark:text-neutral-100">
                          {safeAgentState.spotifyAuth.profile.country}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-neutral-600 dark:text-neutral-400">
                        Connected:
                      </span>
                      <span className="text-neutral-900 dark:text-neutral-100 text-xs">
                        {formatDate(safeAgentState.spotifyAuth.connectedAt)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <div className="text-neutral-500 dark:text-neutral-400 text-sm">
                      Not connected to Spotify
                    </div>
                    <div className="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
                      Connect your Spotify account to enable music controls
                    </div>
                  </div>
                )}
              </Card>

              {/* Music Preferences */}
              {safeAgentState.musicPreferences && (
                <Card className="p-4">
                  <h4 className="font-medium text-neutral-900 dark:text-neutral-100 mb-3 flex items-center gap-2">
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM15.657 6.343a1 1 0 011.414 0A9.972 9.972 0 0119 12a9.972 9.972 0 01-1.929 5.657 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 12c0-2.21-.895-4.21-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 12a5.983 5.983 0 01-.757 2.829 1 1 0 01-1.415-1.414A3.987 3.987 0 0013.5 12a3.987 3.987 0 00-.672-2.171 1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Music Preferences
                  </h4>
                  <div className="space-y-3 text-sm">
                    {safeAgentState.musicPreferences.goals &&
                      safeAgentState.musicPreferences.goals.length > 0 && (
                        <div>
                          <span className="text-neutral-600 dark:text-neutral-400 block mb-1">
                            Goals:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {safeAgentState.musicPreferences.goals
                              .slice(0, 3)
                              .map((goal, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-xs"
                                >
                                  {goal}
                                </span>
                              ))}
                            {safeAgentState.musicPreferences.goals.length >
                              3 && (
                              <span className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 rounded text-xs">
                                +
                                {safeAgentState.musicPreferences.goals.length -
                                  3}{" "}
                                more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    {safeAgentState.musicPreferences.preferredGenres &&
                      safeAgentState.musicPreferences.preferredGenres.length >
                        0 && (
                        <div>
                          <span className="text-neutral-600 dark:text-neutral-400 block mb-1">
                            Genres:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {safeAgentState.musicPreferences.preferredGenres
                              .slice(0, 3)
                              .map((genre, i) => (
                                <span
                                  key={i}
                                  className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-xs"
                                >
                                  {genre}
                                </span>
                              ))}
                            {safeAgentState.musicPreferences.preferredGenres
                              .length > 3 && (
                              <span className="px-2 py-1 bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 rounded text-xs">
                                +
                                {safeAgentState.musicPreferences.preferredGenres
                                  .length - 3}{" "}
                                more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                  </div>
                </Card>
              )}

              {/* Agent Settings */}
              <Card className="p-4">
                <h4 className="font-medium text-neutral-900 dark:text-neutral-100 mb-3 flex items-center gap-2">
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Settings
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-neutral-600 dark:text-neutral-400">
                      Mode:
                    </span>
                    <span className="text-neutral-900 dark:text-neutral-100 capitalize">
                      {safeAgentState.mode}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600 dark:text-neutral-400">
                      Language:
                    </span>
                    <span className="text-neutral-900 dark:text-neutral-100 uppercase">
                      {safeAgentState.settings?.language || "en"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-600 dark:text-neutral-400">
                      Onboarding:
                    </span>
                    <span
                      className={`${safeAgentState.isOnboardingComplete ? "text-green-600 dark:text-green-400" : "text-yellow-600 dark:text-yellow-400"}`}
                    >
                      {safeAgentState.isOnboardingComplete
                        ? "Complete"
                        : "In Progress"}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Debug Info */}
              {showDebug && (
                <Card className="p-4 border-orange-200 dark:border-orange-800">
                  <h4 className="font-medium text-orange-900 dark:text-orange-100 mb-3 flex items-center gap-2">
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Debug Information
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-orange-600 dark:text-orange-400">
                        User ID:
                      </span>
                      <span className="text-orange-900 dark:text-orange-100 font-mono break-all">
                        {safeAgentState.userInfo?.id || "Not set"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-orange-600 dark:text-orange-400">
                        Spotify ID:
                      </span>
                      <span className="text-orange-900 dark:text-orange-100 font-mono">
                        {safeAgentState.spotifyAuth?.profile?.id ||
                          "Not connected"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-orange-600 dark:text-orange-400">
                        Step:
                      </span>
                      <span className="text-orange-900 dark:text-orange-100">
                        {safeAgentState.onboardingStep || "start"}
                      </span>
                    </div>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
