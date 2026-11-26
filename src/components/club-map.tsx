"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapboxMap, GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export interface MapClub {
  club: string; lat: number; lng: number; city: string | null; venue: string | null;
  /** set when the club has several sites (one dot each) */
  site?: string;
  teams: number; listed: number; programs: string[];
  /** per gender: team count and leagues ("Boys" → EA, NPL; "Girls" → DPL) */
  byGender?: Record<string, { teams: number; programs: string[] }>;
}
type Gender = "All" | "Boys" | "Girls";

/** League tiers, highest first. A club is coloured by its highest tier that's switched on. */
const TIERS: Array<{ key: string; label: string; color: string; programs: string[] }> = [
  { key: "mls", label: "MLS NEXT", color: "#1d4ed8", programs: ["MLS NEXT"] },
  { key: "ecnl", label: "ECNL", color: "#0f766e", programs: ["ECNL"] },
  { key: "ga", label: "Girls Academy", color: "#be185d", programs: ["GA"] },
  { key: "dpl", label: "DPL", color: "#a21caf", programs: ["DPL"] },
  { key: "ea", label: "Elite Academy", color: "#c2410c", programs: ["EA", "EA2"] },
  { key: "rl", label: "ECNL RL", color: "#0891b2", programs: ["ECNL RL", "Pre-ECNL"] },
  { key: "n1", label: "N1 / NPL", color: "#ca8a04", programs: ["N1", "NPL", "GA Aspire", "USL Academy"] },
  { key: "other", label: "Other / local", color: "#6b7280", programs: [] },
];
/** every tier a club fields (a club in DPL, EA and NPL is in three); "other" when none */
const tiersOf = (programs: string[]) => {
  const ts = TIERS.filter((t) => t.programs.some((p) => programs.includes(p)));
  return ts.length ? ts : [TIERS[TIERS.length - 1]];
};
const programsFor = (c: MapClub, g: Gender) => (g === "All" ? c.programs : c.byGender?.[g]?.programs ?? []);
const teamsFor = (c: MapClub, g: Gender) => (g === "All" ? c.teams : c.byGender?.[g]?.teams ?? 0);
const leagueLine = (c: MapClub) => (["Boys", "Girls"] as const)
  .filter((g) => c.byGender?.[g]?.teams)
  .map((g) => `${g}: ${c.byGender![g].programs.length ? c.byGender![g].programs.join(", ") : "local leagues"}`).join(" · ");

