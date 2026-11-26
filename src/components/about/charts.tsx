"use client";

/**
 * About page charts, ported from the Pitfalls on the Pathway D3 chart kit
 * (~/Documents/Claude/soccer/report/charts.js): solid flat fills from --ch-* tokens, hairline
 * grid, 10–12px labels, one shared tooltip, redraw on resize. Colours live in globals.css.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";

type Palette = Record<"gold" | "blue" | "red" | "green" | "dim" | "ink" | "grid" | "text" | "muted", string>;
function palette(): Palette {
  const s = getComputedStyle(document.documentElement);
  const v = (k: string) => s.getPropertyValue(k).trim();
  return {
    gold: v("--ch-gold"), blue: v("--ch-blue"), red: v("--ch-red"), green: v("--ch-green"),
    dim: v("--ch-dim"), ink: v("--ch-ink"), grid: v("--ch-grid"), text: v("--foreground"), muted: v("--muted-foreground"),
  };
}

/** one tooltip for every chart on the page */
function tipEl() {
  let t = document.getElementById("chart-tip");
  if (!t) { t = document.createElement("div"); t.id = "chart-tip"; document.body.appendChild(t); }
  return t;
}
function showTip(ev: MouseEvent, html: string) {
  const t = tipEl();
  t.style.display = "block";
  t.innerHTML = html;
  let x = ev.clientX + 14;
  if (x + 290 > window.innerWidth) x = ev.clientX - 290;
  t.style.left = `${Math.max(8, x)}px`;
  t.style.top = `${ev.clientY - 10}px`;
}
const hideTip = () => { const t = document.getElementById("chart-tip"); if (t) t.style.display = "none"; };

/** width of an element, re-measured on resize and on theme change (colours are read at draw time) */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  const [, setTheme] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    const mo = new MutationObserver(() => setTheme((n) => n + 1));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, []);
  return [ref, w] as const;
}

/* ───────────── horizontal bars (charts.js hBars) ───────────── */
export function HBars({ rows, valFmt = (v) => v.toLocaleString() }: {
  rows: Array<{ label: string; v: number; c: keyof Palette; end?: string; tip?: string }>;
  valFmt?: (v: number) => string;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  useEffect(() => {
    const el = ref.current;
    if (!el || !W) return;
    const P = palette();
    el.innerHTML = "";
    // narrow screens: row labels sit above the bars so bars get the full width
    const narrow = W < 520;
    const m = narrow ? { top: 4, right: 12, bottom: 26, left: 4 } : { top: 4, right: 120, bottom: 26, left: 190 };
    const barH = 26, gap = 10, labelH = narrow ? 17 : 0, step = barH + gap + labelH;
    const H = m.top + m.bottom + rows.length * step;
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H);
    const x = d3.scaleLinear().domain([0, d3.max(rows, (r) => r.v) ?? 1]).range([m.left, W - m.right]);
    const ticks = x.ticks(narrow ? 3 : 5);
    svg.append("g").selectAll("line").data(ticks).join("line")
      .attr("x1", (d) => x(d)).attr("x2", (d) => x(d)).attr("y1", m.top).attr("y2", H - m.bottom).attr("stroke", P.grid);
    svg.append("g").selectAll("text").data(ticks).join("text")
      .attr("x", (d) => x(d)).attr("y", H - 8).attr("text-anchor", "middle")
      .attr("fill", P.muted).attr("font-size", "11px").text((d) => valFmt(d));
    rows.forEach((r, i) => {
      const y = m.top + i * step + labelH;
      const bw = Math.max(2, x(r.v) - x(0));
      svg.append("rect").attr("x", x(0)).attr("y", y).attr("width", bw).attr("height", barH).attr("rx", 3).attr("fill", P[r.c])
        .on("mousemove", (ev) => showTip(ev, `<strong>${r.label}</strong><br>${r.tip ?? valFmt(r.v)}`))
        .on("mouseleave", hideTip);
      const end = r.end ?? valFmt(r.v);
      if (narrow) {
        svg.append("text").attr("x", m.left).attr("y", y - 5).attr("fill", P.text).attr("font-size", "11px").text(r.label);
        const ex = x(0) + bw + 6, fits = ex < W - m.right - 8 * end.length;
        svg.append("text").attr("x", fits ? ex : W - m.right).attr("y", fits ? y + barH / 2 + 4 : y - 5)
          .attr("text-anchor", fits ? "start" : "end").attr("fill", P.text).attr("font-size", "11px").attr("font-weight", 600).text(end);
      } else {
        svg.append("text").attr("x", m.left - 10).attr("y", y + barH / 2 + 4).attr("text-anchor", "end")
          .attr("fill", P.text).attr("font-size", "12px").text(r.label);
        svg.append("text").attr("x", x(0) + bw + 8).attr("y", y + barH / 2 + 4)
          .attr("fill", P.text).attr("font-size", "12px").attr("font-weight", 600).text(end);
      }
    });
    return hideTip;
  });
  return <div ref={ref} className="d3-chart" />;
}

