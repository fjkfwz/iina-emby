import { describe, expect, it } from "vitest";
import { buildAuthorizationHeader, buildEmbyHeaders } from "./auth";

describe("auth utils", () => {
  it("builds authorization header with defaults", () => {
    const header = buildAuthorizationHeader();
    expect(header).toContain('Client="IINA Emby Plugin"');
    expect(header).toContain('DeviceId="iina-emby"');
    expect(header).not.toContain("Token=");
  });

  it("includes token when provided", () => {
    const header = buildAuthorizationHeader({ deviceId: "my-mac" }, "token123");
    expect(header).toContain('DeviceId="my-mac"');
    expect(header).toContain('Token="token123"');
  });

  it("builds complete headers map with Authorization", () => {
    const headers = buildEmbyHeaders({ clientName: "TestClient" }, "secret-key", { "Custom-Header": "Value" });
    expect(headers.Authorization).toContain('Client="TestClient"');
    expect(headers.Authorization).toContain('Token="secret-key"');
    expect(headers["Custom-Header"]).toBe("Value");
    expect(headers.Accept).toBe("application/json");
  });
});
