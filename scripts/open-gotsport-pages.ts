/**
 * Open each GotSport schedule page in Google Chrome, save it to the Mac Desktop
 * as GotSport-01.html, GotSport-02.html, etc., without pausing between pages.
 *
 * Usage:
 *   npx tsx scripts/open-gotsport-pages.ts 48745
 *   npx tsx scripts/open-gotsport-pages.ts 48745 --boys
 *   npx tsx scripts/open-gotsport-pages.ts 48745 --girls
 *   npx tsx scripts/open-gotsport-pages.ts 48745 --ages 7-10
 *   npx tsx scripts/open-gotsport-pages.ts 48745 --groups
 *   npx tsx scripts/open-gotsport-pages.ts 48745 --groups --from-group 526951
 *
 * Requirements:
 * - Google Chrome must be installed.
 * - macOS may ask you to allow Terminal (or your terminal app) to control
 *   Google Chrome under System Settings > Privacy & Security > Accessibility.
 * - The script uses Chrome's normal Save Page dialog; it does not fetch pages
 *   directly or bypass the browser.
 *
 * Ages come from the event's published games (data/discovery/games/<event>.json),
 * or U7-U19 when no age data is found.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execFileSync } from "child_process";

const args = process.argv.slice(2);
const event = args.find((a) => /^\d+$/.test(a));
if (!event) {
  console.error(
    "usage: npx tsx scripts/open-gotsport-pages.ts <eventId> [--boys|--girls] [--ages 7-12] [--groups] [--from-group <flightId>]",
  );
  process.exit(1);
}

const genders = args.includes("--boys")
  ? ["m"]
  : args.includes("--girls")
    ? ["f"]
    : ["m", "f"];

const gamesFile = path.join(
  process.cwd(),
  "data",
  "discovery",
  "games",
  `${event}.json`,
);
const flights = new Map<number, { gender: string; age: number; name: string }>();
const found = new Map<string, Set<number>>([
  ["m", new Set<number>()],
  ["f", new Set<number>()],
]);

if (fs.existsSync(gamesFile)) {
  const games = JSON.parse(fs.readFileSync(gamesFile, "utf8")) as Array<{
    division?: string;
    flightId?: number;
  }>;

  for (const game of games) {
    const match = game.division?.match(/^U(\d{1,2})([BG])/);
    if (!match) continue;

    const gender = match[2] === "B" ? "m" : "f";
    const age = Number(match[1]);
    found.get(gender)!.add(age);

    if (game.flightId) {
      flights.set(game.flightId, {
        gender,
        age,
        name: game.division!.replace(/^U\d{1,2}[BG]\s+/, ""),
      });
    }
  }
}

const range = args.includes("--ages")
  ? args[args.indexOf("--ages") + 1]?.match(/^(\d+)(?:-(\d+))?$/)
  : null;

if (args.includes("--ages") && !range) {
  console.error("Invalid age range. Use --ages 7-12 or --ages 10.");
  process.exit(1);
}

const urls: string[] = [];
const byGroup = args.includes("--groups");

if (byGroup) {
  if (!flights.size) {
    console.error(
      `no flights for event ${event} in ${path.relative(process.cwd(), gamesFile)}`,
    );
    process.exit(1);
  }

  const inRange = (age: number) =>
    !range ||
    (age >= Number(range[1]) && age <= Number(range[2] ?? range[1]));

  const list = [...flights]
    .filter(([, flight]) => genders.includes(flight.gender) && inRange(flight.age))
    .sort(
      (a, b) =>
        b[1].gender.localeCompare(a[1].gender) ||
        a[1].age - b[1].age ||
        a[1].name.localeCompare(b[1].name),
    );

  // Skip flights already saved in data/gotsport-pages/.
  const saved = new Set<number>();
  const pagesDir = path.join(process.cwd(), "data", "gotsport-pages");

  for (const file of fs.existsSync(pagesDir)
    ? fs.readdirSync(pagesDir).filter((name) => /\.html?$/i.test(name))
    : []) {
    const html = fs.readFileSync(path.join(pagesDir, file), "utf8");
    if (
      !html.includes(`/events/${event}/`) ||
      /<b>\w+day, \w+ \d{1,2}, \d{4}<\/b>/.test(html)
    ) {
      continue;
    }

    const counts = new Map<number, number>();
    for (const match of html.matchAll(/schedules\?group=(\d+)/g)) {
      const id = Number(match[1]);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    const top = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (top) saved.add(top[0]);
  }

  let todo = list.filter(([id]) => !saved.has(id));
  if (saved.size) {
    console.log(
      `Skipping ${list.length - todo.length} flights already saved in data/gotsport-pages/`,
    );
  }

  // Resume at a particular flight ID, inclusive. Any flights before it are
  // ignored; already-saved flights (including the resume flight) stay skipped.
  const fromGroupIndex = args.indexOf("--from-group");
  if (fromGroupIndex !== -1) {
    const fromGroupValue = args[fromGroupIndex + 1];
    if (!fromGroupValue || !/^\d+$/.test(fromGroupValue)) {
      console.error("Invalid --from-group value. Supply a flight ID, e.g. --from-group 526951.");
      process.exit(1);
    }

    const resumeIndex = list.findIndex(([id]) => id === Number(fromGroupValue));
    if (resumeIndex === -1) {
      console.error(`Flight ${fromGroupValue} was not found in the selected flights for event ${event}.`);
      process.exit(1);
    }

    const beforeResume = todo.length;
    todo = list.slice(resumeIndex).filter(([id]) => !saved.has(id));
    console.log(`Resuming at flight ${fromGroupValue}; ignoring ${resumeIndex} earlier flights.`);
    if (saved.has(Number(fromGroupValue))) {
      console.log(`Flight ${fromGroupValue} is already saved; continuing with the next unsaved flight.`);
    }
  }

  for (const [id] of todo) {
    urls.push(
      `https://system.gotsport.com/org_event/events/${event}/schedules?date=All&group=${id}`,
    );
  }
}

for (const gender of byGroup ? [] : genders) {
  let ages = [...found.get(gender)!].sort((a, b) => a - b);
  if (!ages.length) {
    ages = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 19];
  }

  if (range) {
    ages = ages.filter(
      (age) =>
        age >= Number(range[1]) && age <= Number(range[2] ?? range[1]),
    );
  }

  for (const age of ages) {
    urls.push(
      `https://system.gotsport.com/org_event/events/${event}/schedules?age=${age}&gender=${gender}`,
    );
  }
}

if (!urls.length) {
  console.log("No matching GotSport pages found.");
  process.exit(0);
}

const desktopDir = path.join(os.homedir(), "Desktop", "GotSport");
const importDir = path.join(process.cwd(), "data", "gotsport-pages");
fs.mkdirSync(desktopDir, { recursive: true });
fs.mkdirSync(importDir, { recursive: true });

// Number Desktop files independently, starting at 01 if the GotSport folder is empty.
// Keep importer numbering independent too, so existing files in data/gotsport-pages/
// are never overwritten just because the Desktop folder is new.
function getNextFileNumber(directory: string): number {
  let highest = 0;
  for (const file of fs.readdirSync(directory)) {
    const match = file.match(/^GotSport-(\d+)\.html$/i);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}

// Uses Chrome's native Save Page dialog and macOS keyboard shortcuts.
// The Go to Folder shortcut directs the save dialog to ~/Desktop/GotSport.
const appleScript = String.raw`
on run argv
  set pageUrl to item 1 of argv
  set fileName to item 2 of argv

  tell application "Google Chrome"
    activate
    if (count of windows) is 0 then make new window
    set newTab to make new tab at end of tabs of front window with properties {URL:pageUrl}

    -- Wait up to 90 seconds for the page navigation to finish.
    repeat with attempt from 1 to 90
      if (loading of newTab) is false then exit repeat
      delay 1
    end repeat
    delay 2
  end tell

  tell application "System Events"
    tell process "Google Chrome"
      -- Close any page-level autofill/autocomplete popup before invoking Save.
      key code 53
      delay 0.25
      key code 53
      delay 0.5
      keystroke "s" using {command down}
      delay 1

      -- Choose the Desktop as the save location.
      keystroke "g" using {command down, shift down}
      delay 0.5
      keystroke "~/Desktop/GotSport"
      key code 36
      delay 0.75

      -- Set the sequential filename and save.
      keystroke "a" using {command down}
      keystroke fileName
      key code 36
      delay 1.5
    end tell
  end tell
end run
`;

let nextDesktopNumber = getNextFileNumber(desktopDir);
let nextImportNumber = getNextFileNumber(importDir);

console.log(`Found ${urls.length} pages for event ${event}.`);
console.log(`Saving HTML files to: ${desktopDir}`);
console.log(`Also copying them into the importer folder: ${importDir}`);
console.log(`Starting Desktop filename: GotSport-${String(nextDesktopNumber).padStart(2, "0")}.html`);
console.log(`Starting importer filename: GotSport-${String(nextImportNumber).padStart(2, "0")}.html`);
console.log(
  "Chrome will open and save every page automatically, without batch pauses. Keep Chrome in the foreground while this runs.",
);
console.log(
  "If macOS asks, allow your terminal app to control Chrome in System Settings > Privacy & Security > Accessibility.\n",
);

for (let i = 0; i < urls.length; i++) {
  const fileName = `GotSport-${String(nextDesktopNumber).padStart(2, "0")}.html`;
  const importFileName = `GotSport-${String(nextImportNumber).padStart(2, "0")}.html`;
  const filePath = path.join(desktopDir, fileName);

  console.log(`[${i + 1}/${urls.length}] Saving ${fileName}`);

  try {
    execFileSync("osascript", ["-e", appleScript, "--", urls[i], fileName], {
      stdio: "inherit",
    });

    // Confirm that Chrome actually created the expected file.
    if (!fs.existsSync(filePath)) {
      console.error(
        `Could not find ${fileName} on the Desktop after Chrome's save dialog. Check the dialog and try again.`,
      );
      process.exit(1);
    }

    // Keep the existing standings importer workflow working without overwriting
    // any previously saved importer files.
    fs.copyFileSync(filePath, path.join(importDir, importFileName));
    nextDesktopNumber++;
    nextImportNumber++;
  } catch (error) {
    console.error(`Failed while saving ${fileName}. Stopping so files aren't misnumbered.`);
    console.error(error);
    process.exit(1);
  }
}

console.log(`\nDone: saved ${urls.length} HTML pages to ${desktopDir}`);
console.log(`Copied the same files into ${importDir}`);
console.log("Next step:");
console.log("  npm run standings:import -- --dir --build");
