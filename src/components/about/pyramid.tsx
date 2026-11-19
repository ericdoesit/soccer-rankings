/**
 * The boys pyramid from Pitfalls on the Pathway (report/ecosystem.html, "Deep Dive 01 · The Pyramid"):
 * same bands, poster fills and taper. Each band adds our median rating for its leagues, so the pyramid's
 * order can be read against results.
 */
const PYRAMID_URL = "https://pitfalls-on-the-pathway.vercel.app/report/ecosystem.html";

const BANDS: Array<{
  level: string;
  name: string;
  leagues: string;
  /** our league keys (SOCAL_LEAGUE_ORDER) with a short label */
  rated: Array<[string, string]>;
  /** files in public/pyramid (copied from Pitfalls report/logos) with alt text; wide = landscape logo */
  logos: Array<[string, string, boolean?]>;
  cls: string;
  width: string;
}> = [
  { level: "Level 1", name: "Pro Pipeline", leagues: "MLS NEXT HD", rated: [["MLS NEXT HD", "MLS NEXT HD"]],
    logos: [["mls-next.png", "MLS NEXT"]],
    cls: "bg-[#f2df22] text-[#0f0f0f]", width: "w-[64%] sm:w-[46%]" },
  { level: "Level 2", name: "National Elite", leagues: "ECNL Boys · USL Academy", rated: [["ECNL", "ECNL"]],
    logos: [["ecnl.png", "ECNL"], ["usl-academy.png", "USL Academy"]],
    cls: "bg-[#e94f35] text-white", width: "w-[71%] sm:w-[57%]" },
  { level: "Level 3", name: "National Competitive", leagues: "MLS NEXT AD · ECNL-RL · N1 · Elite Academy · NAL",
    rated: [["MLS NEXT AD", "MLS NEXT AD"], ["ECNL RL", "ECNL RL"], ["N1", "N1 (SoCal top tier)"], ["EA", "Elite Academy"]],
    logos: [["mls-next.png", "MLS NEXT Academy Division"], ["ecnl-rl.png", "ECNL Regional League"], ["n1.png", "National 1 League"], ["ea.png", "Elite Academy"], ["nal.png", "National Academy League"]],
    cls: "bg-[#1b9de0] text-white", width: "w-[78%] sm:w-[68%]" },
  { level: "Level 4", name: "Regional / National Bridge", leagues: "EA2 · Pre-ECNL · ODP",
    rated: [["EA2", "EA2"], ["Pre-ECNL", "Pre-ECNL"]],
    logos: [["pre-ecnl.png", "Pre-ECNL"], ["ea2.png", "Elite Academy 2"], ["odp.png", "Olympic Development Program"]],
    cls: "bg-[#1fa84d] text-white", width: "w-[85%] sm:w-[79%]" },
  { level: "Level 5", name: "Regional Travel", leagues: "SoCal League (Pre-Elite, F1–F4) · Coast Soccer · PSSLU · SGV · Southwest Super · Pacific Regional · USL Youth",
    rated: [["SoCal Pre-Elite", "SoCal Pre-Elite"], ["SoCal F1", "SoCal F1"], ["Coast Soccer League", "Coast Soccer"], ["PSSLU", "PSSLU"], ["SGV Soccer League", "SGV Soccer League"], ["Southwest Super League", "Southwest Super"]],
    logos: [["socal.png", "SoCal Soccer League"], ["csl.svg", "Coast Soccer League", true], ["psslu.png", "PSSLU"], ["sgv.png", "SGV Soccer League"], ["southwest-super.png", "Southwest Super League"], ["pacific-regional.png", "Pacific Regional Soccer League"], ["usl-youth.png", "USL Youth"]],
    cls: "bg-[#dcdad5] text-[#0f0f0f]", width: "w-[92%] sm:w-[90%]" },
  { level: "Foundation", name: "Recreational", leagues: "AYSO · City Parks", rated: [],
    logos: [["ayso.png", "AYSO"], ["la-rec-parks.png", "LA Rec & Parks", true]],
    cls: "bg-[#0f0f0f] text-white dark:ring-1 dark:ring-inset dark:ring-white/15", width: "w-full" },
];

