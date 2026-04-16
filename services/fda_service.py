#!/usr/bin/env python3
"""
Fetch ingredient-related FDA drug label data from openFDA.

Supports two input modes:
1. Manual ingredient input via --queries or --queries-file
2. Database-driven ingredient input via --from-db

Important:
- This works best for ingredients that appear in OTC/drug labels
  such as salicylic acid, zinc oxide, titanium dioxide, benzoyl peroxide, etc.
- Cosmetic-only ingredients may return no result.
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, List

import psycopg2
from dotenv import load_dotenv

from core.normalizer import build_seed_record, uniq_strs, clean_text

load_dotenv()

OPENFDA_BASE = "https://api.fda.gov/drug/label.json"


def read_queries_from_file(
    queries: List[str] | None,
    queries_file: str | None,
) -> List[str]:
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


def read_queries_from_db(limit: int | None = None) -> List[str]:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is missing from environment")

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor() as cur:
            sql = 'SELECT name FROM "Ingredient" ORDER BY name ASC'
            if limit:
                sql += " LIMIT %s"
                cur.execute(sql, (limit,))
            else:
                cur.execute(sql)

            rows = cur.fetchall()
            return uniq_strs([row[0] for row in rows if row and row[0]])
    finally:
        conn.close()


def get_terms(
    *,
    queries: List[str] | None,
    queries_file: str | None,
    from_db: bool,
    db_limit: int | None,
) -> List[str]:
    if from_db:
        return read_queries_from_db(limit=db_limit)
    return read_queries_from_file(queries, queries_file)


def is_valid_ingredient_name(name: str) -> bool:
    lowered = name.lower().strip()

    blocked_substrings = [
        "cosing",
        "european commission",
        "growth - european commission",
        "beautyfeeds",
        "nih",
        "pubchem",
    ]

    if not lowered:
        return False

    if lowered.startswith("substance:"):
        return False

    if any(term in lowered for term in blocked_substrings):
        return False

    if len(name) > 80:
        return False

    if name.count(" ") > 10:
        return False

    return True


def fetch_json(url: str) -> Dict[str, Any]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "beauty-scanner/1.0 (+ingredient enrichment pipeline)"
        },
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def build_query(term: str) -> str:
    search = (
        f'active_ingredient:"{term}"'
        f'+OR+inactive_ingredient:"{term}"'
        f'+OR+openfda.generic_name:"{term}"'
        f'+OR+openfda.substance_name:"{term}"'
    )
    return f"{OPENFDA_BASE}?search={urllib.parse.quote(search, safe=':+\"')}&limit=5"


def as_text_list(value: Any) -> List[str]:
    if isinstance(value, list):
        out: List[str] = []
        for item in value:
            if isinstance(item, str):
                item = clean_text(item)
                if item:
                    out.append(item)
        return out

    if isinstance(value, str):
        cleaned = clean_text(value)
        return [cleaned] if cleaned else []

    return []


def looks_like_product_name(value: str) -> bool:
    value_lower = value.lower()

    blocked_terms = [
        "deodorant",
        "spray",
        "cream",
        "lotion",
        "wash",
        "cleanser",
        "serum",
        "shampoo",
        "conditioner",
        "sunscreen",
        "spf",
        "body wash",
        "antiperspirant",
        "moisturizer",
        "soap",
        "gel",
        "mask",
        "toner",
        "product",
    ]

    if len(value) > 80:
        return True

    if value.count(" ") > 6:
        return True

    return any(term in value_lower for term in blocked_terms)


def clean_aliases(term: str, aliases: List[str]) -> List[str]:
    cleaned: List[str] = []

    for alias in uniq_strs(aliases):
        if alias.casefold() == term.casefold():
            continue
        if looks_like_product_name(alias):
            continue
        cleaned.append(alias)

    return cleaned[:15]


def parse_fda_results(term: str, payload: Dict[str, Any]) -> Dict[str, Any] | None:
    results = payload.get("results")
    if not isinstance(results, list) or not results:
        return None

    concerns: List[str] = []
    descriptions: List[str] = []
    aliases: List[str] = []

    for item in results:
        if not isinstance(item, dict):
            continue

        descriptions.extend(as_text_list(item.get("purpose")))
        descriptions.extend(as_text_list(item.get("indications_and_usage")))
        descriptions.extend(as_text_list(item.get("description")))

        concerns.extend(as_text_list(item.get("warnings")))
        concerns.extend(as_text_list(item.get("warnings_and_cautions")))
        concerns.extend(as_text_list(item.get("do_not_use")))
        concerns.extend(as_text_list(item.get("stop_use")))
        concerns.extend(as_text_list(item.get("ask_doctor")))
        concerns.extend(as_text_list(item.get("pregnancy_or_breast_feeding")))
        concerns.extend(as_text_list(item.get("adverse_reactions")))
        concerns.extend(as_text_list(item.get("boxed_warning")))

        openfda = item.get("openfda") or {}
        if isinstance(openfda, dict):
            aliases.extend(as_text_list(openfda.get("generic_name")))
            aliases.extend(as_text_list(openfda.get("substance_name")))

    description = " ".join(uniq_strs(descriptions)[:3]) or (
        f"FDA label-related information found for {term}."
    )

    return build_seed_record(
        name=term,
        description=description,
        source="OPENFDA_DRUG_LABEL",
        category="regulatory",
        concerns=uniq_strs(concerns)[:20],
        aliases=clean_aliases(term, aliases),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--queries", nargs="*", help="Ingredient names")
    parser.add_argument("--queries-file", help="One ingredient per line")
    parser.add_argument("--from-db", action="store_true", help="Read ingredient names from PostgreSQL")
    parser.add_argument("--db-limit", type=int, help="Limit number of DB ingredient names to read")
    parser.add_argument("--output", required=True, help="Output JSON file")
    parser.add_argument("--sleep", type=float, default=0.25, help="Delay between requests")
    args = parser.parse_args()

    terms = get_terms(
        queries=args.queries,
        queries_file=args.queries_file,
        from_db=args.from_db,
        db_limit=args.db_limit,
    )

    if not terms:
        raise SystemExit("No ingredient terms found. Use --from-db or provide --queries / --queries-file.")

    records: List[Dict[str, Any]] = []

    for term in terms:
        if not is_valid_ingredient_name(term):
            print(f"[SKIP] invalid term: {term}")
            continue

        url = build_query(term)
        try:
            payload = fetch_json(url)
            record = parse_fda_results(term, payload)
            if record:
                records.append(record)
                print(f"[FDA] matched: {term}")
            else:
                print(f"[FDA] no match: {term}")
        except Exception as exc:
            print(f"[FDA] error for {term}: {exc}")

        time.sleep(args.sleep)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(records, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"Wrote {len(records)} FDA records to {output_path}")


if __name__ == "__main__":
    main()
