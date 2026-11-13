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
export function LeaguesMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors outline-none">
        Leagues
        <ChevronDownIcon className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
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
