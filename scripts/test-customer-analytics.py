#!/usr/bin/env python3
"""Validate published aggregates without replacing the verified backend snapshot."""

from copy import deepcopy
from decimal import Decimal
import json
import os
from pathlib import Path
import runpy
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / os.environ.get("PUBLIC_SITE_ROOT", ".")
BUILDER = runpy.run_path(str(ROOT / "scripts/build-customer-analytics.py"))


class CustomerAnalyticsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rows = json.loads((PUBLIC / "data/outreach-users.json").read_text())
        cls.public = json.loads((PUBLIC / "data/customer-analytics.json").read_text())

    def test_published_sample_matches_source(self):
        rebuilt = BUILDER["build"](self.rows, self.public["snapshot"])
        self.assertEqual(rebuilt, self.public)
        summary = self.public["outreach"]["summary"]
        orders = [int(row["historical_orders"]) for row in self.rows]
        self.assertEqual(summary["historical_orders"], sum(orders))
        self.assertEqual(summary["buyers"], sum(value > 0 for value in orders))
        self.assertEqual(summary["repeat_buyers"], sum(value >= 2 for value in orders))

    def test_namespaces_and_actual_partition_totals(self):
        snapshot, sample = self.public["snapshot"], self.public["outreach"]
        self.assertEqual(snapshot["scope"], "all_customers")
        self.assertEqual(snapshot["status"], "verified_counts")
        self.assertEqual(sample["scope"], "selected_outreach")
        self.assertGreater(snapshot["total"], sample["total"])
        self.assertEqual(sample["total"], len(self.rows))
        for dimension in snapshot["dimensions"]:
            self.assertEqual(dimension["denominator"], snapshot["total"])
            self.assertTrue(dimension["partition"])
            self.assertEqual(sum(row["count"] for row in dimension["buckets"]), snapshot["total"])
        for name in ["purchase_frequency", "historical_amount", "subscription", "source_membership"]:
            self.assertEqual(sum(row["count"] for row in sample[name]), sample["total"])
        for cross, subscription in zip(sample["subscription_purchase"], sample["subscription"]):
            self.assertEqual(cross["key"], subscription["key"])
            self.assertEqual(cross["buyers"] + cross["non_buyers"], subscription["count"])
        members = {row["key"]: row["count"] for row in sample["source_membership"]}
        for source in ["recent", "high"]:
            self.assertEqual(members[source + "_only"] + members["both"],
                             sum(source in row["sources"] for row in self.rows))

    def test_public_contract_excludes_records_and_financial_totals(self):
        self.assertEqual(set(self.public), {"schema_version", "snapshot", "outreach"})
        self.assertEqual(set(self.public["outreach"]["summary"]),
                         {"buyers", "non_buyers", "repeat_buyers", "historical_orders"})
        allowed = {"schema_version", "snapshot", "outreach", "as_of", "scope", "status", "total", "dimensions",
                   "key", "label", "denominator", "partition", "buckets", "count", "summary", "buyers",
                   "non_buyers", "repeat_buyers", "historical_orders", "purchase_frequency", "historical_amount",
                   "subscription", "subscription_purchase", "source_membership", "limitations"}
        def inspect(value):
            if isinstance(value, dict):
                self.assertLessEqual(set(value), allowed)
                for item in value.values():
                    inspect(item)
            elif isinstance(value, list):
                for item in value:
                    inspect(item)
            elif isinstance(value, str):
                self.assertNotIn("@", value)
        inspect(self.public)
        serialized = json.dumps(self.public)
        aggregate_amount = sum(Decimal(row["historical_order_usd"]) for row in self.rows)
        self.assertNotIn(format(aggregate_amount, ".2f"), serialized)

    def test_rejects_invalid_sample_and_duplicate_customer(self):
        for field, value in [("historical_orders", "-1"), ("historical_orders", "1.5"),
                             ("historical_order_usd", "-0.01"), ("historical_order_usd", "NaN"),
                             ("sources", ["unknown"])]:
            with self.subTest(field=field, value=value):
                row = deepcopy(self.rows[0])
                row[field] = value
                with self.assertRaises(ValueError):
                    BUILDER["build"]([row], self.public["snapshot"])
        with self.assertRaises(ValueError):
            BUILDER["build"]([self.rows[0], self.rows[0]], self.public["snapshot"])

    def test_backend_snapshot_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "snapshot.json"
            path.write_text(json.dumps(self.public))
            self.assertEqual(BUILDER["snapshot_from"](path), self.public["snapshot"])
            for failure in ["negative", "sum", "duplicate_dimension", "duplicate_bucket"]:
                with self.subTest(failure=failure):
                    bad = deepcopy(self.public["snapshot"])
                    dimension = bad["dimensions"][0]
                    if failure == "negative":
                        dimension["buckets"][0]["count"] = -1
                    elif failure == "sum":
                        dimension["buckets"][0]["count"] += 1
                    elif failure == "duplicate_dimension":
                        bad["dimensions"].append(deepcopy(dimension))
                    else:
                        dimension["buckets"][1]["key"] = dimension["buckets"][0]["key"]
                    path.write_text(json.dumps(bad))
                    with self.assertRaises(ValueError):
                        BUILDER["snapshot_from"](path)


if __name__ == "__main__":
    unittest.main()
