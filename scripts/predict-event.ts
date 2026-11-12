/**
 * Predict an upcoming event from the ratings (data/snapshot.json).
 *
 * Inputs live in data/fixtures/ (collected by hand, e.g. pasted from the event page):
 *   <event>-accepted.tsv   division · club · team · state          (accepted teams)
 *   <event>-groups.tsv     division · group · club · team          (optional: brackets)
 * With groups, each group is a round robin: every team's chances to finish first are
 * simulated (10,000 runs). Without groups, teams are ranked by rating per division.
 *
 *   npx tsx scripts/predict-event.ts 57894
 *   npx tsx scripts/predict-event.ts 57894 --score   # after the event: predictions vs results
 *
 * Writes data/predictions/<event>.json.
 */
import * as fs from "fs";
import * as path from "path";
import { getDataSet } from "../src/lib/data";
import { outcomeModel, type Outcome } from "../src/lib/predict";
import type { Prediction, PredGroup } from "../src/lib/events";

const eventId = process.argv[2];
if (!eventId) { console.error("usage: npx tsx scripts/predict-event.ts <eventId> [--score]"); process.exit(1); }
const FIX = path.join(process.cwd(), "data", "fixtures");
const OUT = path.join(process.cwd(), "data", "predictions");
const readTsv = (f: string) => fs.existsSync(f)
  ? fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => l.split("\t").map((c) => c.trim()))
  : [];

const ds = getDataSet();
const rating = new Map(ds.rankings.map((r) => [r.teamId, r.score]));
const record = new Map(ds.rankings.map((r) => [r.teamId, `${r.wins}-${r.losses}-${r.draws}`]));
const since = new Date(Date.now() - 455 * 864e5).toISOString().slice(0, 10);
const predict = outcomeModel(ds.games, rating, since);
const seasonStart = "2026-08-01";
const gamesThisSeason = new Map<number, number>();
for (const g of ds.games) if (g.date >= seasonStart) for (const id of [g.team1Id, g.team2Id]) gamesThisSeason.set(id, (gamesThisSeason.get(id) ?? 0) + 1);

// ---- match an event entry (club + team label) to one of our teams ----
const norm = (s: string) => s.toLowerCase().replace(/\((ca|cas|can|tx|txs|txn|az|co|ut|nm|id|il|ga)\)/g, " ")
  .replace(/[^a-z0-9]+/g, " ").replace(/\b(soccer club|futbol club|football club|sc|fc)\b/g, " ").replace(/\s+/g, " ").trim();
const ageOk = (division: string, age: string) => division === "U19" ? age === "U19" || age === "U18" : age === division;
const dplo = (s: string) => /\bdplo\b/i.test(s);
const byGender = ds.teams.filter((t) => t.gender === "Girls");

interface Entry { division: string; club: string; team: string; group?: string; teamId?: number; matchedName?: string; confidence?: "exact" | "club" | "none" }
function matchEntry(e: Entry): Entry {
  const full = norm(`${e.club} ${e.team}`), label = norm(e.team), club = norm(e.club);
  const pool = byGender.filter((t) => ageOk(e.division, t.ageGroup) && dplo(t.sourceName ?? t.name) === dplo(e.team));
  const exact = pool.filter((t) => { const n = norm(t.sourceName ?? ""); return n === full || n === label; });
  // prefer a rated team, then the one most active this season
  const best = (c: typeof pool) => c.sort((a, b) => Number(rating.has(b.id)) - Number(rating.has(a.id)) || (gamesThisSeason.get(b.id) ?? 0) - (gamesThisSeason.get(a.id) ?? 0))[0];
  const sameClub = pool.filter((t) => (norm(t.club ?? "") === club || norm(t.sourceName ?? "").startsWith(club)) && /\bdpl/i.test(t.sourceName ?? t.name));
  if (exact.length) {
    const t = best(exact);
    if (rating.has(t.id)) return { ...e, teamId: t.id, matchedName: t.sourceName, confidence: "exact" };
    // this season's registration has too few games to be rated: stand in the club's rated
    // DPL team of the same age (usually last season's registration of the same squad)
    const proxy = best(sameClub.filter((c) => rating.has(c.id)));
    if (proxy) return { ...e, teamId: proxy.id, matchedName: proxy.sourceName, confidence: "club" };
    return { ...e, teamId: t.id, matchedName: t.sourceName, confidence: "exact" };
  }
  if (sameClub.length) { const t = best(sameClub); return { ...e, teamId: t.id, matchedName: t.sourceName, confidence: "club" }; }
  return { ...e, confidence: "none" };
}

