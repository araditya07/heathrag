"""Scrape CDC health topics into the documents table.

CDC publishes a master sitemap index at /wcms-auto-sitemap-index.xml which
references per-topic sitemaps like /diabetes/wcms-auto-sitemap.xml. We walk an
allowlist of health-related topic sitemaps, then fetch each page.

Usage:
    python scripts/02_scrape_cdc.py [--limit N] [--reset] [--delay 0.5]
"""

from __future__ import annotations

import argparse
import re
import sys
import time
import xml.etree.ElementTree as ET
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from markdownify import markdownify as md
from tqdm import tqdm

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.config import supabase_admin  # noqa: E402


SITEMAP_INDEX = "https://www.cdc.gov/wcms-auto-sitemap-index.xml"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) HealthRAG/0.1 educational"
)
MIN_CONTENT_LENGTH = 400

# Topic prefixes (the segment between /www.cdc.gov/ and /wcms-auto-sitemap.xml)
# that we treat as health-content topics.
HEALTH_TOPIC_ALLOWLIST = {
    # Cardiometabolic — anchors for the golden dataset
    "diabetes", "prediabetes", "diabetestv",
    "heart-disease", "cholesterol", "high-blood-pressure", "bloodpressure",
    "stroke", "obesity", "healthyweight", "salt", "sodium",
    # Nutrition + activity
    "nutrition", "infant-toddler-nutrition", "physicalactivity",
    # Kidney / thyroid / liver / blood
    "kidney-disease", "ckd", "thyroid",
    "bleeding-disorders", "blood-disorders", "anemia",
    # Respiratory
    "asthma", "flu", "covid", "covid19", "rsv", "pneumonia", "hepatitis", "hiv",
    # Cancer screening (overview)
    "cancerscreening", "cancer", "breast-cancer", "colorectalcancer", "skin-cancer",
    # Mental health / brain
    "mentalhealth", "epilepsy",
    # Food safety + infectious (a few — but limited via per-topic cap)
    "foodsafety", "foodnet", "salmonella", "norovirus",
    # Reproductive
    "reproductivehealth", "pregnancy",
}

# Hard per-topic cap so any one topic can't crowd out the corpus.
PER_TOPIC_CAP = 40

# Per-page exclusions (we don't want PDFs or non-content pages).
EXCLUDE_RE = re.compile(r"\.(pdf|pptx?|xlsx?|zip|jpg|png)$", re.I)


def _xml_loc_text(elem) -> list[str]:
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    return [loc.text.strip() for loc in elem.iter() if loc.tag.endswith("loc") and loc.text]


def fetch_topic_sitemap_urls() -> list[str]:
    headers = {"User-Agent": USER_AGENT}
    r = requests.get(SITEMAP_INDEX, headers=headers, timeout=30)
    r.raise_for_status()
    root = ET.fromstring(r.text)

    all_loc = _xml_loc_text(root)
    print(f"Sitemap index has {len(all_loc):,} topic sitemaps.")

    selected = []
    for loc in all_loc:
        # Format: https://www.cdc.gov/<topic>/wcms-auto-sitemap.xml
        m = re.match(r"https?://www\.cdc\.gov/([^/]+)/wcms-auto-sitemap\.xml$", loc)
        if not m:
            continue
        topic = m.group(1).lower()
        if topic in HEALTH_TOPIC_ALLOWLIST:
            selected.append(loc)
    print(f"  selected {len(selected)} health-topic sitemaps from the allowlist.")
    return selected


