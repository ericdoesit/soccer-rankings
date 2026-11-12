/**
 * Captures HTML from a GotSport schedule page after CAPTCHA is solved.
 * Uses the persistent browser profile that already has a valid session.
 */
import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const BROWSER_PROFILE = path.join(process.cwd(), ".browser-profile");

async function main() {
  const context = await chromium.launchPersistentContext(BROWSER_PROFILE, {
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    viewport: { width: 1280, height: 720 },
  });

  const page = context.pages()[0] || (await context.newPage());

  // Navigate to a schedule page (session should still be valid)
  const url =
    "https://system.gotsport.com/org_event/events/41052/schedules?team=264749";
  console.log(`Navigating to ${url}`);

  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(async () => {
    // Handle CAPTCHA redirect
    if (page.url().includes("verify_captchas")) {
      console.log("CAPTCHA — solving...");
      await page.waitForURL("**/schedules**", { timeout: 120000 });
      await page.waitForLoadState("networkidle");
    }
  });

  await page.waitForTimeout(2000);

  // Dismiss cookie consent popup if present
  for (const label of ["Accept All", "Reject All", "Accept"]) {
    const btn = page.locator(`button:has-text("${label}")`).first();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click();
      console.log(`Dismissed cookie consent ("${label}")`);
      await page.waitForTimeout(1000);
      break;
    }
  }

  // Wait for schedule content to render
  await page.waitForTimeout(3000);

  // Save screenshot
  await page.screenshot({ path: "scripts/schedule_page.png", fullPage: true });
  console.log("Screenshot saved");

  // Save the full HTML
  const html = await page.content();
  fs.writeFileSync("scripts/schedule_raw.html", html);
  console.log(`Saved ${html.length} bytes of raw HTML`);

  // Extract just the body text
  const bodyText = await page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script, style, noscript, nav, footer").forEach((e) => e.remove());
    return clone.innerText;
  });
  fs.writeFileSync("scripts/schedule_text.txt", bodyText);
  console.log(`Saved ${bodyText.length} chars of body text`);

  // Extract all table data
  const tableData = await page.evaluate(() => {
    const tables: { id: string; rows: string[][] }[] = [];
    document.querySelectorAll("table").forEach((table, idx) => {
      const rows: string[][] = [];
      table.querySelectorAll("tr").forEach((tr) => {
        const cells: string[] = [];
        tr.querySelectorAll("td, th").forEach((cell) => {
          cells.push((cell as HTMLElement).innerText.trim());
        });
        if (cells.length > 0) rows.push(cells);
      });
      tables.push({ id: table.id || `table_${idx}`, rows });
    });
    return tables;
  });
  fs.writeFileSync("scripts/schedule_tables.json", JSON.stringify(tableData, null, 2));
  console.log(`Saved ${tableData.length} tables`);

  for (const table of tableData) {
    console.log(`\nTable "${table.id}" — ${table.rows.length} rows:`);
    for (const row of table.rows.slice(0, 5)) {
      console.log(`  [${row.join(" | ")}]`);
    }
    if (table.rows.length > 5) {
      console.log(`  ... (${table.rows.length - 5} more rows)`);
    }
  }

  await context.close();
}

main().catch(console.error);
