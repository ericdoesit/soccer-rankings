import { chromium } from "playwright";

async function searchAndCapture() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  // Track API calls
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("team_ranking")) {
      console.log(`\nREQUEST: ${request.method()} ${url}`);
    }
  });

  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("team_ranking")) {
      try {
        const body = await response.json();
        const count = Array.isArray(body) ? body.length : "non-array";
        console.log(`RESPONSE: ${count} items from ${url}`);
        if (Array.isArray(body) && body.length > 0) {
          console.log(`  First: #${body[0].national_rank} ${body[0].team_name} (age=${body[0].age})`);
          if (body.length > 1) {
            console.log(`  Last: #${body[body.length - 1].national_rank} ${body[body.length - 1].team_name}`);
          }
        }
      } catch {}
    }
  });

  console.log("Loading page...");
  await page.goto("https://rankings.gotsport.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(8000);

  // Click "Team Rankings Search"
  console.log("\n=== Opening search panel ===");
  const searchBtn = page.locator('button:has-text("Team Rankings Search")');
  await searchBtn.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // Type in the search box
  console.log("\n=== Searching for 'FC Dallas' ===");
  const searchInput = page.locator('input[placeholder*="Team"]');
  await searchInput.fill("FC Dallas");
  await page.waitForTimeout(3000);

  // Try pressing Enter or clicking search
  await searchInput.press("Enter");
  await page.waitForTimeout(3000);

  // Take screenshot of results
  await page.screenshot({ path: "scripts/search_results.png", fullPage: true });
  console.log("Screenshot saved");

  // Get the visible results from the page
  console.log("\n=== Visible results ===");
  const teams = await page.$$eval(".team-name, [class*='team'], [class*='name']", (els) =>
    els.map((el) => el.textContent?.trim()).filter((t) => t && t.length > 3 && t.length < 80).slice(0, 20)
  );
  if (teams.length > 0) {
    console.log("Teams found on page:");
    teams.forEach((t) => console.log(`  ${t}`));
  }

  // Also check for any table rows or list items
  const rows = await page.$$eval("tr, li", (els) =>
    els
      .map((el) => el.textContent?.trim())
      .filter((t) => t && t.includes("FC") && t.length < 200)
      .slice(0, 10)
  );
  if (rows.length > 0) {
    console.log("\nTable rows with 'FC':");
    rows.forEach((r) => console.log(`  ${r?.substring(0, 100)}`));
  }

  await page.waitForTimeout(2000);
  await browser.close();
}

searchAndCapture().catch(console.error);