const accepted = readTsv(path.join(FIX, `${eventId}-accepted.tsv`)).map(([division, club, team]) => ({ division, club, team }));
const groupsRaw = readTsv(path.join(FIX, `${eventId}-groups.tsv`)).map(([division, group, club, team]) => ({ division, group, club, team }));
const entries: Entry[] = (groupsRaw.length ? groupsRaw : accepted).map(matchEntry);
if (!entries.length) { console.error(`no data/fixtures/${eventId}-accepted.tsv or -groups.tsv`); process.exit(1); }

const r = (e: Entry) => (e.teamId !== undefined ? rating.get(e.teamId) : undefined);
const label = (e: Entry) => `${e.club} ${e.team}`;
const pct = (x: number) => `${Math.round(100 * x)}%`.padStart(4);

// ---- group simulation (round robin, 3 pts win / 1 draw; ties broken at random) ----
// Teams we have no rating for count as the division's median rated team (flagged "no data")
const medianOf = (xs: number[]) => { const v = [...xs].sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : 0; };
const divMedian = new Map<string, number>();
for (const d of new Set(entries.map((e) => e.division))) divMedian.set(d, medianOf(entries.filter((e) => e.division === d && r(e) !== undefined).map((e) => r(e)!)));
const rr = (e: Entry) => r(e) ?? divMedian.get(e.division)!;
function simulate(group: Entry[], runs = 10000) {
  const firsts = new Array(group.length).fill(0), pts = new Array(group.length).fill(0);
  const pairs: Array<[number, number, Outcome]> = [];
  for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
    pairs.push([i, j, predict(rr(group[i]), rr(group[j]))]);
  }
  for (let k = 0; k < runs; k++) {
    const p = new Array(group.length).fill(0);
    for (const [i, j, o] of pairs) {
      const x = Math.random();
      if (x < o.win) p[i] += 3; else if (x < o.win + o.draw) { p[i]++; p[j]++; } else p[j] += 3;
    }
    const top = Math.max(...p), leaders = p.flatMap((v, i) => (v === top ? [i] : []));
    firsts[leaders[Math.floor(Math.random() * leaders.length)]]++;
    p.forEach((v, i) => (pts[i] += v));
  }
  return { pairs, firsts: firsts.map((f) => f / runs), points: pts.map((v) => v / runs) };
}

