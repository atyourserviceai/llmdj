# LLMDJ Spotify Agent - Implementation Task List

## Overview

Transform the current app-agent-template foundation into a fully-functional Spotify DJ agent that allows users to control their Spotify playback through natural language conversation.

## Current State

✅ **Foundation Complete:**

- App-agent-template foundation with four-mode architecture
- Basic agent structure with onboarding/integration/plan/act modes
- Chat interface and tool confirmation system
- React + Cloudflare Workers setup
- Git remotes configured (template, upstream, superfans)

✅ **Spotify Integration Complete:**

- OAuth authentication flow working end-to-end
- Agent state-based token storage (immediate availability)
- Basic Spotify tools: connection, search, playback control, analysis
- Music taste analysis and recommendation tools
- Comprehensive error handling and token management

## Target State

**LLMDJ Agent Capabilities:**

- ✅ Control Spotify playback (play, pause, skip, volume)
- ✅ Search Spotify catalog (tracks, artists, albums, playlists)
- ✅ Analyze listening history and preferences
- ✅ Recommend music based on conversation context
- [ ] Create and manage playlists
- [ ] Queue songs based on natural language requests
- [ ] Real-time music player integration

**UI Features:**

- [ ] Split layout: Chat interface on left, Spotify player on right
- [ ] Embedded Spotify Web Player with visual feedback
- [ ] Real-time playback status and controls
- [ ] Playlist creation and management interface
- [ ] Music recommendation display
- [ ] Queue visualization

## Implementation Tasks

### Phase 1: Project Configuration & Setup ✅ **COMPLETE**

#### 1.1 Update Project Metadata ✅ **COMPLETE**

- [x] **Update `package.json`** ✅

  - [x] Change name to `"llmdj"`
  - [x] Update description to "AI-powered Spotify DJ agent"
  - [x] Add Spotify-specific dependencies:
    - [x] `@spotify/web-api-ts-sdk` (latest)
    - [x] Add any additional audio/music related packages
  - [x] Update repository URL to LLMDJ repo

- [x] **Update `wrangler.jsonc`** ✅

  - [x] Change name to `"llmdj"`
  - [x] Update environment names (llmdj-dev, llmdj-staging, llmdj)
  - [x] Add Spotify-specific environment variables:
    - [x] `SPOTIFY_CLIENT_ID`
    - [x] `SPOTIFY_CLIENT_SECRET`
    - [x] `SPOTIFY_REDIRECT_URI`

- [x] **Update `.dev.vars.example`** ✅
  - [x] Add Spotify environment variables template
  - [x] Add comments explaining how to get Spotify API credentials

#### 1.2 Update Documentation ✅ **COMPLETE**

- [x] **Update `README.md`** ✅

  - [x] Change title to "🎵 LLMDJ - AI Spotify DJ Agent"
  - [x] Add Spotify-specific setup instructions
  - [x] Document Spotify API setup process
  - [x] Add usage examples for music control
  - [x] Update deployment domains to llmdj.\*

- [x] **Update `index.html`** ✅
  - [x] Change title to "LLMDJ - AI Spotify DJ"
  - [x] Add music/audio related meta tags
  - [x] Add Spotify Web Playback SDK script tag

### Phase 2: Agent Customization ✅ **COMPLETE**

#### 2.1 Agent Core Updates ✅ **COMPLETE**

- [x] **Update `src/agent/AppAgent.ts`** ✅
  - [x] Update agent description and capabilities for music domain
  - [x] Add music/Spotify domain knowledge
  - [x] Customize mode descriptions for music context:
    - [x] Onboarding: Music preferences, Spotify account setup
    - [x] Integration: Spotify API connection testing
    - [x] Plan: Music discovery, playlist planning
    - [x] Act: Playback control, playlist management

#### 2.2 Agent Prompts ✅ **COMPLETE**

- [x] **Update `src/agent/prompts/unified.ts`** ✅
  - [x] Add Spotify DJ personality and expertise
  - [x] Include music terminology and concepts
  - [x] Add context about Spotify API capabilities
  - [x] Customize mode-specific prompts for music use cases

#### 2.3 Agent Storage ✅ **COMPLETE**

**Why we need music-specific storage:**

- **Personalization**: Remember user's music taste and listening patterns for better recommendations
- **Session Continuity**: Maintain context across conversations (current playlist, music mood, preferences)
- **Learning**: Track successful interactions to improve future music suggestions
- **Integration State**: Store Spotify connection status and user profile data
- **Playbook Enhancement**: Capture music-specific workflows and preferences during onboarding

