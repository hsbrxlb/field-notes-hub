#!/usr/bin/env python3
"""Run the deterministic OEDRO scan and emit only public-safe Hub data."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import sqlite3
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "data" / "demand-radar.json"
DEFAULT_STATE = ROOT / ".github" / "demand-radar-state.json"
SCANNER_REVISION = "36ea88b73c36ee951b7f200bb5d22ca7f29e9b18"
ALLOWED_TOPICS = {
    "complaint", "support", "installation", "fitment", "recommendation",
    "tonneau_cover", "running_boards", "floor_mats", "bumper", "general",
}
ALLOWED_FAMILIES = {"reddit", "forum", "youtube", "bluesky"}
TRACKING_QUERY_KEYS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "gclid", "fbclid", "mc_cid", "mc_eid",
}


def utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def atomic_write(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_suffix(path.suffix + ".partial")
    partial.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    partial.replace(path)


def normalize_url(value: str) -> str:
    parsed = urlsplit(value.strip())
    if parsed.scheme.lower() != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("source URL must be public HTTPS without credentials")
    query = [
        (key, item) for key, item in parse_qsl(parsed.query, keep_blank_values=True)
        if key.lower() not in TRACKING_QUERY_KEYS
    ]
    return urlunsplit(("https", parsed.netloc.lower(), parsed.path or "/", urlencode(query), ""))


def public_signal_id(url: str, key: str) -> str:
    return hmac.new(key.encode("utf-8"), normalize_url(url).encode("utf-8"), hashlib.sha256).hexdigest()


def validate_state(state: dict[str, Any]) -> None:
    if set(state) != {"schema_version", "updated_at", "query_plan_revision", "cursors", "seen", "last_run"}:
        raise ValueError("state fields do not match contract")
    if state["schema_version"] != 1 or state["query_plan_revision"] != SCANNER_REVISION:
        raise ValueError("state metadata does not match scanner revision")
    if not isinstance(state["cursors"], dict) or not isinstance(state["seen"], dict):
        raise ValueError("state cursors and seen must be objects")
    for key, value in state["cursors"].items():
        if not isinstance(key, str) or "|" not in key or not isinstance(value, int) or value < 0:
            raise ValueError("state cursor is invalid")
    for signal_id, record in state["seen"].items():
        if not isinstance(signal_id, str) or len(signal_id) != 64 or any(char not in "0123456789abcdef" for char in signal_id):
            raise ValueError("state signal id is invalid")
        if set(record or {}) != {"first_seen", "last_seen"}:
            raise ValueError("state seen record is invalid")


def safe_timestamp(value: Any, fallback: str) -> str:
    if isinstance(value, str):
        try:
            datetime.fromisoformat(value.replace("Z", "+00:00"))
            return value
        except ValueError:
            pass
    return fallback


def build_public_item(row: dict[str, Any], key: str, now: str, truth_blocked: bool) -> dict[str, Any] | None:
    try:
        metadata = json.loads(row.get("metadata_json") or "{}")
    except json.JSONDecodeError:
        return None
    family = metadata.get("source_family")
    if family not in ALLOWED_FAMILIES:
        return None
    topic = row.get("category") if row.get("category") in ALLOWED_TOPICS else "general"
    direct = bool(row.get("direct_brand"))
    if not direct:
        return None
    triage_status = row.get("status")
    if triage_status not in {"NEEDS_FACTS", "DRAFT_READY"}:
        return None
    if truth_blocked:
        triage_status = "NEEDS_FACTS"
    source_link = normalize_url(str(row.get("canonical_url") or ""))
    observed_at = safe_timestamp(row.get("published_at") or row.get("discovered_at"), now)
    return {
        "signal_id": public_signal_id(source_link, key),
        "topic": topic,
        "source_family": family,
        "source_link": source_link,
        "reason_code": "direct_oedro_question",
        "next_action": "verify_product_facts" if triage_status == "NEEDS_FACTS" else "review_reply_opportunity",
        "triage_status": triage_status,
        "observed_at": observed_at,
        "last_seen_at": now,
    }


def prune_seen(seen: dict[str, Any], now: str, days: int = 90, limit: int = 5000) -> dict[str, Any]:
    cutoff = datetime.fromisoformat(now) - timedelta(days=days)
    kept = []
    for signal_id, record in seen.items():
        try:
            last_seen = datetime.fromisoformat(record["last_seen"].replace("Z", "+00:00"))
        except (KeyError, TypeError, ValueError):
            continue
        if last_seen >= cutoff:
            kept.append((last_seen, signal_id, record))
    kept.sort(reverse=True)
    return {signal_id: record for _, signal_id, record in kept[:limit]}


def merge_items(existing: list[dict[str, Any]], current: list[dict[str, Any]], now: str) -> tuple[list[dict[str, Any]], int, int]:
    cutoff = datetime.fromisoformat(now) - timedelta(days=30)
    merged: dict[str, dict[str, Any]] = {}
    for item in existing:
        try:
            last_seen = datetime.fromisoformat(item["last_seen_at"].replace("Z", "+00:00"))
        except (KeyError, TypeError, ValueError):
            continue
        if (
            last_seen >= cutoff
            and isinstance(item.get("signal_id"), str)
            and item.get("reason_code") == "direct_oedro_question"
        ):
            merged[item["signal_id"]] = item
    new_count = 0
    duplicate_count = 0
    for item in current:
        if item["signal_id"] in merged:
            duplicate_count += 1
        else:
            new_count += 1
        merged[item["signal_id"]] = item
    items = sorted(merged.values(), key=lambda item: item["last_seen_at"], reverse=True)[:100]
    return items, new_count, duplicate_count


def enforce_truth_gate(items: list[dict[str, Any]], blocked: bool) -> list[dict[str, Any]]:
    output = [dict(item) for item in items]
    if not blocked:
        return output
    for item in output:
        item["triage_status"] = "NEEDS_FACTS"
        item["next_action"] = "verify_product_facts"
    return output


def _seed_cursors(db_path: Path, cursors: dict[str, int], now: str) -> None:
    with sqlite3.connect(db_path) as conn:
        for key, value in cursors.items():
            source, query = key.split("|", 1)
            conn.execute(
                "INSERT OR REPLACE INTO source_cursors(source,query,cursor,updated_at) VALUES(?,?,?,?)",
                (source, query, str(value), now),
            )


def _read_cursors(db_path: Path) -> dict[str, int]:
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute("SELECT source,query,cursor FROM source_cursors ORDER BY source,query").fetchall()
    output: dict[str, int] = {}
    for source, query, cursor in rows:
        try:
            output[f"{source}|{query}"] = max(0, int(cursor))
        except (TypeError, ValueError):
            continue
    return output


def _candidate_rows(db_path: Path) -> list[dict[str, Any]]:
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT m.*, c.direct_brand
               FROM mentions m
               LEFT JOIN classifications c ON c.mention_id=m.id
               WHERE m.status IN ('DRAFT_READY','NEEDS_FACTS')
               ORDER BY m.priority DESC, m.discovered_at DESC"""
        ).fetchall()
    return [dict(row) for row in rows]


