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
const rel = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { ...headers, Accept: "application/vnd.github+json" } });
if (!rel.ok) throw new Error(`[fetch-data] latest release: HTTP ${rel.status}`);
const release = await rel.json();
const asset = release.assets?.find((a) => a.name === "runtime-data.tar.gz");
if (!asset) throw new Error(`[fetch-data] release ${release.tag_name} has no runtime-data.tar.gz`);

console.log(`[fetch-data] downloading ${release.tag_name} (${(asset.size / 1e6).toFixed(1)} MB)`);
const res = await fetch(asset.url, { headers: { ...headers, Accept: "application/octet-stream" } });
if (!res.ok) throw new Error(`[fetch-data] download: HTTP ${res.status}`);
const tmp = path.join(ROOT, "runtime-data.tar.gz");
fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
execFileSync("tar", ["-xzf", tmp, "-C", ROOT], { stdio: "inherit" });
fs.rmSync(tmp);
console.log(`[fetch-data] data from ${release.tag_name} unpacked into data/`);
