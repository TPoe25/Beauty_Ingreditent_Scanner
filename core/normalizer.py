#!/usr/bin/env python3
"""
Shared helpers for turning external source data into the same ingredient shape
used by data/ingredients.final.json and prisma/seed.ts.
"""

from __future__ import annotations

import re
from typing import Iterable, List, Dict, Any


def normalize_name(value: str) -> str:
    return (
        (value or "")
        .lower()
        .strip()
        .replace("&", " and ")
    ).replace("\u00ae", "").replace("\u2122", "")


def normalize_ingredient_name(value: str) -> str:
    value = normalize_name(value)
    value = re.sub(r"\(.*?\)", "", value)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    value = re.sub(r"\s+", " ", value).strip()
    return value


def clean_text(value: str | None) -> str | None:
    if not value:
        return None
    value = re.sub(r"\s+", " ", value).strip()
    return value or None


def uniq_strs(values: Iterable[str]) -> List[str]:
    seen = set()
    out: List[str] = []

    for value in values:
        if not isinstance(value, str):
            continue
        cleaned = clean_text(value)
        if not cleaned:
            continue
        key = cleaned.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(cleaned)

    return out


def infer_risk(concerns: Iterable[str], description: str | None = None) -> tuple[str, int, str]:
    """
    Very simple heuristic for first pass.
    You can tighten this later.
    """
    concern_text = " ".join(uniq_strs(concerns)).lower()
    desc_text = (description or "").lower()
    blob = f"{concern_text} {desc_text}"

    high_terms = [
        "boxed warning",
        "carcinogen",
        "mutagen",
        "severe",
        "restricted",
        "prohibited",
        "toxic",
        "poison",
        "organ toxicity",
    ]
    moderate_terms = [
        "irritation",
        "allergen",
        "sensitivity",
        "dryness",
        "photosensitivity",
        "caution",
        "warning",
        "adverse reaction",
        "contact dermatitis",
        "avoid",
    ]

    if any(term in blob for term in high_terms):
        return ("high", 40, "high_review_needed")

    if any(term in blob for term in moderate_terms):
        return ("moderate", 15, "moderate_context")

    return ("low", 3, "mvp_safe")


def build_seed_record(
    *,
    name: str,
    description: str | None = None,
    source: str | None = None,
    category: str | None = None,
    concerns: Iterable[str] | None = None,
    aliases: Iterable[str] | None = None,
    risk_level: str | None = None,
    risk_score: int | None = None,
    review_bucket: str | None = None,
) -> Dict[str, Any]:
    clean_name = clean_text(name)
    if not clean_name:
        raise ValueError("Ingredient name is required")

    clean_description = clean_text(description)
    clean_concerns = uniq_strs(concerns or [])
    clean_aliases = uniq_strs(aliases or [])
    clean_source = clean_text(source)
    clean_category = clean_text(category)

    if not risk_level or risk_score is None or not review_bucket:
        inferred_level, inferred_score, inferred_bucket = infer_risk(
            clean_concerns, clean_description
        )
        risk_level = risk_level or inferred_level
        risk_score = risk_score if risk_score is not None else inferred_score
        review_bucket = review_bucket or inferred_bucket

    normalized = normalize_ingredient_name(clean_name)

    return {
        "name": clean_name,
        "normalizedName": normalized,
        "riskLevel": risk_level,
        "riskScore": risk_score,
        "description": clean_description,
        "reviewBucket": review_bucket,
        "category": clean_category,
        "source": clean_source,
        "aliases": clean_aliases,
        "concerns": clean_concerns,
    }


def merge_records(existing: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    """
    Merge two records for the same normalized ingredient.
    Keeps the higher risk score and combines text/aliases/concerns/sources.
    """
    result = dict(existing)

    existing_score = int(existing.get("riskScore") or 0)
    incoming_score = int(incoming.get("riskScore") or 0)

    if incoming_score > existing_score:
        result["riskLevel"] = incoming.get("riskLevel", result.get("riskLevel"))
        result["riskScore"] = incoming_score
        result["reviewBucket"] = incoming.get("reviewBucket", result.get("reviewBucket"))

    if not result.get("description") and incoming.get("description"):
        result["description"] = incoming["description"]
    elif result.get("description") and incoming.get("description"):
        if incoming["description"] not in result["description"]:
            result["description"] = f'{result["description"]} | {incoming["description"]}'

    result["aliases"] = uniq_strs([
        *(result.get("aliases") or []),
        *(incoming.get("aliases") or []),
    ])

    result["concerns"] = uniq_strs([
        *(result.get("concerns") or []),
        *(incoming.get("concerns") or []),
    ])

    sources = uniq_strs([
        *(str(result.get("source") or "").split(" | ") if result.get("source") else []),
        *(str(incoming.get("source") or "").split(" | ") if incoming.get("source") else []),
    ])
    result["source"] = " | ".join(sources) if sources else None

    if not result.get("category") and incoming.get("category"):
        result["category"] = incoming["category"]

    return result
