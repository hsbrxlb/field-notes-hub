#!/usr/bin/env python3

from __future__ import annotations

import importlib.util
from pathlib import Path


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
assert MODULE.validate_project_update({"id": "example", "status": "进行中"}) == {
    "id": "example", "status": "进行中"
}

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

print("Hub成果更新脚本测试通过")
