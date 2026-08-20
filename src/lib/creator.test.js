import { describe, expect, it } from "vitest";
import {
  normalizeCreatorHandle,
  previewFromGalleryCards,
  trackedCreatorSource,
} from "./creator.js";

describe("normalizeCreatorHandle", () => {
  it("strips @ and lowercases", () => {
    expect(normalizeCreatorHandle("@Maker")).toBe("maker");
    expect(normalizeCreatorHandle("Maker")).toBe("maker");
  });
});

describe("trackedCreatorSource", () => {
  const sources = [
    { id: "s-kw", sourceType: "keyword", query: "maker" },
    { id: "s-cr", sourceType: "creator", query: "@Maker" },
  ];

  it("matches a tracked creator ignoring @ and case", () => {
    expect(trackedCreatorSource(sources, "maker")?.id).toBe("s-cr");
    expect(trackedCreatorSource(sources, "@MAKER")?.id).toBe("s-cr");
  });

  it("does not treat a keyword with the same query as a tracked creator", () => {
    expect(trackedCreatorSource([{ id: "s-kw", sourceType: "keyword", query: "maker" }], "maker")).toBeNull();
  });
});

describe("previewFromGalleryCards", () => {
  const cards = [
    { id: "a", creatorHandle: "maker", outlierScore: 8, postedAt: 100, views: 10, thumbUrl: "a.jpg", caption: "a", url: "/a" },
    { id: "b", creatorHandle: "@Maker", outlierScore: 3, postedAt: 300, views: 20, thumbUrl: "b.jpg", caption: "b", url: "/b" },
    { id: "c", creatorHandle: "maker", outlierScore: 1.2, postedAt: 200, views: 5, thumbUrl: "c.jpg", caption: "c", url: "/c" },
    { id: "d", creatorHandle: "other", outlierScore: 50, postedAt: 400, views: 99, thumbUrl: "d.jpg", caption: "d", url: "/d" },
  ];

  it("takes this creator's outliers by score and last 5 by postedAt", () => {
    const preview = previewFromGalleryCards("maker", cards);
    expect(preview.videoCount).toBe(3);
    expect(preview.outlierCount).toBe(2); // 8 and 3, not 1.2
    expect(preview.outliers.map((v) => v.id)).toEqual(["a", "b", "c"]);
    expect(preview.recent.map((v) => v.id)).toEqual(["b", "c", "a"]);
  });
});
