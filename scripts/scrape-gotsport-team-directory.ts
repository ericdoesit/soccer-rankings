/**
 * GotSport team directory for Region IV (the 13 Western states).
 *
 * Pages through the public rankings list (rankings.gotsport.com) filtered to
 * Region IV for every age/gender. Each row carries the stable team_id plus
 * club_name, team_name and team_association (state association, e.g. CAS/CAN/WA),
 * which the rankings API match feed lacks. Also keeps the event ids each team
 * earned points in, used to infer league membership.
 *
 *   npx tsx scripts/scrape-gotsport-team-directory.ts            # all ages, resumes
 *   npx tsx scripts/scrape-gotsport-team-directory.ts --age 13   # one age
 *
 * Output: data/gotsport-teams/region4.json (array of DirectoryTeam), saved after
 * every page so an interrupted run resumes where it left off.
 */
import * as fs from "fs";
import * as path from "path";

import { gsGet } from "./lib/gotsport-client";

const OUT_DIR = path.join(process.cwd(), "data", "gotsport-teams");
const OUT_FILE = path.join(OUT_DIR, "region4.json");
const PROGRESS_FILE = path.join(OUT_DIR, "region4.progress.json");
export const DIRECTORY_AGES = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];

export interface DirectoryTeam {
  teamId: number;
  teamName: string;
  clubName: string;
  association: string; // state association code: CAS, CAN, AZ, NV, WA, ...
  region: number;
  age: number; // U-age at ranking date
  gender: "m" | "f";
  nationalRank: number | null;
  regionalRank: number | null;
  associationRank: number | null;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  eventIds: number[];
  rankingDate: string;
}

interface Page { pagination?: { total_pages: number }; team_ranking_data?: Array<Record<string, any>> } // eslint-disable-line @typescript-eslint/no-explicit-any

function fetchPage(age: number, gender: string, page: number) {
  const q = new URLSearchParams({
    "search[team_country]": "USA",
    "search[age]": String(age),
    "search[gender]": gender,
    "search[team_region]": "4",
    "search[filter_by]": "regional",
    "search[page]": String(page),
  });
  return gsGet<Page>(`/team_ranking_data?${q}`);
}

/**
 * Page through the Region IV rankings list, resuming from the progress file.
 * Stops early when budget() returns false. Returns true when every age/gender
 * is complete. Pass refresh=true to start a fresh pass (rankings change weekly).
 */
export async function scrapeDirectory(opts: { ages?: number[]; budget?: () => boolean; refresh?: boolean } = {}) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const ages = opts.ages ?? DIRECTORY_AGES;
  const budget = opts.budget ?? (() => true);
  const teams = new Map<number, DirectoryTeam>();
  if (fs.existsSync(OUT_FILE)) {
    for (const t of JSON.parse(fs.readFileSync(OUT_FILE, "utf-8")) as DirectoryTeam[]) teams.set(t.teamId, t);
  }
  type Progress = Record<string, { page: number; total: number }>;
  const done: Progress = !opts.refresh && fs.existsSync(PROGRESS_FILE)
    ? JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf-8")) : {};

  for (const age of ages) {
    for (const gender of ["m", "f"]) {
      const key = `${age}${gender}`;
      let page = (done[key]?.page ?? 0) + 1;
      let totalPages = done[key]?.total ?? Infinity;
      while (page <= totalPages) {
        if (!budget()) return false;
        const data = await fetchPage(age, gender, page);
        if (!data) { console.warn(`  giving up on U${age} ${gender} page ${page} for now`); return false; }
        totalPages = data.pagination?.total_pages ?? 0;
        for (const t of data.team_ranking_data ?? []) {
          if (t.team_region !== 4) continue;
          teams.set(t.team_id, {
            teamId: t.team_id,
            teamName: t.team_name ?? "",
            clubName: t.club_name ?? "",
            association: t.team_association ?? "",
            region: t.team_region,
            age: t.age,
            gender: t.gender,
            nationalRank: t.national_rank ?? null,
            regionalRank: t.regional_rank ?? null,
            associationRank: t.association_rank ?? null,
            points: t.total_points ?? 0,
            wins: t.total_wins ?? 0,
            losses: t.total_losses ?? 0,
            draws: t.total_draws ?? 0,
            eventIds: Object.keys(t.event_results_json ?? {}).map(Number),
            rankingDate: t.ranking_date ?? "",
          });
        }
        done[key] = { page, total: totalPages };
        fs.writeFileSync(OUT_FILE, JSON.stringify([...teams.values()]));
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify(done));
        if (page % 10 === 0 || page === totalPages)
          console.log(`  directory U${age} ${gender}: page ${page}/${totalPages}  (${teams.size} teams)`);
        page++;
      }
      if (totalPages === Infinity || totalPages === 0) done[key] = { page: 0, total: 0 };
    }
  }
  return true;
}

if (process.argv[1]?.endsWith("scrape-gotsport-team-directory.ts")) {
  const ageArg = process.argv.indexOf("--age");
  scrapeDirectory({ ages: ageArg > 0 ? [Number(process.argv[ageArg + 1])] : undefined,
    refresh: process.argv.includes("--refresh") })
    .then((complete) => console.log(complete ? "Directory complete." : "Directory paused."))
    .catch((e) => { console.error(e); process.exit(1); });
}
