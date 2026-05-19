"""Scrape NIH MedlinePlus health topics into the documents table.

MedlinePlus is the NIH's plain-language consumer-facing health library
(https://medlineplus.gov). Unlike CDC's policy-oriented pages, MedlinePlus
topics are written for patients — short, structured, and FAQ-style. Adding
them substantially helps queries phrased the way real users phrase them
("what are early signs of diabetes?", "how is high blood pressure diagnosed?")
because the wording in the source matches.

Strategy
--------

MedlinePlus exposes an XMLHttpRequest-friendly topic index at::

    https://medlineplus.gov/xml.html

…with full-content XML files per topic group. But scraping the XML
adds parsing complexity and produces unstable HTML inside CDATA. The
HTML pages have a clean structure and we already have BeautifulSoup +
markdownify wired up — so we walk the A-Z topic index pages and fetch
each topic page's main article.

Usage::

    python scripts/03_scrape_medlineplus.py [--limit N] [--reset] [--delay 0.5]
"""

from __future__ import annotations

import argparse
import re
import string
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from markdownify import markdownify as md
from tqdm import tqdm

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.config import supabase_admin  # noqa: E402


BASE = "https://medlineplus.gov"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) HealthRAG/0.1 educational"
)
MIN_CONTENT_LENGTH = 400
PER_LETTER_CAP = 50  # avoid overwhelming the docs table; ~1500 topics total


def fetch(url: str, session: requests.Session) -> str | None:
    try:
        r = session.get(url, timeout=30)
        if r.status_code != 200:
            return None
        return r.text
    except Exception:
        return None


def discover_topic_urls(session: requests.Session) -> list[str]:
    """Walk the A-Z index pages, harvest topic links, dedupe."""
    urls: list[str] = []
    seen = set()
    for letter in string.ascii_uppercase:
        index_url = f"{BASE}/healthtopics_{letter.lower()}.html"
        html = fetch(index_url, session)
        if not html:
            continue
        soup = BeautifulSoup(html, "html.parser")
        # Topic links sit inside <ul id="index"> or similar list constructs;
        # use a generic href filter that matches /<topic>.html under the root.
        per_letter = 0
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if not href.startswith("/"):
                continue
            if "healthtopics_" in href or "encyclopedia" in href or "drug" in href:
                continue
            # We want plain topic pages like /diabetes.html, not /spanish/diabetes.html
            if href.count("/") != 1 or not href.endswith(".html"):
                continue
            url = BASE + href
            if url in seen:
                continue
            seen.add(url)
            urls.append(url)
            per_letter += 1
            if per_letter >= PER_LETTER_CAP:
                break
    return urls


_PARAGRAPH_RE = re.compile(r"\n{3,}")


def extract_main(html: str) -> tuple[str, str]:
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
        or soup.find(id="topic-summary")
        or soup.find(class_="page-content")
        or soup.find(id="mplus-content")
        or soup.body
    )
    if main is None:
        return title, ""

    body_md = md(str(main), heading_style="ATX", strip=["a"]).strip()
    body_md = _PARAGRAPH_RE.sub("\n\n", body_md)
    return title, body_md


def guess_content_type(url: str, body: str) -> str:
    lc_body = body.lower()
    if any(kw in lc_body for kw in ("dose", "dosage", "side effects", "drug interactions")):
        return "drug_info"
    if any(kw in lc_body for kw in ("vitamin", "minerals", "nutrient", "diet ")):
        return "nutrition"
    return "disease_info"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--reset", action="store_true", help="Delete nih documents before scraping")
    parser.add_argument("--delay", type=float, default=0.5)
    args = parser.parse_args()

    sb = supabase_admin()
    if args.reset:
        print("Deleting existing nih documents…")
        sb.table("documents").delete().eq("source", "nih").execute()

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})

    print("Discovering MedlinePlus topic URLs…")
    candidate_urls = discover_topic_urls(session)
    print(f"  found {len(candidate_urls)} candidate topic URLs")

    if args.limit:
        candidate_urls = candidate_urls[: args.limit]

    inserted = 0
    skipped_empty = 0
    errors = 0
    batch: list[dict] = []
    BATCH_SIZE = 50

    for url in tqdm(candidate_urls, desc="Ingesting MedlinePlus"):
        try:
            html = fetch(url, session)
            if not html:
                errors += 1
                continue
            title, body = extract_main(html)
            if len(body) < MIN_CONTENT_LENGTH:
                skipped_empty += 1
                continue
            batch.append({
                "source": "nih",
                "source_url": url,
                "title": (title or url)[:500],
                "raw_content": body,
                "content_type": guess_content_type(url, body),
            })
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
    print(
        "\nNext steps:\n"
        "  python scripts/04_chunk_documents.py        # chunk new docs (no --reset)\n"
        "  python scripts/05_embed_and_store.py        # embed new chunks (resumable)\n"
        "  python scripts/10_threshold_sweep.py --reranker   # see retrieval lift\n"
    )


if __name__ == "__main__":
    main()