/* ───────────── paired horizontal bars: two values per row (e.g. predicted vs actual) ───────────── */
export function PairedBars({ rows, series, max = 1, valFmt = (v) => `${Math.round(v * 100)}%` }: {
  rows: Array<{ label: string; a: number; b: number; tip?: string }>;
  series: [{ name: string; c: keyof Palette }, { name: string; c: keyof Palette }];
  max?: number;
  valFmt?: (v: number) => string;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  useEffect(() => {
    const el = ref.current;
    if (!el || !W) return;
    const P = palette();
    el.innerHTML = "";
    const narrow = W < 520;
    const m = narrow ? { top: 4, right: 44, bottom: 26, left: 4 } : { top: 4, right: 56, bottom: 26, left: 150 };
    const barH = 13, inner = 3, gap = 14, labelH = narrow ? 17 : 0, step = barH * 2 + inner + gap + labelH;
    const H = m.top + m.bottom + rows.length * step;
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H);
    const x = d3.scaleLinear().domain([0, max]).range([m.left, W - m.right]);
    const ticks = x.ticks(narrow ? 4 : 5);
    svg.append("g").selectAll("line").data(ticks).join("line")
      .attr("x1", (d) => x(d)).attr("x2", (d) => x(d)).attr("y1", m.top).attr("y2", H - m.bottom).attr("stroke", P.grid);
    svg.append("g").selectAll("text").data(ticks).join("text")
      .attr("x", (d) => x(d)).attr("y", H - 8).attr("text-anchor", "middle")
      .attr("fill", P.muted).attr("font-size", "11px").text((d) => valFmt(d));
    rows.forEach((r, i) => {
      const y = m.top + i * step + labelH;
      if (narrow) svg.append("text").attr("x", m.left).attr("y", y - 5).attr("fill", P.text).attr("font-size", "11px").text(r.label);
      else svg.append("text").attr("x", m.left - 10).attr("y", y + barH + inner / 2 + 4).attr("text-anchor", "end")
        .attr("fill", P.text).attr("font-size", "12px").text(r.label);
      ([r.a, r.b] as const).forEach((v, k) => {
        const yy = y + k * (barH + inner), bw = Math.max(2, x(v) - x(0));
        svg.append("rect").attr("x", x(0)).attr("y", yy).attr("width", bw).attr("height", barH).attr("rx", 2).attr("fill", P[series[k].c])
          .on("mousemove", (ev) => showTip(ev, `<strong>${r.label}</strong><br>${series[k].name}: ${valFmt(v)}${r.tip ? `<br>${r.tip}` : ""}`))
          .on("mouseleave", hideTip);
        svg.append("text").attr("x", x(0) + bw + 6).attr("y", yy + barH / 2 + 4)
          .attr("fill", P.text).attr("font-size", "11px").attr("font-weight", k ? 600 : 400).text(valFmt(v));
      });
    });
    return hideTip;
  });
  return (
    <div>
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.name} className="legend-item">
            <span style={{ width: 10, height: 10, borderRadius: 2, background: `var(--ch-${s.c})`, display: "inline-block" }} />{s.name}
          </span>
        ))}
      </div>
      <div ref={ref} className="d3-chart" />
    </div>
  );
}

/* ───────────── league overlap: count-scaled rating densities ───────────── */

/** League colours: one hue per league family, dashed line for its second tier. */
const LEAGUE_STYLE: Record<string, { c: keyof Palette; dash?: string }> = {
  "MLS NEXT HD": { c: "red" }, "MLS NEXT AD": { c: "red", dash: "6 4" },
  "ECNL": { c: "blue" }, "ECNL RL": { c: "blue", dash: "6 4" }, "Pre-ECNL": { c: "blue", dash: "2 3" },
  "GA": { c: "red" }, "GA Aspire": { c: "red", dash: "6 4" },
  "EA": { c: "green" }, "EA2": { c: "green", dash: "6 4" }, "DPL": { c: "green" },
  "N1": { c: "gold" },
  "SoCal Soccer League": { c: "ink" }, "SoCal Pre-Elite": { c: "dim" }, "SoCal F1": { c: "ink" }, "SoCal F2": { c: "ink", dash: "6 4" }, "SoCal F3": { c: "ink", dash: "2 3" }, "SoCal F4": { c: "dim", dash: "2 3" }, "Coast Soccer League": { c: "ink", dash: "6 4" }, "PSSLU": { c: "ink", dash: "2 3" }, "SGV Soccer League": { c: "dim" }, "Southwest Super League": { c: "dim", dash: "6 4" },
};
/** Boys pyramid level from Pitfalls on the Pathway (report/ecosystem.html): 1 Pro Pipeline … 5 Regional Travel. */
const PYRAMID_LEVEL: Record<string, number> = {
  "MLS NEXT HD": 1, "ECNL": 2, "MLS NEXT AD": 3, "ECNL RL": 3, "N1": 3, "EA": 3,
  "EA2": 4, "Pre-ECNL": 4, "SoCal Soccer League": 5, "SoCal Pre-Elite": 5, "SoCal F1": 5, "SoCal F2": 5, "SoCal F3": 5, "SoCal F4": 5, "Coast Soccer League": 5, "PSSLU": 5, "SGV Soccer League": 5, "Southwest Super League": 5,
};
const PYRAMID_URL = "https://pitfalls-on-the-pathway.vercel.app/report/ecosystem.html";
const MIN_TEAMS = 5;
/** state / district leagues: off by default so the elite-league curves aren't dwarfed */
const LOCAL = new Set(["SoCal Soccer League", "SoCal Pre-Elite", "SoCal F1", "SoCal F2", "SoCal F3", "SoCal F4", "Coast Soccer League", "PSSLU", "SGV Soccer League", "Southwest Super League"]);