def _all_urls(db_path: Path) -> list[str]:
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute("SELECT canonical_url FROM mentions ORDER BY discovered_at").fetchall()
    return [str(row[0]) for row in rows if row and row[0]]


def _source_entries(scan_result: dict[str, Any], truth_result: dict[str, Any]) -> list[dict[str, Any]]:
    failures = {str(item.get("source")) for item in scan_result.get("failures", [])}
    counts = scan_result.get("source_counts", {})
    tavily_count = sum(int(counts.get(name, 0) or 0) for name in ("reddit", "forum", "open_web"))
    youtube_count = int(counts.get("youtube", 0) or 0)
    bluesky_count = int(counts.get("bluesky", 0) or 0)
    truth_blocked = bool(truth_result.get("stale") or truth_result.get("conflicts") or truth_result.get("failures"))
    return [
        {"source": "tavily", "status": "failed" if "tavily" in failures else "ok", "accepted_count": tavily_count},
        {"source": "youtube", "status": "failed" if "youtube" in failures else "ok", "accepted_count": youtube_count},
        {"source": "bluesky", "status": "failed" if "bluesky" in failures else "ok", "accepted_count": bluesky_count},
        {"source": "official_facts", "status": "blocked" if truth_blocked else "ok", "accepted_count": int(truth_result.get("inserted", 0) or 0)},
    ]


def _youtube_public_metrics(scan_result: dict[str, Any]) -> dict[str, int]:
    stats = scan_result.get("youtube_fetch_stats", {})

    def count(name: str) -> int:
        try:
            return max(0, int(stats.get(name, 0) or 0))
        except (TypeError, ValueError):
            return 0

    top_level = count("top_level_comments")
    replies = count("embedded_replies")
    return {
        "youtube_videos_checked": count("videos_returned"),
        "youtube_comments_checked": top_level + replies,
        "youtube_replies_checked": replies,
        "youtube_unavailable_videos": count("unavailable_videos"),
    }