export function ClubMap({ clubs, token }: { clubs: MapClub[]; token: string | undefined }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const [on, setOn] = useState<Set<string>>(() => new Set(TIERS.map((t) => t.key)));
  const [rankedOnly, setRankedOnly] = useState(false);
  const [gender, setGender] = useState<Gender>("All");

  const geojson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: clubs
      // a club shows when any league it fields (for the chosen gender) is switched on
      .filter((c) => !c.byGender || teamsFor(c, gender) > 0)
      .map((c) => ({ c, tier: tiersOf(programsFor(c, gender)).find((t) => on.has(t.key)) }))
      .filter((x): x is { c: MapClub; tier: (typeof TIERS)[number] } => !!x.tier && (!rankedOnly || x.c.listed > 0))
      .map(({ c, tier }) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
        properties: { club: c.club, site: c.site ?? "", city: c.city ?? "", venue: c.venue ?? "", teams: c.teams, listed: c.listed, tier: tier.label, color: tier.color,
          leagues: leagueLine(c) || c.programs.join(", ") },
      })),
  }), [clubs, on, rankedOnly, gender]);

  // create the map once (browser only). The basemap follows the site theme (<html class="dark">,
  // see theme-toggle.tsx): Mapbox light-v11 / dark-v11, swapped live when the theme changes.
  const geoRef = useRef(geojson);
  useEffect(() => {
    if (!token || !el.current || map.current) return;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    const isDark = () => document.documentElement.classList.contains("dark");
    const styleUrl = (dark: boolean) => `mapbox://styles/mapbox/${dark ? "dark" : "light"}-v11`;
    import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (cancelled || !el.current) return;
      mapboxgl.accessToken = token;
      let dark = isDark();
      const m = new mapboxgl.Map({ container: el.current, style: styleUrl(dark), center: [-117.9, 33.85], zoom: 7.2 });
      m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.current = m;
      // a new style drops our source and layer: add them on every style load
      m.on("style.load", () => {
        if (m.getSource("clubs")) return;
        m.addSource("clubs", { type: "geojson", data: geoRef.current });
        m.addLayer({
          id: "clubs", type: "circle", source: "clubs",
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": ["interpolate", ["linear"], ["get", "teams"], 1, 4, 20, 7, 80, 12],
            "circle-opacity": 0.85, "circle-stroke-color": dark ? "#1a1919" : "#ffffff", "circle-stroke-width": 1,
          },
        });
      });
      observer = new MutationObserver(() => {
        if (isDark() === dark) return;
        dark = isDark();
        m.setStyle(styleUrl(dark));
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      m.on("mouseenter", "clubs", () => { m.getCanvas().style.cursor = "pointer"; });
      m.on("mouseleave", "clubs", () => { m.getCanvas().style.cursor = ""; });
      m.on("click", "clubs", (e) => {
        // GeoJSON typings aren't installed; the layer only holds our Point features
        const f = e.features?.[0] as unknown as { geometry: { type: string; coordinates: [number, number] }; properties: Record<string, string | number> } | undefined;
        if (!f || f.geometry.type !== "Point") return;
        const p = f.properties;
        const box = document.createElement("div");
        box.className = "club-popup-body";
        const a = document.createElement("a");
        a.href = `/club/${encodeURIComponent(String(p.club))}`;
        a.textContent = String(p.club);
        a.className = "club-popup-title";
        const meta = document.createElement("div");
        meta.className = "club-popup-meta";
        meta.textContent = `${p.teams} teams (${p.listed} ranked)${p.city ? ` · ${p.city}` : ""}`;
        box.append(a, meta);
        if (p.leagues) {
          const l = document.createElement("div");
          l.className = "club-popup-meta";
          l.textContent = String(p.leagues);
          box.append(l);
        }
        if (p.venue) {
          const v = document.createElement("div");
          v.className = "club-popup-venue";
          v.textContent = p.site ? `Site: ${p.site} (one of the club's sites)` : `Home field: ${p.venue}`;
          box.append(v);
        }
        new mapboxgl.Popup({ offset: 10, className: "club-popup", maxWidth: "280px" }).setLngLat(f.geometry.coordinates).setDOMContent(box).addTo(m);
      });
    });
    return () => { cancelled = true; observer?.disconnect(); map.current?.remove(); map.current = null; };
    // geojson is applied by the effect below once the source exists
  }, [token]);

  // filters
  useEffect(() => {
    geoRef.current = geojson; // for the next style load (theme switch)
    const src = map.current?.getSource("clubs") as GeoJSONSource | undefined;
    src?.setData(geojson);
  }, [geojson]);

  if (!token) {
    return (
      <div className="surface p-6 text-sm text-muted-foreground">
        The map needs a Mapbox token. Add <code>NEXT_PUBLIC_MAPBOX_TOKEN=pk.…</code>{" "}to <code>.env.local</code>{" "}and restart
        the dev server.
      </div>
    );
  }
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        {TIERS.map((t) => (
          <button key={t.key} type="button" aria-pressed={on.has(t.key)}
            onClick={() => setOn((s) => { const n = new Set(s); if (n.has(t.key)) n.delete(t.key); else n.add(t.key); return n; })}
            className={`flex items-center gap-1.5 rounded-full bg-card px-3 py-1 shadow-[var(--surface-shadow)] ${on.has(t.key) ? "" : "opacity-40"}`}>
            <span className="inline-block size-2.5 rounded-full" style={{ background: t.color }} aria-hidden />
            {t.label}
          </button>
        ))}
        <span className="ml-2 inline-flex overflow-hidden rounded-full bg-card shadow-[var(--surface-shadow)]" role="group" aria-label="Teams">
          {(["All", "Boys", "Girls"] as const).map((g) => (
            <button key={g} type="button" aria-pressed={gender === g} onClick={() => setGender(g)}
              className={`px-3 py-1 ${gender === g ? "bg-foreground text-background" : ""}`}>{g}</button>
          ))}
        </span>
        <label className="ml-2 flex items-center gap-1.5">
          <input type="checkbox" checked={rankedOnly} onChange={(e) => setRankedOnly(e.target.checked)} />
          Only clubs with a ranked team
        </label>
        <span className="ml-auto text-xs text-muted-foreground">
          {new Set(geojson.features.map((f) => f.properties.club)).size} clubs shown
        </span>
      </div>
      <div ref={el} className="h-[70vh] w-full overflow-hidden rounded-[var(--radius-surface)] shadow-[var(--surface-shadow)]" />
    </div>
  );
}
