// Download the site's runtime data from the latest GitHub Release (see scripts/publish-data.sh).
//
// Runs before `next build` (npm prebuild). Does nothing when data/snapshot.json already exists,
// so local builds keep using local data. The repo is public, so no token is needed; optional:
//   GITHUB_TOKEN       raises the GitHub API rate limit (or needed if the repo goes private again)
//   DATA_REPO          default ericdoesit/soccer-rankings
//
//   node scripts/fetch-data.mjs           # only if data is missing
//   node scripts/fetch-data.mjs --force   # replace local data with the latest release
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SNAPSHOT = path.join(ROOT, "data", "snapshot.json");
const REPO = process.env.DATA_REPO || "ericdoesit/soccer-rankings";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const force = process.argv.includes("--force");

if (fs.existsSync(SNAPSHOT) && !force) {
  console.log("[fetch-data] data/snapshot.json present; using local data");
  process.exit(0);
}
const headers = { "X-GitHub-Api-Version": "2022-11-28", ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * The latest release's runtime-data.tar.gz. First the plain download link (github.com/…/releases/
 * latest/download/…): no API call, so no rate limit. Unauthenticated API calls are limited to 60 an
 * hour per address, and Vercel's build machines share addresses, so the API route alone failed
 * builds with HTTP 403 (2026-11-19). The API stays as a fallback, with retries.
 */
async function download() {
  const direct = `https://github.com/${REPO}/releases/latest/download/runtime-data.tar.gz`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(direct, { redirect: "follow" }).catch(() => null);
    if (res?.ok) { console.log(`[fetch-data] downloading the latest release (direct link)`); return Buffer.from(await res.arrayBuffer()); }
    console.log(`[fetch-data] direct download: ${res ? `HTTP ${res.status}` : "network error"} (try ${attempt}/3)`);
    await sleep(2000 * attempt);
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    const rel = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { ...headers, Accept: "application/vnd.github+json" } }).catch(() => null);
    if (rel?.ok) {
      const release = await rel.json();
      const asset = release.assets?.find((a) => a.name === "runtime-data.tar.gz");
      if (!asset) throw new Error(`[fetch-data] release ${release.tag_name} has no runtime-data.tar.gz`);
      console.log(`[fetch-data] downloading ${release.tag_name} (${(asset.size / 1e6).toFixed(1)} MB)`);
      const res = await fetch(asset.url, { headers: { ...headers, Accept: "application/octet-stream" } });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      console.log(`[fetch-data] download: HTTP ${res.status} (try ${attempt}/3)`);
    } else console.log(`[fetch-data] latest release: ${rel ? `HTTP ${rel.status}` : "network error"} (try ${attempt}/3)`);
    await sleep(5000 * attempt);
  }
  throw new Error("[fetch-data] could not download the latest data release");
}
const archive = await download();
const tmp = path.join(ROOT, "runtime-data.tar.gz");
fs.writeFileSync(tmp, archive);
execFileSync("tar", ["-xzf", tmp, "-C", ROOT], { stdio: "inherit" });
fs.rmSync(tmp);
// archives packed on macOS before COPYFILE_DISABLE carry AppleDouble "._name" files: drop them
for (const f of fs.readdirSync(path.join(ROOT, "data"), { recursive: true })) {
  if (path.basename(String(f)).startsWith("._")) fs.rmSync(path.join(ROOT, "data", String(f)), { force: true });
}
console.log("[fetch-data] latest data release unpacked into data/");

// Slim the GotSport game files to the fields pages read at request time (src/lib/tournament-view,
// team-context, league-rankings): 150 MB → ~60 MB. Every server function ships data/ (next.config
// outputFileTracingIncludes), and Vercel only groups routes into shared functions while they stay
// small; Hobby allows 12 functions per deployment. eventName is kept on the first game of each file
// only (one file = one event). The build-time importer never runs on these slimmed copies.
const KEEP = ["date", "homeTeamId", "awayTeamId", "division", "venue"];
const gamesDir = path.join(ROOT, "data", "discovery", "games");
if (fs.existsSync(gamesDir)) {
  let before = 0, after = 0;
  for (const f of fs.readdirSync(gamesDir).filter((n) => n.endsWith(".json"))) {
    const file = path.join(gamesDir, f);
    const text = fs.readFileSync(file, "utf8");
    before += text.length;
    const slim = JSON.parse(text).map((g, i) => {
      const o = i === 0 && g.eventName ? { eventName: g.eventName } : {};
      for (const k of KEEP) if (g[k] !== undefined && g[k] !== null && g[k] !== "") o[k] = g[k];
      return o;
    });
    const out = JSON.stringify(slim);
    after += out.length;
    fs.writeFileSync(file, out);
  }
  console.log(`[fetch-data] slimmed data/discovery/games: ${(before / 1e6).toFixed(0)} MB → ${(after / 1e6).toFixed(0)} MB`);
}
