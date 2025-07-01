export interface OAuthConfig {
  client_id: string;
  auth_url: string;
  token_url: string;
}

export interface ServerOAuthConfig extends OAuthConfig {
  client_secret: string;
}

// Client-side config (fetches from server endpoint)
let cachedConfig: OAuthConfig | null = null;

export async function getOAuthConfig(): Promise<OAuthConfig> {
  // Return cached config if available
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const response = await fetch("/api/oauth/config");
    if (!response.ok) {
      throw new Error(`Failed to fetch OAuth config: ${response.status}`);
    }

    const config: OAuthConfig = await response.json();
    cachedConfig = config;
    console.log("[OAuth Config] Fetched from server:", config);
    return config;
  } catch (error) {
    console.error("[OAuth Config] Failed to fetch from server:", error);
    throw new Error("Failed to load OAuth configuration");
  }
}

// Server-side config (reads from environment variables)
export function getServerOAuthConfig(env: any): ServerOAuthConfig {
  return {
    client_id: env.ATYOURSERVICE_OAUTH_CLIENT_ID,
    auth_url: `${env.OAUTH_PROVIDER_BASE_URL}/oauth/authorize`,
    token_url: `${env.OAUTH_PROVIDER_BASE_URL}/oauth/token`,
    client_secret: env.ATYOURSERVICE_OAUTH_CLIENT_SECRET,
  };
}
