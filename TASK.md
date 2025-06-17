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

## Target State

**LLMDJ Agent Capabilities:**

- Control Spotify playback (play, pause, skip, volume)
- Search Spotify catalog (tracks, artists, albums, playlists)
- Create and manage playlists
- Analyze listening history and preferences
- Recommend music based on conversation context
- Queue songs based on natural language requests
- Real-time music player integration

**UI Features:**

- Split layout: Chat interface on left, Spotify player on right
- Embedded Spotify Web Player with visual feedback
- Real-time playback status and controls
- Playlist creation and management interface
- Music recommendation display
- Queue visualization

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

### Phase 3: Spotify Integration & Tools

#### 3.1 Spotify API Setup ✅ **COMPLETE**

- [x] **Create `src/agent/tools/spotify.ts`** (comprehensive Spotify integration) ✅

  - [x] Implement Spotify Web API client with @spotify/web-api-ts-sdk
  - [x] Handle OAuth authentication flow with proper token management
  - [x] Implement token refresh logic with proper storage
  - [x] Add error handling for API rate limits and connection issues
  - [x] Create type-safe API wrappers with comprehensive error handling

- [x] **Integrated OAuth flow within agent architecture** ✅
  - [x] Implement Spotify OAuth flow within agent context
  - [x] Handle authorization code exchange and storage
  - [x] Store and refresh access tokens in agent storage
  - [x] Implement connection status checking

#### 3.2 Agent Tools Implementation ✅ **COMPLETE**

- [x] **Created comprehensive `src/agent/tools/spotify.ts`** ✅

  - [x] **connectSpotifyAccount** - OAuth connection with profile storage
  - [x] **getSpotifyConnectionStatus** - Check connection and token validity
  - [x] **searchSpotifyContent** - Search tracks, artists, albums, playlists
  - [x] **getTrackDetails** - Detailed track info with audio features
  - [x] **getSpotifyRecommendations** - AI-powered personalized recommendations
  - [x] **getSpotifyDevices** - Available playback devices
  - [x] **getCurrentPlayback** - Real-time playback state
  - [x] **controlSpotifyPlayback** - Full playback control (play/pause/skip/shuffle/repeat)

#### 3.3 Tool Registration ✅ **COMPLETE**

- [x] **Update `src/utils/tool-registry.ts`** ✅
  - [x] Import and register all Spotify tools with error handling
  - [x] Configure tool availability by mode (onboarding/integration/plan/act)
  - [x] Set up proper tool descriptions and parameters

- [x] **Update `src/agent/AppAgent.ts`** ✅
  - [x] Integrate Spotify tools with mode-based access control
  - [x] Configure tool confirmation requirements for music actions

### Phase 4: UI Components & Layout

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

- [ ] **Create `src/components/auth/`**
  - [ ] **`SpotifyLogin.tsx`** - Spotify OAuth login button
  - [ ] **`AuthCallback.tsx`** - Handle OAuth callback
  - [ ] **`UserProfile.tsx`** - Display Spotify user info
  - [ ] **`AuthRequired.tsx`** - Require auth wrapper

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

- [ ] **Create `src/lib/music-intelligence.ts`**
  - [ ] Analyze user's music taste
  - [ ] Generate smart recommendations
  - [ ] Create auto-playlists based on mood/activity
  - [ ] Music similarity algorithms
  - [ ] Context-aware suggestions

### Phase 6: Testing & Polish

#### 6.1 Testing Setup

- [ ] **Create `tests/spotify-integration.test.ts`**

  - [ ] Test Spotify API integration
  - [ ] Mock API responses for testing
  - [ ] Test authentication flow
  - [ ] Test tool functionality

- [ ] **Create `tests/player-functionality.test.ts`**
  - [ ] Test player controls
  - [ ] Test queue management
  - [ ] Test playlist operations

#### 6.2 Error Handling & UX

- [ ] **Implement comprehensive error handling**

  - [ ] Spotify API rate limiting
  - [ ] Network connectivity issues
  - [ ] Authentication failures
  - [ ] Player device unavailable
  - [ ] Premium account requirements

- [ ] **Add loading states and feedback**
  - [ ] Loading indicators for API calls
  - [ ] Success/error notifications
  - [ ] Offline state handling
  - [ ] Graceful degradation

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
  - [ ] Add Spotify API credentials to each environment
  - [ ] Configure redirect URIs for each domain
  - [ ] Test authentication in each environment

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

## Success Criteria

### Core Functionality

- [ ] User can authenticate with Spotify
- [ ] Agent can control playback (play, pause, skip)
- [ ] Agent can search and play specific songs/artists
- [ ] Agent can create and manage playlists
- [ ] Real-time player shows current track and controls

### Advanced Features

- [ ] Agent provides intelligent music recommendations
- [ ] Queue management works seamlessly
- [ ] Multiple device support
- [ ] Responsive design works on mobile

### Integration Quality

- [ ] Four-mode architecture adapted for music domain
- [ ] Error handling provides clear feedback
- [ ] Performance is smooth for typical usage
- [ ] Authentication flow is user-friendly

### Documentation & Deployment

- [ ] Complete setup documentation
- [ ] All environments deployed and working
- [ ] User guide helps new users get started
- [ ] Code is well-documented and maintainable

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
