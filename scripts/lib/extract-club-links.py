"""Generic member-club extractor for state association pages.

Walks the page in order, tracking the latest section heading (h2-h5, accordion
summary), and collects external links whose text looks like a club name.
Usage: python3 extract-club-links.py page.html  -> JSON list on stdout
"""
import html, json, re, sys
from urllib.parse import urlparse

SKIP_HOSTS = ("facebook.com","twitter.com","x.com","instagram.com","youtube.com","linkedin.com","google.com",
  "goo.gl","usyouthsoccer.org","ussoccer.com","gotsport.com","sportsconnect.com","bluesombrero.com","apple.com",
  "wordpress","wp.com","simaxsports","tiktok.com","pinterest","sportngin.com","mailchimp","eventbrite","amazon",
  "azref.com","learning.ussoccer","mojo.sport","playmetrics","demosphere","stacksports","teamsnap.com","maps.app")
NAV_WORDS = re.compile(r"^(home|about|contact|login|log in|register|donate|shop|news|read more|learn more|click here|here|website|more|view|visit|apply|download|pdf|map|email)$", re.I)

def main(path, own_host):
    s = open(path, encoding="utf-8", errors="ignore").read()
    s = re.sub(r"<(script|style|nav|header|footer)\b.*?</\1>", " ", s, flags=re.S | re.I)
    tokens = re.finditer(r"<(h[2-5]|summary)\b[^>]*>(.*?)</\1>|<a\b[^>]*href=\"(https?://[^\"]+)\"[^>]*>(.*?)</a>", s, re.S | re.I)
    section, out, seen = None, [], set()
    for m in tokens:
        if m.group(1):
            t = html.unescape(re.sub(r"<[^>]+>", " ", m.group(2))).strip()
            t = re.sub(r"\s+", " ", t)
            if 1 < len(t) < 60: section = t
            continue
        url, text = m.group(3), html.unescape(re.sub(r"<[^>]+>", " ", m.group(4)))
        text = re.sub(r"\s+", " ", text).strip()
        host = urlparse(url).netloc.lower()
        if not text or len(text) < 3 or len(text) > 80 or NAV_WORDS.match(text): continue
        if own_host in host or any(h in host for h in SKIP_HOSTS): continue
        if re.search(r"\.(pdf|jpg|png|docx?)$", url, re.I): continue
        key = (text.lower(), host)
        if key in seen: continue
        seen.add(key)
        out.append({"name": text, "area": section, "website": url})
    json.dump(out, sys.stdout, indent=1)

main(sys.argv[1], sys.argv[2])
