// Conversion loop, iteration gate: `node scripts/conversion-check.mjs [BASE]`.
// BASE defaults to local dev (http://localhost:5199); pass the production
// origin to audit the live page instead.
//
// Asserts the conversion-critical contract of the landing page:
// hero promise + CTAs above the fold with correct targets, live carousel
// with loaded thumbs + working arrows, agentic terminal that starts on
// scroll, final CTA, footer legal links resolving, no JS errors, no
// horizontal overflow — desktop and mobile. Exits non-zero on any failure.
import { chromium } from "playwright-core";

const BASE = (process.argv[2] ?? "http://localhost:5199").replace(/\/$/, "");
const EXE =
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

const failures = [];
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra && !cond ? ` — ${extra}` : ""}`);
  if (!cond) failures.push(name);
}

const IGNORED_ERRORS = [/VITE_SUPABASE_URL/, /favicon/i, /net::ERR_/];

async function auditViewport(browser, width, height, tag) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e && e.message || e).slice(0, 160)));
  page.on("console", (m) => {
    if (m.type() === "error") {
      const t = m.text().slice(0, 200);
      if (!IGNORED_ERRORS.some((re) => re.test(t))) errors.push(t);
    }
  });

  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 45000 });

  // Hero promise + rotator words.
  const h1 = (await page.locator("h1").nth(0).innerText().catch(() => "")) ?? "";
  check(`[${tag}] hero promise`, /Clone viral/i.test(h1) && /paying customers/i.test(h1), h1.slice(0, 60));
  const rotator = await page.evaluate(() => {
    const el = document.querySelector(".rotator-inner");
    return el ? el.textContent : "";
  });
  check(`[${tag}] rotator words`, /app/.test(rotator) && /saas/.test(rotator));

  // Hero CTAs above the fold with correct targets.
  const pricing = page.getByRole("link", { name: /see pricing/i }).first();
  const signin = page.getByRole("link", { name: /sign in/i }).first();
  check(`[${tag}] hero pricing CTA visible`, await pricing.isVisible());
  check(`[${tag}] hero signin CTA visible`, await signin.isVisible());
  check(`[${tag}] pricing href`, (await pricing.getAttribute("href")) === "/pricing");
  check(`[${tag}] signin href`, (await signin.getAttribute("href")) === "/login");

  // Click-through lands on /pricing (consent-gated analytics must not break nav).
  await pricing.click();
  await page.waitForURL("**/pricing", { timeout: 15000 }).catch(() => {});
  check(`[${tag}] pricing click lands`, page.url().endsWith("/pricing"), page.url());
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 45000 });

  // Live carousel: cards with loaded thumbs, working next arrow, dots.
  await page.waitForFunction(
    () => document.querySelectorAll('a[href*="tiktok.com"] img').length >= 4,
    { timeout: 20000 },
  ).catch(() => {});
  const loaded = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href*="tiktok.com"] img'))
      .filter((im) => im.naturalWidth > 50).length,
  );
  check(`[${tag}] carousel cards loaded (>=4)`, loaded >= 4, `loaded=${loaded}`);
  const before = await page.evaluate(() => {
    const sc = document.querySelector(".embla__viewport, [class*='overflow-hidden']");
    return window.scrollX;
  });
  // The scrollable track: whichever div holds the cards and actually overflows.
  const trackInfo = await page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll("div"));
    const el = divs.find(
      (d) => d.querySelector('a[href*="tiktok.com"]') && d.scrollWidth > d.clientWidth + 4,
    );
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  check(`[${tag}] carousel scroller present`, !!trackInfo);
  const trackX = (idx) =>
    page.evaluate((i) => {
      const divs = Array.from(document.querySelectorAll("div"));
      const el = divs.find(
        (d) => d.querySelector('a[href*="tiktok.com"]') && d.scrollWidth > d.clientWidth + 4,
      );
      return el ? el.scrollLeft : -1 - i;
    }, idx);
  const nextBtn = page.getByRole("button", { name: /next outliers/i });
  if ((await nextBtn.count()) && trackInfo) {
    const x0 = await trackX(0);
    await nextBtn.nth(0).click({ force: true }).catch(() => {});
    await page.waitForTimeout(900);
    const x1 = await trackX(1);
    check(`[${tag}] next arrow scrolls`, x1 > x0, `x0=${x0} x1=${x1}`);
  } else {
    check(`[${tag}] next arrow scrolls`, false, "no next button or no scrollable track");
  }

  // Agentic terminal types on scroll into view.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.62));
  await page.waitForFunction(() => document.body.innerText.includes("/track @competitor"), { timeout: 20000 }).catch(() => {});
  const typed = await page.evaluate(() => document.body.innerText.includes("/track @competitor"));
  check(`[${tag}] terminal starts on scroll`, typed);

  // Final CTA + footer legal links resolve.
  const final = page.getByRole("link", { name: /get in the \/loop/i }).first();
  check(`[${tag}] final CTA visible`, await final.isVisible().catch(() => false));
  for (const p of ["/privacy", "/terms", "/agent-setup", "/pricing"]) {
    const r = await page.request.get(BASE + p).catch(() => null);
    check(`[${tag}] ${p} resolves`, !!r && r.ok(), r ? `status=${r.status()}` : "no response");
  }

  // No horizontal overflow.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(`[${tag}] no horizontal overflow`, overflow <= 1, `overflow=${overflow}px`);

  check(`[${tag}] no JS errors`, errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.close();
}

const browser = await chromium.launch({ executablePath: EXE, args: ["--no-sandbox"] });
try {
  await auditViewport(browser, 1280, 900, "desktop");
  await auditViewport(browser, 390, 844, "mobile");
} finally {
  await browser.close();
}

if (failures.length) {
  console.log(`\n${failures.length} FAILURES:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("\nAll conversion checks passed.");
