import { describe, expect, it } from "vitest";
import { CREDIT_USD, creditsToUsd, formatCredits } from "./credits.js";

describe("creditsToUsd", () => {
  it("prices one credit at one cent", () => {
    expect(CREDIT_USD).toBe(0.01);
    expect(creditsToUsd(1)).toBe("$0.01");
  });

  it("formats whole and large amounts en-US with two decimals", () => {
    expect(creditsToUsd(0)).toBe("$0.00");
    expect(creditsToUsd(75)).toBe("$0.75");
    expect(creditsToUsd(3000)).toBe("$30.00");
    expect(creditsToUsd(123400)).toBe("$1,234.00");
    expect(creditsToUsd(1234)).toBe("$12.34");
  });

  it("keeps sub-cent precision for fractional credits", () => {
    expect(creditsToUsd(1.5)).toBe("$0.015");
    expect(creditsToUsd(7.5)).toBe("$0.075");
  });

  it("returns '' for missing or non-numeric input", () => {
    expect(creditsToUsd(null)).toBe("");
    expect(creditsToUsd(undefined)).toBe("");
    expect(creditsToUsd(NaN)).toBe("");
    expect(creditsToUsd("abc")).toBe("");
  });
});

describe("formatCredits", () => {
  it("pairs the credit count with its dollar value", () => {
    expect(formatCredits(75)).toBe("75 credits ($0.75)");
    expect(formatCredits(1)).toBe("1 credit ($0.01)");
    expect(formatCredits(5000)).toBe("5,000 credits ($50.00)");
    expect(formatCredits(1.5)).toBe("1.5 credits ($0.015)");
  });

  it("returns '' for missing input", () => {
    expect(formatCredits(null)).toBe("");
    expect(formatCredits(NaN)).toBe("");
  });
});
