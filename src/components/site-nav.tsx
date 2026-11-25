"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
import { LEAGUE_PAGES, LeaguesMenu } from "@/components/leagues-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Header links in one pill group; the section you're in is filled. */
const LINKS: Array<[href: string, label: string, match: RegExp]> = [
  // state and club pages (reached from rankings, About and the map) sit under Rankings
  ["/rankings", "Rankings", /^\/(rankings|team|states?|club)\b/],
  ["/events", "Events", /^\/(events|tournament|match)\b/],
  ["/socal", "Southern CA", /^\/(socal|map)\b/],
  ["/proven", "Proven", /^\/(proven|power-rankings)\b/],
  ["/tools/flight-planner", "Flight Planner", /^\/tools\b/],
  ["/findings", "Findings", /^\/findings\b/],
  ["/about", "About", /^\/about\b/],
];
const LEAGUES_RE = /^\/(league|mls-next)\b/;

const item = (on: boolean) =>
  `whitespace-nowrap rounded-full px-3.5 py-2 transition-colors duration-500 ease-out ${
    on ? "bg-foreground text-background" : "text-foreground hover:bg-muted data-[popup-open]:bg-muted"
  }`;

export function SiteNav() {
  const path = usePathname() ?? "/";
  const on = (re: RegExp) => re.test(path);
  const [rankings, ...rest] = LINKS;
  const current = LEAGUES_RE.test(path) ? "Leagues" : (LINKS.find(([, , re]) => re.test(path))?.[1] ?? "Menu");
  return (
    <>
      {/* phones: every section in one menu, labelled with the section you're in */}
      <nav aria-label="Main" className="md:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger className="group/mm flex h-11 items-center gap-1.5 rounded-full bg-card px-4 text-[13px] font-medium shadow-[var(--surface-shadow)] outline-none focus-visible:ring-2 focus-visible:ring-ring data-[popup-open]:bg-muted">
            {current}
            <ChevronDownIcon className="size-3.5 transition-transform duration-200 group-data-[popup-open]/mm:rotate-180" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={8} className="max-h-[75vh] w-64 rounded-2xl p-1.5 duration-200">
            <DropdownMenuGroup>
              {LINKS.map(([href, label, re]) => (
                <DropdownMenuItem key={href} render={<Link href={href} />} className={`py-2.5 ${on(re) ? "font-semibold" : ""}`}>
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Leagues</DropdownMenuLabel>
              {LEAGUE_PAGES.map(([href, label]) => (
                <DropdownMenuItem key={href} render={<Link href={href} />} className="py-2.5">{label}</DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      {/* tablet and up: the pill bar. The padding (cancelled by negative margins) gives the
          pill's soft shadow room inside the scroll container, which would otherwise clip it */}
      <nav aria-label="Main" className="pointer-events-none -mx-8 -my-8 hidden min-w-0 overflow-x-auto px-8 py-8 [scrollbar-width:none] md:block">
        <div className="pointer-events-auto flex w-max items-center gap-0.5 rounded-full bg-card p-1.5 text-[13px] font-medium shadow-[var(--surface-shadow)]">
          <Link href={rankings[0]} className={item(on(rankings[2]))}>{rankings[1]}</Link>
          {rest.slice(0, 1).map(([href, label, re]) => <Link key={href} href={href} className={item(on(re))}>{label}</Link>)}
          <LeaguesMenu active={LEAGUES_RE.test(path)} itemClass={item} />
          {rest.slice(1).map(([href, label, re]) => <Link key={href} href={href} className={item(on(re))}>{label}</Link>)}
        </div>
      </nav>
    </>
  );
}
