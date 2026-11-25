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
 *   npx tsx scripts/predict-event.ts 57894 --dry-run # print the matching, write nothing
 *
 * Writes data/predictions/<event>.json.
 *
 * --score never re-predicts: it grades the saved (pre-event) predictions file against the
 * GotSport results in data/discovery/games/<event>.json, pairing games by match number + date
 * (snapshot team ids change on every rebuild, and GotSport's result names often lack the club).
 * It also writes each team's GotSport id at this event into the file as gotsportTeamId.
 */
import * as fs from "fs";
import * as path from "path";
import { getDataSet } from "../src/lib/data";
import { outcomeModel, type Outcome } from "../src/lib/predict";
import type { Prediction, PredGroup, PredTeam } from "../src/lib/events";
import { assignGotsportIds, readGsMatches } from "./lib/event-gotsport-ids";

const eventId = process.argv[2];
if (!eventId) { console.error("usage: npx tsx scripts/predict-event.ts <eventId> [--score]"); process.exit(1); }
const FIX = path.join(process.cwd(), "data", "fixtures");
const OUT = path.join(process.cwd(), "data", "predictions");

if (process.argv.includes("--score")) { scoreSaved(); process.exit(0); }

function scoreSaved() {
  const predFile = path.join(OUT, `${eventId}.json`);
  const gamesFile = path.join(process.cwd(), "data", "discovery", "games", `${eventId}.json`);
  if (!fs.existsSync(predFile)) { console.error(`no saved predictions: ${predFile}`); process.exit(1); }
  if (!fs.existsSync(gamesFile)) { console.error(`no GotSport results yet: ${gamesFile} (run the discovery crawler)`); process.exit(1); }
  const pred: Prediction = JSON.parse(fs.readFileSync(predFile, "utf8"));
  const results: Array<{ matchNumber: number | string; date: string; homeTeamId: number; awayTeamId: number; homeScore: number | null; awayScore: number | null }> =
    JSON.parse(fs.readFileSync(gamesFile, "utf8"));
  const byMatch = new Map(results.map((g) => [`${g.matchNumber}|${g.date}`, g]));
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  // Schedules change after predictions are made (teams re-slotted, home/away flipped, withdrawals),
  // so a match number alone can pair the wrong teams. Each team's GotSport id comes from
  // assignGotsportIds (GotSport's names for the id first, then shared match numbers); a game is
  // graded only when both of its ids belong to the two predicted teams.
  const teamsByKey = new Map<string, PredTeam & { division: string }>();
  for (const d of pred.divisions) for (const g of d.groups) for (const t of [...g.teams, ...g.matches.flatMap((m) => [m.a, m.b])])
    if (!teamsByKey.has(`${d.division}|${t.label}`)) teamsByKey.set(`${d.division}|${t.label}`, { ...t, division: d.division });
  const slots = pred.divisions.flatMap((d) => d.groups.flatMap((g) => g.matches.filter((m) => m.schedule).map((m) => {
    const [a, b] = [teamsByKey.get(`${d.division}|${m.a.label}`)!, teamsByKey.get(`${d.division}|${m.b.label}`)!];
    const aHome = key(m.schedule!.home) === key(m.a.label);
    return { match: m.schedule!.match, date: m.schedule!.date, home: aHome ? a : b, away: aHome ? b : a };
  })));
  const ids = assignGotsportIds([...teamsByKey.values()], slots, results);
  const gsId = new Map<string, number>(); // division|label → GotSport team id
  for (const [t, { id }] of ids) gsId.set(`${t.division}|${t.label}`, id);
  const owner = new Map<number, string>(); // GotSport id → division|label
  for (const [k, id] of gsId) owner.set(id, k);
  let changed = 0;
  const noData = (t: PredTeam) => t.rating === null;
  const split = () => ({ games: 0, correct: 0, favGames: 0, favWon: 0 });
  const rated = split(), unrated = split();
  const BUCKETS: Array<[number, number]> = [[0, 0.5], [0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.01]];
  const buckets = BUCKETS.map(([from, to]) => ({ from, to: Math.min(to, 1), games: 0, predicted: 0, won: 0, drew: 0 }));
  const upsets: NonNullable<Prediction["score"]>["upsets"] = [];
  const big = { games: 0, lost: 0, lostNoData: 0 };
  let n = 0, right = 0, logLoss = 0, favGames = 0, favWon = 0, draws = 0, unplayed = 0;
  for (const d of pred.divisions) for (const g of d.groups) for (const m of g.matches) {
    const res = m.schedule && byMatch.get(`${m.schedule.match}|${m.schedule.date}`);
    if (!res) { unplayed++; continue; }
    const ka = `${d.division}|${m.a.label}`, kb = `${d.division}|${m.b.label}`;
    const h = owner.get(res.homeTeamId), w = owner.get(res.awayTeamId);
    const aHome = h === ka && w === kb ? true : h === kb && w === ka ? false : null;
    if (aHome === null) { changed++; m.result = null; continue; } // a different pairing was played
    if (res.homeScore == null || res.awayScore == null) { unplayed++; continue; }
    const as = aHome ? res.homeScore : res.awayScore, bs = aHome ? res.awayScore : res.homeScore;
    m.result = { a: as, b: bs };
    const actual: "win" | "draw" | "loss" = as > bs ? "win" : as === bs ? "draw" : "loss";
    const call = (["win", "draw", "loss"] as const).reduce((x, y) => (m[y] > m[x] ? y : x));
    const ok = call === actual, favA = m.win >= m.loss, chance = favA ? m.win : m.loss;
    const favWins = actual !== "draw" && (actual === "win") === favA;
    const side = noData(m.a) || noData(m.b) ? unrated : rated;
    n++; side.games++;
    if (ok) { right++; side.correct++; }
    logLoss -= Math.log(Math.max(1e-6, m[actual]));
    if (actual === "draw") draws++;
    else { favGames++; side.favGames++; if (favWins) { favWon++; side.favWon++; } }
    const b = buckets.find((x) => chance >= x.from && chance < x.to) ?? buckets[buckets.length - 1];
    b.games++; b.predicted += chance; if (favWins) b.won++; if (actual === "draw") b.drew++;
    if (chance >= 0.7) {
      big.games++;
      if (actual !== "draw" && !favWins) {
        big.lost++; if (side === unrated) big.lostNoData++;
        const [fav, opp] = favA ? [m.a, m.b] : [m.b, m.a];
        upsets.push({ division: d.division, group: g.name, fav: fav.label, opp: opp.label, chance, score: favA ? `${as}–${bs}` : `${bs}–${as}`, noData: side === unrated });
      }
    }
  }
  buckets.forEach((b) => { if (b.games) b.predicted /= b.games; });
  upsets.sort((x, y) => y.chance - x.chance);

  // championship outcomes: knockout final (by match number) or the round-robin SuperGroup winner
  const labelOf = new Map<string, string>(); // division|GotSport id → label
  for (const [k, id] of gsId) labelOf.set(`${k.split("|")[0]}|${id}`, k.slice(k.indexOf("|") + 1));
  const finals: NonNullable<Prediction["score"]>["finals"] = [];
  let played = 0, favTopped = 0, expected = 0;
  for (const d of pred.divisions) for (const g of d.groups) {
    if (g.kind === "bracket") {
      const byTitle = g.teams.filter((t) => t.reach).sort((x, y) => y.reach!.title - x.reach!.title);
      const fin = (g.knockout ?? []).find((k) => /^final/i.test(k.round));
      const res = fin && byMatch.get(`${fin.match}|${fin.date}`);
      if (!byTitle.length || !res || res.homeScore == null || res.awayScore == null) continue;
      const home = labelOf.get(`${d.division}|${res.homeTeamId}`) ?? fin!.home, away = labelOf.get(`${d.division}|${res.awayTeamId}`) ?? fin!.away;
      const winner = res.homeScore > res.awayScore ? home : res.awayScore > res.homeScore ? away : null; // a draw went to penalties
      const w = winner ? byTitle.findIndex((t) => t.label === winner) : -1;
      finals.push({ division: d.division, group: g.name, kind: "final", favorite: byTitle[0].label, favChance: byTitle[0].reach!.title,
        home, away, score: `${res.homeScore}–${res.awayScore}`, winner, winnerChance: w >= 0 ? byTitle[w].reach!.title : null, winnerRank: w >= 0 ? w + 1 : null });
      continue;
    }
    if (!g.matches.length || g.matches.some((m) => !m.result)) continue;
    const st = new Map(g.teams.map((t) => [t.label, { p: 0, gd: 0, gf: 0 }]));
    for (const m of g.matches) {
      const A = st.get(m.a.label)!, B = st.get(m.b.label)!, { a, b } = m.result!;
      A.gd += a - b; B.gd += b - a; A.gf += a; B.gf += b;
      if (a > b) A.p += 3; else if (b > a) B.p += 3; else { A.p++; B.p++; }
    }
    const order = [...st].sort((x, y) => y[1].p - x[1].p || y[1].gd - x[1].gd || y[1].gf - x[1].gf).map(([l]) => l);
    const byOdds = [...g.teams].sort((x, y) => (y.winGroup ?? 0) - (x.winGroup ?? 0));
    played++; expected += byOdds[0].winGroup ?? 0; if (order[0] === byOdds[0].label) favTopped++;
    if (/supergroup/i.test(g.name)) {
      const w = byOdds.findIndex((t) => t.label === order[0]);
      finals.push({ division: d.division, group: g.name, kind: "group", favorite: byOdds[0].label, favChance: byOdds[0].winGroup ?? 0,
        winner: order[0], winnerChance: byOdds[w]?.winGroup ?? null, winnerRank: w + 1 });
    }
  }

  // null = no GotSport id played as this team (e.g. it withdrew and others filled its games)
  const tag = (div: string, t: PredTeam) => { t.gotsportTeamId = gsId.get(`${div}|${t.label}`) ?? null; };
  for (const d of pred.divisions) {
    for (const g of d.groups) { g.teams.forEach((t) => tag(d.division, t)); g.matches.forEach((m) => { tag(d.division, m.a); tag(d.division, m.b); }); }
    d.ranking.forEach((t) => tag(d.division, t));
  }
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log(`SCORE: ${n} games graded (${unplayed} not found or unplayed, ${changed} played by a different pairing than predicted) · most-likely result right ${n ? pct(right / n) : "—"}` +
    ` · favorite won ${favGames ? pct(favWon / favGames) : "—"} of decided games · avg log loss ${n ? (logLoss / n).toFixed(3) : "—"} (coin flip 1.099)`);
  buckets.filter((b) => b.games).forEach((b) => console.log(`  favorite ${Math.round(b.from * 100)}–${Math.round(b.to * 100)}%: ${b.games} games · predicted ${pct(b.predicted)} · won ${pct(b.won / b.games)} · drew ${pct(b.drew / b.games)}`));
  console.log(`  both rated: ${rated.correct}/${rated.games} right · with a no-data team: ${unrated.correct}/${unrated.games} right`);
  console.log(`  70%+ favorites lost ${big.lost} of ${big.games} (${big.lostNoData} involving a no-data team) · group favorites topped ${favTopped}/${played} (expected ${expected.toFixed(1)})`);
  finals.forEach((f) => console.log(`  ${f.division} ${f.group}: favorite ${f.favorite} ${pct(f.favChance)} → ${f.kind === "final" ? `${f.home} ${f.score} ${f.away}` : `won by ${f.winner}`}`));
  console.log(`GotSport ids recorded for ${gsId.size} teams`);
  pred.score = {
    games: n, correct: right, logLoss: n ? logLoss / n : null, gradedAt: new Date().toISOString(),
    favGames, favWon, draws, buckets: buckets.filter((b) => b.games), rated, noData: unrated, bigUpsets: big,
    upsets: upsets.slice(0, 8), finals, groups: { played, favTopped, expected },
  };
  fs.writeFileSync(predFile, JSON.stringify(pred, null, 2) + "\n");
}
const readTsv = (f: string) => fs.existsSync(f)
  ? fs.readFileSync(f, "utf8").split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => l.split("\t").map((c) => c.trim()))
  : [];

