import Link from "next/link";
import { WEST_PATHS } from "./west-map-paths";

export interface MapArea {
  code: string;   // association code: CAS, CAN, AZ, …
  slug: string;   // /state/<slug>
  name: string;
  teams: number;
  clubs: number;
}

// Association code → state outline (California is drawn twice, clipped)
const PATH_FOR: Record<string, string> = {
  CAS: "ca", CAN: "ca", AK: "ak", AZ: "az", CO: "co", HI: "hi", ID: "id",
  MT: "mt", NV: "nv", NM: "nm", OR: "or", UT: "ut", WA: "wa", WY: "wy",
};

// Approximate Cal North / Cal South association line, in map coordinates:
// San Luis Obispo–Monterey county line on the coast to the Inyo–Mono line at Nevada.
const CA_SPLIT = { coast: [0, 303], east: [175, 255] } as const;
const CLIP: Record<string, string> = {
  CAN: `0,0 400,0 ${CA_SPLIT.east[0]},${CA_SPLIT.east[1]} ${CA_SPLIT.coast[0]},${CA_SPLIT.coast[1]}`,
  CAS: `${CA_SPLIT.coast[0]},${CA_SPLIT.coast[1]} ${CA_SPLIT.east[0]},${CA_SPLIT.east[1]} 400,600 0,600`,
};

// Label positions (map coordinates): area centroids, CA halves measured within their clip
const LABEL: Record<string, [number, number]> = {
  WA: [118, 52], OR: [92, 118], CAN: [56, 218], CAS: [101, 330], NV: [128, 236], ID: [190, 150],
  MT: [275, 88], WY: [294, 183], UT: [216, 252], CO: [318, 275], AZ: [192, 368], NM: [296, 376],
  AK: [116, 500], HI: [300, 560],
};

/**
 * Clickable map of the West: each state (Cal North and Cal South separately)
 * links to its /state page. Shading shows how many teams we have there.
 */
export function WestMap({ areas, className }: { areas: MapArea[]; className?: string }) {
  const max = Math.max(1, ...areas.map((a) => a.teams));
  // light tonal range so the black labels read without a halo
  const shade = (n: number) => 0.08 + 0.32 * Math.sqrt(n / max);
  return (
    <svg viewBox="0 0 390 595" className={className} role="img" aria-label="Map of the West: choose a state">
      <defs>
        {Object.entries(CLIP).map(([code, pts]) => (
          <clipPath key={code} id={`clip-${code}`}><polygon points={pts} /></clipPath>
        ))}
        <clipPath id="clip-ca-outline"><path d={WEST_PATHS.ca} /></clipPath>
      </defs>
      {areas.map((a) => {
        const d = WEST_PATHS[PATH_FOR[a.code]];
        if (!d) return null;
        const [lx, ly] = LABEL[a.code] ?? [0, 0];
        return (
          <Link key={a.code} href={`/state/${a.slug}`} className="group outline-none" aria-label={`${a.name}: ${a.clubs} clubs, ${a.teams} teams`}>
            <title>{`${a.name} · ${a.clubs} clubs · ${a.teams.toLocaleString()} teams`}</title>
            <path
              d={d}
              clipPath={CLIP[a.code] ? `url(#clip-${a.code})` : undefined}
              fill="var(--primary)"
              fillOpacity={shade(a.teams)}
              stroke="var(--background)"
              strokeWidth={1.2}
              className="transition-[fill-opacity] duration-150 group-hover:[fill-opacity:0.55] group-focus-visible:[fill-opacity:0.55]"
            />
            <text
              x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
              className="pointer-events-none select-none text-[11px] font-semibold"
              fill="var(--foreground)"
            >
              {a.code === "CAS" ? "CA-S" : a.code === "CAN" ? "CA-N" : a.code}
            </text>
          </Link>
        );
      })}
      {/* Cal North / Cal South line */}
      <line x1={CA_SPLIT.coast[0]} y1={CA_SPLIT.coast[1]} x2={CA_SPLIT.east[0]} y2={CA_SPLIT.east[1]}
        stroke="var(--background)" strokeWidth={1.2} strokeDasharray="3 2" clipPath="url(#clip-ca-outline)"
        className="pointer-events-none" />
    </svg>
  );
}
