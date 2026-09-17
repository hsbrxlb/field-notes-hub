#!/usr/bin/env python3
"""Build aggregate-only customer analytics from the existing outreach sample."""

import argparse
from collections import Counter
from decimal import Decimal, InvalidOperation
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def count(value, name):
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{name} must be a nonnegative integer")
    return value


def snapshot_from(path):
    empty = {"as_of": None, "scope": "all_customers", "status": "pending", "total": None, "dimensions": []}
    if path is None:
        return empty
    raw = json.loads(path.read_text())
    raw = raw.get("snapshot", raw)
    total = count(raw["total"], "snapshot.total")
    as_of = raw.get("as_of")
    if not isinstance(as_of, str) or not as_of.strip():
        raise ValueError("snapshot.as_of is required")
    dimensions = []
    seen = set()
    for dimension in raw.get("dimensions", []):
        key = dimension["key"]
        if not isinstance(key, str) or key in seen:
            raise ValueError("snapshot dimension keys must be unique strings")
        seen.add(key)
        denominator = count(dimension.get("denominator", total), "denominator")
        if denominator > total:
            raise ValueError("dimension denominator exceeds total")
        buckets = []
        bucket_keys = set()
        for bucket in dimension["buckets"]:
            bucket_key = bucket["key"]
            label = bucket["label"]
            if not isinstance(bucket_key, str) or bucket_key in bucket_keys or not isinstance(label, str):
                raise ValueError("invalid or duplicate bucket")
            bucket_keys.add(bucket_key)
            number = count(bucket["count"], "bucket.count")
            if number > denominator:
                raise ValueError("bucket exceeds denominator")
            buckets.append({"key": bucket_key, "label": label, "count": number})
        partition = dimension.get("partition", False)
        if not isinstance(partition, bool):
            raise ValueError("partition must be boolean")
        if partition and sum(bucket["count"] for bucket in buckets) != denominator:
            raise ValueError("partition counts do not equal denominator")
        label = dimension["label"]
        if not isinstance(label, str):
            raise ValueError("dimension label must be a string")
        dimensions.append({"key": key, "label": label, "denominator": denominator,
                           "partition": partition, "buckets": buckets})
    return {"as_of": as_of, "scope": "all_customers", "status": "verified_counts",
            "total": total, "dimensions": dimensions}


def build(rows, snapshot):
    if not isinstance(rows, list) or not rows:
        raise ValueError("outreach input must be a nonempty list")
    seen = set()
    frequency, amount, status, membership = Counter(), Counter(), Counter(), Counter()
    cross = {key: {"buyers": 0, "non_buyers": 0} for key in ["subscribed", "unsubscribed", "opted_out"]}
    status_keys = {"订阅": "subscribed", "未订阅": "unsubscribed", "退订": "opted_out"}
    total_orders, total_amount, buyers, repeat = 0, Decimal("0"), 0, 0
    for row in rows:
        identifier = row["customer_id"]
        if not identifier or identifier in seen:
            raise ValueError("missing or duplicate customer identifier")
        seen.add(identifier)
        try:
            orders = Decimal(str(row["historical_orders"]))
            dollars = Decimal(str(row["historical_order_usd"]))
        except InvalidOperation as error:
            raise ValueError("invalid order number or amount") from error
        if not orders.is_finite() or orders < 0 or orders != orders.to_integral_value():
            raise ValueError("order counts must be nonnegative integers")
        if not dollars.is_finite() or dollars < 0:
            raise ValueError("historical amount must be finite and nonnegative")
        orders = int(orders)
        email = status_keys[row["email_status"]]
        sources = set(row["sources"])
        if not sources or not sources <= {"recent", "high"}:
            raise ValueError("unknown sample source")
        frequency["0" if orders == 0 else "1" if orders == 1 else "2_3" if orders <= 3 else "4_9" if orders <= 9 else "10_plus"] += 1
        amount["0" if dollars == 0 else "under_100" if dollars < 100 else "100_499" if dollars < 500 else "500_999" if dollars < 1000 else "1000_2499" if dollars < 2500 else "2500_4999" if dollars < 5000 else "5000_plus"] += 1
        status[email] += 1
        cross[email]["buyers" if orders else "non_buyers"] += 1
        membership["both" if len(sources) == 2 else "recent_only" if "recent" in sources else "high_only"] += 1
        total_orders += orders
        total_amount += dollars
        buyers += orders > 0
        repeat += orders >= 2
    def buckets(counter, labels):
        return [{"key": key, "label": label, "count": counter[key]} for key, label in labels]
    subscriptions = [("subscribed", "已订阅"), ("unsubscribed", "未订阅"), ("opted_out", "已退订")]
    outreach = {
        "scope": "selected_outreach", "total": len(rows),
        "summary": {"buyers": buyers, "non_buyers": len(rows) - buyers, "repeat_buyers": repeat,
                    "historical_orders": total_orders},
        "purchase_frequency": buckets(frequency, [("0", "未下单"), ("1", "1单"), ("2_3", "2–3单"), ("4_9", "4–9单"), ("10_plus", "10单及以上")]),
        "historical_amount": buckets(amount, [("0", "$0"), ("under_100", "$0以上、不足100"), ("100_499", "$100–不足500"), ("500_999", "$500–不足1,000"), ("1000_2499", "$1,000–不足2,500"), ("2500_4999", "$2,500–不足5,000"), ("5000_plus", "$5,000及以上")]),
        "subscription": buckets(status, subscriptions),
        "subscription_purchase": [{"key": key, "label": label, **cross[key]} for key, label in subscriptions],
        "source_membership": buckets(membership, [("recent_only", "仅近期访问来源"), ("high_only", "仅高消费来源"), ("both", "两类来源重叠")]),
        "limitations": ["这是近期访问与高消费筛选后的名单，不能代表全体客户。", "金额沿用历史订单总额，尚未核实退款和取消订单的扣除口径。", "名单没有注册日期和订单日期，不能据此分析注册分布或销售趋势。"]
    }
    return {"schema_version": 1, "snapshot": snapshot, "outreach": outreach}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=ROOT / "data/outreach-users.json")
    parser.add_argument("--snapshot", type=Path, help="Verified backend aggregate counts; no customer records")
    parser.add_argument("--output", type=Path, default=ROOT / "data/customer-analytics.json")
    args = parser.parse_args()
    result = build(json.loads(args.input.read_text()), snapshot_from(args.snapshot))
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(f"Customer analytics: {result['outreach']['total']} sample customers; snapshot {result['snapshot']['status']}")


if __name__ == "__main__":
    main()
