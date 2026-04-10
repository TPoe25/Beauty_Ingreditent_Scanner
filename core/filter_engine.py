#!/usr/bin/env python3
"""
Merge base ingredient data with FDA/literature enrichment data and write a final file
that prisma/seed.ts already knows how to import.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List

from core.normalizer import merge_records


def load_json_array(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []

    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)

    if not isinstance(data, list):
        raise ValueError(f"{path} must contain a JSON array")

    return [item for item in data if isinstance(item, dict)]


def save_json_array(path: Path, records: List[Dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(records, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def merge_datasets(base_records: List[Dict[str, Any]], extra_records: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    by_key: Dict[str, Dict[str, Any]] = {}

    for record in base_records:
        key = record.get("normalizedName") or record.get("name", "").lower().strip()
        if key:
            by_key[key] = record

    for record in extra_records:
        key = record.get("normalizedName") or record.get("name", "").lower().strip()
        if not key:
            continue

        if key in by_key:
            by_key[key] = merge_records(by_key[key], record)
        else:
            by_key[key] = record

    merged = list(by_key.values())
    merged.sort(key=lambda item: (item.get("name") or "").lower())
    return merged


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", required=True, help="Base JSON file, e.g. data/ingredients.final.json")
    parser.add_argument("--extra", nargs="+", required=True, help="Extra JSON files to merge")
    parser.add_argument("--out", required=True, help="Output merged JSON file")
    args = parser.parse_args()

    base_path = Path(args.base)
    out_path = Path(args.out)

    base_records = load_json_array(base_path)
    extra_records: List[Dict[str, Any]] = []

    for raw_path in args.extra:
        extra_records.extend(load_json_array(Path(raw_path)))

    merged = merge_datasets(base_records, extra_records)
    save_json_array(out_path, merged)

    print(f"Base records:   {len(base_records)}")
    print(f"Extra records:  {len(extra_records)}")
    print(f"Merged records: {len(merged)}")
    print(f"Wrote: {out_path}")


if __name__ == "__main__":
    main()
