# File: pubchem_service.py
#
# What this does
# - GET /autocomplete?q=niac  -> PubChem autocomplete suggestions (optional UI helper)
# - GET /search?q=niacinamide -> returns [{cid, name, synonyms[], toxicity_text}] (no caching)
#
# Setup (WSL)
#   python3 -m venv .venv
#   source .venv/bin/activate
#   pip install -U fastapi uvicorn httpx
#
# Run
#   uvicorn pubchem_service:app --host 0.0.0.0 --port 8000
#
# Try
#   curl "http://localhost:8000/autocomplete?q=niac&limit=8"
#   curl "http://localhost:8000/search?q=niacinamide&limit=3"

from __future__ import annotations

import asyncio
import re
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware


PUBCHEM_BASE = "https://pubchem.ncbi.nlm.nih.gov"
DEFAULT_TIMEOUT_S = 30.0

app = FastAPI(title="PubChem Search Service", version="0.1.0")

# Allow your app to call this service from a browser/webview if needed.
# Tighten origins later.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _norm_ws(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip())


async def _get_json(client: httpx.AsyncClient, url: str) -> Dict[str, Any]:
    r = await client.get(url)
    r.raise_for_status()
    return r.json()


async def pubchem_autocomplete(client: httpx.AsyncClient, q: str, limit: int) -> List[str]:
    """
    PubChem Auto-Complete Search Service (dictionary: compound)
    Response commonly contains: {"dictionary_terms": {"compound": [...]}, ...}
    """
    url = f"{PUBCHEM_BASE}/rest/autocomplete/compound/{quote(q)}/json?limit={limit}"
    data = await _get_json(client, url)

    # Primary (what PubChem returns)
    terms = (data.get("dictionary_terms") or data.get("DictionaryTerms") or {})
    compound_terms = terms.get("compound") or terms.get("Compound") or []
    if compound_terms:
        return [_norm_ws(x) for x in compound_terms if _norm_ws(x)]

    # Fallbacks (rare / defensive)
    results = data.get("results") or data.get("Results") or []
    out: List[str] = []
    for item in results:
        if isinstance(item, str):
            out.append(item)
        elif isinstance(item, dict):
            out.append(item.get("text") or item.get("name") or "")
    return [_norm_ws(x) for x in out if _norm_ws(x)]

async def name_to_cids(client: httpx.AsyncClient, q: str) -> List[int]:
    """
    PUG-REST: name -> CID list
    """
    url = f"{PUBCHEM_BASE}/rest/pug/compound/name/{quote(q)}/cids/JSON"
    try:
        data = await _get_json(client, url)
    except httpx.HTTPStatusError as e:
        if e.response.status_code in (400, 404):
            return []
        raise
    cids = data.get("IdentifierList", {}).get("CID", [])
    return [int(x) for x in cids]


async def cid_synonyms(client: httpx.AsyncClient, cid: int) -> List[str]:
    """
    PUG-REST: CID -> synonyms
    """
    url = f"{PUBCHEM_BASE}/rest/pug/compound/cid/{cid}/synonyms/JSON"
    data = await _get_json(client, url)
    info = (data.get("InformationList", {}).get("Information") or [])
    if not info:
        return []
    syns = info[0].get("Synonym") or []
    return [_norm_ws(s) for s in syns if _norm_ws(s)]


async def cid_title(client: httpx.AsyncClient, cid: int) -> str:
    """
    Best-effort "name" for display. Prefer first synonym if available; otherwise fallback to CID label.
    """
    syns = await cid_synonyms(client, cid)
    return syns[0] if syns else f"CID {cid}"


def _pugview_to_text(node: Any) -> str:
    """
    Flatten PUG-View JSON into readable text.
    PUG-View is nested (Record -> Section -> Information).
    We extract strings from common fields (TOCHeading, Name, Value/StringWithMarkup).
    """
    parts: List[str] = []

    def walk(x: Any) -> None:
        if x is None:
            return
        if isinstance(x, str):
            t = _norm_ws(x)
            if t:
                parts.append(t)
            return
        if isinstance(x, list):
            for i in x:
                walk(i)
            return
        if isinstance(x, dict):
            # Common PUG-View fields
            for k in ("TOCHeading", "Heading", "Name", "Value", "String", "Description", "Text"):
                if k in x:
                    walk(x[k])

            # Markup blocks
            if "StringWithMarkup" in x and isinstance(x["StringWithMarkup"], list):
                for item in x["StringWithMarkup"]:
                    if isinstance(item, dict) and "String" in item:
                        walk(item["String"])

            # Recurse into typical nesting keys
            for k in ("Record", "Section", "Information", "Data", "Reference", "Table", "Row", "Cell"):
                if k in x:
                    walk(x[k])
            return

    walk(node)

    # De-dup consecutive duplicates
    cleaned: List[str] = []
    for p in parts:
        if not cleaned or cleaned[-1] != p:
            cleaned.append(p)

    # Join into a readable blob
    text = "\n".join(cleaned)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text


async def cid_toxicity_text(client: httpx.AsyncClient, cid: int) -> str:
    """
    PUG-View: try a few headings commonly used for toxicity/safety content.
    """
    headings = [
        "Toxicity",
        "Toxicological Information",
        "Toxicity Summary",
        "Safety and Hazards",
        "Hazards Identification",
        "GHS Classification",
    ]

    for h in headings:
        url = (
            f"{PUBCHEM_BASE}/rest/pug_view/data/compound/{cid}/JSON/"
            f"?heading={quote(h)}&response_type=display"
        )
        try:
            data = await _get_json(client, url)
            text = _pugview_to_text(data)
            if text:
                return text
        except httpx.HTTPStatusError as e:
            # 404/400 if heading not found for that CID; try next heading.
            if e.response.status_code in (400, 404):
                continue
            raise
    return ""


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/autocomplete")
async def autocomplete(
    q: str = Query(..., min_length=1),
    limit: int = Query(8, ge=1, le=20),
) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_S) as client:
        results = await pubchem_autocomplete(client, q, limit)
        return {"query": q, "results": results}


@app.get("/search")
async def search(
    q: str = Query(..., min_length=1),
    limit: int = Query(3, ge=1, le=10),
    max_synonyms: int = Query(50, ge=0, le=500),
) -> Dict[str, Any]:
    """
    Returns top N CID matches for the query, with:
      - name (best-effort display name)
      - synonyms (up to max_synonyms)
      - toxicity_text (flattened from PUG-View)
    """
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_S) as client:
        try:
            cids = await name_to_cids(client, q)
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=502, detail=f"PubChem error: {e.response.status_code}") from e
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"PubChem request failed: {e}") from e

        if not cids:
            return {"query": q, "results": []}

        cids = cids[:limit]

        async def build(cid: int) -> Dict[str, Any]:
            syns_task = asyncio.create_task(cid_synonyms(client, cid))
            tox_task = asyncio.create_task(cid_toxicity_text(client, cid))
            syns = await syns_task
            tox = await tox_task
            name = syns[0] if syns else f"CID {cid}"
            return {
                "cid": cid,
                "name": name,
                "synonyms": syns[:max_synonyms],
                "toxicity_text": tox,
            }

        results = await asyncio.gather(*(build(cid) for cid in cids))
        return {"query": q, "results": results}