// optional match schedule: division · match # · date · time · field · home · away (names as shown on GotSport)
const schedule = readTsv(path.join(FIX, `${eventId}-schedule.tsv`)).map(([division, match, date, time, field, home, away]) => ({ division, match, date, time, field, home, away }));
/** the entry a GotSport display name ("Colorado Rush East U15G DPL") refers to */
const findEntry = (division: string, shown: string) => {
  const n = norm(shown);
  const inDiv = entries.filter((e) => e.division === division);
  // GotSport shows "<club> <team>" but drops words repeated from the club name
  // ("Idaho Surf SC" + "ID Surf U16G DPL" → "Idaho Surf SC ID U16G DPL")
  const restFits = (e: Entry) => {
    const club = norm(e.club);
    if (!n.startsWith(club + " ")) return false;
    const team = new Set(norm(e.team).split(" "));
    return n.slice(club.length + 1).split(" ").every((w) => team.has(w));
  };
  return inDiv.find((e) => norm(`${e.club} ${e.team}`) === n) ?? inDiv.find((e) => norm(e.team) === n)
    ?? inDiv.find((e) => n.startsWith(norm(e.club) + " ") && n.endsWith(norm(e.team)))
    ?? inDiv.find(restFits);
};
const scheduled = new Map<string, (typeof schedule)[number] & { homeEntry?: Entry }>();
for (const m of schedule) {
  const h = findEntry(m.division, m.home), a = findEntry(m.division, m.away);
  if (!h || !a) { console.warn(`schedule: couldn't place match ${m.match} (${m.home} vs ${m.away})`); continue; }
  scheduled.set([h, a].map((e) => label(e)).sort().join("|"), { ...m, homeEntry: h });
}
const slot = (x: Entry, y: Entry) => {
  const m = scheduled.get([x, y].map((e) => label(e)).sort().join("|"));
  return m ? { match: m.match, date: m.date, time: m.time, field: m.field, home: label(m.homeEntry!) } : null;
};
// optional knockout brackets: division · group · match · round · date · time · field · home · away,
// where later rounds name earlier ones: "W:Round of 16 A" (winner) / "L:…" (loser)
const bracketRows = readTsv(path.join(FIX, `${eventId}-bracket.tsv`)).map(([division, group, match, round, date, time, field, home, away]) => ({ division, group, match, round, date, time, field, home, away }));
type BRow = (typeof bracketRows)[number];
const STAGE: Array<[RegExp, "qf" | "sf" | "final" | "title"]> = [[/^round of 16/i, "qf"], [/^quarter/i, "sf"], [/^semi/i, "final"], [/^final/i, "title"]];
/** Play a knockout bracket 10,000 times. Draws go to penalties (50/50). */
function simulateBracket(rows: BRow[], division: string, runs = 10000) {
  const teamOf = (name: string) => (/^[WL]:/.test(name) ? null : findEntry(division, name) ?? null);
  const reach = new Map<Entry, Record<"qf" | "sf" | "final" | "title", number>>();
  const pairings = new Map<string, Map<string, number>>(); // match → "a|b" → count
  const ordered = [...rows].sort((a, b) => Number(a.match) - Number(b.match));
  for (let k = 0; k < runs; k++) {
    const res = new Map<string, { w: Entry; l: Entry }>();
    let pending = ordered;
    while (pending.length) {
      const next: BRow[] = [];
      for (const m of pending) {
        const side = (s: string) => { const ref = s.match(/^([WL]):(.+)$/); if (!ref) return teamOf(s); const r0 = res.get(ref[2]); return r0 ? (ref[1] === "W" ? r0.w : r0.l) : undefined; };
        const h = side(m.home), a = side(m.away);
        if (h === undefined || a === undefined) { next.push(m); continue; }
        if (!h || !a) continue; // a team we couldn't place (warned below): skip that branch
        const o = predict(rr(h), rr(a)), x = Math.random();
        const homeWins = x < o.win || (x < o.win + o.draw && Math.random() < 0.5);
        res.set(m.round, homeWins ? { w: h, l: a } : { w: a, l: h });
        const key = [label(h), label(a)].join("|");
        const pm = pairings.get(m.match) ?? new Map<string, number>(); pm.set(key, (pm.get(key) ?? 0) + 1); pairings.set(m.match, pm);
        const stage = STAGE.find(([re]) => re.test(m.round))?.[1];
        if (stage) { const w = homeWins ? h : a; const t = reach.get(w) ?? { qf: 0, sf: 0, final: 0, title: 0 }; t[stage]++; reach.set(w, t); }
      }
      if (next.length === pending.length) break;
      pending = next;
    }
  }
  return { reach, pairings, runs };
}
const metaFile = path.join(FIX, `${eventId}-event.json`);
const event: Prediction["event"] = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, "utf8")) : { id: Number(eventId), name: `Event ${eventId}` };
const out: Prediction = {
  event, generatedAt: new Date().toISOString(), ratingsFrom: new Date(fs.statSync(path.join(process.cwd(), "data", "snapshot.json")).mtimeMs).toISOString(),
  model: "Rating gap → win/draw/loss rates of past games with the same gap; groups simulated 10,000 times",
  teams: { total: entries.length, rated: entries.filter((e) => r(e) !== undefined).length },
  divisions: [],
};
const divisions = [...new Set(entries.map((e) => e.division))];
const unmatched = entries.filter((e) => e.confidence === "none");
const teamOut = (e: Entry, rank: Map<Entry, number>): PredGroup["teams"][number] => ({
  club: e.club, team: e.team, label: label(e), teamId: e.teamId ?? null, matchedName: e.matchedName ?? null,
  match: e.confidence ?? "none", rating: r(e) ?? null, assumedRating: r(e) === undefined ? rr(e) : null,
  record: e.teamId && rating.has(e.teamId) ? record.get(e.teamId) ?? null : null, rankInDivision: rank.get(e) ?? null,
});