/** Gaussian KDE scaled by team count, so a bigger league draws a bigger curve. */
function density(values: number[], xs: number[], bw: number) {
  const k = 1 / (bw * Math.sqrt(2 * Math.PI));
  return xs.map((x) => values.reduce((s, v) => s + k * Math.exp(-0.5 * ((x - v) / bw) ** 2), 0));
}
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };

export function LeagueOverlap({ groups, order, initial = "U15|Boys" }: {
  groups: Record<string, Record<string, number[]>>;
  order: string[];
  initial?: string;
}) {
  const ages = useMemo(() => [...new Set(Object.keys(groups).map((k) => k.split("|")[0]))]
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))), [groups]);
  const [age, setAge] = useState(initial.split("|")[0]);
  const [gender, setGender] = useState(initial.split("|")[1]);
  // "count": curve area = number of teams (the original chart); "share": every league the same size
  const [scale, setScale] = useState<"count" | "share">("count");
  const [showLocal, setShowLocal] = useState(false);
  const shown = (l: string) => showLocal || !LOCAL.has(l);
  const level = (l: string) => (gender === "Boys" ? PYRAMID_LEVEL[l] : undefined);
  const leagues = useMemo(() => {
    const g = groups[`${age}|${gender}`] ?? {};
    return order.filter((l) => shown(l) && (g[l]?.length ?? 0) >= MIN_TEAMS)
      .map((l) => ({ league: l, values: g[l], med: median(g[l]) }))
      .sort((a, b) => b.med - a.med); // legend reads top league first, like the triangles right to left
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, order, age, gender, showLocal]);
  const hidden = useMemo(() => {
    const g = groups[`${age}|${gender}`] ?? {};
    return order.filter((l) => shown(l) && g[l]?.length && g[l].length < MIN_TEAMS).map((l) => `${l} (${g[l].length})`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, order, age, gender, showLocal]);

  const [ref, W] = useWidth<HTMLDivElement>();
  useEffect(() => {
    const el = ref.current;
    if (!el || !W) return;
    const P = palette();
    el.innerHTML = "";
    if (!leagues.length) return;
    const narrow = W < 520;
    const H = narrow ? 268 : 328;
    const m = { top: 12, right: 12, bottom: 52, left: narrow ? 44 : 60 };
    const all = leagues.flatMap((l) => l.values);
    const lo = Math.floor((d3.min(all) ?? 0) - 1), hi = Math.ceil((d3.max(all) ?? 1) + 1);
    const xs = d3.range(lo, hi + 0.001, (hi - lo) / 160);
    const curves = leagues.map((l) => {
      const ys = density(l.values, xs, 0.6);
      return { ...l, ys: scale === "share" ? ys.map((v) => v / l.values.length) : ys };
    });
    const x = d3.scaleLinear().domain([lo, hi]).range([m.left, W - m.right]);
    const y = d3.scaleLinear().domain([0, (d3.max(curves, (c) => d3.max(c.ys)) ?? 1) * 1.08]).range([H - m.bottom, m.top]);
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H).style("overflow", "visible");

    // y: teams per rating point (count), or % of the league's teams per rating point (share)
    const yt = y.ticks(narrow ? 4 : 5);
    const yFmt = (d: number) => (scale === "share" ? `${Math.round(d * 100)}%` : `${d}`);
    svg.append("g").selectAll("line").data(yt).join("line")
      .attr("x1", m.left).attr("x2", W - m.right).attr("y1", (d) => y(d)).attr("y2", (d) => y(d)).attr("stroke", P.grid);
    svg.append("g").selectAll("text").data(yt).join("text")
      .attr("x", m.left - 8).attr("y", (d) => y(d) + 4).attr("text-anchor", "end")
      .attr("fill", P.muted).attr("font-size", "11px").text(yFmt);

    const xt = x.ticks(narrow ? 5 : 8);
    svg.append("g").selectAll("line").data(xt).join("line")
      .attr("x1", (d) => x(d)).attr("x2", (d) => x(d)).attr("y1", m.top).attr("y2", H - m.bottom).attr("stroke", P.grid);
    svg.append("g").selectAll("text").data(xt).join("text")
      .attr("x", (d) => x(d)).attr("y", H - m.bottom + 18).attr("text-anchor", "middle")
      .attr("fill", P.muted).attr("font-size", "11px").text((d) => d);
    svg.append("text").attr("x", (m.left + W - m.right) / 2).attr("y", H - 10).attr("text-anchor", "middle")
      .attr("fill", P.muted).attr("font-size", "11px").text("Team rating (goals)");
    svg.append("text").attr("transform", `translate(10 ${(m.top + H - m.bottom) / 2}) rotate(-90)`).attr("text-anchor", "middle")
      .attr("fill", P.muted).attr("font-size", "11px").text(scale === "share" ? (narrow ? "Share per point" : "Share of league per rating point") : (narrow ? "Teams per point" : "Teams per rating point"));

    const area = d3.area<number>().x((_, i) => x(xs[i])).y0(y(0)).y1((d) => y(d)).curve(d3.curveBasis);
    const line = d3.line<number>().x((_, i) => x(xs[i])).y((d) => y(d)).curve(d3.curveBasis);
    for (const c of curves) {
      const st = LEAGUE_STYLE[c.league] ?? { c: "dim" as const };
      svg.append("path").attr("d", area(c.ys)).attr("fill", P[st.c]).attr("fill-opacity", st.c === "ink" ? 0.04 : 0.08);
      svg.append("path").attr("d", line(c.ys)).attr("fill", "none").attr("stroke", P[st.c]).attr("stroke-width", 2.25)
        .attr("stroke-dasharray", st.dash ?? null);
      // median: a small triangle on the axis
      const mx = x(c.med), by = H - m.bottom;
      svg.append("path").attr("d", `M${mx},${by + 1} l-5,9 h10 z`).attr("fill", P[st.c])
        .on("mousemove", (ev) => showTip(ev, `<strong>${c.league}</strong>${level(c.league) ? ` · level ${level(c.league)}` : ""}<br>median ${c.med.toFixed(1)} · ${c.values.length} teams`))
        .on("mouseleave", hideTip);
    }
    svg.append("line").attr("x1", m.left).attr("x2", W - m.right).attr("y1", H - m.bottom).attr("y2", H - m.bottom).attr("stroke", P.muted).attr("stroke-opacity", 0.4);

    // hover: the number of teams per league near the pointer
    const guide = svg.append("line").attr("y1", m.top).attr("y2", H - m.bottom).attr("stroke", P.muted).attr("stroke-dasharray", "3 3").style("display", "none");
    svg.append("rect").attr("x", m.left).attr("y", m.top).attr("width", W - m.left - m.right).attr("height", H - m.top - m.bottom)
      .attr("fill", "transparent")
      .on("mousemove", (ev) => {
        const [px] = d3.pointer(ev);
        const r = x.invert(px);
        guide.style("display", null).attr("x1", px).attr("x2", px);
        const rows = curves.map((c) => ({ c, n: c.values.filter((v) => Math.abs(v - r) <= 0.5).length })).filter((o) => o.n);
        showTip(ev, `<strong>Rating ${(r - 0.5).toFixed(1)} – ${(r + 0.5).toFixed(1)}</strong><br>` +
          (rows.length ? rows.map((o) => `${o.c.league}: <strong>${o.n}</strong>`).join("<br>") : "no teams"));
      })
      .on("mouseleave", () => { guide.style("display", "none"); hideTip(); });
    return hideTip;
  });

  const pill = (on: boolean) => `rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${on ? "bg-foreground text-background" : "bg-muted text-foreground hover:bg-[var(--press)]"}`;
  const legend = leagues.map(({ league, values, med }) => {
    const st = LEAGUE_STYLE[league] ?? { c: "dim" as const };
    return (
      <div key={league} className="flex items-start gap-2.5">
        <svg width="26" height="12" className="mt-1 shrink-0" aria-hidden>
          <line x1="0" x2="26" y1="6" y2="6" stroke={`var(--ch-${st.c})`} strokeWidth="3" strokeDasharray={st.dash} />
        </svg>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-semibold leading-tight text-foreground">
            {league}
            {level(league) && (
              <span title={`Pyramid level ${level(league)}`} className="rounded-full border border-[var(--surface-line)] px-1.5 text-[10px] font-semibold leading-4 tabular-nums text-muted-foreground">
                L{level(league)}
              </span>
            )}
          </div>
          <div className="text-xs tabular-nums text-muted-foreground">median {med.toFixed(1)} · {values.length} teams</div>
        </div>
      </div>
    );
  });
  return (
    <div>
      <h3 className="heading-sm">How {age} {gender}&rsquo; SoCal Leagues Overlap in Quality</h3>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        {`Distribution of team ratings for rated ${age} ${gender.toLowerCase()} Cal South teams in each league, 2026/27. Triangles mark each league’s median.`}
      </p>
      <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Gender">
        {["Boys", "Girls"].map((g) => <button key={g} type="button" className={pill(g === gender)} onClick={() => setGender(g)}>{g}</button>)}
      </div>
      <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Age group">
        {ages.map((a) => <button key={a} type="button" className={pill(a === age)} onClick={() => setAge(a)}>{a}</button>)}
      </div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        <button type="button" className={pill(scale === "count")} onClick={() => setScale("count")}>Number of teams</button>
        <button type="button" className={pill(scale === "share")} onClick={() => setScale("share")}>Share of each league</button>
        <button type="button" aria-pressed={showLocal} className={pill(showLocal)} onClick={() => setShowLocal((v) => !v)}>
          {showLocal ? "✓ " : "+ "}Local leagues (SoCal F1, CSL, PSSLU, SGV, SWSL)
        </button>
      </div>
      {/* legend beside the chart on wide screens (League → median · teams), above it on phones */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-8">
        <div className="min-w-0 lg:order-1">
          <div ref={ref} className="d3-chart" />
          {!leagues.length && (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No league has {MIN_TEAMS}+ rated teams here{showLocal ? "" : " without the local leagues"}.
            </p>
          )}
        </div>
        {leagues.length > 0 && (
          <div className="grid grid-cols-2 content-start gap-x-4 gap-y-3 sm:grid-cols-3 lg:order-2 lg:grid-cols-1 lg:pt-2">
            <p className="col-span-full text-xs font-semibold text-muted-foreground">
              League{gender === "Boys" ? " · pyramid level" : ""}
            </p>
            {legend}
          </div>
        )}
      </div>
      {leagues.length > 0 && (
        <p className="mt-4 border-t border-[var(--surface-line)] pt-3 text-xs leading-relaxed text-muted-foreground">
          {scale === "share"
            ? `Each curve is scaled to its own league, so every league has the same area and small leagues are as easy to read as big ones.`
            : `The area under each curve equals the league's number of rated ${age} ${gender.toLowerCase()} teams, so height shows both quality and quantity.`}{" "}
          Each team counts in the league it played most in 2026/27 (at least 5 games there; summer and winter leagues don’t count) and has at least 10 rated games. MLS NEXT HD is the
          Homegrown Division (Flex games included), AD the Academy Division.
        </p>
      )}
      {leagues.length > 0 && gender === "Boys" && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          L1–L5 are the levels of the{" "}
          <a href={PYRAMID_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">
            Pitfalls on the Pathway boys pyramid
          </a>
          : L1 Pro Pipeline, L2 National Elite, L3 National Competitive, L4 Regional/National Bridge, L5 Regional Travel.
          Where a league with a higher level number sits above one with a lower number, results disagree with the pyramid.
        </p>
      )}
      {hidden.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">Not drawn (fewer than {MIN_TEAMS} teams): {hidden.join(", ")}.</p>
      )}
    </div>
  );
}

