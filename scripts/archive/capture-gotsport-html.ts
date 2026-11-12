/**
 * Captures the raw HTML from a GotSport schedule page
 * so we can understand the structure for parsing game scores.
 */
import { chromium } from "playwright";
import * as fs from "fs";

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  // Navigate to a team's event schedule
  const url =
    "https://system.gotsport.com/org_event/events/41052/schedules?team=264749";
  console.log(`Navigating to ${url}`);

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Wait for CAPTCHA to resolve (auto or manual)
  console.log("Waiting for content to load (up to 60s)...");
  let resolved = false;
  for (let i = 0; i < 30; i++) {
    const html = await page.content();
    if (!html.includes("verify_captchas")) {
      resolved = true;
      break;
    }
    await page.waitForTimeout(2000);
  }

  if (!resolved) {
    console.log("CAPTCHA not resolved. Saving captcha page HTML.");
  }

  // Wait for full render
  await page.waitForTimeout(5000);

  // Save the raw HTML
  const html = await page.content();
  fs.writeFileSync("scripts/gotsport_schedule_raw.html", html);
  console.log(`Saved ${html.length} bytes of HTML`);

  // Also try to find the specific elements with scores
  const bodyText = await page.evaluate(() => {
    const scripts = document.querySelectorAll("script, style, noscript");
    scripts.forEach((s) => s.remove());
    return document.body?.innerText || "";
  });
  fs.writeFileSync("scripts/gotsport_schedule_text.txt", bodyText);
  console.log(`Saved ${bodyText.length} chars of text content`);

  // Take screenshot
  await page.screenshot({
    path: "scripts/gotsport_schedule.png",
    fullPage: true,
  });
  console.log("Screenshot saved");

  await browser.close();
}

main().catch(console.error);
