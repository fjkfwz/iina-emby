import type { EmbyServer } from "@shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticateByName, verifyServerSession } from "./emby-auth-client";

describe("emby-auth-client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("authenticates by name and preserves password on the returned server", async () => {
    const mockAuthResponse = {
      AccessToken: "token-xyz-123",
      User: {
        Id: "user-456",
        Name: "myuser",
      },
      ServerId: "srv-emby-1",
    };

    const mockPublicInfo = {
      ServerName: "My Home Emby",
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/System/Info/Public")) {
        return {
          ok: true,
          json: async () => mockPublicInfo,
        } as Response;
      }
      if (urlStr.includes("/Users/AuthenticateByName")) {
        return {
          ok: true,
          status: 200,
          json: async () => mockAuthResponse,
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const result = await authenticateByName("http://192.168.1.100:8096", "myuser", "mysecretpw");

    expect(result.success).toBe(true);
    expect(result.server).toBeDefined();
    expect(result.server?.username).toBe("myuser");
    expect(result.server?.password).toBe("mysecretpw");
    expect(result.server?.accessToken).toBe("token-xyz-123");
    expect(result.server?.serverName).toBe("My Home Emby");

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/Users/AuthenticateByName"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          Username: "myuser",
          Pw: "mysecretpw",
        }),
      }),
    );
  });

  it("handles 401 invalid password correctly", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/System/Info/Public")) {
        return { ok: true, json: async () => ({}) } as Response;
      }
      if (urlStr.includes("/Users/AuthenticateByName")) {
        return {
          ok: false,
          status: 401,
          text: async () => "Unauthorized",
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const result = await authenticateByName("http://192.168.1.100:8096", "myuser", "wrongpw");
    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid username or password");
  });

  it("verifies server session successfully", async () => {
    const dummyServer: EmbyServer = {
      id: "srv-1",
      serverUrl: "http://localhost:8096/emby",
      serverName: "Test",
      accessToken: "valid-token",
      userId: "u-1",
      username: "test",
      password: "saved-pw",
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/System/Info")) {
        return { ok: true } as Response;
      }
      if (urlStr.includes("/Users/u-1")) {
        return {
          ok: true,
          json: async () => ({ Id: "u-1", Name: "test" }),
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const check = await verifyServerSession(dummyServer);
    expect(check.valid).toBe(true);
    expect(check.user?.Name).toBe("test");
  });
});
