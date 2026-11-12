#!/usr/bin/env python3
"""
GotSport Game Score Scraper

Scrapes individual game scores from GotSport schedule pages.
Uses DrissionPage to handle reCAPTCHA verification automatically.

Data flow:
1. Load team IDs from our existing data
2. For each team, navigate to their event schedule pages
3. Handle reCAPTCHA when encountered
4. Extract game scores from the rendered HTML
5. Save to JSON for import into our ranking system

Usage:
    source .venv/bin/activate
    python3 scripts/scrape_game_scores.py [--team-id 264749] [--event-id 38150] [--limit 10]
"""

import json
import os
import re
import sys
import time
from pathlib import Path

from DrissionPage import ChromiumPage, ChromiumOptions

OUTPUT_DIR = Path("data/gotsport/games")
TEAMS_FILE = Path("data/gotsport/teams.json")
BASE_URL = "https://system.gotsport.com"


def setup_browser():
    """Configure browser with stealth settings."""
    opts = ChromiumOptions()
    opts.headless()
    opts.set_argument("--disable-blink-features=AutomationControlled")
    opts.set_argument("--no-sandbox")
    opts.set_argument("--disable-gpu")
    opts.set_user_agent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
    )
    return ChromiumPage(opts)


def handle_captcha(page, max_wait=30):
    """Wait for and attempt to handle reCAPTCHA verification."""
    start = time.time()
    while time.time() - start < max_wait:
        # Check if we're on a captcha page
        body_text = page.html
        if "verify" not in body_text.lower() and "captcha" not in body_text.lower():
            return True

        # Look for the reCAPTCHA iframe
        captcha_frame = page.ele("iframe[src*=recaptcha]", timeout=2)
        if captcha_frame:
            print("    reCAPTCHA detected, waiting for auto-solve...")
            # DrissionPage sometimes handles simple reCAPTCHAs automatically
            time.sleep(3)

        # Check if captcha was solved (page content changed)
        if "schedule" in page.html.lower() or "game" in page.html.lower():
            return True

        time.sleep(2)

    return False


def extract_games_from_page(page, team_id, event_id):
    """Extract game scores from a rendered GotSport schedule page."""
    games = []

    # Wait for content to load
    time.sleep(2)

    html = page.html

    # Look for game/match rows in various formats GotSport uses
    # Pattern 1: Table rows with scores
    score_patterns = [
        # "TeamA 3 - 2 TeamB" or "3 - 2" or "3-2"
        r'(\d+)\s*[-–]\s*(\d+)',
    ]

    # Try to find structured game data
    # GotSport schedule pages typically have tables with:
    # Date | Time | Home Team | Score | Away Team | Location
    rows = page.eles("tr")

    for row in rows:
        try:
            cells = row.eles("td")
            if len(cells) < 4:
                continue

            cell_texts = [c.text.strip() for c in cells]
            row_text = " | ".join(cell_texts)

            # Look for score pattern in the row
            score_match = None
            for text in cell_texts:
                m = re.match(r'^(\d+)\s*[-–]\s*(\d+)$', text.strip())
                if m:
                    score_match = m
                    break

            if not score_match:
                continue

            # Try to extract team names from adjacent cells
            score_idx = next(
                i for i, t in enumerate(cell_texts)
                if re.match(r'^\d+\s*[-–]\s*\d+$', t.strip())
            )

            home_team = cell_texts[score_idx - 1] if score_idx > 0 else ""
            away_team = cell_texts[score_idx + 1] if score_idx + 1 < len(cell_texts) else ""

            # Look for date in the row
            date_match = None
            for text in cell_texts:
                dm = re.search(r'(\d{1,2}/\d{1,2}/\d{2,4})', text)
                if dm:
                    date_match = dm.group(1)
                    break

            game = {
                "team_id": team_id,
                "event_id": event_id,
                "home_team": home_team,
                "away_team": away_team,
                "home_score": int(score_match.group(1)),
                "away_score": int(score_match.group(2)),
                "date": date_match,
                "raw_row": row_text[:200],
            }
            games.append(game)

        except (StopIteration, IndexError, ValueError):
            continue

    return games


def scrape_team_games(page, team_id, events):
    """Scrape games for a specific team across their events."""
    all_games = []

    for event in events:
        event_id = event["id"]
        event_name = event.get("name", f"Event {event_id}")

        url = f"{BASE_URL}/org_event/events/{event_id}/schedules?team={team_id}"
        print(f"  Scraping: {event_name} (event {event_id})...")

        try:
            page.get(url)
            time.sleep(2)

            # Handle CAPTCHA if present
            if "verify" in page.html.lower() or "captcha" in page.html.lower():
                if not handle_captcha(page):
                    print(f"    CAPTCHA not solved, skipping event")
                    continue

            games = extract_games_from_page(page, team_id, event_id)
            all_games.extend(games)

            if games:
                print(f"    Found {len(games)} games")
            else:
                print(f"    No game scores found on page")

        except Exception as e:
            print(f"    Error: {e}")

        time.sleep(1)  # polite delay

    return all_games


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--team-id", type=int, help="Scrape specific team")
    parser.add_argument("--event-id", type=int, help="Scrape specific event")
    parser.add_argument("--limit", type=int, default=5, help="Max teams to scrape")
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Load team data
    if not TEAMS_FILE.exists():
        print(f"No team data found at {TEAMS_FILE}")
        print("Run 'npx tsx scripts/scrape-gotsport.ts' first")
        sys.exit(1)

    teams_data = json.loads(TEAMS_FILE.read_text())
    print(f"Loaded {len(teams_data)} teams from {TEAMS_FILE}")

    # Filter to specific team if requested
    if args.team_id:
        teams_data = [
            t for t in teams_data
            if t["team_ranking_data"]["team_id"] == args.team_id
        ]
        if not teams_data:
            print(f"Team {args.team_id} not found")
            sys.exit(1)

    # Limit
    teams_data = teams_data[:args.limit]

    # Start browser
    print("Starting browser...")
    page = setup_browser()

    all_games = []

    for i, team_entry in enumerate(teams_data):
        team = team_entry["team_ranking_data"]
        events = team_entry["events"]
        team_id = team["team_id"]

        # Filter to specific event if requested
        if args.event_id:
            events = [e for e in events if e["id"] == args.event_id]

        print(f"\n[{i+1}/{len(teams_data)}] {team['team_name']} ({team['club_name']}) - {len(events)} events")

        games = scrape_team_games(page, team_id, events)
        all_games.extend(games)

        # Save incrementally
        output_file = OUTPUT_DIR / f"team_{team_id}_games.json"
        with open(output_file, "w") as f:
            json.dump(games, f, indent=2)

    # Save combined results
    combined_file = OUTPUT_DIR / "all_games.json"
    with open(combined_file, "w") as f:
        json.dump(all_games, f, indent=2)

    print(f"\n=== Summary ===")
    print(f"Teams scraped: {len(teams_data)}")
    print(f"Total games found: {len(all_games)}")
    print(f"Saved to: {combined_file}")

    page.quit()


if __name__ == "__main__":
    main()
