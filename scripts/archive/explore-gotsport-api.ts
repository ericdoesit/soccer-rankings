import { chromium } from "playwright";

async function exploreAPI() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  // Track ranking API calls
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("team_ranking")) {
      console.log(`\nAPI REQUEST: ${request.method()} ${url}`);
      console.log(`  Headers:`, JSON.stringify(request.headers(), null, 2));
    }
  });

  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("team_ranking")) {
      try {
        const body = await response.json();
        console.log(`API RESPONSE: ${response.status()} - ${Array.isArray(body) ? body.length : 'non-array'} items`);
        if (Array.isArray(body) && body.length > 0) {
          console.log(`  First: #${body[0].national_rank} ${body[0].team_name} (age=${body[0].age}, gender=${body[0].gender})`);
          if (body.length > 1) {
            console.log(`  Last: #${body[body.length-1].national_rank} ${body[body.length-1].team_name}`);
          }
        }
      } catch {}
    }
  });

  console.log("Loading rankings page...");
  await page.goto("https://rankings.gotsport.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(5000);

  // Click "Boys" button
  console.log("\n=== Clicking Boys button ===");
  try {
    const boysBtn = await page.$('button:has-text("Boys")');
    if (boysBtn) {
      await boysBtn.click();
      await page.waitForTimeout(3000);
    }
  } catch (e) {
    console.log("Could not click Boys:", e);
  }

  // Look for age group selectors
  console.log("\n=== Looking for age selectors ===");
  const ageButtons = await page.$$('button, a, [role="tab"]');
  for (const btn of ageButtons) {
    const text = await btn.textContent();
    if (text && /U\d|u\d|B\d|G\d|\d{4}/.test(text.trim()) && text.trim().length < 10) {
      console.log(`  Age button: "${text.trim()}"`);
    }
  }

  // Try clicking an age group (Boys U14 or similar)
  console.log("\n=== Trying to select a specific age group ===");
  const allButtons = await page.$$("button");
  for (const btn of allButtons) {
    const text = await btn.textContent();
    if (text?.trim() === "Boys U14" || text?.trim() === "U14" || text?.trim() === "14") {
      console.log(`Clicking: "${text.trim()}"`);
      await btn.click();
      await page.waitForTimeout(3000);
      break;
    }
  }

  // Try to use the search functionality
  console.log("\n=== Trying Team Rankings Search ===");
  try {
    const searchBtn = await page.$('button:has-text("Team Rankings Search")');
    if (searchBtn) {
      await searchBtn.click();
      await page.waitForTimeout(2000);

      // Look for what appeared
      const inputs = await page.$$("input, select");
      for (const input of inputs) {
        const placeholder = await input.getAttribute("placeholder");
        const name = await input.getAttribute("name");
        const type = await input.getAttribute("type");
        console.log(`  Input: name=${name}, placeholder=${placeholder}, type=${type}`);
      }
    }
  } catch (e) {
    console.log("Search error:", e);
  }

  await page.screenshot({ path: "scripts/rankings_explored.png", fullPage: true });
  console.log("\nScreenshot saved");

  await page.waitForTimeout(3000);
  await browser.close();
}

exploreAPI().catch(console.error);