const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

export function Pyramid({ groups, group = "U15|Boys", minTeams = 5 }: {
  groups: Record<string, Record<string, number[]>>;
  group?: string;
  minTeams?: number;
}) {
  const g = groups[group] ?? {};
  const med = (k: string) => ((g[k]?.length ?? 0) >= minTeams ? median(g[k]) : null);
  const [age, gender] = group.split("|");
  // the key: every rated league, highest median first, with its band's colour and level
  const key = BANDS.flatMap((b, i) => b.rated.map(([k, label]) => ({ label, v: med(k), n: g[k]?.length ?? 0, level: i + 1,
    color: b.cls.match(/bg-\[(#\w+)\]/)?.[1] ?? "#888" })))
    .filter((r) => r.v != null).sort((a, z) => z.v! - a.v!);
  return (
    <figure>
      <h3 className="heading-sm">The Boys Pyramid, Checked Against Results</h3>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">
        Levels from the{" "}
        <a href={PYRAMID_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
          Pitfalls on the Pathway pyramid
        </a>
        . The key gives our median team rating for each league&rsquo;s {age} {gender.toLowerCase()} Cal South teams, 2026/27.
      </p>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_210px] lg:gap-8">
      <div className="mx-auto flex w-full max-w-[620px] flex-col items-center gap-[3px]">
        {BANDS.map((b) => {
          return (
            <div
              key={b.level}
              className={`${b.cls} ${b.width} grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 rounded-lg px-3 py-1.5 sm:px-3.5`}
            >
              <span className="whitespace-nowrap text-xs font-bold tracking-[-0.01em] sm:text-[13px]">{b.name}</span>
              <span className="text-right text-[10px] font-bold uppercase tracking-[0.1em] opacity-75">{b.level}</span>
              <div className="col-span-2 flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                {b.logos.map(([f, alt, wide]) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={f + alt} src={`/pyramid/${f}`} alt={alt} title={alt} loading="lazy"
                    className={`object-contain ${wide ? "h-4 w-auto sm:h-5" : "h-7 w-7 sm:h-8 sm:w-8"}`} />
                ))}
              </div>
              {/* league names run across the bottom of the layer, under the logos */}
              {/* two lines reserved below desktop width, where level 5's list wraps, so every layer is the same height */}
              <span className="col-span-2 flex min-h-[2.75em] items-center justify-center text-center text-[9px] leading-snug opacity-85 sm:text-[10px] lg:min-h-0">{b.leagues}</span>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 content-start gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-1 lg:pt-1">
        <p className="col-span-full text-xs font-semibold text-muted-foreground">Median rating, highest first</p>
        {key.map((r) => (
          <div key={r.label} className="flex items-center gap-2.5" title={`${r.n} rated teams`}>
            <span className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-inset ring-black/10" style={{ background: r.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{r.label}</span>
            <span className="text-[10px] font-semibold text-muted-foreground">L{r.level}</span>
            <span className="w-7 text-right text-sm font-semibold tabular-nums text-foreground">{r.v!.toFixed(1)}</span>
          </div>
        ))}
      </div>
      </div>
      <figcaption className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Read down the pyramid and the medians should fall. They don&rsquo;t at the top: ECNL (level 2) and MLS NEXT AD
        (level 3) rate as high as or higher than MLS NEXT HD (level 1), and the best level 3 leagues sit close behind. The
        pyramid ranks access to the pro pathway; results show levels 1 to 3 overlapping. Levels 4 and 5 do fall in order.
        Ratings come from games between leagues, and few games cross leagues, so the top gaps are the least certain.
      </figcaption>
    </figure>
  );
}
