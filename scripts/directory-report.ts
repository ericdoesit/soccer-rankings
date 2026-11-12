/** Quick health report of the West directory in Postgres:  npm run db:report */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { sql } from "drizzle-orm";
import { getDb } from "../src/db";
(async () => {
  const db = await getDb();
  const run = async (label: string, q: ReturnType<typeof sql>) => { const r: any = await db.execute(q); console.log(`\n${label}`); console.table(r.rows ?? r); };
  await run("Biggest clubs per State Cup area (top 2)", sql`select state_cup, name, team_count, top_tier from (
    select coalesce(case association when 'CAS' then 'CA-S' when 'CAN' then 'CA-N' end, state) state_cup, name, team_count, top_tier,
    row_number() over (partition by coalesce(association,state) order by team_count desc) rn from clubs) x where rn<=2 order by state_cup`);
  await run("Clubs by top tier", sql`select coalesce(top_tier,'(none known)') tier, count(*) from clubs group by 1 order by 1`);
  await run("Teams per league (team_leagues)", sql`select l.name, count(*) from team_leagues tl join leagues l on l.id=tl.league_id group by 1 order by 2 desc`);
  await run("public_players view (empty until step 7)", sql`select count(*) from public_players`);
  process.exit(0);
})();
