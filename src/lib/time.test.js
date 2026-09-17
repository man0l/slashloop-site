import { expect, test } from "vitest";
import { timeAgo } from "./time.js";

test("formats elapsed time as relative labels", () => {
  const now = Date.now();
  expect(timeAgo(new Date(now).toISOString())).toBe("just now");
  expect(timeAgo(new Date(now - 90 * 1000).toISOString())).toMatch(/minute ago/);
  expect(timeAgo(new Date(now - 3 * 3600 * 1000).toISOString())).toMatch(/3 hours ago/);
  expect(timeAgo(new Date(now - 3 * 86400 * 1000).toISOString())).toMatch(/3 days ago/);
  expect(timeAgo(new Date(now - 40 * 86400 * 1000).toISOString())).toMatch(/month/);
});
