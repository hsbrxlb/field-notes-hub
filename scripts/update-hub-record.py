#!/usr/bin/env python3
"""Add one public-safe work result and optionally update its related project."""

from __future__ import annotations

import argparse
import json
import re
from datetime import date
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
RESULTS_PATH = ROOT / "data" / "content-studio.json"
CONTENT_PATH = ROOT / "data" / "content.json"
RESULT_FIELDS = {
    "id", "date", "project", "type", "category", "title", "description",
    "purpose", "status", "related_work", "links",
}
PROJECT_FIELDS = {"id", "status", "progress", "next", "dependency"}
CATEGORIES = {"content", "research", "system"}
STATUSES = {"已完成", "进行中", "概念", "待确认"}
FORBIDDEN = re.compile(
    r"(?:api[_-]?key|password|token|secret|cookie|localhost|127\.0\.0\.1|"
    r"file://|/Users/|/var/|@[A-Za-z0-9_]{2,}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})",
    re.IGNORECASE,
)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def atomic_write(path: Path, payload: dict[str, Any]) -> None:
    partial = path.with_suffix(path.suffix + ".partial")
    partial.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    partial.replace(path)


def validate_text(value: Any, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label}不能为空")
    value = value.strip()
    if FORBIDDEN.search(value):
        raise ValueError(f"{label}包含不适合公开的内容")
    return value


def validate_result(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict) or set(raw) != RESULT_FIELDS:
        raise ValueError("result字段不符合固定格式")
    result = {key: raw[key] for key in RESULT_FIELDS}
    for key in RESULT_FIELDS - {"links"}:
        result[key] = validate_text(result[key], f"result.{key}")
    try:
        date.fromisoformat(result["date"])
    except ValueError as exc:
        raise ValueError("result.date必须是有效的YYYY-MM-DD日期") from exc
    if result["category"] not in CATEGORIES:
        raise ValueError("result.category必须是content、research或system")
    if result["status"] not in STATUSES:
        raise ValueError("result.status不在允许范围")
    if not isinstance(raw["links"], list):
        raise ValueError("result.links必须是数组")
    links = []
    for index, link in enumerate(raw["links"]):
        if not isinstance(link, dict) or set(link) != {"label", "href"}:
            raise ValueError(f"result.links[{index}]字段不正确")
        label = validate_text(link["label"], f"result.links[{index}].label")
        href = validate_text(link["href"], f"result.links[{index}].href")
        is_relative = bool(re.fullmatch(r"[A-Za-z0-9][^\s:]*", href)) and not re.search(
            r"(?:^|/)\.\.(?:/|$)", href
        )
        if not (href.startswith("https://") or is_relative):
            raise ValueError(f"result.links[{index}].href必须是相对链接或HTTPS链接")
        links.append({"label": label, "href": href})
    result["links"] = links
    return result


def validate_project_update(raw: Any) -> dict[str, str] | None:
    if raw is None:
        return None
    if not isinstance(raw, dict) or not set(raw).issubset(PROJECT_FIELDS) or "id" not in raw:
        raise ValueError("project_update字段不正确")
    return {key: validate_text(value, f"project_update.{key}") for key, value in raw.items()}


def main() -> None:
    parser = argparse.ArgumentParser(description="更新OEDRO Hub成果记录")
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    packet = load_json(args.input.resolve())
    if not isinstance(packet, dict) or set(packet) - {"result", "project_update"}:
        raise ValueError("输入只允许result和project_update")
    result = validate_result(packet.get("result"))
    project_update = validate_project_update(packet.get("project_update"))

    results_data = load_json(RESULTS_PATH)
    current = [item for item in results_data["results"] if item.get("id") != result["id"]]
    current.append(result)
    current.sort(key=lambda item: (item["date"], item["id"]), reverse=True)
    results_data["results"] = current

    content_data = load_json(CONTENT_PATH)
    if project_update:
        project = next(
            (item for item in content_data["work"]["projects"] if item.get("id") == project_update["id"]),
            None,
        )
        if project is None:
            raise ValueError("project_update.id没有对应项目")
        project.update({key: value for key, value in project_update.items() if key != "id"})

    if args.dry_run:
        print(json.dumps({
            "ok": True,
            "dry_run": True,
            "result_id": result["id"],
            "result_count": len(current),
            "project_updated": bool(project_update),
        }, ensure_ascii=False))
        return

    atomic_write(RESULTS_PATH, results_data)
    if project_update:
        atomic_write(CONTENT_PATH, content_data)
    print(json.dumps({
        "ok": True,
        "result_id": result["id"],
        "result_count": len(current),
        "project_updated": bool(project_update),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
