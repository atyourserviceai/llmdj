import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { getOAuthConfig, type OAuthConfig } from "../../config/oauth";

// JWT token utilities (client-side versions)
function isJWTToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  try {
    const headerJson = atob(parts[0]);
    const header = JSON.parse(headerJson);
    return header.alg && header.typ === "JWT";
  } catch {
    return false;
  }
}

function isJWTTokenExpired(token: string): boolean {
  if (!isJWTToken(token)) {
    return false; // Not a JWT token, can't check expiration
  }

  try {
    const parts = token.split(".");
    const payloadJson = atob(parts[1]);
    const payload = JSON.parse(payloadJson);

    if (!payload.exp) {
      return false; // No expiration claim
    }

    // JWT expiration is in seconds, Date.now() is in milliseconds
    const currentTime = Math.floor(Date.now() / 1000);
    return payload.exp <= currentTime;
  } catch {
    return true; // If we can't parse it, consider it expired
  }
}

export interface UserInfo {
  id: string;
  email: string;
  credits: number;
}

export interface AuthMethod {
  type: "atyourservice" | "byok";
  apiKey?: string; // AtYourService.ai API key from OAuth
  userInfo?: UserInfo;
  byokKeys?: {
    openai?: string;
    anthropic?: string;
  };
}

export interface AuthContextType {
  authMethod: AuthMethod | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  oauthConfig: OAuthConfig | null;
  login: () => void;
  logout: () => void;
  switchToBYOK: (keys: { openai?: string; anthropic?: string }) => void;
  switchToCredits: () => void;
  refreshUserInfo: () => Promise<void>;
  checkTokenExpiration: () => boolean; // Returns true if token is expired
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [authMethod, setAuthMethod] = useState<AuthMethod | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [oauthConfig, setOauthConfig] = useState<OAuthConfig | null>(null);

  useEffect(() => {
    // Load OAuth config and check for stored auth on component mount
    const init = async () => {
      try {
        const config = await getOAuthConfig();
        setOauthConfig(config);
      } catch (error) {
        console.error("Failed to load OAuth config:", error);
      }

      // Check for forced reauth flag
      const forceReauth = localStorage.getItem("force_reauth");
      if (forceReauth) {
        console.log(
          "[Auth] Force re-authentication requested, clearing all auth data"
        );
        localStorage.removeItem("auth_method");
        localStorage.removeItem("oauth_state");
        localStorage.removeItem("force_reauth");
        setIsLoading(false);
        return;
      }

      const stored = localStorage.getItem("auth_method");
      if (stored) {
        try {
          const parsedAuth = JSON.parse(stored);
          console.log("[Auth] Found stored auth, validating...", {
            hasApiKey: !!parsedAuth?.apiKey,
            userInfo: parsedAuth?.userInfo ? "present" : "missing",
            type: parsedAuth?.type,
          });

          // Validate the token if it exists
          if (parsedAuth?.apiKey) {
            try {
              console.log("[Auth] Validating token with /api/user/info...");
              const response = await fetch("/api/user/info", {
                method: "GET",
                headers: {
                  Authorization: `Bearer ${parsedAuth.apiKey}`,
                },
              });

              if (response.ok) {
                console.log("[Auth] ✅ Token validation successful");
                // Token is valid, use the stored auth
                setAuthMethod(parsedAuth);

                // Sync token with agent to ensure it has the latest token
                await syncTokenWithAgent(parsedAuth);
              } else {
                // Token is invalid, clear it and show sign-in with message
                console.log(
                  "[Auth] ❌ Stored token is invalid (API responded with error), clearing auth",
                  { status: response.status, statusText: response.statusText }
                );
                localStorage.removeItem("auth_method");

                // Check if this was specifically due to token expiration
                if (
                  isJWTToken(parsedAuth.apiKey) &&
                  isJWTTokenExpired(parsedAuth.apiKey)
                ) {
                  localStorage.setItem("auth_expired_token", "true");
                } else {
                  localStorage.setItem("auth_invalid_token", "true");
                }
              }
            } catch (error) {
              console.log(
                "[Auth] ⚠️ Network error during token validation:",
                error
              );
              // Network error - only clear token if we can definitively say it's expired
              if (
                isJWTToken(parsedAuth.apiKey) &&
                isJWTTokenExpired(parsedAuth.apiKey)
              ) {
                console.log(
                  "[Auth] Token is expired, clearing auth despite network error"
                );
                localStorage.removeItem("auth_method");
                localStorage.setItem("auth_expired_token", "true");
              } else {
                console.log(
                  "[Auth] Could not validate token due to network error, keeping stored auth"
                );
                setAuthMethod(parsedAuth);

                // Even with network error, try to sync with agent
                await syncTokenWithAgent(parsedAuth);
              }
            }
          } else {
            // No API key, invalid auth
            console.log("[Auth] No API key in stored auth, clearing");
            localStorage.removeItem("auth_method");
          }
        } catch (e) {
          console.error("[Auth] Invalid stored auth:", e);
          localStorage.removeItem("auth_method");
        }
      } else {
        console.log("[Auth] No stored auth found");
      }
      setIsLoading(false);
    };

    init();
  }, []);