- [x] **Update `src/agent/storage/entities.ts`** ✅

  - [x] Add Spotify-specific data structures:
    - [x] `SpotifyProfile` (user profile data and connection status)
    - [x] `PlaylistData` (custom playlists created through the agent)
    - [x] `ListeningHistory` (tracks played, skipped, liked during sessions)
    - [x] `MusicPreferences` (favorite genres, artists, discovered through interactions)
    - [x] `MusicSession` (current listening context, mood, activity)

- [x] **Update `src/agent/storage/history.ts`** ✅
  - [x] Add music session tracking (what was played when, context)
  - [x] Store playlist creation history and evolution
  - [x] Track music recommendations and their success rate
  - [x] Maintain conversation context related to music discovery

### Phase 3: Spotify Integration & Tools ✅ **COMPLETE**

#### 3.1 Spotify API Setup ✅ **COMPLETE**

- [x] **Create `src/agent/tools/spotify.ts`** ✅

#### 3.2 Agent Tools Implementation ✅ **COMPLETE**

- [x] **Created comprehensive `src/agent/tools/spotify.ts`** ✅
  - [x] **connectSpotifyAccount** - OAuth connection with agent state storage
  - [x] **getSpotifyConnectionStatus** - Check connection from agent state
  - [x] **searchSpotifyContent** - Search tracks, artists, albums, playlists
  - [x] **getTrackDetails** - Detailed track info with audio features
  - [x] **getSpotifyRecommendations** - AI-powered personalized recommendations
  - [x] **getUserTopTracks** - User's most played tracks with analysis
  - [x] **getUserTopArtists** - User's favorite artists with genre analysis
  - [x] **getUserPlaylists** - User's playlists with behavior analysis
  - [x] **analyzeMusicTaste** - Comprehensive music preference analysis
  - [x] **getSpotifyDevices** - Available playback devices
  - [x] **getCurrentPlayback** - Real-time playback state
  - [x] **controlSpotifyPlayback** - Full playback control

#### 3.3 Tool Registration ✅ **COMPLETE**

- [x] **Update `src/utils/tool-registry.ts`** ✅

  - [x] Import and register all Spotify tools with error handling
  - [x] Configure tool availability by mode (onboarding/integration/plan/act)
  - [x] Set up proper tool descriptions and parameters

- [x] **Update `src/agent/AppAgent.ts`** ✅
  - [x] Integrate Spotify tools with mode-based access control
  - [x] Configure tool confirmation requirements for music actions

### 🚨 **CRITICAL: User Isolation & Authentication** 🚨

**🔥 MOST CRITICAL SECURITY ISSUE - NO USER ISOLATION:**

- [ ] **🔥 CRITICAL: Implement user authentication before agent access**

  - [ ] **Problem**: Currently ALL users share the same agent state (`"default-room"`)
  - [ ] **Risk**: Spotify tokens, music preferences, and personal data shared between all users
  - [ ] **Impact**: Complete privacy breach - users see each other's music, playlists, recommendations

  **Required Implementation:**

  - [ ] **User authentication gate** - No agent access without login
  - [ ] **Spotify OAuth as primary auth** - Use Spotify as the identity provider
  - [ ] **Per-user agent rooms** - Agent name/room derived from authenticated user ID
  - [ ] **Session management** - Secure session handling with proper logout

  **Current Flow (BROKEN):**

  ```
  User visits URL → Loads agent with "default-room" → Everyone shares state
  ```

  **Required Flow (SECURE):**

  ```
  User visits URL → Spotify OAuth → Agent room = `spotify-user-{spotifyUserId}` → Isolated state
  ```

- [ ] **Multi-account support within session**

  - [ ] Keep current Spotify OAuth tools for connecting additional accounts
  - [ ] Allow household members to connect their Spotify accounts to shared session
  - [ ] Implement account switching within authenticated session
  - [ ] Maintain primary account as session owner

- [ ] **URL-based room access (admin/support)**
  - [ ] Implement admin authentication for URL-based room access
  - [ ] Add impersonation/support capabilities for troubleshooting
  - [ ] Audit logging for admin access to user rooms
  - [ ] Secure room name generation (no guessable patterns)

### 🚨 **URGENT: Security Review** 🚨

**HIGH PRIORITY SECURITY TASKS (after user isolation):**

- [ ] **Audit token exposure in LLM requests**

  - [ ] Review all tools that access `agent.state.spotifyAuth`
  - [ ] Ensure sensitive tokens are never passed to LLM context
  - [ ] Implement token masking/redaction in logs and tool results
  - [ ] Add security middleware to filter sensitive data from tool outputs

- [ ] **Implement secure token storage**

  - [ ] Encrypt tokens before storing in agent state
  - [ ] Implement secure token retrieval/decryption
  - [ ] Add token rotation and cleanup mechanisms
  - [ ] Consider moving tokens to separate encrypted storage

