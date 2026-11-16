"use client";

import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** League pages outside the per-program rankings: MLS NEXT predictions and local league tables. */
export const LEAGUE_PAGES: Array<[href: string, label: string]> = [
  ["/mls-next?division=homegrown", "MLS NEXT Homegrown"],
  ["/mls-next?division=academy", "MLS NEXT Academy"],
  ["/league/socal-soccer-league#rankings", "SoCal Soccer League"],
  ["/league/norcal-premier#rankings", "NorCal Premier"],
  ["/league/coast-soccer-league#rankings", "Coast Soccer League (CSL)"],
];

/** League programs with their own rankings view (the same list as the Rankings page's "League" filter). */
const RANKED_LEAGUES: Array<[program: string, label: string]> = [
  ["MLS NEXT", "MLS NEXT"],
  ["ECNL", "ECNL"],
  ["ECNL RL", "ECNL RL"],
  ["Pre-ECNL", "Pre-ECNL"],
  ["GA", "Girls Academy"],
  ["GA Aspire", "GA Aspire"],
  ["DPL", "DPL"],
  ["EA", "Elite Academy"],
  ["EA2", "Elite Academy 2"],
  ["USL Academy", "USL Academy"],
  ["N1", "National 1 (N1)"],
  ["NPL", "NPL"],
];

/** "Leagues" dropdown in the site header. */
export function LeaguesMenu({ active = false, itemClass }: { active?: boolean; itemClass: (on: boolean) => string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={`${itemClass(active)} group/lm flex items-center gap-1 outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
        Leagues
        <ChevronDownIcon className="size-3.5 transition-transform duration-200 group-data-[popup-open]/lm:rotate-180" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-60 rounded-2xl p-1.5 duration-200">
        <DropdownMenuGroup>
          <DropdownMenuLabel>MLS NEXT predictions</DropdownMenuLabel>
          <DropdownMenuItem render={<Link href="/mls-next?division=homegrown" />}>MLS NEXT Homegrown</DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/mls-next?division=academy" />}>MLS NEXT Academy</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Local league rankings</DropdownMenuLabel>
          <DropdownMenuItem render={<Link href="/league/socal-soccer-league#rankings" />}>SoCal Soccer League</DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/league/norcal-premier#rankings" />}>NorCal Premier</DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/league/coast-soccer-league#rankings" />}>Coast Soccer League (CSL)</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Rankings by league</DropdownMenuLabel>
          {RANKED_LEAGUES.map(([program, label]) => (
            <DropdownMenuItem key={program} render={<Link href={`/rankings?program=${encodeURIComponent(program)}`} />}>
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
