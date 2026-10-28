import { describe, expect, it, vi } from "vitest";
import { createSafeHttp } from "./safe-http";

describe("createSafeHttp", () => {
  it("performs GET request and parses JSON body", async () => {
    const mockExec = vi.fn().mockResolvedValue({
      status: 0,
      stdout: '{"Name":"Inception","Type":"Movie"}\n200',
      stderr: "",
    });

    const mockUtils = {
      exec: mockExec,
      resolvePath: vi.fn((p) => `/mock/path/${p}`),
    } as unknown as typeof iina.utils;

    const safeHttp = createSafeHttp(mockUtils);
    const res = await safeHttp.get<any>("https://emby.example.com/Items/123", {
      headers: { "X-Emby-Token": "secret" },
    });

    expect(mockExec).toHaveBeenCalledWith(
      "/usr/bin/curl",
      expect.arrayContaining(["-s", "-S", "-L", "-X", "GET", "-H", "X-Emby-Token: secret"]),
    );
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ Name: "Inception", Type: "Movie" });
  });

  it("performs POST request with data payload", async () => {
    const mockExec = vi.fn().mockResolvedValue({
      status: 0,
      stdout: "\n204",
      stderr: "",
    });

    const mockUtils = {
      exec: mockExec,
    } as unknown as typeof iina.utils;

    const safeHttp = createSafeHttp(mockUtils);
    const res = await safeHttp.post("https://emby.example.com/Sessions/Playing", {
      headers: { "Content-Type": "application/json" },
      data: { ItemId: "123", PositionTicks: 10000 },
    });

    expect(mockExec).toHaveBeenCalledWith(
      "/usr/bin/curl",
      expect.arrayContaining(["-X", "POST", "-d", JSON.stringify({ ItemId: "123", PositionTicks: 10000 })]),
    );
    expect(res.status).toBe(204);
  });

  it("handles curl download and resolves path", async () => {
    const mockExec = vi.fn().mockResolvedValue({
      status: 0,
      stdout: "",
      stderr: "",
    });

    const mockUtils = {
      exec: mockExec,
      resolvePath: vi.fn((p) => `/resolved/${p}`),
    } as unknown as typeof iina.utils;

    const safeHttp = createSafeHttp(mockUtils);
    await safeHttp.download("https://emby.example.com/subtitle.srt", "@tmp/sub.srt");

    expect(mockUtils.resolvePath).toHaveBeenCalledWith("@tmp/sub.srt");
    expect(mockExec).toHaveBeenCalledWith(
      "/usr/bin/curl",
      expect.arrayContaining(["-o", "/resolved/@tmp/sub.srt", "https://emby.example.com/subtitle.srt"]),
    );
  });

  it("prefers native iina.http when provided", async () => {
    const mockGet = vi.fn().mockResolvedValue({
      status: 200,
      data: { Name: "Movie", Type: "Movie" },
    });
    const mockPost = vi.fn().mockResolvedValue({
      status: 204,
      data: "",
    });
    const mockDownload = vi.fn().mockResolvedValue(undefined);

    const mockHttp = {
      get: mockGet,
      post: mockPost,
      download: mockDownload,
    } as unknown as typeof iina.http;

    const mockExec = vi.fn();
    const mockUtils = {
      exec: mockExec,
      resolvePath: vi.fn((p) => `/resolved/${p}`),
    } as unknown as typeof iina.utils;

    const safeHttp = createSafeHttp(mockUtils, undefined, mockHttp);

    const getRes = await safeHttp.get<any>("https://emby.example.com/Items/123", {
      headers: { "X-Emby-Token": "secret" },
    });
    expect(mockGet).toHaveBeenCalledWith("https://emby.example.com/Items/123", {
      headers: { "X-Emby-Token": "secret" },
    });
    expect(mockExec).not.toHaveBeenCalled();
    expect(getRes.data).toEqual({ Name: "Movie", Type: "Movie" });

    const postRes = await safeHttp.post("https://emby.example.com/Sessions/Playing", {
      data: { ItemId: "123" },
    });
    expect(mockPost).toHaveBeenCalledWith("https://emby.example.com/Sessions/Playing", {
      data: { ItemId: "123" },
    });
    expect(mockExec).not.toHaveBeenCalled();
    expect(postRes.status).toBe(204);

    await safeHttp.download("https://emby.example.com/sub.srt", "@tmp/sub.srt");
    expect(mockDownload).toHaveBeenCalledWith("https://emby.example.com/sub.srt", "/resolved/@tmp/sub.srt");
    expect(mockExec).not.toHaveBeenCalled();
  });
});