/* ───────────── league ranges: how firm each league's level is ───────────── */

type Range = { median: number; lo: number; hi: number; teams: number; crossGames: number };
const LEVEL_COLOR: Record<number, keyof Palette> = { 1: "gold", 2: "red", 3: "blue", 4: "green", 5: "ink" };

/**
 * One row per league: the bar is the 80% range of its median rating over the bootstrap re-runs
 * (scripts/league-ranges.ts), the dot the median; the end label the games linking it to other leagues.
 */
export function LeagueRanges({ groups, events, leagues, replicates, initial = "U15" }: {
  groups: Record<string, Record<string, Range>>;
  events: Array<{ event: string; shifts: Record<string, Record<string, number>> }>;
  /** leagues to draw, in tie-break order */
  leagues: string[];
  replicates: number;
  initial?: string;
}) {
  const ages = useMemo(() => Object.keys(groups).filter((k) => k.endsWith("|Boys")).map((k) => k.split("|")[0])
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))), [groups]);
  const [age, setAge] = useState(ages.includes(initial) ? initial : ages[0]);
  const key = `${age}|Boys`;
  const rows = useMemo(() => Object.entries(groups[key] ?? {}).filter(([l]) => leagues.includes(l))
    .map(([league, r]) => ({ league, ...r, level: PYRAMID_LEVEL[league] }))
    .sort((a, b) => b.median - a.median), [groups, key, leagues]);
  // the one-event test: the biggest move any single tournament causes at this age
  const biggest = useMemo(() => {
    let best: { event: string; league: string; d: number } | null = null;
    for (const e of events) for (const [l, d] of Object.entries(e.shifts[key] ?? {})) {
      if (!leagues.includes(l)) continue;
      if (!best || Math.abs(d) > Math.abs(best.d)) best = { event: e.event, league: l, d };
    }
    return best;
  }, [events, key, leagues]);

  const [ref, W] = useWidth<HTMLDivElement>();
  useEffect(() => {
    const el = ref.current;
    if (!el || !W || !rows.length) return;
    const P = palette();
    el.innerHTML = "";
    const narrow = W < 520;
    const rowH = narrow ? 40 : 30, top = 6;
    const m = { left: narrow ? 8 : 170, right: narrow ? 8 : 120 };
    const H = top + rows.length * rowH + 30;
    const lo = Math.floor(d3.min(rows, (r) => r.lo)! - 0.5), hi = Math.ceil(d3.max(rows, (r) => r.hi)! + 0.5);
    const x = d3.scaleLinear().domain([lo, hi]).range([m.left, W - m.right]);
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H);
    const xt = x.ticks(narrow ? 5 : 8);
    svg.append("g").selectAll("line").data(xt).join("line")
      .attr("x1", (d) => x(d)).attr("x2", (d) => x(d)).attr("y1", top).attr("y2", H - 24).attr("stroke", P.grid);
    svg.append("g").selectAll("text").data(xt).join("text")
      .attr("x", (d) => x(d)).attr("y", H - 8).attr("text-anchor", "middle").attr("fill", P.muted).attr("font-size", "11px").text((d) => d);
    rows.forEach((r, i) => {
      const y = top + i * rowH + (narrow ? 26 : rowH / 2);
      const c = P[LEVEL_COLOR[r.level ?? 5] ?? "ink"];
      const label = `${r.league}${r.level ? ` · L${r.level}` : ""}`;
      if (narrow) svg.append("text").attr("x", m.left).attr("y", y - 11).attr("fill", P.text).attr("font-size", "11px").text(`${label} · ${r.crossGames} games vs other leagues`);
      else {
        svg.append("text").attr("x", m.left - 12).attr("y", y + 4).attr("text-anchor", "end").attr("fill", P.text).attr("font-size", "12px").text(label);
        svg.append("text").attr("x", W - m.right + 12).attr("y", y + 4).attr("fill", P.muted).attr("font-size", "11px").text(`${r.crossGames} games vs others`);
      }
      svg.append("line").attr("x1", x(r.lo)).attr("x2", x(r.hi)).attr("y1", y).attr("y2", y)
        .attr("stroke", c).attr("stroke-opacity", 0.35).attr("stroke-width", 9).attr("stroke-linecap", "round");
      svg.append("circle").attr("cx", x(r.median)).attr("cy", y).attr("r", 5).attr("fill", c).attr("stroke", P.text).attr("stroke-opacity", r.level === 1 ? 0.5 : 0);
      svg.append("rect").attr("x", 0).attr("y", y - rowH / 2).attr("width", W).attr("height", rowH).attr("fill", "transparent")
        .on("mousemove", (ev) => showTip(ev, `<strong>${r.league}</strong><br>median ${r.median.toFixed(1)}, likely ${r.lo.toFixed(1)} – ${r.hi.toFixed(1)}<br>${r.teams} teams · ${r.crossGames} games vs other leagues`))
        .on("mouseleave", hideTip);
    });
    return hideTip;
  });

  const pill = (on: boolean) => `rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${on ? "bg-foreground text-background" : "bg-muted text-foreground hover:bg-[var(--press)]"}`;
  return (
    <div>
      <h3 className="heading-sm">How Sure Is Each League&rsquo;s Level? {age} Boys, Cal South</h3>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">
        Dot: the league&rsquo;s median team rating. Bar: where it landed in 80% of {replicates} re-runs of the ratings,
        each with the games between leagues reshuffled. A wide bar means few games tie the league to the others.
      </p>
      <div className="mb-5 flex flex-wrap gap-1.5" role="group" aria-label="Age group">
        {ages.map((a) => <button key={a} type="button" className={pill(a === age)} onClick={() => setAge(a)}>{a}</button>)}
      </div>
      <div ref={ref} className="d3-chart" />
      {biggest && (
        <p className="mt-4 rounded-lg bg-muted px-4 py-3 text-sm leading-relaxed text-foreground">
          {Math.abs(biggest.d) >= 0.3
            ? <>One event matters: without <strong>{biggest.event}</strong>, {biggest.league}&rsquo;s median moves {biggest.d > 0 ? "up" : "down"} {Math.abs(biggest.d).toFixed(1)} goals. Its level leans on that event&rsquo;s results.</>
            : <>No single tournament carries a league: leaving out each league&rsquo;s biggest connecting event moves no {age} median by more than {Math.abs(biggest.d).toFixed(1)} goals.</>}
        </p>
      )}
    </div>
  );
}

