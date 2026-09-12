import { describe, it, expect, vi, afterEach } from "vitest";
import { downloadSlideshowZip } from "./slideshowZip.js";

// Minimal Response stand-in — the helper only reads ok/status/content-type/blob.
const media = (type = "image/jpeg", { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  headers: { get: (h) => (String(h).toLowerCase() === "content-type" ? type : null) },
  blob: async () => new Blob([`${type}-${status}`]),
});

describe("downloadSlideshowZip", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches every slide and triggers one download named by the caller", async () => {
    const fetchMock = vi.fn(async () => media());
    vi.stubGlobal("fetch", fetchMock);
    const hrefs = [];
    Object.assign(URL, {
      createObjectURL: vi.fn((blob) => {
        hrefs.push(blob);
        return `blob:${hrefs.length}`;
      }),
      revokeObjectURL: vi.fn(),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const packed = await downloadSlideshowZip(["https://cdn/a", "https://cdn/b"], { fileName: "slides-x.zip" });

    expect(packed).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(hrefs).toHaveLength(1);
    expect(hrefs[0]).toBeInstanceOf(Blob);
    const anchor = click.mock.contexts[0];
    expect(anchor.download).toBe("slides-x.zip");
    expect(anchor.href).toBe("blob:1");
  });

  it("derives the entry extension from the content type (URL fallback)", async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.endsWith("typed")) return media("image/png");
      if (url.endsWith("untyped.png")) return media(""); // no content-type -> URL extension
      return media(); // no content-type, no extension -> jpg default
    });
    vi.stubGlobal("fetch", fetchMock);
    Object.assign(URL, { createObjectURL: () => "blob:z", revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const packed = await downloadSlideshowZip(["https://cdn/typed", "https://cdn/untyped.png", "https://cdn/bare"]);
    expect(packed).toBe(3);
  });

  it("packs best-effort: a failed slide is skipped but the set still downloads", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url) => (url.endsWith("bad") ? media("image/jpeg", { ok: false, status: 403 }) : media())));
    Object.assign(URL, { createObjectURL: () => "blob:z", revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const packed = await downloadSlideshowZip(["https://cdn/a", "https://cdn/bad", "https://cdn/b"]);
    expect(packed).toBe(2);
  });

  it("throws when no slide could be fetched", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => media("image/jpeg", { ok: false, status: 500 })));
    Object.assign(URL, { createObjectURL: () => "blob:z", revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await expect(downloadSlideshowZip(["https://cdn/a"])).rejects.toThrow(/no slides/i);
  });
});