const ds = getDataSet();
const rating = new Map(ds.rankings.map((r) => [r.teamId, r.score]));
const record = new Map(ds.rankings.map((r) => [r.teamId, `${r.wins}-${r.losses}-${r.draws}`]));
const since = new Date(Date.now() - 455 * 864e5).toISOString().slice(0, 10);
// win/draw/loss table from teams with 4+ games (1–3-game ratings are pulled-in estimates, see data.ts)
const predict = outcomeModel(ds.games, new Map(ds.rankings.filter((x) => x.gamesPlayed >= 4).map((x) => [x.teamId, x.score])), since);
const seasonStart = "2026-08-01";
const gamesThisSeason = new Map<number, number>();
for (const g of ds.games) if (g.date >= seasonStart) for (const id of [g.team1Id, g.team2Id]) gamesThisSeason.set(id, (gamesThisSeason.get(id) ?? 0) + 1);

// ---- match an event entry (club + team label) to one of our teams ----
const norm = (s: string) => s.toLowerCase().replace(/\((ca|cas|can|tx|txs|txn|az|co|ut|nm|id|il|ga)\)/g, " ")
  .replace(/[^a-z0-9]+/g, " ").replace(/\b(soccer club|futbol club|football club|sc|fc)\b/g, " ").replace(/\s+/g, " ").trim();