  const login = async () => {
    try {
      const config = oauthConfig || (await getOAuthConfig());
      const state = Math.random().toString(36).substring(2);

      const authUrl = new URL(config.auth_url);
      authUrl.searchParams.set("client_id", config.client_id);
      authUrl.searchParams.set(
        "redirect_uri",
        `${window.location.origin}/auth/callback`
      );
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("state", state);

      localStorage.setItem("oauth_state", state);
      window.location.href = authUrl.toString();
    } catch (error) {
      console.error("[Auth] Failed to start OAuth flow:", error);
      // Could show error message to user here
    }
  };

  // Helper function to sync token with agent after authentication
  const syncTokenWithAgent = async (authData: AuthMethod) => {
    if (
      authData.type === "atyourservice" &&
      authData.userInfo &&
      authData.apiKey
    ) {
      try {
        console.log("[Auth] Syncing new token with agent...");

        const response = await fetch(
          `/agents/app-agent/${authData.userInfo.id}/store-user-info`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authData.apiKey}`,
            },
            body: JSON.stringify({
              user_id: authData.userInfo.id,
              api_key: authData.apiKey,
              email: authData.userInfo.email,
              credits: authData.userInfo.credits,
              payment_method: "credits", // Default value
            }),
          }
        );

        if (response.ok) {
          console.log("[Auth] ✅ Successfully synced token with agent");
        } else {
          console.warn(
            "[Auth] ⚠️ Failed to sync token with agent:",
            response.status
          );
        }
      } catch (error) {
        console.error("[Auth] Error syncing token with agent:", error);
      }
    }
  };

  const logout = async () => {
    // Capture current auth method before clearing it
    const currentAuth = authMethod;

    // Clear local storage and state first
    setAuthMethod(null);
    localStorage.removeItem("auth_method");
    localStorage.removeItem("oauth_state");

    // Also clear the agent's cached user data if we have valid auth info
    if (currentAuth?.userInfo?.id && currentAuth?.apiKey) {
      try {
        console.log("[Auth] Clearing agent cached data on logout...");
        const clearResponse = await fetch(
          `/agents/app-agent/${currentAuth.userInfo.id}/clear-user-info`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${currentAuth.apiKey}`,
            },
          }
        );

        if (clearResponse.ok) {
          console.log("[Auth] Successfully cleared agent cached data");
        } else {
          console.warn(
            "[Auth] Failed to clear agent cached data:",
            clearResponse.status
          );
        }
      } catch (error) {
        console.warn("[Auth] Error clearing agent cached data:", error);
      }
    }
  };

  const switchToBYOK = (keys: { openai?: string; anthropic?: string }) => {
    if (!authMethod || authMethod.type !== "atyourservice") return;

    const newAuth: AuthMethod = {
      type: "byok",
      apiKey: authMethod.apiKey, // Keep AtYourService.ai API key for verification
      userInfo: authMethod.userInfo,
      byokKeys: keys,
    };

    setAuthMethod(newAuth);
    localStorage.setItem("auth_method", JSON.stringify(newAuth));
  };

  const switchToCredits = () => {
    if (!authMethod || authMethod.type !== "byok") return;

    const newAuth: AuthMethod = {
      type: "atyourservice",
      apiKey: authMethod.apiKey,
      userInfo: authMethod.userInfo,
    };

    setAuthMethod(newAuth);
    localStorage.setItem("auth_method", JSON.stringify(newAuth));
  };

  const refreshUserInfo = async () => {
    if (!authMethod || !authMethod.apiKey) return;

    try {
      // Call the local server endpoint that proxies to the gateway
      const response = await fetch("/api/user/info", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authMethod.apiKey}`,
        },
      });

      if (response.ok) {
        const userInfo = (await response.json()) as {
          id: string;
          email: string;
          credits: number;
        };

        // Update the stored auth method with fresh user info
        const updatedAuth = {
          ...authMethod,
          userInfo: {
            id: userInfo.id,
            email: userInfo.email,
            credits: userInfo.credits,
          },
        };

        setAuthMethod(updatedAuth);
        localStorage.setItem("auth_method", JSON.stringify(updatedAuth));
      } else {
        console.error(
          "Failed to refresh user info:",
          response.status,
          await response.text()
        );
      }
    } catch (error) {
      console.error("Error refreshing user info:", error);
    }
  };

  const checkTokenExpiration = () => {
    if (!authMethod?.apiKey) return false;

    // Check if it's a JWT token and if it's expired
    if (isJWTToken(authMethod.apiKey) && isJWTTokenExpired(authMethod.apiKey)) {
      console.log("Token has expired, clearing auth");
      setAuthMethod(null);
      localStorage.removeItem("auth_method");
      localStorage.setItem("auth_expired_token", "true");
      return true;
    }

    return false;
  };

  const value: AuthContextType = {
    authMethod,
    isAuthenticated: !!authMethod,
    isLoading,
    oauthConfig,
    login,
    logout,
    switchToBYOK,
    switchToCredits,
    refreshUserInfo,
    checkTokenExpiration,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
