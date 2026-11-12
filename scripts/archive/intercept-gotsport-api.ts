import { chromium } from "playwright";

async function interceptRankingsAPI() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  // Intercept all XHR/fetch calls
  page.on("request", (request) => {
    if (request.resourceType() === "xhr" || request.resourceType() === "fetch") {
      const url = request.url();
      if (url.includes("gotsport") && !url.includes("doubleclick") && !url.includes("nr-data")) {
        console.log(`\nREQUEST: ${request.method()} ${url}`);
        const headers = request.headers();
        const relevant = Object.entries(headers).filter(
          ([k]) => !["accept-encoding", "sec-", "user-agent"].some((p) => k.startsWith(p))
        );
        if (relevant.length > 0) {
          console.log("  Headers:", Object.fromEntries(relevant));
        }
        if (request.postData()) {
          console.log("  Body:", request.postData()?.substring(0, 500));
        }
      }
    }
  });

  page.on("response", async (response) => {
    const url = response.url();
    if (
      url.includes("team_ranking") ||
      url.includes("ranking_data") ||
      url.includes("/api/v1")
    ) {
      try {
        const body = await response.text();
        console.log(`\nRESPONSE: ${response.status()} ${url}`);
        console.log(`  Content-Type: ${response.headers()["content-type"]}`);
        console.log(`  Body length: ${body.length}`);
        console.log(`  Preview: ${body.substring(0, 500)}`);
      } catch {}
    }
  });

  console.log("Navigating to rankings.gotsport.com...");
  await page.goto("https://rankings.gotsport.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });

  // Wait for the page to load and make its API calls
  await page.waitForTimeout(10000);

  // Now try selecting U14 Boys to see what API call it makes
  console.log("\n\n=== Trying to interact with filters ===");

  // Look for dropdowns/selectors
  const selectors = await page.$$("select, [role='listbox'], .dropdown, button");
  console.log(`Found ${selectors.length} potential filter elements`);

  for (const sel of selectors) {
    const text = await sel.textContent();
    const tag = await sel.evaluate((el) => el.tagName);
    if (text && text.trim().length < 100) {
      console.log(`  ${tag}: "${text.trim().substring(0, 80)}"`);
    }
  }

  // Take a screenshot
  await page.screenshot({ path: "scripts/rankings_page.png", fullPage: true });
  console.log("\nScreenshot saved to scripts/rankings_page.png");

  // Wait a bit more for user inspection
  await page.waitForTimeout(5000);

  await browser.close();
}

interceptRankingsAPI().catch(console.error);
