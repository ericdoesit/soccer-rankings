/**
 * Captures a SoCal league schedule page (known to have games)
 * and tries the "Export Team Schedule" link.
 */
import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const BROWSER_PROFILE = path.join(process.cwd(), ".browser-profile");

async function main() {
  const context = await chromium.launchPersistentContext(BROWSER_PROFILE, {
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
    viewport: { width: 1280, height: 720 },
  });

  const page = context.pages()[0] || (await context.newPage());

  // Use a SoCal league team we know has games
  const url =
    "https://system.gotsport.com/org_event/events/43086/schedules?team=3118856";
  console.log(`Navigating to ${url}`);

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

  // Handle CAPTCHA
  if (page.url().includes("verify_captchas")) {
    console.log("CAPTCHA — waiting...");
    await page.waitForURL("**/schedules**", { timeout: 120000 });
    console.log("CAPTCHA solved!");
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

  // Wait for content
  await page.waitForTimeout(5000);

  // Screenshot
  await page.screenshot({
    path: "scripts/socal_schedule.png",
    fullPage: true,
  });
  console.log("Screenshot saved");

  // Get page text
  const text = await page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script, style, noscript").forEach((e) => e.remove());
    return clone.innerText;
  });
  console.log(`\nPage text (${text.length} chars):`);
  console.log(text.substring(0, 3000));

  // Look for "Export Team Schedule" link
  const exportLink = await page.$('a:has-text("Export"), a[href*="export"], a[href*="csv"]');
  if (exportLink) {
    const href = await exportLink.getAttribute("href");
    console.log(`\nExport link found: ${href}`);

    // Try to download it
    if (href) {
      const [download] = await Promise.all([
        page.waitForEvent("download", { timeout: 10000 }).catch(() => null),
        exportLink.click(),
      ]);
      if (download) {
        const savePath = "scripts/schedule_export.csv";
        await download.saveAs(savePath);
        console.log(`Downloaded to ${savePath}`);
        const content = fs.readFileSync(savePath, "utf-8");
        console.log(`\nExport content (${content.length} chars):`);
        console.log(content.substring(0, 1000));
      }
    }
  } else {
    console.log("\nNo export link found");
    // List all links
    const links = await page.$$eval("a", (els) =>
      els.map((a) => ({
        text: a.textContent?.trim().substring(0, 50),
        href: a.getAttribute("href")?.substring(0, 100),
      })).filter((l) => l.text && l.text.length > 1)
    );
    console.log("\nAll links on page:");
    for (const l of links) {
      console.log(`  "${l.text}" -> ${l.href}`);
    }
  }

  // Also look for schedule/game tables
  const tables = await page.evaluate(() => {
    const result: { tag: string; classes: string; text: string }[] = [];
    document.querySelectorAll("table, .schedule, .games, .matches, [class*='game'], [class*='match'], [class*='schedule']").forEach((el) => {
      result.push({
        tag: el.tagName,
        classes: el.className,
        text: (el as HTMLElement).innerText.substring(0, 200),
      });
    });
    return result;
  });
  console.log(`\nSchedule-related elements: ${tables.length}`);
  for (const t of tables) {
    console.log(`  ${t.tag}.${t.classes}: "${t.text.substring(0, 100)}"`);
  }

  await context.close();
}

main().catch(console.error);
