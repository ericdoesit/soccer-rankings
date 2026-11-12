/**
 * Identifies GotSport events by visiting each page and extracting the name + team count.
 * Uses persistent browser session.
 */
import { chromium } from "playwright";
import * as path from "path";

const BROWSER_PROFILE = path.join(process.cwd(), ".browser-profile");

const EVENT_IDS = [
  // Arizona leagues
  { id: 33123, note: "AZ league?" },
  { id: 40180, note: "AZ league?" },
  { id: 37959, note: "AZ league?" },
  // Arizona tournaments
  { id: 42831, note: "Phoenix Rising Fall Classic" },
  { id: 34357, note: "2025 AZ Presidents Cup" },
  { id: 34355, note: "2025 AZ State Cup" },
  { id: 44690, note: "AZ tournament?" },
  { id: 39047, note: "AZ tournament?" },
  { id: 40568, note: "AZ tournament?" },
  { id: 43088, note: "Amanda Post Memorial" },
  // Nevada leagues
  { id: 34926, note: "NV South Youth Soccer League" },
  { id: 46235, note: "LV Club Soccer League Fall" },
  { id: 35204, note: "Nevada State League 2024" },
  { id: 35419, note: "NV Vegas Cup?" },
  // Nevada tournaments
  { id: 44482, note: "LV Thanksgiving Classic" },
  { id: 42598, note: "LV Labor Day Classic" },
  { id: 49872, note: "LV Memorial Cup 2026" },
  { id: 44025, note: "LV Mayor's Cup" },
  { id: 36961, note: "Jeff Bush Memorial Cup" },
  { id: 44382, note: "NV tournament?" },
  // NorCal (bonus)
  { id: 39681, note: "D6 Sierra-Valley Metro" },
];

async function main() {
  const context = await chromium.launchPersistentContext(BROWSER_PROFILE, {
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
    viewport: { width: 1280, height: 720 },
  });

  const page = context.pages()[0] || (await context.newPage());
  let firstPage = true;

  console.log("ID       | Name                                          | Teams | Type");
  console.log("---------|-----------------------------------------------|-------|--------");

  for (const event of EVENT_IDS) {
    try {
      await page.goto(
        `https://system.gotsport.com/org_event/events/${event.id}/teams?showall=groups`,
        { waitUntil: "domcontentloaded", timeout: 15000 }
      );

      if (page.url().includes("verify_captchas")) {
        console.log("CAPTCHA — solve it in the browser...");
        await page.waitForURL("**/teams**", { timeout: 120000 });
      }

      if (firstPage) {
        const btn = page.locator('button:has-text("Accept All")').first();
        if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await btn.click();
        }
        firstPage = false;
      }

      await page.waitForTimeout(1500);

      const name = await page.locator(".navbar-brand-event").first().textContent().catch(() => "Unknown");

      // Count teams on the page
      const teamCount = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="schedules?team="]');
        return links.length;
      });

      // Determine if league or tournament based on name
      const isLeague = /league|season|fall|spring|cup.*league/i.test(name || "");
      const type = isLeague ? "LEAGUE" : "TOURN";

      const displayName = (name || "Unknown").substring(0, 45).padEnd(45);
      console.log(`${String(event.id).padEnd(9)}| ${displayName} | ${String(teamCount).padStart(5)} | ${type}`);
    } catch {
      console.log(`${String(event.id).padEnd(9)}| ERROR loading page`);
    }

    await page.waitForTimeout(500);
  }

  await context.close();
}

main().catch(console.error);
