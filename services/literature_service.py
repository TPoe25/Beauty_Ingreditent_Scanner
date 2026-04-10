#!/usr/bin/env python3
"""
Fetch simple PubMed literature summaries for ingredients.

This is a first-pass enrichment layer:
- searches PubMed
- fetches a few abstracts
- builds one normalized ingredient record
"""

from __future__ import annotations

import argparse
import json
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import List, Dict, Any

from core.normalizer import build_seed_record, uniq_strs, clean_text


ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
EFETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"


def read_queries(queries: List[str] | None, queries_file: str | None) -> List[str]:
    out: List[str] = []

    if queries:
        out.extend(q.strip() for q in queries if q.strip())

    if queries_file:
        path = Path(queries_file)
        if path.exists():
            for line in path.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line and not line.startswith("#"):
                    out.append(line)

    return uniq_strs(out)


def fetch_text(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "beauty-scanner/1.0 (+literature enrichment pipeline)"
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read().decode("utf-8")


def search_pubmed(term: str, limit: int = 3) -> List[str]:
    query = f'({term}) AND (cosmetic OR skincare OR topical OR dermatology)'
    params = urllib.parse.urlencode({
        "db": "pubmed",
        "term": query,
        "retmode": "json",
        "retmax": str(limit),
        "sort": "relevance",
    })
    text = fetch_text(f"{ESEARCH_URL}?{params}")
    payload = json.loads(text)
    idlist = payload.get("esearchresult", {}).get("idlist", [])
    return [str(x) for x in idlist]


def fetch_pubmed_abstracts(pmids: List[str]) -> List[Dict[str, str]]:
    if not pmids:
        return []

    params = urllib.parse.urlencode({
        "db": "pubmed",
        "id": ",".join(pmids),
        "retmode": "xml",
    })
    xml_text = fetch_text(f"{EFETCH_URL}?{params}")
    root = ET.fromstring(xml_text)

    articles: List[Dict[str, str]] = []

    for article in root.findall(".//PubmedArticle"):
        title = "".join(article.findtext(".//ArticleTitle", default="") or "")
        abstract_nodes = article.findall(".//Abstract/AbstractText")
        abstract_parts = ["".join(node.itertext()).strip() for node in abstract_nodes]
        abstract_parts = [part for part in abstract_parts if part]
        abstract = " ".join(abstract_parts).strip()

        if title or abstract:
            articles.append({
                "title": clean_text(title) or "",
                "abstract": clean_text(abstract) or "",
            })

    return articles


def detect_concerns(text: str) -> List[str]:
    text = (text or "").lower()
    keywords = {
        "irritation": "irritation",
        "contact dermatitis": "contact dermatitis",
        "allergy": "allergy",
        "allergic": "allergy",
        "photosensitivity": "photosensitivity",
        "dryness": "dryness",
        "toxicity": "toxicity",
        "cytotoxic": "toxicity",
        "inflammation": "inflammation",
        "sensitization": "sensitization",
    }

    found = [label for needle, label in keywords.items() if needle in text]
    return uniq_strs(found)


def summarize_articles(term: str, articles: List[Dict[str, str]]) -> Dict[str, Any] | None:
    if not articles:
        return None

    combined = " ".join(
        article["abstract"]
        for article in articles
        if article.get("abstract")
    ).strip()

    description = combined[:900] if combined else f"PubMed literature found for {term}."
    concerns = detect_concerns(combined)

    aliases: List[str] = []
    for article in articles:
        title = article.get("title", "")
        if term.lower() not in title.lower():
            continue
        aliases.append(title)

    return build_seed_record(
        name=term,
        description=description,
        source="PUBMED_LITERATURE",
        category="literature",
        concerns=concerns,
        aliases=[],
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--queries", nargs="*", help="Ingredient names")
    parser.add_argument("--queries-file", help="One ingredient per line")
    parser.add_argument("--output", required=True, help="Output JSON file")
    parser.add_argument("--limit", type=int, default=3, help="PubMed articles per term")
    parser.add_argument("--sleep", type=float, default=0.34, help="Delay between requests")
    args = parser.parse_args()

    terms = read_queries(args.queries, args.queries_file)
    records: List[Dict[str, Any]] = []

    for term in terms:
        try:
            pmids = search_pubmed(term, limit=args.limit)
            articles = fetch_pubmed_abstracts(pmids)
            record = summarize_articles(term, articles)

            if record:
                records.append(record)
                print(f"[LIT] matched: {term} ({len(pmids)} pmids)")
            else:
                print(f"[LIT] no match: {term}")
        except Exception as exc:
            print(f"[LIT] error for {term}: {exc}")

        time.sleep(args.sleep)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Wrote {len(records)} literature records to {output_path}")


if __name__ == "__main__":
    main()
