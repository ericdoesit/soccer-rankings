"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LeaguesMenu } from "@/components/leagues-menu";

/** Header links in one pill group; the section you're in is filled. */
const LINKS: Array<[href: string, label: string, match: RegExp]> = [
  ["/rankings", "Rankings", /^\/(rankings|team)\b/],
  ["/states", "States", /^\/(states?|club)\b/],
  ["/events", "Events", /^\/(events|tournament|match)\b/],
  ["/map", "Map", /^\/map\b/],
  ["/power-rankings", "Power Rankings", /^\/power-rankings\b/],
  ["/tools/flight-planner", "Flight Planner", /^\/tools\b/],
  ["/about", "About", /^\/about\b/],
];

const item = (on: boolean) =>
  `whitespace-nowrap rounded-full px-3.5 py-2 ${
    on ? "bg-foreground text-background" : "text-foreground hover:bg-muted active:bg-[var(--press)] transition-colors duration-300 ease-out hover:duration-150 active:duration-75 data-[popup-open]:bg-muted"
  }`;

export function SiteNav() {
  const path = usePathname() ?? "/";
  const on = (re: RegExp) => re.test(path);
  const [rankings, ...rest] = LINKS;
  return (
    // the padding (cancelled by negative margins) gives the pill's soft shadow room inside the
    // scroll container, which would otherwise clip it into a hard edge
    <nav aria-label="Main" className="pointer-events-none -mx-8 -my-8 min-w-0 overflow-x-auto px-8 py-8 [scrollbar-width:none]">
      <div className="pointer-events-auto flex w-max items-center gap-0.5 rounded-full bg-card p-1.5 text-[13px] font-medium shadow-[var(--surface-shadow)]">
        <Link href={rankings[0]} className={item(on(rankings[2]))}>{rankings[1]}</Link>
        {rest.slice(0, 2).map(([href, label, re]) => <Link key={href} href={href} className={item(on(re))}>{label}</Link>)}
        <LeaguesMenu active={/^\/(league|mls-next)\b/.test(path)} itemClass={item} />
        {rest.slice(2).map(([href, label, re]) => <Link key={href} href={href} className={item(on(re))}>{label}</Link>)}
      </div>
    </nav>
  );
}
