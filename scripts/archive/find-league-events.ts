/**
 * Identifies GotSport league events for Arizona and Nevada
 * by checking event pages and extracting event names + team counts.
 */
import { chromium } from "playwright";
import * as path from "path";

const BROWSER_PROFILE = path.join(process.cwd(), ".browser-profile");

const EVENT_IDS = [
  // Arizona events from search
  42831, 41863, 43506, 39681, 34357, 34355,
  // Nevada events from search
  34926, 44482, 42598, 46235, 49872, 44025, 36961, 35204,
  // Also try nearby IDs to SoCal league (43086)
  43085, 43087, 43088, 43089, 43090,
  // Try some other known ranges
  45000, 46000, 47000, 48000,
];

async function main() {
  const context = await chromium.launchPersistentContext(BROWSER_PROFILE, {
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
    viewport: { width: 1280, height: 720 },
  });

  const page = context.pages()[0] || (await context.newPage());

  // Dismiss cookie consent on first page
  let firstPage = true;

  for (const eventId of EVENT_IDS) {
    const url = `https://system.gotsport.com/org_event/events/${eventId}`;

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

      // Handle CAPTCHA on first visit
      if (page.url().includes("verify_captchas")) {
        console.log("CAPTCHA — waiting for solve...");
        await page.waitForURL(`**/events/${eventId}**`, { timeout: 120000 });
        console.log("CAPTCHA solved!");
      }

      // Dismiss cookie consent
      if (firstPage) {
        const btn = page.locator('button:has-text("Accept All")').first();
        if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await btn.click();
        }
        firstPage = false;
      }

      await page.waitForTimeout(1500);

      // Get event name
      const name = await page
        .locator(".navbar-brand-event")
        .first()
        .textContent()
        .catch(() => null);

      // Get team count from "Team Brackets" or clubs page
      const text = await page.evaluate(() => {
        const el = document.body;
        return el?.innerText?.substring(0, 2000) || "";
      });

      // Check if it mentions state
      const hasAZ = /arizona|AZ|phoenix|tucson|scottsdale|mesa|chandler|tempe/i.test(text);
      const hasNV = /nevada|NV|las vegas|henderson|reno/i.test(text);
      const hasCA = /california|CA|socal|los angeles|san diego/i.test(text);

      const state = hasAZ ? "AZ" : hasNV ? "NV" : hasCA ? "CA" : "??";

      // Try to find teams link and count
      const teamsLink = await page.$('a[href*="teams"]');
      const teamsText = teamsLink ? await teamsLink.textContent() : "";

      console.log(
        `${eventId}: ${name || "Unknown"} [${state}] ${teamsText ? `(${teamsText.trim()})` : ""}`
      );
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`${eventId}: ERROR - ${msg.substring(0, 80)}`);
    }

    await page.waitForTimeout(500);
  }

  await context.close();
}

main().catch(console.error);
