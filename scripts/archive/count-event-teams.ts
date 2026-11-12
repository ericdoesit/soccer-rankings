/**
 * Counts teams in each event by scraping the clubs page.
 */
import { chromium } from "playwright";
import * as path from "path";

const BROWSER_PROFILE = path.join(process.cwd(), ".browser-profile");

const EVENTS = [
  // Arizona
  { id: 42831, name: "Phoenix Rising Fall Classic" },
  { id: 34357, name: "2025 AZ Presidents Cup" },
  { id: 34355, name: "2025 AZ State Cup" },
  { id: 44690, name: "Tuzos Challenge 2025" },
  { id: 40568, name: "2025 Copper State Challenge" },
  { id: 43088, name: "2026 Amanda Post Memorial" },
  { id: 37959, name: "2025 Rated Cup (Phoenix)" },
  // Nevada
  { id: 34926, name: "NV South Youth Soccer League" },
  { id: 46235, name: "LV Club Soccer League Fall" },
  { id: 35204, name: "Nevada State League 2024" },
  { id: 44482, name: "LV Thanksgiving Classic" },
  { id: 42598, name: "LV Labor Day Classic" },
  { id: 49872, name: "LV Memorial Cup 2026" },
  { id: 44025, name: "LV Mayor's Cup Showcase" },
  { id: 35419, name: "Vegas Cup 2025" },
  { id: 44382, name: "Vegas Cup 2026" },
  { id: 36961, name: "Jeff Bush Memorial Cup 2025" },
  // NorCal
  { id: 39681, name: "D6 Sierra-Valley Metro Spring" },
  // SoCal (for reference)
  { id: 33123, name: "SOCAL Fall League 2024-2025" },
  { id: 40180, name: "NV South YSL Spring 2025" },
];

async function main() {
  const context = await chromium.launchPersistentContext(BROWSER_PROFILE, {
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
    viewport: { width: 1280, height: 720 },
  });

  const page = context.pages()[0] || (await context.newPage());
  let firstPage = true;

  console.log("Scraping team counts from clubs pages...\n");

  for (const event of EVENTS) {
    try {
      // Use the clubs page which lists all participating clubs/teams
      await page.goto(
        `https://system.gotsport.com/org_event/events/${event.id}/clubs`,
        { waitUntil: "domcontentloaded", timeout: 15000 }
      );

      if (page.url().includes("verify_captchas")) {
        console.log("CAPTCHA — solve it...");
        await page.waitForURL("**/clubs**", { timeout: 120000 });
      }

      if (firstPage) {
        const btn = page.locator('button:has-text("Accept All")').first();
        if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) await btn.click();
        firstPage = false;
      }

      await page.waitForTimeout(2000);

      // Count team links on the page
      const teamLinks = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="schedules?team="]');
        const teamIds = new Set<string>();
        links.forEach((a) => {
          const match = a.getAttribute("href")?.match(/team=(\d+)/);
          if (match) teamIds.add(match[1]);
        });
        return teamIds.size;
      });

      // Count clubs
      const clubCount = await page.evaluate(() => {
        // Clubs are usually in a table or list
        const rows = document.querySelectorAll("table tbody tr");
        return rows.length;
      });

      console.log(`${event.id} | ${event.name.padEnd(35)} | ${String(teamLinks).padStart(5)} teams | ${clubCount} clubs`);
    } catch {
      console.log(`${event.id} | ${event.name.padEnd(35)} | ERROR`);
    }

    await page.waitForTimeout(500);
  }

  await context.close();
}

main().catch(console.error);