/* ───────────── line over time (charts.js lineChart): one value per point, labelled ───────────── */
export function PointLine({ points, domain, valFmt = (v) => `${Math.round(v * 100)}%`, c = "blue" }: {
  points: Array<{ label: string; v: number; tip?: string }>;
  domain: [number, number];
  valFmt?: (v: number) => string;
  c?: keyof Palette;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  useEffect(() => {
    const el = ref.current;
    if (!el || !W) return;
    const P = palette();
    el.innerHTML = "";
    const narrow = W < 520;
    const m = { top: 22, right: narrow ? 36 : 16, bottom: narrow ? 40 : 28, left: 40 };
    const H = narrow ? 200 : 220;
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H);
    const x = d3.scalePoint<number>().domain(points.map((_, i) => i)).range([m.left + 10, W - m.right - 10]);
    const y = d3.scaleLinear().domain(domain).range([H - m.bottom, m.top]);
    const ticks = y.ticks(4);
    svg.append("g").selectAll("line").data(ticks).join("line")
      .attr("x1", m.left).attr("x2", W - m.right).attr("y1", (d) => y(d)).attr("y2", (d) => y(d)).attr("stroke", P.grid);
    svg.append("g").selectAll("text").data(ticks).join("text")
      .attr("x", m.left - 8).attr("y", (d) => y(d) + 4).attr("text-anchor", "end")
      .attr("fill", P.muted).attr("font-size", "11px").text((d) => valFmt(d));
    svg.append("path").datum(points)
      .attr("d", d3.line<(typeof points)[number]>().x((_, i) => x(i)!).y((p) => y(p.v)))
      .attr("fill", "none").attr("stroke", P[c]).attr("stroke-width", 2.5);
    points.forEach((p, i) => {
      svg.append("circle").attr("cx", x(i)!).attr("cy", y(p.v)).attr("r", 4.5).attr("fill", P[c])
        .on("mousemove", (ev) => showTip(ev, `<strong>${p.label}</strong><br>${p.tip ?? valFmt(p.v)}`))
        .on("mouseleave", hideTip);
      if (!narrow || i % 2 === 0 || i === points.length - 1)
        svg.append("text").attr("x", x(i)!).attr("y", y(p.v) - 10).attr("text-anchor", "middle")
          .attr("fill", P.text).attr("font-size", "11px").attr("font-weight", 600).text(valFmt(p.v));
      const lx = svg.append("text").attr("fill", P.muted).attr("font-size", "11px").text(p.label);
      if (narrow) lx.attr("transform", `translate(${x(i)! + 4},${H - m.bottom + 12}) rotate(35)`);
      else lx.attr("x", x(i)!).attr("y", H - 8).attr("text-anchor", "middle");
    });
    return hideTip;
  });
  return <div ref={ref} className="d3-chart" />;
}

