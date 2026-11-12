/**
 * Intercepts all API/XHR calls from a GotSport schedule page
 * to discover how game data is loaded.
 */
import { chromium } from "playwright";
import * as path from "path";

const BROWSER_PROFILE = path.join(process.cwd(), ".browser-profile");

async function main() {
  const context = await chromium.launchPersistentContext(BROWSER_PROFILE, {
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
    viewport: { width: 1280, height: 720 },
  });

  const page = context.pages()[0] || (await context.newPage());

  // Intercept ALL network requests
  page.on("request", (req) => {
    const url = req.url();
    if (
      req.resourceType() === "xhr" ||
      req.resourceType() === "fetch"
    ) {
      if (
        url.includes("gotsport") &&
        !url.includes("nr-data") &&
        !url.includes("doubleclick") &&
        !url.includes("google") &&
        !url.includes("ad.gt") &&
        !url.includes("kargo") &&
        !url.includes("sparteo") &&
        !url.includes("criteo") &&
        !url.includes("pubmatic") &&
        !url.includes("rubiconproject")
      ) {
        console.log(`\nREQUEST: ${req.method()} ${url}`);
      }
    }
  });

  page.on("response", async (res) => {
    const url = res.url();
    if (
      url.includes("gotsport") &&
      !url.includes("nr-data") &&
      !url.includes("doubleclick") &&
      !url.includes("ad.gt") &&
      (res.request().resourceType() === "xhr" ||
        res.request().resourceType() === "fetch")
    ) {
      try {
        const ct = res.headers()["content-type"] || "";
        if (ct.includes("json") || ct.includes("html")) {
          const body = await res.text();
          console.log(`RESPONSE ${res.status()}: ${url}`);
          console.log(`  Content-Type: ${ct}`);
          console.log(`  Body (first 300): ${body.substring(0, 300)}`);
        }
      } catch {}
    }
  });

  const url =
    "https://system.gotsport.com/org_event/events/41052/schedules?team=264749";
  console.log(`Navigating to ${url}\n`);

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Handle CAPTCHA
  if (page.url().includes("verify_captchas")) {
    console.log("CAPTCHA — waiting for solve...");
    await page.waitForURL("**/schedules**", { timeout: 120000 });
    console.log("CAPTCHA solved\n");
  }

  // Dismiss cookie consent
  for (const label of ["Accept All", "Reject All"]) {
    const btn = page.locator(`button:has-text("${label}")`).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await btn.click();
      console.log(`Dismissed "${label}"`);
      break;
    }
  }

  // Wait for dynamic content
  console.log("\nWaiting 10s for dynamic content to load...");
  await page.waitForTimeout(10000);

  // Check what's actually on the page now
  const text = await page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script, style, noscript, nav").forEach((e) => e.remove());
    return clone.innerText;
  });
  console.log(`\n=== Page text (${text.length} chars) ===`);
  console.log(text.substring(0, 2000));

  // Save screenshot
  await page.screenshot({
    path: "scripts/schedule_intercepted.png",
    fullPage: true,
  });

  await context.close();
}

main().catch(console.error);