for (const div of divisions) {
  const inDiv = entries.filter((e) => e.division === div);
  const ranked = inDiv.filter((e) => r(e) !== undefined).sort((a, b) => r(b)! - r(a)!);
  const rank = new Map(ranked.map((e, i) => [e, i + 1]));
  console.log(`\n=== ${div} ${event.gender ?? ""} · ${inDiv.length} teams ===`);
  const groups: PredGroup[] = [];
  for (const g of groupsRaw.length ? [...new Set(inDiv.map((e) => e.group!))] : []) {
    const grp = inDiv.filter((e) => e.group === g);
    // SuperGroups of 8–16 teams are championship brackets, not round robins: ranked only
    if (grp.length > 6) {
      const rows = bracketRows.filter((b) => b.division === div && b.group === g);
      if (!rows.length) {
        console.log(`  ${g}: ${grp.length}-team championship bracket (no bracket file: ranked by rating)`);
        groups.push({ name: g, kind: "bracket", teams: [...grp].sort((a, b) => rr(b) - rr(a)).map((e) => teamOut(e, rank)), matches: [] });
        continue;
      }
      for (const b of rows) for (const side of [b.home, b.away]) if (!/^[WL]:/.test(side) && !findEntry(div, side))
        console.warn(`  ! ${div} ${g}: couldn't place "${side}" in the bracket; the simulation will be incomplete`);
      const ko = simulateBracket(rows, div);
      const rate = (e: Entry) => { const t = ko.reach.get(e) ?? { qf: 0, sf: 0, final: 0, title: 0 }; return { qf: t.qf / ko.runs, sf: t.sf / ko.runs, final: t.final / ko.runs, title: t.title / ko.runs }; };
      const teams = [...grp].sort((a, b) => rate(b).title - rate(a).title || rr(b) - rr(a)).map((e) => ({ ...teamOut(e, rank), reach: rate(e) }));
      console.log(`  ${g}: knockout bracket`);
      teams.slice(0, 5).forEach((t) => console.log(`    ${pct(t.reach.title)} title · ${pct(t.reach.final)} final · ${pct(t.reach.sf)} semis  ${t.label}`));
      const firstRound = rows.filter((b) => !/^[WL]:/.test(b.home) && !/^[WL]:/.test(b.away)).map((b) => {
        const h = findEntry(div, b.home), a = findEntry(div, b.away);
        if (!h || !a) return null;
        const o = predict(rr(h), rr(a));
        return { a: teamOut(h, rank), b: teamOut(a, rank), win: o.win, draw: o.draw, loss: o.loss, margin: o.margin,
          schedule: { match: b.match, date: b.date, time: b.time, field: b.field, home: label(h), round: b.round } };
      }).filter((m): m is NonNullable<typeof m> => m !== null).sort((x, y) => Number(x.schedule.match) - Number(y.schedule.match));
      const later = rows.filter((b) => /^[WL]:/.test(b.home)).sort((x, y) => Number(x.match) - Number(y.match)).map((b) => {
        const top = [...(ko.pairings.get(b.match) ?? new Map<string, number>())].sort((x, y) => y[1] - x[1])[0];
        return { match: b.match, round: b.round, date: b.date, time: b.time, field: b.field,
          home: b.home.replace(/^W:/, "Winner ").replace(/^L:/, "Loser "), away: b.away.replace(/^W:/, "Winner ").replace(/^L:/, "Loser "),
          likely: top ? { home: top[0].split("|")[0], away: top[0].split("|")[1], chance: top[1] / ko.runs } : null };
      });
      groups.push({ name: g, kind: "bracket", teams, matches: firstRound, knockout: later });
      continue;
    }
    const sim = simulate(grp);
    console.log(`  ${g}`);
    const order = grp.map((e, i) => ({ e, i })).sort((a, b) => sim.firsts[b.i] - sim.firsts[a.i]);
    order.forEach(({ e, i }) => console.log(`    ${pct(sim.firsts[i])} to win · ${sim.points[i].toFixed(1)} pts · ${(r(e)?.toFixed(2) ?? "  —").padStart(6)}  ${label(e)}${r(e) === undefined ? "  (no data: assumed average)" : ""}`));
    groups.push({
      name: g, kind: "round-robin",
      teams: order.map(({ e, i }) => ({ ...teamOut(e, rank), winGroup: sim.firsts[i], expPoints: sim.points[i] })),
      matches: sim.pairs.map(([i, j, o]) => ({ a: teamOut(grp[i], rank), b: teamOut(grp[j], rank), win: o.win, draw: o.draw, loss: o.loss, margin: o.margin, schedule: slot(grp[i], grp[j]) }))
        .sort((x, y) => (x.schedule?.date ?? "9").localeCompare(y.schedule?.date ?? "9") || (x.schedule?.match ?? "").localeCompare(y.schedule?.match ?? "")),
    });
  }
  const field = ranked.map((e) => r(e)!), avg = field.reduce((s, x) => s + x, 0) / (field.length || 1);
  out.divisions.push({
    division: div, teams: inDiv.length, groups,
    ranking: ranked.map((e) => ({ ...teamOut(e, rank), group: e.group ?? null, beatsAverage: predict(r(e)!, avg).win })),
  });
  ranked.slice(0, groupsRaw.length ? 5 : 99).forEach((e, i) => console.log(`   ${String(i + 1).padStart(2)}. ${r(e)!.toFixed(2).padStart(6)}  ${label(e)}`));
}
console.log(`\nmatched ${entries.length - unmatched.length}/${entries.length} teams (${entries.filter((e) => e.confidence === "exact").length} exact name, ${entries.filter((e) => e.confidence === "club").length} by club); rated ${out.teams.rated}`);

