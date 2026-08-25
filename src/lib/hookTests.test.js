import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getHookTestForVideo,
  startHookTest,
  updateHookTestLock,
  pickHookVersions,
  rerollHooks,
  closeHookTest,
  listHookTests,
  friendlyHookTestError,
} from "./hookTests.js";

const TOKEN = "tok-123";

function json(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("hook-test endpoints", () => {
  it("GETs the open test for a video", async () => {
    const fetchMock = vi.fn(async () => json(200, { test: null }));
    vi.stubGlobal("fetch", fetchMock);

    await getHookTestForVideo(TOKEN, { workspaceId: "ws-1", videoId: "vid-1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mcp.test/api/videos/vid-1/hook-test?workspaceId=ws-1");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("POSTs start with brandContext/insight and NO abort signal (paid generation must survive unmount)", async () => {
    const fetchMock = vi.fn(async () => json(200, { test: { id: "ht-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    await startHookTest(TOKEN, { workspaceId: "ws-1", videoId: "vid-1", brandContext: "running app", insight: "proof first" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mcp.test/api/videos/vid-1/hook-test");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      workspaceId: "ws-1",
      brandContext: "running app",
      insight: "proof first",
    });
    expect(init.signal).toBeUndefined();
  });

  it("omits empty optional fields from the start body", async () => {
    const fetchMock = vi.fn(async () => json(200, { test: { id: "ht-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    await startHookTest(TOKEN, { workspaceId: "ws-1", videoId: "vid-1", brandContext: "   " });

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ workspaceId: "ws-1" });
  });

  it("PATCHes the lock with only the fields provided", async () => {
    const fetchMock = vi.fn(async () => json(200, { test: { id: "ht-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    await updateHookTestLock(TOKEN, { workspaceId: "ws-1", videoId: "vid-1", sameIn: ["the desk", "daylight"] });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ workspaceId: "ws-1", sameIn: ["the desk", "daylight"] });
  });

  it("POSTs picks as sorted label arrays", async () => {
    const fetchMock = vi.fn(async () => json(200, { test: { id: "ht-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    await pickHookVersions(TOKEN, { workspaceId: "ws-1", videoId: "vid-1", picks: ["C", "A"] });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mcp.test/api/videos/vid-1/hook-test/pick");
    // The panel sorts before calling; the client passes through as-is.
    expect(JSON.parse(init.body)).toEqual({ workspaceId: "ws-1", picks: ["C", "A"] });
  });

  it("POSTs reroll and close against their action routes; close omits an absent outcome", async () => {
    const fetchMock = vi.fn(async () => json(200, { test: { id: "ht-1", status: "closed" } }));
    vi.stubGlobal("fetch", fetchMock);

    await rerollHooks(TOKEN, { workspaceId: "ws-1", videoId: "vid-1" });
    let [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mcp.test/api/videos/vid-1/hook-test/reroll");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeUndefined();

    await closeHookTest(TOKEN, { workspaceId: "ws-1", videoId: "vid-1" });
    [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("https://mcp.test/api/videos/vid-1/hook-test/close");
    expect(JSON.parse(init.body)).toEqual({ workspaceId: "ws-1" });

    await closeHookTest(TOKEN, { workspaceId: "ws-1", videoId: "vid-1", outcome: "won" });
    [url, init] = fetchMock.mock.calls[2];
    expect(JSON.parse(init.body)).toEqual({ workspaceId: "ws-1", outcome: "won" });
  });

  it("lists tests through the workspaces resource route with includeClosed only when asked", async () => {
    const fetchMock = vi.fn(async () => json(200, { tests: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await listHookTests(TOKEN, { workspaceId: "ws-1", includeClosed: true });
    let [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mcp.test/api/workspaces?workspaceId=ws-1&resource=hook-tests&includeClosed=1");

    await listHookTests(TOKEN, { workspaceId: "ws-1", includeClosed: false });
    [url] = fetchMock.mock.calls[1];
    expect(url).toBe("https://mcp.test/api/workspaces?workspaceId=ws-1&resource=hook-tests");
  });
});

describe("friendlyHookTestError", () => {
  it("maps insufficient credits to a non-retryable credits kind (retrying re-charges)", () => {
    const mapped = friendlyHookTestError({ message: "Need 2 credits.", status: 402, code: "insufficient_credits" });
    expect(mapped).toEqual({ kind: "credits", retryable: false, message: "Need 2 credits." });
  });

  it("maps a conflict to the conflict kind — caller should refetch, not retry blind", () => {
    const err = new Error("Another request just opened a test for this video.");
    err.status = 409;
    const mapped = friendlyHookTestError(err);
    expect(mapped.kind).toBe("conflict");
    expect(mapped.retryable).toBe(false);
  });

  it("maps 404 to notFound", () => {
    expect(friendlyHookTestError({ message: "gone", status: 404 }).kind).toBe("notFound");
  });

  it("leaves anything else a retryable failure and always yields a message", () => {
    const mapped = friendlyHookTestError(new TypeError("Failed to fetch"));
    expect(mapped.kind).toBe("failure");
    expect(mapped.retryable).toBe(true);
    expect(mapped.message).toBeTruthy();
  });
});
