import {
  buildAuthorizationHeader as buildSharedAuthHeader,
  buildEmbyHeaders as buildSharedEmbyHeaders,
  type ClientIdentity,
  cleanServerUrl,
  DEFAULT_CLIENT_IDENTITY,
  type EmbyServer,
  type EmbySystemInfo,
  type EmbyUser,
} from "@shared";

let currentIdentity: ClientIdentity = {
  ...DEFAULT_CLIENT_IDENTITY,
  deviceId: "iina-emby-react",
};

export function setClientIdentity(identity: Partial<ClientIdentity>) {
  currentIdentity = { ...currentIdentity, ...identity };
}

export function buildAuthorizationHeader(token?: string): string {
  return buildSharedAuthHeader(currentIdentity, token);
}

export function buildAuthHeaders(token?: string, extraHeaders?: HeadersInit): HeadersInit {
  return buildSharedEmbyHeaders(currentIdentity, token, extraHeaders as Record<string, string>);
}

export { cleanServerUrl };

export async function resolveServerApiBase(url: string): Promise<string> {
  const normalized = cleanServerUrl(url);
  if (normalized.endsWith("/emby")) {
    return normalized;
  }

  // Try /emby first (default for Emby)
  try {
    const res = await fetch(`${normalized}/emby/System/Info/Public`);
    if (res.ok) {
      return `${normalized}/emby`;
    }
  } catch {
    // Ignore and check root
  }

  // Try root (reverse proxy setups)
  try {
    const res = await fetch(`${normalized}/System/Info/Public`);
    if (res.ok) {
      return normalized;
    }
  } catch {
    // Fallback to /emby
  }

  return `${normalized}/emby`;
}

export async function getPublicSystemInfo(apiBase: string): Promise<EmbySystemInfo | null> {
  try {
    const res = await fetch(`${apiBase}/System/Info/Public`);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // Ignore
  }
  return null;
}

export async function authenticateByName(
  serverUrl: string,
  username: string,
  pw: string,
): Promise<{
  success: boolean;
  server?: EmbyServer;
  error?: string;
}> {
  try {
    const apiBase = await resolveServerApiBase(serverUrl);
    const authUrl = `${apiBase}/Users/AuthenticateByName`;

    const res = await fetch(authUrl, {
      method: "POST",
      headers: {
        ...buildAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        Username: username.trim(),
        Pw: pw,
      }),
    });

    if (res.status === 401) {
      return { success: false, error: "Invalid username or password" };
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return { success: false, error: errText || `Server returned ${res.status}` };
    }

    const data = await res.json();
    if (!data?.AccessToken || !data?.User) {
      return { success: false, error: "Incomplete response from Emby server" };
    }

    const publicInfo = await getPublicSystemInfo(apiBase);
    const serverName = publicInfo?.ServerName || data.ServerId || "Emby Server";

    const server: EmbyServer = {
      id: `srv-${Date.now()}`,
      serverUrl: apiBase,
      serverName: serverName,
      accessToken: data.AccessToken,
      userId: data.User.Id,
      username: data.User.Name,
      user: data.User as EmbyUser,
      addedAt: Date.now(),
      updatedAt: Date.now(),
    };

    return { success: true, server };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Connection failed";
    return { success: false, error: message };
  }
}

export async function fetchCurrentUser(server: EmbyServer): Promise<EmbyUser | null> {
  try {
    if (!server.userId) return null;
    const apiBase = await resolveServerApiBase(server.serverUrl);
    const userUrl = new URL(`${apiBase}/Users/${encodeURIComponent(server.userId)}`);
    if (server.accessToken) userUrl.searchParams.set("api_key", server.accessToken);
    const userRes = await fetch(userUrl.toString(), {
      headers: buildAuthHeaders(server.accessToken),
    });
    if (userRes.ok) {
      return (await userRes.json()) as EmbyUser;
    }
    return null;
  } catch {
    return null;
  }
}

export async function verifyServerSession(server: EmbyServer): Promise<{ valid: boolean; user?: EmbyUser }> {
  try {
    const apiBase = await resolveServerApiBase(server.serverUrl);
    // Emby validates token on /System/Info or /Users/{userId}
    const infoUrl = new URL(`${apiBase}/System/Info`);
    if (server.accessToken) infoUrl.searchParams.set("api_key", server.accessToken);
    const res = await fetch(infoUrl.toString(), {
      headers: buildAuthHeaders(server.accessToken),
    });
    if (!res.ok) return { valid: false };

    // Get user details
    const user = await fetchCurrentUser(server);
    return { valid: true, user: user || undefined };
  } catch {
    return { valid: false };
  }
}