// ---- after the event: how did the predictions do? ----
if (process.argv.includes("--score")) {
  const ids = new Set(entries.map((e) => e.teamId).filter(Boolean) as number[]);
  const evGames = ds.games.filter((g) => g.tournamentName && g.tournamentName === (event.fullName ?? event.name) && g.date >= (event.start ?? "") && ids.has(g.team1Id) && ids.has(g.team2Id));
  let right = 0, logLoss = 0, n = 0;
  for (const g of evGames) {
    const a = rating.get(g.team1Id), b = rating.get(g.team2Id);
    if (a === undefined || b === undefined) continue;
    const o = predict(a, b);
    const actual = g.team1Score > g.team2Score ? "win" : g.team1Score === g.team2Score ? "draw" : "loss";
    const call = o.win >= o.loss ? (o.win >= o.draw ? "win" : "draw") : (o.loss >= o.draw ? "loss" : "draw");
    if (call === actual) right++;
    logLoss -= Math.log(Math.max(1e-6, o[actual]));
    n++;
  }
  console.log(`\nSCORE: ${n} games · most-likely result right ${n ? pct(right / n) : "—"} · avg log loss ${n ? (logLoss / n).toFixed(3) : "—"}`);
  out.score = { games: n, correct: right, logLoss: n ? logLoss / n : null };
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, `${eventId}.json`), JSON.stringify(out, null, 2) + "\n");
