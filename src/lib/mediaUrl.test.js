import { describe, it, expect } from "vitest";
import { isTikTokCdnUrl, displayMediaUrl, displayMediaUrls } from "./mediaUrl.js";

const TIKTOK_COVER =
  "https://p19-common-sign.tiktokcdn-us.com/tos-useast8-p-0068-tx2/oItCjfjE9AMIBzjIBR0iAWAqbiQiEvTO1zaAAm~tplv-tiktokx-origin.image?x-expires=1&x-signature=abc";

describe("isTikTokCdnUrl", () => {
  it("matches the regional image CDN that 403s in the browser", () => {
    expect(isTikTokCdnUrl(TIKTOK_COVER)).toBe(true);
    expect(isTikTokCdnUrl("https://p16-common-sign.tiktokcdn-us.com/tos/x.image")).toBe(true);
    expect(isTikTokCdnUrl("https://v16.tiktokcdn.com/video/abc")).toBe(true);
    expect(isTikTokCdnUrl("https://v16-webapp-prime.us.tiktok.com/video/abc")).toBe(true);
  });

  it("does not match owned storage or unrelated CDNs", () => {
    expect(isTikTokCdnUrl("https://pub-abc.r2.dev/ws/vid.jpg")).toBe(false);
    expect(isTikTokCdnUrl("https://cdn.example/cover.jpg")).toBe(false);
    expect(isTikTokCdnUrl("https://kv.rd.apify.net/v2/abc")).toBe(false);
    expect(isTikTokCdnUrl(null)).toBe(false);
  });
});

describe("displayMediaUrl", () => {
  it("drops TikTok CDN URLs so the page never requests them", () => {
    expect(displayMediaUrl(TIKTOK_COVER)).toBeNull();
  });

  it("keeps R2 / our own hosts", () => {
    expect(displayMediaUrl("https://pub-abc.r2.dev/ws/vid.jpg")).toBe("https://pub-abc.r2.dev/ws/vid.jpg");
  });

  it("filters a mixed slideshow list down to owned URLs", () => {
    expect(displayMediaUrls([
      TIKTOK_COVER,
      "https://pub-abc.r2.dev/ws/vid/slides/00.jpg",
      "not-a-url",
    ])).toEqual(["https://pub-abc.r2.dev/ws/vid/slides/00.jpg"]);
  });
});
