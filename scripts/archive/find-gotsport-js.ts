import { chromium } from "playwright";

async function findJsEndpoints() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  // Capture JS bundle URLs
  const jsUrls: string[] = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (url.endsWith(".js") && url.includes("rankings")) {
      jsUrls.push(url);
    }
  });

  await page.goto("https://rankings.gotsport.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(5000);

  // Get all script sources
  const scripts = await page.$$eval("script[src]", (els) =>
    els.map((el) => el.getAttribute("src")).filter(Boolean)
  );

  console.log("=== Script sources ===");
  for (const src of scripts) {
    console.log(`  ${src}`);
  }

  // Search the page source for API-related strings
  const pageSource = await page.content();

  // Look for API endpoint patterns
  const apiPatterns = pageSource.match(
    /(?:["'`])(\/api\/[^"'`\s]+|https?:\/\/[^"'`\s]*api[^"'`\s]*|team_ranking[^"'`\s]*|ranking_data[^"'`\s]*)/g
  );
  if (apiPatterns) {
    console.log("\n=== API patterns in page source ===");
    const unique = [...new Set(apiPatterns)];
    for (const p of unique.slice(0, 30)) {
      console.log(`  ${p}`);
    }
  }

  // Fetch and analyze the main JS bundle
  for (const url of jsUrls.slice(0, 3)) {
    console.log(`\n=== Analyzing JS bundle: ${url} ===`);
    const response = await page.goto(url);
    if (response) {
      const js = await response.text();

      // Find all fetch/API calls
      const fetchCalls = js.match(/fetch\s*\([^)]*(?:ranking|api|team)[^)]*\)/gi);
      if (fetchCalls) {
        console.log("  Fetch calls:");
        for (const call of fetchCalls.slice(0, 10)) {
          console.log(`    ${call.substring(0, 200)}`);
        }
      }

      // Find API URL constructions
      const urlPatterns = js.match(/["'`][^"'`]*(?:team_ranking_data|api\/v1)[^"'`]*["'`]/g);
      if (urlPatterns) {
        console.log("  URL patterns:");
        for (const p of [...new Set(urlPatterns)]) {
          console.log(`    ${p}`);
        }
      }

      // Find query parameter constructions
      const queryParams = js.match(/(?:age|gender|association|region|search|page|limit|offset|per_page)\s*[=:]\s*[^,;\s}]+/g);
      if (queryParams) {
        console.log("  Query params:");
        for (const p of [...new Set(queryParams)].slice(0, 20)) {
          console.log(`    ${p}`);
        }
      }
    }
  }

  await browser.close();
}

findJsEndpoints().catch(console.error);
