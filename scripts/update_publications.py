#!/usr/bin/env python3
"""Refresh the public publication cache from Semantic Scholar."""

import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
PROFILE_JS = ROOT / "profile.js"
OUTPUT = ROOT / "data" / "publications.json"
PAGE_SIZE = 100
MAX_RETRIES = 5


def author_id_from_profile() -> str:
    source = PROFILE_JS.read_text(encoding="utf-8")
    match = re.search(
        r"semanticScholarAuthorId\s*:\s*['\"]([^'\"]+)['\"]", source
    )
    if not match:
        raise RuntimeError("semanticScholarAuthorId was not found in profile.js")
    return match.group(1)


def fetch_page(author_id: str, offset: int) -> list[dict]:
    query = urlencode(
        {
            "fields": "title,year,authors,venue,url",
            "limit": PAGE_SIZE,
            "offset": offset,
        }
    )
    url = f"https://api.semanticscholar.org/graph/v1/author/{author_id}/papers?{query}"
    headers = {"User-Agent": "researcher-portfolio-publication-cache/1.0"}
    api_key = os.environ.get("SEMANTIC_SCHOLAR_API_KEY")
    if api_key:
        headers["x-api-key"] = api_key

    for attempt in range(MAX_RETRIES):
        try:
            request = Request(url, headers=headers)
            with urlopen(request, timeout=45) as response:
                payload = json.loads(response.read().decode("utf-8"))
            papers = payload.get("data")
            if not isinstance(papers, list):
                raise RuntimeError("Semantic Scholar response did not contain a paper list")
            return papers
        except HTTPError as error:
            retryable = error.code == 429 or 500 <= error.code < 600
            if not retryable or attempt == MAX_RETRIES - 1:
                raise
            retry_after = error.headers.get("Retry-After") if error.headers else None
            try:
                delay = int(retry_after) if retry_after else 2 ** (attempt + 1)
            except ValueError:
                delay = 2 ** (attempt + 1)
            time.sleep(min(max(delay, 1), 120))


def normalize_papers(papers: list[dict]) -> list[dict]:
    normalized = []
    seen = set()
    for paper in papers:
        paper_id = paper.get("paperId")
        key = paper_id or (paper.get("title"), paper.get("year"))
        if key in seen:
            continue
        seen.add(key)
        normalized.append(
            {
                "paperId": paper_id,
                "title": paper.get("title"),
                "year": paper.get("year"),
                "authors": [
                    {"name": author.get("name")}
                    for author in (paper.get("authors") or [])
                    if isinstance(author, dict) and author.get("name")
                ],
                "venue": paper.get("venue"),
                "url": paper.get("url"),
            }
        )
    return normalized


def paper_identity(paper: dict) -> str | tuple[str, str]:
    if paper.get("paperId"):
        return str(paper["paperId"])
    return (
        (paper.get("title") or "").strip().casefold(),
        str(paper.get("year") or ""),
    )


def main() -> int:
    author_id = author_id_from_profile()
    fetched = []
    offset = 0

    while True:
        batch = fetch_page(author_id, offset)
        fetched.extend(batch)
        print(f"Fetched {len(batch)} papers at offset {offset}")
        if len(batch) < PAGE_SIZE:
            break
        offset += len(batch)

    papers = normalize_papers(fetched)
    if not papers:
        raise RuntimeError(
            "Semantic Scholar returned no papers; keeping the existing cache unchanged"
        )

    cached = {}
    if OUTPUT.exists():
        cached = json.loads(OUTPUT.read_text(encoding="utf-8"))
    cached_papers = cached.get("papers", [])
    if cached.get("authorId") == author_id:
        known_papers = {paper_identity(paper) for paper in cached_papers}
    else:
        known_papers = set()
    new_papers = [paper for paper in papers if paper_identity(paper) not in known_papers]
    if not new_papers:
        print("No new papers found; leaving the publication cache unchanged.")
        return 0
    print(f"Found {len(new_papers)} paper(s) not yet in the publication cache.")

    payload = {
        "authorId": author_id,
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "Semantic Scholar",
        "papers": papers,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(OUTPUT)
    print(f"Saved {len(papers)} papers to {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as error:  # Keep the existing cache if any API step fails.
        print(f"Publication refresh failed: {error}", file=sys.stderr)
        sys.exit(1)
