import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getVideoDetail,
  analyzeVideo,
  friendlyAnalysisError,
  friendlyJobError,
  VideoApiError,
} from "./video.js";

const TOKEN = "tok-123";

function json(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("getVideoDetail", () => {
  it("GETs /api/videos/:id with the workspaceId and bearer token", async () => {
    const fetchMock = vi.fn(async () => json(200, { id: "v1", analysis: null, analysisJob: null }));
    vi.stubGlobal("fetch", fetchMock);

    await getVideoDetail(TOKEN, { workspaceId: "ws-1", videoId: "abc-123" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mcp.test/api/videos/abc-123?workspaceId=ws-1");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("URL-encodes the video id", async () => {
    const fetchMock = vi.fn(async () => json(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await getVideoDetail(TOKEN, { workspaceId: "ws-1", videoId: "a/b c" });

    expect(fetchMock.mock.calls[0][0]).toContain("/api/videos/a%2Fb%20c?");
  });
});

describe("analyzeVideo", () => {
  it("POSTs /api/videos/:id/analyze with { workspaceId }", async () => {
    const fetchMock = vi.fn(async () => json(200, { queued: true, jobId: "j1", status: "queued" }));
    vi.stubGlobal("fetch", fetchMock);

    await analyzeVideo(TOKEN, { workspaceId: "ws-1", videoId: "abc" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mcp.test/api/videos/abc/analyze");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({ workspaceId: "ws-1" });
  });

  it("surfaces a 429 quota body through the shared error shaping", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(429, { error: "gemini_quota_exhausted", retryable: true, message: "Gemini is temporarily unavailable." })),
    );

    await expect(analyzeVideo(TOKEN, { workspaceId: "ws-1", videoId: "abc" })).rejects.toMatchObject({
      status: 429,
      code: "gemini_quota_exhausted",
      message: "Gemini is temporarily unavailable.",
    });
  });
});

describe("friendlyAnalysisError", () => {
  it("402 insufficient credits -> credits, not retryable", () => {
    const err = new VideoApiError("Insufficient credits — 5 required, 3 remaining.", 402, "insufficient_credits");
    expect(friendlyAnalysisError(err)).toEqual({
      kind: "credits",
      retryable: false,
      message: "Insufficient credits — 5 required, 3 remaining.",
    });
  });

  it("429 quota -> quota, retryable", () => {
    const err = new VideoApiError("Gemini is temporarily unavailable.", 429, "gemini_quota_exhausted");
    expect(friendlyAnalysisError(err)).toEqual({
      kind: "quota",
      retryable: true,
      message: "Gemini is temporarily unavailable.",
    });
  });

  it("422 analyze failed -> failure, retryable", () => {
    const err = new VideoApiError("This video can't be analyzed.", 422, "analyze_failed");
    const r = friendlyAnalysisError(err);
    expect(r.kind).toBe("failure");
    expect(r.retryable).toBe(true);
  });

  it("404 video_not_found -> notFound, not retryable", () => {
    const err = new VideoApiError("Video not found.", 404, "video_not_found");
    expect(friendlyAnalysisError(err)).toEqual({ kind: "notFound", retryable: false, message: "Video not found." });
  });
});

describe("friendlyJobError", () => {
  it("a quota-tagged job -> quota retryable with a friendly line", () => {
    expect(friendlyJobError("gemini_quota", "[gemini_quota] 429 ...")).toMatchObject({
      kind: "quota",
      retryable: true,
      message: "Gemini is temporarily unavailable — try again later.",
    });
  });

  it("a non-quota job -> failure, retryable, keeps the persisted error text", () => {
    expect(friendlyJobError("other", "download timed out")).toMatchObject({
      kind: "failure",
      retryable: true,
      message: "download timed out",
    });
  });
});