def run_live(scanner_root: Path, output_path: Path, state_path: Path, hmac_key: str) -> dict[str, Any]:
    attempted_at = utc_now()
    existing = load_json(output_path)
    state = load_json(state_path)
    validate_state(state)

    runtime_root = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "oedro-demand-radar"
    db_path = runtime_root / "state" / "oedro-listening.sqlite3"
    os.environ["OEDRO_AGENT_STATE_ROOT"] = str(runtime_root / "state")
    os.environ["OEDRO_AGENT_INBOX_ROOT"] = str(runtime_root / "inbox")
    os.environ["OEDRO_AGENT_DB"] = str(db_path)
    os.environ["OEDRO_VOICE_RAW_ROOT"] = str(runtime_root / "voice-raw")
    sys.path.insert(0, str(scanner_root / "src"))

    from oedro_agent.db import init_db  # noqa: PLC0415
    from oedro_agent.service import scan  # noqa: PLC0415
    from oedro_agent.triage import triage_new  # noqa: PLC0415
    from oedro_agent.truth import sync_truth  # noqa: PLC0415

    init_db()
    _seed_cursors(db_path, state["cursors"], attempted_at)
    truth_result = sync_truth()
    scan_result = scan("full")
    triage_new()
    completed_at = utc_now()
    truth_blocked = bool(truth_result.get("stale") or truth_result.get("conflicts") or truth_result.get("failures"))

    current_items = [
        item for item in (build_public_item(row, hmac_key, completed_at, truth_blocked) for row in _candidate_rows(db_path))
        if item is not None
    ]
    existing_items = enforce_truth_gate(existing.get("items", []), truth_blocked)
    items, new_count, duplicate_count = merge_items(existing_items, current_items, completed_at)
    scan_status = str(scan_result.get("status", "FAILED")).lower()
    if scan_status not in {"success", "partial", "failed"}:
        scan_status = "failed"
    last_success_at = completed_at if scan_status == "success" else existing.get("last_success_at")

    youtube_metrics = _youtube_public_metrics(scan_result)
    raw_source_counts = scan_result.get("raw_source_counts", {})
    bluesky_posts_checked = max(0, int(raw_source_counts.get("bluesky", 0) or 0))
    payload = {
        "schema_version": 1,
        "generated_at": completed_at,
        "last_attempt_at": attempted_at,
        "last_success_at": last_success_at,
        "method": "deterministic_external_signal_scan",
        "status": scan_status,
        "stale_after_hours": 36,
        "truth_status": "blocked" if truth_blocked else "current",
        "metrics": {
            "raw_discovered": int(scan_result.get("discovered", 0) or 0),
            "accepted": int(scan_result.get("accepted", 0) or 0),
            "filtered": int(scan_result.get("filtered_noise", 0) or 0),
            "new_actionable": new_count,
            "duplicate_actionable": duplicate_count,
            "open_items": len(items),
            **youtube_metrics,
            "bluesky_posts_checked": bluesky_posts_checked,
        },
        "sources": _source_entries(scan_result, truth_result),
        "items": items,
    }

    previous_seen = state["seen"]
    for url in _all_urls(db_path):
        signal_id = public_signal_id(url, hmac_key)
        record = previous_seen.get(signal_id, {"first_seen": completed_at, "last_seen": completed_at})
        record["last_seen"] = completed_at
        previous_seen[signal_id] = record
    state.update({
        "updated_at": completed_at,
        "cursors": _read_cursors(db_path),
        "seen": prune_seen(previous_seen, completed_at),
        "last_run": {"run_id": str(scan_result.get("run_id", "")), "status": scan_status, "attempted_at": attempted_at},
    })
    atomic_write(output_path, payload)
    atomic_write(state_path, state)
    return payload


def write_failed_attempt(output_path: Path, attempted_at: str) -> dict[str, Any]:
    existing = load_json(output_path)
    payload = dict(existing)
    payload["generated_at"] = attempted_at
    payload["last_attempt_at"] = attempted_at
    payload["status"] = "failed"
    payload["metrics"] = {
        "raw_discovered": 0,
        "accepted": 0,
        "filtered": 0,
        "new_actionable": 0,
        "duplicate_actionable": 0,
        "open_items": len(existing.get("items", [])),
        "youtube_videos_checked": 0,
        "youtube_comments_checked": 0,
        "youtube_replies_checked": 0,
        "youtube_unavailable_videos": 0,
        "bluesky_posts_checked": 0,
    }
    payload["sources"] = [
        {"source": "tavily", "status": "failed", "accepted_count": 0},
        {"source": "youtube", "status": "failed", "accepted_count": 0},
        {"source": "bluesky", "status": "failed", "accepted_count": 0},
        {"source": "official_facts", "status": "failed", "accepted_count": 0},
    ]
    atomic_write(output_path, payload)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Update the public-safe OEDRO demand radar feed")
    parser.add_argument("--scanner-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--state", type=Path, default=DEFAULT_STATE)
    args = parser.parse_args()
    hmac_key = os.getenv("OEDRO_STATE_HMAC_KEY", "")
    if not hmac_key:
        raise SystemExit("OEDRO_STATE_HMAC_KEY is required")
    failed = False
    try:
        payload = run_live(args.scanner_root.resolve(), args.output.resolve(), args.state.resolve(), hmac_key)
    except Exception:
        payload = write_failed_attempt(args.output.resolve(), utc_now())
        failed = True
    print(json.dumps({"status": payload["status"], "metrics": payload["metrics"]}, ensure_ascii=False))
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
