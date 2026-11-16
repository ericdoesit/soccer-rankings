"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapboxMap, GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

export interface MapClub {
  club: string; lat: number; lng: number; city: string | null; venue: string | null;
  /** set when the club has several sites (one dot each) */
  site?: string;
  teams: number; listed: number; programs: string[];
}

/** Highest league a club fields, in this order; colours follow it. */
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
const tierOf = (programs: string[]) => TIERS.find((t) => t.programs.some((p) => programs.includes(p))) ?? TIERS[TIERS.length - 1];

export function ClubMap({ clubs, token }: { clubs: MapClub[]; token: string | undefined }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapboxMap | null>(null);
  const [on, setOn] = useState<Set<string>>(() => new Set(TIERS.map((t) => t.key)));
  const [rankedOnly, setRankedOnly] = useState(false);

  const geojson = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: clubs
      .map((c) => ({ c, tier: tierOf(c.programs) }))
      .filter(({ c, tier }) => on.has(tier.key) && (!rankedOnly || c.listed > 0))
      .map(({ c, tier }) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [c.lng, c.lat] },
        properties: { club: c.club, site: c.site ?? "", city: c.city ?? "", venue: c.venue ?? "", teams: c.teams, listed: c.listed, tier: tier.label, color: tier.color, programs: c.programs.join(", ") },
      })),
  }), [clubs, on, rankedOnly]);

  // create the map once (browser only)
  useEffect(() => {
    if (!token || !el.current || map.current) return;
    let cancelled = false;
    import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (cancelled || !el.current) return;
      mapboxgl.accessToken = token;
      const m = new mapboxgl.Map({ container: el.current, style: "mapbox://styles/mapbox/light-v11", center: [-117.9, 33.85], zoom: 7.2 });
      m.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.current = m;
      m.on("load", () => {
        m.addSource("clubs", { type: "geojson", data: geojson });
        m.addLayer({
          id: "clubs", type: "circle", source: "clubs",
          paint: {
            "circle-color": ["get", "color"],
            "circle-radius": ["interpolate", ["linear"], ["get", "teams"], 1, 4, 20, 7, 80, 12],
            "circle-opacity": 0.85, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1,
          },
        });
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
          meta.textContent = `${p.tier} · ${p.teams} teams (${p.listed} ranked)${p.city ? ` · ${p.city}` : ""}`;
          box.append(a, meta);
          if (p.venue) {
            const v = document.createElement("div");
            v.className = "club-popup-venue";
            v.textContent = p.site ? `Site: ${p.site} (one of the club's sites)` : `Home field: ${p.venue}`;
            box.append(v);
          }
          new mapboxgl.Popup({ offset: 10, className: "club-popup", maxWidth: "280px" }).setLngLat(f.geometry.coordinates).setDOMContent(box).addTo(m);
        });
      });
    });
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
    // geojson is applied by the effect below once the source exists
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // filters
  useEffect(() => {
    const src = map.current?.getSource("clubs") as GeoJSONSource | undefined;
    src?.setData(geojson);
  }, [geojson]);

  if (!token) {
    return (
      <div className="surface p-6 text-sm text-muted-foreground">
        The map needs a Mapbox token. Add <code>NEXT_PUBLIC_MAPBOX_TOKEN=pk.…</code> to <code>.env.local</code> and restart
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
