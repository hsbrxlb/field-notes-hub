#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
import contextlib
import io
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch


MODULE_PATH = Path(__file__).with_name("update-hub-record.py")
SPEC = importlib.util.spec_from_file_location("update_hub_record", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


VALID = {
    "id": "example-result",
    "date": "2026-08-26",
    "project": "OEDRO海外用户运营",
    "type": "工作汇总",
    "category": "system",
    "title": "示例成果",
    "description": "记录已经完成并确认可公开的工作结果。",
    "purpose": "供后续回顾。",
    "status": "已完成",
    "related_work": "海外用户运营Hub",
    "links": [{"label": "查看页面", "href": "index.html"}],
}


assert MODULE.validate_result(VALID)["id"] == "example-result"

try:
    MODULE.validate_result({**VALID, "description": "打开 /Users/example/private.txt"})
except ValueError as exc:
    assert "不适合公开" in str(exc)
else:
    raise AssertionError("本机路径未被拒绝")

try:
    MODULE.validate_result({**VALID, "links": [{"label": "下载", "href": "../private.zip"}]})
except ValueError:
    pass
else:
    raise AssertionError("路径穿越未被拒绝")

try:
    MODULE.validate_result({**VALID, "links": [{"label": "查看", "href": "javascript:alert(1)"}]})
except ValueError:
    pass
else:
    raise AssertionError("非HTTPS协议未被拒绝")

with TemporaryDirectory() as directory:
    root = Path(directory)
    results_path = root / "content-studio.json"
    content_path = root / "content.json"
    input_path = root / "input.json"
    results_path.write_text(json.dumps({"results": []}), encoding="utf-8")
    content_path.write_text(json.dumps({"navigation": []}), encoding="utf-8")

    def run(packet, dry_run=False):
        input_path.write_text(json.dumps(packet), encoding="utf-8")
        argv = [str(MODULE_PATH), "--input", str(input_path)]
        if dry_run:
            argv.append("--dry-run")
        output = io.StringIO()
        with patch.object(MODULE, "RESULTS_PATH", results_path), patch("sys.argv", argv), contextlib.redirect_stdout(output):
            MODULE.main()
        return json.loads(output.getvalue())

    for retired in ({"id": "example", "status": "进行中"}, {}, None):
        for dry_run in (False, True):
            before = (results_path.read_bytes(), content_path.read_bytes())
            try:
                run({"result": VALID, "project_update": retired}, dry_run)
            except ValueError as exc:
                assert "不再支持project_update" in str(exc)
            else:
                raise AssertionError("已停用的project_update未被拒绝")
            assert before == (results_path.read_bytes(), content_path.read_bytes())
            assert not list(root.glob("*.partial"))

    before = results_path.read_bytes()
    assert run({"result": VALID}, True)["dry_run"] is True
    assert results_path.read_bytes() == before
    content_before = content_path.read_bytes()
    assert run({"result": VALID})["ok"] is True
    assert json.loads(results_path.read_text())["results"] == [VALID]
    assert content_path.read_bytes() == content_before
    revised = {**VALID, "title": "更新后的成果"}
    assert run({"result": revised})["result_count"] == 1
    assert json.loads(results_path.read_text())["results"] == [revised]

print("Hub成果更新脚本测试通过")