def fetch_page_urls(topic_sitemaps: list[str]) -> list[str]:
    """Walk each topic sitemap, cap per-topic at PER_TOPIC_CAP, then interleave round-robin.

    Interleaving ensures a `--limit N` doesn't get swallowed by a single huge topic
    (e.g. salmonella had 500+ URLs; without round-robin we'd scrape only salmonella).
    """
    headers = {"User-Agent": USER_AGENT}
    per_topic: list[list[str]] = []
    for sm_url in topic_sitemaps:
        try:
            r = requests.get(sm_url, headers=headers, timeout=30)
            r.raise_for_status()
            root = ET.fromstring(r.text)
            topic_urls = []
            for u in _xml_loc_text(root):
                if EXCLUDE_RE.search(u):
                    continue
                topic_urls.append(u)
                if len(topic_urls) >= PER_TOPIC_CAP:
                    break
            if topic_urls:
                per_topic.append(topic_urls)
        except Exception as e:
            print(f"  ! failed to load {sm_url}: {e}")

    # Round-robin interleave
    seen = set()
    interleaved: list[str] = []
    idx = 0
    while True:
        progressed = False
        for queue in per_topic:
            if idx < len(queue):
                u = queue[idx]
                if u not in seen:
                    seen.add(u)
                    interleaved.append(u)
                progressed = True
        if not progressed:
            break
        idx += 1
    return interleaved


def extract_main_content(html: str) -> tuple[str, str]:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "nav", "footer", "aside", "header"]):
        tag.decompose()

    title = ""
    h1 = soup.find("h1")
    if h1 and h1.get_text(strip=True):
        title = h1.get_text(strip=True)
    elif soup.title and soup.title.string:
        title = soup.title.string.strip()

    main = (
        soup.find("main")
        or soup.find("article")
        or soup.find(id="content")
        or soup.find(class_="syndicate")
        or soup.body
    )
    if main is None:
        return title, ""

    body_md = md(str(main), heading_style="ATX", strip=["a"]).strip()
    while "\n\n\n" in body_md:
        body_md = body_md.replace("\n\n\n", "\n\n")
    return title, body_md


NUTRITION_TOPICS = {"nutrition", "healthyweight", "salt", "sodium", "fats"}
PROCEDURE_TOPICS = {"physicalactivity", "vaccines", "vaccinesafety"}


def guess_content_type(url: str) -> str:
    u = url.lower()
    for t in NUTRITION_TOPICS:
        if f"/{t}/" in u:
            return "nutrition"
    for t in PROCEDURE_TOPICS:
        if f"/{t}/" in u:
            return "procedure"
    return "disease_info"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--delay", type=float, default=0.5)
    args = parser.parse_args()

    sb = supabase_admin()
    if args.reset:
        print("Deleting existing cdc documents…")
        sb.table("documents").delete().eq("source", "cdc").execute()

    topic_sitemaps = fetch_topic_sitemap_urls()
    page_urls = fetch_page_urls(topic_sitemaps)
    print(f"Collected {len(page_urls):,} candidate page URLs.")

    if args.limit:
        page_urls = page_urls[: args.limit]

    inserted = 0
    skipped_empty = 0
    errors = 0
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    batch = []
    BATCH_SIZE = 50

    for url in tqdm(page_urls, desc="Ingesting CDC pages"):
        try:
            r = session.get(url, timeout=30)
            if r.status_code != 200:
                errors += 1
                time.sleep(args.delay)
                continue
            title, body = extract_main_content(r.text)
            if len(body) < MIN_CONTENT_LENGTH:
                skipped_empty += 1
                time.sleep(args.delay)
                continue

            batch.append(
                {
                    "source": "cdc",
                    "source_url": url,
                    "title": (title or url)[:500],
                    "raw_content": body,
                    "content_type": guess_content_type(url),
                }
            )

            if len(batch) >= BATCH_SIZE:
                sb.table("documents").insert(batch).execute()
                inserted += len(batch)
                batch = []
        except Exception as e:
            errors += 1
            print(f"  ! error on {url}: {e}")
        time.sleep(args.delay)

    if batch:
        sb.table("documents").insert(batch).execute()
        inserted += len(batch)

    print(f"\nDone. inserted={inserted} skipped_empty={skipped_empty} errors={errors}")


if __name__ == "__main__":
    main()
