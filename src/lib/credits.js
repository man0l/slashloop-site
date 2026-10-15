// 1 credit = $0.01 USD — mirror of src/lib/credits.ts in the slashloop repo.
// Every credit amount shown in the UI carries its dollar value next to it.
export const CREDIT_USD = 0.01;

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

/** "$0.75", "$1,234.00", "$0.015" (1.5 credits). '' for a non-number. */
export function creditsToUsd(n) {
  if (n === null || n === undefined || n === "") return "";
  const credits = Number(n);
  if (!Number.isFinite(credits)) return "";
  // Credits are cents: divide by 100 instead of multiplying by 0.01 so
  // 1234 credits is exactly 12.34, not 12.340000000000002.
  return USD.format(credits / 100);
}

/** "75 credits ($0.75)", "1 credit ($0.01)". '' for a non-number. */
export function formatCredits(n) {
  const usd = creditsToUsd(n);
  if (!usd) return "";
  const credits = Number(n);
  return `${credits.toLocaleString("en-US")} credit${credits === 1 ? "" : "s"} (${usd})`;
}
