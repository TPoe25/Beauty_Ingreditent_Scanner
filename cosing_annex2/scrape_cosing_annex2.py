# File: scrape_cosing_annex2.py
#
# Setup (WSL):
#   python3 -m venv .venv
#   source .venv/bin/activate
#   python -m pip install -U pip playwright
#   python -m playwright install chromium
#
# Run (debug small):
#   python scrape_cosing_annex2.py --max-pages 2 --max-entries 20 --debug
#
# Run headful if debugging paginator/consent UI:
#   python scrape_cosing_annex2.py --max-pages 2 --max-entries 20 --headful --slowmo 200 --debug
#
# Full run (resumable):
#   python scrape_cosing_annex2.py --out cosing_annex2 --throttle 0.7 --debug
#
# Outputs:
#   <out>.jsonl  (appended incrementally; resumable)
#   <out>.csv    (rebuilt from jsonl each run)
#   <out>_debug/ (optional html/png dumps when --debug)

from __future__ import annotations

import argparse
import csv
import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set

from playwright.sync_api import Browser, Page, sync_playwright


ANNEX_II_URL = "https://ec.europa.eu/growth/tools-databases/cosing/reference/annexes/list/II"
DETAILS_ID_RE = re.compile(r"/details/(\d+)\b")


@dataclass(frozen=True)
class EntryRef:
    entry_id: str
    url: str


def _sleep(seconds: float) -> None:
    time.sleep(seconds)


def _extract_entry_id(url: str) -> Optional[str]:
    m = DETAILS_ID_RE.search(url)
    return m.group(1) if m else None


def _dump_debug(page: Page, out_dir: Path, tag: str) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    html_path = out_dir / f"{tag}.html"
    png_path = out_dir / f"{tag}.png"
    try:
        html_path.write_text(page.content(), encoding="utf-8")
    except Exception:
        pass
    try:
        page.screenshot(path=str(png_path), full_page=True)
    except Exception:
        pass


def _accept_cookies_if_present(page: Page) -> None:
    candidates = [
        "button:has-text('Accept all cookies')",
        "button:has-text('Accept all')",
        "button:has-text('Accept')",
        "button:has-text('I accept')",
        "button:has-text('Agree')",
        "button:has-text('OK')",
        "button:has-text('Allow all')",
        "a:has-text('Accept all cookies')",
        "a:has-text('Accept')",
    ]
    for sel in candidates:
        loc = page.locator(sel).first
        try:
            if loc.count() and loc.is_visible():
                loc.click(timeout=1500)
                page.wait_for_timeout(600)
                return
        except Exception:
            continue


def _wait_for_results(page: Page, timeout_ms: int = 30000) -> None:
    page.wait_for_load_state("domcontentloaded")
    _accept_cookies_if_present(page)

    try:
        page.wait_for_selector(
            "a[href*='/growth/tools-databases/cosing/details/'], a[href*='/details/']",
            timeout=timeout_ms,
        )
        return
    except Exception:
        pass

    for sel in ["table", "div:has-text('records')", "div:has-text('record')"]:
        try:
            page.wait_for_selector(sel, timeout=6000)
            _accept_cookies_if_present(page)
            return
        except Exception:
            continue


def _collect_detail_links_on_page(page: Page) -> List[str]:
    hrefs = page.eval_on_selector_all(
        "a[href*='/growth/tools-databases/cosing/details/'], a[href*='/details/']",
        "els => els.map(a => a.href).filter(Boolean)",
    )
    seen = set()
    out: List[str] = []
    for h in hrefs:
        if h in seen:
            continue
        seen.add(h)
        out.append(h)
    return out


def _try_click_next(page: Page) -> bool:
    _accept_cookies_if_present(page)

    selectors = [
        "a[rel='next']",
        "a[aria-label*='Next' i]",
        "button[aria-label*='Next' i]",
        "a[title*='Next' i]",
        "button[title*='Next' i]",
        "a.page-link[aria-label*='Next' i]",
        "button.page-link[aria-label*='Next' i]",
        "[class*='next' i] a",
        "[class*='next' i] button",
        "a:has-text('Next')",
        "button:has-text('Next')",
        "a:has-text('›')",
        "button:has-text('›')",
        "a:has-text('»')",
        "button:has-text('»')",
        "a:has-text('>')",
        "button:has-text('>')",
    ]

    def _click_if_possible(loc) -> bool:
        try:
            if loc.count() == 0:
                return False
            loc = loc.first
            if not loc.is_visible():
                return False
            aria_disabled = (loc.get_attribute("aria-disabled") or "").lower()
            if aria_disabled == "true":
                return False
            if loc.get_attribute("disabled") is not None:
                return False
            loc.click(timeout=2500)
            page.wait_for_load_state("domcontentloaded")
            page.wait_for_timeout(900)
            _accept_cookies_if_present(page)
            return True
        except Exception:
            return False

    for sel in selectors:
        if _click_if_possible(page.locator(sel)):
            return True

    try:
        cand = page.locator("a,button,[role='button']").filter(
            has_text=re.compile(r"^\s*(next|›|»|>)\s*$", re.I)
        )
        if _click_if_possible(cand):
            return True
    except Exception:
        pass

    try:
        arrow_like = page.locator("a,button,[role='button']").filter(
            has_text=re.compile(r"(›|»|>)", re.I)
        )
        n = arrow_like.count()
        for i in range(n - 1, -1, -1):
            loc = arrow_like.nth(i)
            if _click_if_possible(loc):
                return True
    except Exception:
        pass

    return False