- [ ] **Review tool result sanitization**

  - [ ] Audit all Spotify tool return values for sensitive data
  - [ ] Implement data sanitization layer
  - [ ] Remove or mask user IDs, emails, and other PII
  - [ ] Add security logging for token access

- [ ] **Authentication security**
  - [ ] Implement CSRF protection for OAuth flow
  - [ ] Add state parameter validation
  - [ ] Secure redirect URI handling
  - [ ] Rate limiting for authentication attempts

### Phase 4: UI Components & Layout 🎯 **NEXT PHASE**

#### 4.1 Layout Restructuring

- [ ] **Update `src/app.tsx`**
  - [ ] Implement split layout (chat left, player right)
  - [ ] Add responsive design for mobile
  - [ ] Create player collapse/expand functionality
  - [ ] Add music-themed styling and colors

#### 4.2 Spotify Player Components

- [ ] **Create `src/components/spotify-player/`**

  - [ ] **`SpotifyPlayer.tsx`** - Main player container
  - [ ] **`PlaybackControls.tsx`** - Play/pause/skip buttons
  - [ ] **`TrackDisplay.tsx`** - Current track info display
  - [ ] **`VolumeControl.tsx`** - Volume slider
  - [ ] **`ProgressBar.tsx`** - Track progress and seeking
  - [ ] **`DeviceSelector.tsx`** - Choose playback device

- [ ] **Create `src/components/playlist-display/`**

  - [ ] **`PlaylistGrid.tsx`** - Display user's playlists
  - [ ] **`PlaylistCard.tsx`** - Individual playlist component
  - [ ] **`TrackList.tsx`** - Display tracks in a playlist
  - [ ] **`TrackItem.tsx`** - Individual track component

- [ ] **Create `src/components/music-controls/`**
  - [ ] **`SearchResults.tsx`** - Display search results
  - [ ] **`QueueDisplay.tsx`** - Show current queue
  - [ ] **`RecommendationCard.tsx`** - Music recommendations
  - [ ] **`MusicVisualizer.tsx`** - Audio visualization (optional)

#### 4.3 Chat Integration

- [ ] **Update `src/components/chat/ChatContainer.tsx`**

  - [ ] Add music context to chat interface
  - [ ] Show currently playing track in chat header
  - [ ] Add quick action buttons for common music commands

- [ ] **Create `src/components/chat-with-player/`**
  - [ ] **`MusicContextChat.tsx`** - Chat with music awareness
  - [ ] **`QuickActions.tsx`** - Fast music control buttons
  - [ ] **`NowPlayingIndicator.tsx`** - Show what's playing

#### 4.4 Authentication UI

- [x] **Create `src/components/auth/SpotifyAuth.tsx`** ✅ (Basic OAuth UI completed)
- [ ] **Enhance authentication UI**
  - [ ] **`AuthCallback.tsx`** - Better OAuth callback handling
  - [ ] **`UserProfile.tsx`** - Display Spotify user info
  - [ ] **`AuthRequired.tsx`** - Require auth wrapper
  - [ ] **`ConnectionStatus.tsx`** - Show connection health

### Phase 5: Advanced Features

#### 5.1 Web Playback SDK Integration

- [ ] **Create `src/lib/spotify-player.ts`**

  - [ ] Initialize Spotify Web Playback SDK
  - [ ] Handle player ready/not ready events
  - [ ] Manage player state changes
  - [ ] Handle authentication errors
  - [ ] Implement device switching

- [ ] **Update `public/index.html`**
  - [ ] Add Spotify Web Playback SDK script
  - [ ] Add player initialization script

#### 5.2 Real-time State Management

- [ ] **Create `src/hooks/useSpotifyPlayer.ts`**

  - [ ] Manage player state in React
  - [ ] Handle real-time playback updates
  - [ ] Provide player control functions
  - [ ] Handle connection status

- [ ] **Create `src/hooks/useSpotifyAuth.ts`**

  - [ ] Manage authentication state
  - [ ] Handle token refresh
  - [ ] Provide auth status and functions

- [ ] **Create `src/hooks/useSpotifyAPI.ts`**
  - [ ] Provide API access with auth
  - [ ] Handle API errors gracefully
  - [ ] Implement request caching

#### 5.3 Music Intelligence

- [x] **Music taste analysis implemented** ✅
- [ ] **Enhanced music intelligence**
  - [ ] Context-aware recommendations (time, weather, activity)
  - [ ] Auto-playlists based on mood/activity
  - [ ] Music similarity algorithms
  - [ ] Learning from user feedback

### Phase 6: Testing & Polish

#### 6.1 Testing Setup

- [ ] **Create `tests/spotify-integration.test.ts`**
- [ ] **Create `tests/player-functionality.test.ts`**
- [ ] **Create `tests/security.test.ts`** - Test token security

