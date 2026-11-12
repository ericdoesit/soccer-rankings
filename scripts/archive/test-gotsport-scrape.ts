/**
 * GotSport Scraping Proof-of-Concept
 *
 * Tests whether we can access game data from GotSport using Playwright.
 * Targets: team schedules with game scores from system.gotsport.com
 *
 * Usage: npx tsx scripts/test-gotsport-scrape.ts
 */

import { chromium } from "playwright";

const TEST_URLS = [
  // SoCal league team schedule (from existing data)
  "https://system.gotsport.com/org_event/events/43086/schedules?team=3118856",
  // Rankings page
  "https://rankings.gotsport.com/",
  // Event page (SoCal Fall League)
  "https://system.gotsport.com/org_event/events/43086",
];

async function testGotSportAccess() {
  console.log("Starting GotSport scraping test...\n");

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
  });

  // Track API calls made by the page
  const apiCalls: string[] = [];
  context.on("request", (request) => {
    const url = request.url();
    if (
      url.includes("/api/") ||
      url.includes(".json") ||
      url.includes("graphql") ||
      (url.includes("gotsport") && request.resourceType() === "xhr")
    ) {
      apiCalls.push(`${request.method()} ${url}`);
    }
  });

  context.on("response", async (response) => {
    const url = response.url();
    if (
      url.includes("/api/") ||
      url.includes("gotsport") &&
      response.request().resourceType() === "xhr"
    ) {
      try {
        const contentType = response.headers()["content-type"] || "";
        if (contentType.includes("json")) {
          const body = await response.text();
          console.log(`\n=== API Response: ${url} ===`);
          console.log(body.substring(0, 500));
        }
      } catch {
        // response body may not be available
      }
    }
  });

  for (const url of TEST_URLS) {
    console.log(`\n--- Testing: ${url} ---`);
    const page = await context.newPage();

    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

      // Check for CAPTCHA
      const captcha = await page.$('iframe[src*="recaptcha"]');
      const captchaPanel = await page.$(".panel-title");
      const captchaText = captchaPanel
        ? await captchaPanel.textContent()
        : null;

      if (captcha || captchaText?.includes("verify")) {
        console.log("  CAPTCHA DETECTED - waiting 15s for manual solve...");
        await page.waitForTimeout(15000);

        // Check if captcha was solved (page navigated)
        const newUrl = page.url();
        if (newUrl !== url) {
          console.log(`  Redirected to: ${newUrl}`);
        }
      }

      // Get page title and content
      const title = await page.title();
      console.log(`  Title: ${title}`);

      // Look for schedule/game data
      const gameRows = await page.$$("table tr, .game-row, .match-row, .schedule-row");
      console.log(`  Table rows found: ${gameRows.length}`);

      // Extract any visible score data
      const scores = await page.$$eval(
        "td, .score, .result",
        (els) =>
          els
            .map((el) => el.textContent?.trim())
            .filter((t) => t && /^\d+-\d+$/.test(t))
            .slice(0, 10)
      );
      if (scores.length > 0) {
        console.log(`  Scores found: ${scores.join(", ")}`);
      }

      // Look for team names
      const teamNames = await page.$$eval(
        ".team-name, .club-name, td a",
        (els) =>
          els
            .map((el) => el.textContent?.trim())
            .filter((t) => t && t.length > 3 && t.length < 60)
            .slice(0, 10)
      );
      if (teamNames.length > 0) {
        console.log(`  Team names: ${teamNames.join(", ")}`);
      }

      // Take a screenshot
      const screenshotName = url
        .replace(/[^a-z0-9]/gi, "_")
        .substring(0, 50);
      await page.screenshot({
        path: `scripts/screenshot_${screenshotName}.png`,
        fullPage: true,
      });
      console.log(`  Screenshot saved`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`  ERROR: ${msg}`);
    }

    await page.close();
  }

  // Report API calls
  if (apiCalls.length > 0) {
    console.log("\n=== API Calls Intercepted ===");
    for (const call of apiCalls) {
      console.log(`  ${call}`);
    }
  } else {
    console.log("\n  No API calls intercepted");
  }

  await browser.close();
  console.log("\nDone.");
}

testGotSportAccess().catch(console.error);