def collect_annex_ii_entry_refs(
    page: Page,
    *,
    max_pages: Optional[int],
    throttle_s: float,
    debug: bool,
    debug_dir: Path,
) -> List[EntryRef]:
    page.goto(ANNEX_II_URL, wait_until="domcontentloaded")
    _wait_for_results(page)

    refs: Dict[str, EntryRef] = {}
    page_no = 0
    stagnant_rounds = 0

    while True:
        page_no += 1
        if max_pages is not None and page_no > max_pages:
            break

        _accept_cookies_if_present(page)
        links = _collect_detail_links_on_page(page)

        before = len(refs)
        for href in links:
            entry_id = _extract_entry_id(href)
            if not entry_id:
                continue
            refs.setdefault(entry_id, EntryRef(entry_id=entry_id, url=href))
        after = len(refs)

        if debug:
            print(f"[list] page {page_no}: links={len(links)} | total_unique={after} | +{after - before}")

        if not links and debug:
            _dump_debug(page, debug_dir, f"listing_page_{page_no}_no_links")

        if after == before:
            stagnant_rounds += 1
        else:
            stagnant_rounds = 0

        if stagnant_rounds >= 2:
            if debug:
                print("[list] stopping: no new IDs discovered for 2 consecutive pages")
            break

        if not _try_click_next(page):
            if debug:
                print("[list] stopping: could not find/click next")
            break

        _sleep(throttle_s)

    return sorted(refs.values(), key=lambda r: int(r.entry_id))


def scrape_details(page: Page, ref: EntryRef, *, throttle_s: float, debug: bool, debug_dir: Path) -> Dict[str, Any]:
    page.goto(ref.url, wait_until="domcontentloaded")
    page.wait_for_timeout(900)
    _accept_cookies_if_present(page)
    _sleep(throttle_s)

    data = page.evaluate(
        """() => {
            const out = {};
            const norm = (s) => (s || '').replace(/\\s+/g,' ').trim();

            out.page_url = location.href;
            const h1 = document.querySelector('h1');
            out.title = norm(h1 ? h1.innerText : document.title);

            const dts = Array.from(document.querySelectorAll('dt'));
            for (const dt of dts) {
              const dd = dt.nextElementSibling;
              if (!dd || dd.tagName.toLowerCase() !== 'dd') continue;
              const k = norm(dt.innerText).replace(/:$/,'');
              const v = norm(dd.innerText);
              if (k && v) out[k] = v;
            }

            const rows = Array.from(document.querySelectorAll('table tr'));
            for (const tr of rows) {
              const cells = Array.from(tr.querySelectorAll('th,td')).map(c => norm(c.innerText));
              if (cells.length === 2 && cells[0] && cells[1]) {
                const k = cells[0].replace(/:$/,'');
                const v = cells[1];
                if (!out[k]) out[k] = v;
              }
            }

            const sections = [];
            const heads = Array.from(document.querySelectorAll('h2,h3'));
            for (const h of heads) {
              const title = norm(h.innerText);
              if (!title) continue;
              const chunk = [];
              let n = h.nextElementSibling;
              while (n && !['H2','H3'].includes(n.tagName)) {
                const txt = norm(n.innerText);
                if (txt) chunk.push(txt);
                n = n.nextElementSibling;
              }
              if (chunk.length) sections.push({ heading: title, text: chunk.join('\\n') });
            }
            if (sections.length) out.sections = sections;

            return out;
        }"""
    )

    data["entry_id"] = ref.entry_id

    meaningful_keys = [k for k in data.keys() if k not in {"entry_id"}]
    if debug and len(meaningful_keys) <= 2:
        _dump_debug(page, debug_dir, f"details_{ref.entry_id}_thin")

    return data


def _load_scraped_ids(jsonl_path: Path) -> Set[str]:
    if not jsonl_path.exists():
        return set()
    ids: Set[str] = set()
    with jsonl_path.open("r", encoding="utf-8") as f:
        for line in f:
            try:
                obj = json.loads(line)
                eid = str(obj.get("entry_id") or "").strip()
                if eid:
                    ids.add(eid)
            except Exception:
                continue
    return ids


