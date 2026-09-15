#!/usr/bin/env python3
"""Build public, category-split product data from the local OEDRO official snapshot."""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

SOURCE_ROOT = Path("/Users/oliver/AI/knowledge/oedro-products/normalized")
OUTPUT_ROOT = Path(__file__).resolve().parents[1] / "data" / "products"

CATEGORY_NAMES = {
    "986": "前大灯总成",
    "987": "尾灯总成",
    "989": "车内储物",
    "990": "脚垫与后备箱垫",
    "992": "货箱盖",
    "993": "越野保险杠",
    "994": "轮眉与翼子板",
    "995": "脚踏板",
    "996": "拖车后视镜",
    "999": "农机与通用工具",
    "1009": "测试商品",
    "1011": "散热器",
}

WARNING_LABELS = {
    "warranty_conflict_on_official_product_page": "官网质保口径不一致",
    "invalid_document_url_placeholder": "说明书链接无效",
    "fitment_section_not_found": "未找到独立适配段落",
    "image_urls_missing": "官网图片缺失",
}


def cleaned_documents(documents):
    return [
        {"name": item.get("name", ""), "kind": item.get("kind", ""), "url": item.get("url", "")}
        for item in documents
        if item.get("status") != "invalid_placeholder" and item.get("url")
    ]


def public_product(item):
    identity = item["identity"]
    commercial = item.get("commercial_snapshot", {})
    review = item.get("review_snapshot", {})
    installation = item.get("installation", {})
    media = item.get("media", {})
    variants = item.get("variants", {})
    warranty = item.get("warranty_and_returns", {})
    warnings = [WARNING_LABELS.get(value, value) for value in item.get("parser_warnings", [])]
    return {
        "id": identity.get("product_sku_id") or identity.get("product_id"),
        "productId": identity.get("product_id", ""),
        "sku": identity.get("sku", ""),
        "brand": identity.get("brand", ""),
        "categoryId": identity.get("category_id", ""),
        "name": identity.get("product_name", ""),
        "url": item.get("source", {}).get("canonical_url", ""),
        "capturedAt": commercial.get("captured_at") or item.get("source", {}).get("captured_at", ""),
        "fitment": item.get("fitment", {}).get("official_text", ""),
        "price": {
            "sale": commercial.get("sale_price", ""),
            "market": commercial.get("market_price", ""),
            "currency": commercial.get("currency", "USD"),
            "discount": commercial.get("discount_text", ""),
            "stock": commercial.get("delivery_or_stock_text", ""),
            "freeShipping": bool(commercial.get("free_shipping")),
        },
        "review": {"score": review.get("score"), "count": review.get("count")},
        "warnings": warnings,
        "description": item.get("description_text", ""),
        "highlights": [value.get("title", "") for value in item.get("highlights", []) if value.get("title")],
        "specifications": item.get("specifications", {}),
        "package": item.get("package_included", []),
        "installation": {
            "notes": installation.get("official_notes", ""),
            "position": installation.get("position", ""),
            "documents": cleaned_documents(installation.get("documents", [])),
        },
        "media": {
            "images": media.get("image_urls", []),
            "videos": media.get("video_urls", []),
        },
        "variants": {
            "options": variants.get("option_definitions", []),
            "selected": variants.get("selected_attributes", []),
            "skus": variants.get("sku_options", []),
            "related": variants.get("related_products", []),
        },
        "policies": {
            "productWarranty": warranty.get("product_warranty_values", []),
            "pageClaims": warranty.get("page_claims", []),
            "returnUrl": warranty.get("return_policy_url", ""),
            "shippingUrl": warranty.get("shipping_policy_url", ""),
        },
    }


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    grouped = defaultdict(list)
    brands = Counter()
    warnings = Counter()
    source_path = SOURCE_ROOT / "products.jsonl"
    with source_path.open(encoding="utf-8") as handle:
        for line in handle:
            product = public_product(json.loads(line))
            grouped[product["categoryId"]].append(product)
            brands[product["brand"]] += 1
            warnings.update(product["warnings"])

    record_keys = Counter(
        (product["brand"], product["id"], product["url"])
        for products in grouped.values() for product in products
    )
    duplicate_records = sum(count - 1 for count in record_keys.values() if count > 1)
    for products in grouped.values():
        for product in products:
            if record_keys[(product["brand"], product["id"], product["url"])] > 1:
                product["warnings"].append("官网目录存在重复记录")

    categories = []
    for category_id, products in sorted(grouped.items(), key=lambda pair: (-len(pair[1]), pair[0])):
        products.sort(key=lambda item: (item["brand"] != "OEDRO", item["name"].lower(), item["id"]))
        filename = f"category-{category_id}.json"
        write_json(OUTPUT_ROOT / filename, {"categoryId": category_id, "products": products})
        categories.append({
            "id": category_id,
            "name": CATEGORY_NAMES.get(category_id, f"分类 {category_id}"),
            "count": len(products),
            "file": f"data/products/{filename}",
            "brands": dict(Counter(product["brand"] for product in products)),
        })

    policies = []
    policy_path = SOURCE_ROOT / "policies.jsonl"
    if policy_path.exists():
        for line in policy_path.read_text(encoding="utf-8").splitlines():
            item = json.loads(line)
            source = item.get("source", {})
            policies.append({
                "articleId": item.get("article_id", ""),
                "title": item.get("title", ""),
                "officialText": item.get("official_text", ""),
                "url": source.get("url", ""),
                "capturedAt": source.get("captured_at", ""),
            })
    write_json(OUTPUT_ROOT / "policies.json", {"policies": policies})

    manifest = {
        "title": "OEDRO 官网产品资料库",
        "description": "按官网分类浏览 OEDRO、OEDRO PRO 与 YITAMOTOR 商品资料。",
        "source": "OEDRO official website",
        "sourceUrl": "https://www.oedro.com/",
        "capturedAt": max(product["capturedAt"] for products in grouped.values() for product in products),
        "productCount": sum(len(products) for products in grouped.values()),
        "brandCounts": dict(brands),
        "warningCounts": dict(warnings),
        "duplicateRecords": duplicate_records,
        "categories": categories,
        "policyFile": "data/products/policies.json",
        "notes": [
            "价格、库存、评分和配送信息是抓取时快照，购买或对外引用前请打开官网复核。",
            "分类 1009 是官网接口中的测试商品，保留用于完整性核对，不作为正式选品。",
        ],
    }
    write_json(OUTPUT_ROOT / "manifest.json", manifest)
    total_bytes = sum(path.stat().st_size for path in OUTPUT_ROOT.glob("*.json"))
    print(f"Built {manifest['productCount']} products in {len(categories)} category files ({total_bytes} bytes).")


if __name__ == "__main__":
    main()
