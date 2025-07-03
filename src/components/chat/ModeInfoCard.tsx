//import { Card } from "@/components/card/Card";
import { Robot } from "@phosphor-icons/react";
import type { AgentMode } from "../../agent/AppAgent";

interface ModeInfoCardProps {
  agentMode: AgentMode;
}

/**
 * ModeInfoCard - Displays mode-specific information and features
 * This is shown above the playbook panel and includes full mode information
 */
export function ModeInfoCard({ agentMode }: ModeInfoCardProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="bg-[#F48120]/10 text-[#F48120] rounded-full p-2 inline-flex">
          <Robot size={20} />
        </div>
        <h3 className="font-semibold text-lg">
          {agentMode === "onboarding" && "Onboarding Mode"}
          {agentMode === "integration" && "Integration Mode"}
          {agentMode === "plan" && "Plan Mode"}
          {agentMode === "act" && "Act Mode"}
        </h3>
      </div>

      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {agentMode === "onboarding" &&
          "Let me connect to your Spotify and discover your music taste. I'll help you:"}
        {agentMode === "integration" &&
          "In this mode, we can test your Spotify connection and music tools. I'll help you:"}
        {agentMode === "plan" &&
          "Let me help you plan your music discovery and playlist strategies. Try asking about:"}
        {agentMode === "act" &&
          "Ready to control your music and create playlists. I can help you:"}
      </p>

      <div className="text-sm space-y-2">
        {agentMode === "onboarding" && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[#F48120]">•</span>
              <span>Connect your Spotify account securely</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#F48120]">•</span>
              <span>Analyze your existing playlists and listening history</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#F48120]">•</span>
              <span>Discover your music preferences automatically</span>
            </div>
          </>
        )}

        {agentMode === "integration" && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[#F48120]">•</span>
              <span>Test your Spotify API connection and permissions</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#F48120]">•</span>
              <span>Verify playback controls and device availability</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#F48120]">•</span>
              <span>Test music search and discovery functionality</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#F48120]">•</span>
              <span>Validate playlist operations with sample data</span>
            </div>
          </>
        )}

        {agentMode === "plan" && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[#F48120]">•</span>
              <span>Plan playlists and listening sessions</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#F48120]">•</span>
              <span>Discuss music discovery strategies</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#F48120]">•</span>
              <span>Explore new genres and artists (read-only)</span>
            </div>
          </>
        )}

        {agentMode === "act" && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[#F48120]">•</span>
              <span>Control Spotify playback (play, pause, skip, volume)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#F48120]">•</span>
              <span>Create and manage playlists in real-time</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[#F48120]">•</span>
              <span>Perform live DJ operations and recommendations</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