/* ───────────── regression: game counts as shaded cells (or every game as a dot), bin means, fitted line ───────────── */
type Mark = "squares" | "dots";
export function RegressionChart({ cells, means, slope, intercept, xLabel, yLabel, pointsUrl, c = "blue" }: {
  cells: Array<{ x: number; y: number; n: number }>;
  means: Array<{ x: number; y: number; n: number }>;
  slope: number; intercept: number; xLabel: string; yLabel: string;
  /** per-game points ({ x: predicted ×10, y: actual }) for the "every game" view, fetched when first shown */
  pointsUrl?: string;
  c?: keyof Palette;
}) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const [mark, setMark] = useState<Mark>("squares");
  const [points, setPoints] = useState<{ x: number[]; y: number[] } | null>(null);
  const loading = mark === "dots" && !points;
  const choose = (k: Mark) => {
    setMark(k);
    if (k === "dots" && !points && pointsUrl) fetch(pointsUrl).then((r) => r.json()).then(setPoints).catch(() => setMark("squares"));
  };

  useEffect(() => {
    const el = ref.current;
    if (!el || !W) return;
    const t0 = performance.now();
    const P = palette();
    el.innerHTML = "";
    const narrow = W < 520;
    const m = { top: 12, right: 14, bottom: 40, left: 44 };
    const H = Math.min(W, narrow ? 340 : 440);
    const lim = 8;
    const x = d3.scaleLinear().domain([-lim, lim]).range([m.left, W - m.right]);
    const y = d3.scaleLinear().domain([-lim, lim]).range([H - m.bottom, m.top]);
    // every game: one canvas under the SVG (23,000 SVG circles would be slow to draw and hover)
    if (mark === "dots" && points) {
      const dpr = window.devicePixelRatio || 1;
      const cv = document.createElement("canvas");
      cv.width = W * dpr; cv.height = H * dpr;
      cv.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px`;
      el.style.position = "relative";
      el.appendChild(cv);
      const ctx = cv.getContext("2d")!;
      ctx.scale(dpr, dpr);
      ctx.beginPath();
      ctx.rect(m.left, m.top, W - m.left - m.right, H - m.top - m.bottom);
      ctx.clip();
      ctx.fillStyle = P[c];
      ctx.globalAlpha = narrow ? 0.22 : 0.16;
      // scores are whole goals: spread each dot a little (fixed seed, so it doesn't shimmer on redraw)
      let seed = 7;
      const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) - 0.5;
      const r = narrow ? 1.1 : 1.4;
      for (let i = 0; i < points.x.length; i++) {
        const px = x(points.x[i] / 10 + rand() * 0.1), py = y(points.y[i] + rand() * 0.7);
        ctx.beginPath(); ctx.arc(px, py, r, 0, 2 * Math.PI); ctx.fill();
      }
    }
    const svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H)
      .style("position", "relative");
    const ticks = [-8, -4, 0, 4, 8];
    const g = svg.append("g");
    for (const t of ticks) {
      g.append("line").attr("x1", x(t)).attr("x2", x(t)).attr("y1", m.top).attr("y2", H - m.bottom).attr("stroke", P.grid).attr("stroke-width", t === 0 ? 2 : 1);
      g.append("line").attr("x1", m.left).attr("x2", W - m.right).attr("y1", y(t)).attr("y2", y(t)).attr("stroke", P.grid).attr("stroke-width", t === 0 ? 2 : 1);
      g.append("text").attr("x", x(t)).attr("y", H - m.bottom + 15).attr("text-anchor", "middle").attr("fill", P.muted).attr("font-size", "11px").text(t > 0 ? `+${t}` : t);
      g.append("text").attr("x", m.left - 8).attr("y", y(t) + 4).attr("text-anchor", "end").attr("fill", P.muted).attr("font-size", "11px").text(t > 0 ? `+${t}` : t);
    }
    svg.append("text").attr("x", (m.left + W - m.right) / 2).attr("y", H - 6).attr("text-anchor", "middle").attr("fill", P.muted).attr("font-size", "11px").text(xLabel);
    svg.append("text").attr("transform", `translate(12,${(m.top + H - m.bottom) / 2}) rotate(-90)`).attr("text-anchor", "middle").attr("fill", P.muted).attr("font-size", "11px").text(yLabel);
    if (mark === "squares") {
      // each cell: half a goal wide (predicted), one goal tall (actual); shade by share of the busiest (square root)
      const shown = cells.filter((d) => Math.abs(d.x) < lim && Math.abs(d.y) < lim);
      const max = d3.max(shown, (d) => d.n) ?? 1;
      const cw = x(0.5) - x(0), ch = y(0) - y(1);
      svg.append("g").selectAll("rect").data(shown).join("rect")
        .attr("x", (d) => x(d.x - 0.25)).attr("y", (d) => y(d.y + 0.5)).attr("width", cw).attr("height", ch)
        .attr("fill", P[c]).attr("fill-opacity", (d) => 0.06 + 0.7 * Math.sqrt(d.n / max))
        .on("mousemove", (ev, d) => showTip(ev, `predicted ${d.x > 0 ? "+" : ""}${d.x}, actual ${d.y > 0 ? "+" : ""}${d.y}<br><strong>${d.n.toLocaleString()}</strong> games`))
        .on("mouseleave", hideTip);
    }
    // fitted line
    svg.append("line").attr("x1", x(-lim)).attr("y1", y(intercept - slope * lim)).attr("x2", x(lim)).attr("y2", y(intercept + slope * lim))
      .attr("stroke", P.red).attr("stroke-width", 2.5);
    // average actual margin per predicted bin
    svg.append("g").selectAll("circle").data(means.filter((d) => Math.abs(d.x) <= lim && Math.abs(d.y) <= lim)).join("circle")
      .attr("cx", (d) => x(d.x)).attr("cy", (d) => y(d.y)).attr("r", 3.5).attr("fill", P.ink)
      .on("mousemove", (ev, d) => showTip(ev, `predicted ${d.x > 0 ? "+" : ""}${d.x} goals<br>average actual <strong>${d.y > 0 ? "+" : ""}${d.y.toFixed(1)}</strong> over ${d.n.toLocaleString()} games`))
      .on("mouseleave", hideTip);
    el.dataset.drawMs = (performance.now() - t0).toFixed(1);
    return hideTip;
  });
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="chart-legend !mb-0">
          <span className="legend-item"><span style={{ width: mark === "dots" ? 6 : 10, height: mark === "dots" ? 6 : 10, borderRadius: mark === "dots" ? 3 : 2, background: `var(--ch-${c})`, opacity: 0.6, display: "inline-block" }} />{mark === "dots" ? "One dot per game" : "Games (darker = more)"}</span>
          <span className="legend-item"><span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--ch-ink)", display: "inline-block" }} />Average actual margin</span>
          <span className="legend-item"><span style={{ width: 14, height: 2.5, background: "var(--ch-red)", display: "inline-block" }} />Regression line</span>
        </div>
        {pointsUrl && (
          <div className="flex gap-1.5" role="group" aria-label="Chart view">
            {(["squares", "dots"] as const).map((k) => (
              <button key={k} type="button" onClick={() => choose(k)} aria-pressed={mark === k}
                className={`rounded-full px-3 py-1 text-xs font-medium ${mark === k ? "bg-foreground text-background" : "bg-card shadow-[var(--surface-shadow)] hover:bg-muted"}`}>
                {k === "squares" ? "Squares" : loading ? "Loading…" : "Every game"}
              </button>
            ))}
          </div>
        )}
      </div>
      <div ref={ref} className="d3-chart" />
    </div>
  );
}