#### 6.2 Error Handling & UX

- [x] **Basic error handling implemented** ✅
- [ ] **Enhanced error handling**
  - [ ] Spotify API rate limiting
  - [ ] Network connectivity issues
  - [ ] Authentication failures
  - [ ] Player device unavailable
  - [ ] Premium account requirements

#### 6.3 Performance Optimization

- [ ] **Optimize API calls**

  - [ ] Implement request caching
  - [ ] Batch API requests where possible
  - [ ] Implement pagination for large results
  - [ ] Add debouncing for search

- [ ] **Optimize UI performance**
  - [ ] Lazy load components
  - [ ] Optimize re-renders
  - [ ] Implement virtual scrolling for large lists

### Phase 7: Deployment & Documentation

#### 7.1 Environment Setup

- [ ] **Configure Cloudflare secrets**
- [ ] **Security audit for production**

#### 7.2 Final Documentation

- [ ] **Update README.md with complete setup guide**

  - [ ] Spotify Developer App setup
  - [ ] API key configuration
  - [ ] Local development setup
  - [ ] Deployment instructions

- [ ] **Create user guide**

  - [ ] How to connect Spotify account
  - [ ] Available voice commands
  - [ ] Playlist management features
  - [ ] Troubleshooting guide

- [ ] **Security documentation**

## Current Status Summary

### ✅ **What's Working Now:**

1. **Complete OAuth flow** - Users can authenticate with Spotify
2. **Agent state storage** - Tokens stored in agent state for immediate access
3. **Music analysis** - Comprehensive taste analysis from user's Spotify data
4. **Basic playback control** - Can control Spotify playback via tools
5. **Search functionality** - Can search Spotify catalog
6. **Recommendation system** - AI-powered music recommendations

### 🎯 **Immediate Next Steps:**

1. **🚨 SECURITY REVIEW** - Address token exposure in LLM requests (CRITICAL)
2. **UI Enhancement** - Split layout with embedded player
3. **Web Playback SDK** - Real-time player integration
4. **Playlist management** - Create and edit playlists

### 📋 **Key Achievements:**

- Solved complex database transaction issues by moving to agent state
- Built comprehensive Spotify tool suite with error handling
- Implemented working OAuth flow with proper token management
- Created music intelligence for taste analysis and recommendations

### ⚠️ **Critical Security Concerns:**

- **🔥 CRITICAL**: All users share the same agent state - complete privacy breach
- **🔥 CRITICAL**: No user authentication gate - anyone can access anyone's data
- **🔥 CRITICAL**: Spotify tokens, music preferences shared between all users
- Spotify access tokens currently stored in agent state
- Potential exposure of sensitive tokens in LLM context
- Need comprehensive security audit and token sanitization
- Implement encrypted token storage and secure access patterns

**SECURITY STATUS: 🚨 CRITICAL ISSUES MUST BE FIXED BEFORE PRODUCTION 🚨**

The foundation is technically solid and functional, but the **user isolation issue makes it completely unsuitable for production use**. Authentication and user isolation must be implemented immediately.

## Technical Dependencies

### Required Spotify Setup

1. **Spotify Developer Account** - Create app at developer.spotify.com
2. **API Credentials** - Client ID and Client Secret
3. **Redirect URIs** - Configure for each deployment environment
4. **Premium Account** - Required for Web Playback SDK (playback control)

### External Libraries

- `@spotify/web-api-sdk` - Official Spotify Web API SDK
- Spotify Web Playback SDK (loaded via script tag)
- Additional audio visualization libraries (optional)

### Cloudflare Configuration

- Environment variables for Spotify credentials
- CORS configuration for Spotify domains
- OAuth redirect handling

## Implementation Notes

### Authentication Flow

1. User clicks "Connect Spotify" → Redirect to Spotify OAuth
2. User authorizes → Callback with authorization code
3. Exchange code for access token → Store in agent state
4. Initialize Web Playback SDK → Ready for music control

### Agent Mode Adaptations

- **Onboarding**: Gather music preferences, setup Spotify connection
- **Integration**: Test Spotify API connection, validate permissions
- **Plan**: Music discovery, playlist planning, recommendation strategy
- **Act**: Direct playback control, playlist management, music actions

### Key Technical Challenges

1. **Token Management**: Refresh tokens, handle expiration
2. **Real-time Sync**: Keep UI in sync with Spotify state
3. **Device Management**: Handle multiple Spotify devices
4. **Premium Requirements**: Graceful handling of free account limitations
5. **Rate Limiting**: Respect Spotify API limits

This comprehensive task list provides a complete roadmap for transforming the app-agent-template into a fully-functional LLMDJ Spotify agent.