// Event settings (data/fixtures/<event>-event.json): gender, plus for non-DPL events `teamTag` (regex a
// team's name must match, default DPL) and `excludeTag` (regex that rules a team out, e.g. ECNL RL / Pre-ECNL).
const eventMeta = (() => { const f = path.join(FIX, `${eventId}-event.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {}; })() as
  { gender?: string; teamTag?: string; excludeTag?: string };
const TEAM_TAG = new RegExp(eventMeta.teamTag ?? "\\bdpl", "i");
const EXCLUDE_TAG = eventMeta.excludeTag ? new RegExp(eventMeta.excludeTag, "i") : null;
/** "U18/19" covers both ages; DPL's "U19" also takes U18 teams */
const ageOk = (division: string, age: string) => {
  const two = division.match(/^U(\d+)\/(\d+)$/);
  if (two) return age === `U${two[1]}` || age === `U${two[2]}`;
  return division === "U19" ? age === "U19" || age === "U18" : age === division;
};
const dplo = (s: string) => /\bdplo\b/i.test(s);
const byGender = ds.teams.filter((t) => t.gender === (eventMeta.gender ?? "Girls") && !(EXCLUDE_TAG?.test(t.sourceName ?? t.name)));

interface Entry { division: string; club: string; team: string; group?: string; teamId?: number; matchedName?: string; confidence?: "id" | "exact" | "club" | "none"; gotsportTeamId?: number }
function matchEntry(e: Entry): Entry {
  const full = norm(`${e.club} ${e.team}`), label = norm(e.team), club = norm(e.club);
  const pool = byGender.filter((t) => ageOk(e.division, t.ageGroup) && dplo(t.sourceName ?? t.name) === dplo(e.team));
  const exact = pool.filter((t) => { const n = norm(t.sourceName ?? ""); return n === full || n === label; });
  // prefer a rated team, then the one most active this season
  const best = (c: typeof pool) => c.sort((a, b) => Number(rating.has(b.id)) - Number(rating.has(a.id)) || (gamesThisSeason.get(b.id) ?? 0) - (gamesThisSeason.get(a.id) ?? 0))[0];
  const sameClub = pool.filter((t) => (norm(t.club ?? "") === club || norm(t.sourceName ?? "").startsWith(club)) && TEAM_TAG.test(t.sourceName ?? t.name));
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
const label = (e: Entry) => `${e.club} ${e.team}`;
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

// ---- GotSport ids: match entrants by the team id they are registered under ----
// The same GotSport team plays under different names at different events (Dallas Surf's DPL
// team is "12G Aspire" elsewhere), so names alone miss teams we have. The crawler saves each
// event's unplayed matches (data/discovery/schedules) and results (data/discovery/games) with team
// ids; pairing our schedule/bracket fixtures with them by match number gives each entrant its id.
// An id that stands in for more than one entrant (schedule changes) goes to the one it played most.
{
  const gsMatches = readGsMatches(eventId);
  const fixtures = [
    ...readTsv(path.join(FIX, `${eventId}-schedule.tsv`)).map(([division, match, date, , , home, away]) => ({ division, match, date, home, away })),
    ...readTsv(path.join(FIX, `${eventId}-bracket.tsv`)).map(([division, , match, , date, , , home, away]) => ({ division, match, date, home, away })),
  ];
  const place = (division: string, shown: string) => (/^[WL]:/.test(shown) ? undefined : findEntry(division, shown));
  const best = assignGotsportIds(entries, fixtures.map((m) => ({ match: m.match, date: m.date, home: place(m.division, m.home), away: place(m.division, m.away) })), gsMatches);
  const byGsId = new Map<number, typeof ds.teams>();
  for (const t of ds.teams) for (const gs of [t.gotsportTeamId, ...(t.formerGotsportTeamIds ?? [])]) if (gs) byGsId.set(gs, [...(byGsId.get(gs) ?? []), t]);
  let agreed = 0, changed = 0;
  let kept = 0;
  for (const [e, { id, by }] of best) {
    const t = (byGsId.get(id) ?? []).filter((c) => rating.has(c.id))
      .sort((a, b) => (gamesThisSeason.get(b.id) ?? 0) - (gamesThisSeason.get(a.id) ?? 0))[0];
    // only match numbers tie this id to the entrant (no GotSport name names the club): an exact
    // name match to a different team wins, since re-slotted schedules send votes astray
    if (t && e.teamId !== t.id && by === "slots" && e.confidence === "exact") {
      console.log(`  kept name match: ${e.division} ${label(e)} = ${e.matchedName} (GotSport id ${id} by match numbers only → ${t.sourceName})`);
      kept++; continue;
    }
    e.gotsportTeamId = id;
    if (!t) continue;
    if (e.teamId === t.id) { agreed++; continue; }
    console.log(`  by GotSport id: ${e.division} ${label(e)}: ${e.matchedName ? `${e.matchedName} (${e.confidence})` : "no data"} → ${t.sourceName}`);
    Object.assign(e, { teamId: t.id, matchedName: t.sourceName, confidence: "id" });
    changed++;
  }
  console.log(`GotSport ids: ${best.size}/${entries.length} entrants (from ${gsMatches.length} GotSport matches) · ${agreed} agree with the name match · ${changed} re-matched by id · ${kept} kept their exact name match`);
}

const r = (e: Entry) => (e.teamId !== undefined ? rating.get(e.teamId) : undefined);
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
  // once a group's schedule is known, simulate only the games actually scheduled
  // (big groups, e.g. 6 teams, don't play a full round robin)
  const hasSchedule = group.some((x, i) => group.some((y, j) => j > i && slot(x, y)));
  for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
    if (hasSchedule && !slot(group[i], group[j])) continue;
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
  club: e.club, team: e.team, label: label(e), teamId: e.teamId ?? null, matchedName: e.matchedName ?? null, gotsportTeamId: e.gotsportTeamId ?? null,
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
console.log(`\nmatched ${entries.length - unmatched.length}/${entries.length} teams (${entries.filter((e) => e.confidence === "id").length} by GotSport id, ${entries.filter((e) => e.confidence === "exact").length} exact name, ${entries.filter((e) => e.confidence === "club").length} by club); rated ${out.teams.rated}`);

if (process.argv.includes("--dry-run")) console.log("dry run: predictions not written");
else {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${eventId}.json`), JSON.stringify(out, null, 2) + "\n");
}
