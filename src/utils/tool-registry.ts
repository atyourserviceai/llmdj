import type { Tool } from "@/types/tool";
import { debugSpotifyState } from "../agent/tools/debug-spotify";

export const toolRegistry: Record<string, Tool> = {};

// Debug tools (for troubleshooting)
export const DEBUG_TOOLS = [debugSpotifyState] as const;
