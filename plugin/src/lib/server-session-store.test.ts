import { describe, expect, it, vi } from "vitest";
import { createServerSessionStore } from "./server-session-store";

describe("server-session-store", () => {
  it("stores and preserves server password in addOrUpdateServer and getStoredEmbySession", () => {
    const memoryStore: Record<string, unknown> = {};

    const mockPreferences = {
      get: (key: string) => memoryStore[key],
      set: (key: string, value: unknown) => {
        memoryStore[key] = value;
      },
      sync: vi.fn(),
    } as unknown as typeof iina.preferences;

    const mockLog = Object.assign(vi.fn(), {
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    });

    const store = createServerSessionStore({
      preferences: mockPreferences,
      log: mockLog,
    });

    const added = store.addOrUpdateServer({
      serverUrl: "http://192.168.1.50:8096",
      accessToken: "token-1",
      userId: "u-1",
      username: "alice",
      password: "secretpassword123",
      serverName: "Alice Home",
    });

    expect(added).toBeDefined();
    expect(added?.password).toBe("secretpassword123");

    const servers = store.loadStoredServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].password).toBe("secretpassword123");

    const session = store.getStoredEmbySession();
    expect(session?.password).toBe("secretpassword123");

    // Update password for the same server
    const updated = store.addOrUpdateServer({
      id: added?.id,
      serverUrl: "http://192.168.1.50:8096",
      accessToken: "token-2",
      userId: "u-1",
      username: "alice",
      password: "newpassword456",
    });

    expect(updated?.password).toBe("newpassword456");
    const updatedServers = store.loadStoredServers();
    expect(updatedServers).toHaveLength(1);
    expect(updatedServers[0].password).toBe("newpassword456");
  });
});