def write_jsonl_append(path: Path, row: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def load_all_rows(jsonl_path: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    if not jsonl_path.exists():
        return rows
    with jsonl_path.open("r", encoding="utf-8") as f:
        for line in f:
            try:
                rows.append(json.loads(line))
            except Exception:
                continue
    return rows


def write_flat_csv(path: Path, rows: List[Dict[str, Any]]) -> None:
    keys: List[str] = []
    seen = set()
    for r in rows:
        for k in r.keys():
            if k not in seen:
                seen.add(k)
                keys.append(k)

    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        for r in rows:
            w.writerow(
                {
                    k: (
                        r.get(k)
                        if not isinstance(r.get(k), (dict, list))
                        else json.dumps(r.get(k), ensure_ascii=False)
                    )
                    for k in keys
                }
            )


def run(
    *,
    out_prefix: str,
    max_pages: Optional[int],
    max_entries: Optional[int],
    throttle_s: float,
    headful: bool,
    slowmo_ms: int,
    debug: bool,
) -> None:
    out_base = Path(out_prefix)
    jsonl_path = out_base.with_suffix(".jsonl")
    csv_path = out_base.with_suffix(".csv")
    debug_dir = Path(f"{out_prefix}_debug")

    scraped_ids = _load_scraped_ids(jsonl_path)
    if debug and scraped_ids:
        print(f"[resume] found {len(scraped_ids)} existing entry_id(s) in {jsonl_path}")

    with sync_playwright() as p:
        browser: Browser = p.chromium.launch(headless=not headful, slow_mo=slowmo_ms or 0)
        page = browser.new_page(viewport={"width": 1280, "height": 900})

        refs = collect_annex_ii_entry_refs(
            page,
            max_pages=max_pages,
            throttle_s=throttle_s,
            debug=debug,
            debug_dir=debug_dir,
        )

        if max_entries is not None:
            refs = refs[:max_entries]

        refs_todo = [r for r in refs if r.entry_id not in scraped_ids]

        if debug:
            print(f"[list] total unique discovered: {len(refs)}")
            print(f"[resume] remaining to scrape: {len(refs_todo)}")

        if not refs:
            if debug:
                _dump_debug(page, debug_dir, "listing_final_no_entries")
                print(f"[debug] Dumped HTML+PNG to: {debug_dir.resolve()}")
            raise SystemExit("No entries found on Annex II listing (0 discovered). Use --headful --slowmo 200 --debug.")

        if not refs_todo:
            print("Nothing to do: all discovered entries are already in JSONL.")
        else:
            for i, ref in enumerate(refs_todo, start=1):
                try:
                    row = scrape_details(page, ref, throttle_s=throttle_s, debug=debug, debug_dir=debug_dir)
                    write_jsonl_append(jsonl_path, row)
                    print(f"[{i}/{len(refs_todo)}] scraped {ref.entry_id}")
                except Exception as e:
                    err = {"entry_id": ref.entry_id, "page_url": ref.url, "error": str(e)}
                    write_jsonl_append(jsonl_path, err)
                    print(f"[{i}/{len(refs_todo)}] FAILED {ref.entry_id}: {e}")

        browser.close()

    all_rows = load_all_rows(jsonl_path)
    write_flat_csv(csv_path, all_rows)

    print(f"\nWrote:\n  {jsonl_path}\n  {csv_path}")
    if debug:
        print(f"[debug] Debug artifacts (if any): {debug_dir.resolve()}")


def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="Scrape CosIng Annex II (Prohibited) list into JSONL + CSV (resumable)."
    )
    ap.add_argument("--out", default="cosing_annex2", help="Output file prefix (default: cosing_annex2)")
    ap.add_argument("--max-pages", type=int, default=None, help="Limit pagination pages (debug)")
    ap.add_argument("--max-entries", type=int, default=None, help="Limit number of entries (debug)")
    ap.add_argument("--throttle", type=float, default=0.7, help="Seconds to sleep between actions (default: 0.7)")
    ap.add_argument("--headful", action="store_true", help="Run with visible browser window")
    ap.add_argument("--slowmo", type=int, default=0, help="Slow down Playwright actions (ms)")
    ap.add_argument("--debug", action="store_true", help="Write debug HTML+PNG dumps when things look wrong")
    return ap.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run(
        out_prefix=args.out,
        max_pages=args.max_pages,
        max_entries=args.max_entries,
        throttle_s=max(0.2, args.throttle),
        headful=args.headful,
        slowmo_ms=max(0, args.slowmo),
        debug=args.debug,
    )