import { afterEach, describe, expect, it, vi } from "vitest";
import { getGallery, GalleryApiError } from "./gallery.js";

const TOKEN = "tok-123";

function json(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("getGallery", () => {
  it("GETs /api/gallery-data with the workspaceId and bearer token", async () => {
    const fetchMock = vi.fn(async () => json(200, { cards: [], note: "ok", filters: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await getGallery(TOKEN, { workspaceId: "ws-1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mcp.test/api/gallery-data?workspaceId=ws-1");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("forwards analyzedBy=openrouter", async () => {
    const fetchMock = vi.fn(async () => json(200, { cards: [], filters: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await getGallery(TOKEN, { workspaceId: "ws-1", analyzedBy: "openrouter" });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mcp.test/api/gallery-data?workspaceId=ws-1&analyzedBy=openrouter");
  });

  it("omits empty-string filters from the query string", async () => {
    const fetchMock = vi.fn(async () => json(200, { cards: [], filters: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await getGallery(TOKEN, { workspaceId: "ws-1", sourceId: "", analyzedBy: "", limit: 24 });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://mcp.test/api/gallery-data?workspaceId=ws-1&limit=24");
  });

  it("shapes a non-2xx response through GalleryApiError", async () => {
    const fetchMock = vi.fn(async () => json(400, { error: "bad_request", message: "nope" }));
    vi.stubGlobal("fetch", fetchMock);

    const err = await getGallery(TOKEN, { workspaceId: "ws-1" }).catch((e) => e);
    expect(err).toBeInstanceOf(GalleryApiError);
    expect(err.message).toBe("nope");
  });
});
