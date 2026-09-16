const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.env.PUBLIC_SITE_ROOT || path.join(__dirname, '..'));
const { exportMarkdown } = require(path.join(root, 'product-library.js'));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('data/products/manifest.json'));
const html = read('product-library.html');
assert(!/app\.js|data\/content\.json|index\.html|sidebar|nav-list/.test(html), 'share page must not include Hub entrypoints');
for (const file of ['products.js', 'product-library.js', 'base.css', 'theme.css', 'products.css', 'product-library.css']) assert(html.includes(file), `${file} missing`);
let total = 0;
for (const category of manifest.categories) {
  const categoryData = JSON.parse(read(category.file));
  for (const brand of ['全部', ...Object.keys(category.brands)]) {
    for (const quality of ['全部', '资料完整', '需复核']) {
      const products = categoryData.products.filter((p) => (brand === '全部' || p.brand === brand) && (quality === '全部' || (quality === '需复核' ? p.warnings.length > 0 : p.warnings.length === 0)));
      const markdown = exportMarkdown({ manifest, category, categoryData, products, brand, quality }, '2026-09-16T00:00:00Z');
      const blocks = [...markdown.matchAll(/^(`{3,})json\n([\s\S]*?)\n\1$/gm)].map((m) => JSON.parse(m[2]));
      assert.deepEqual(blocks[0], manifest);
      const { products: ignored, ...metadata } = categoryData;
      assert.deepEqual(blocks[1].categoryMetadata, metadata);
      assert.deepEqual(blocks.slice(2), products, `${category.id}/${brand}/${quality} must preserve all fields and all pages`);
      assert.equal(blocks[1].exportedCount, products.length);
      total += products.length;
    }
  }
}
const category = manifest.categories[0];
const unusual = { name: '```\n# nested', sku: '特殊|SKU', empty: null, variants: [false, 0, ''], description: '<script>alert(1)</script>' };
const markdown = exportMarkdown({ manifest, category, categoryData: { products: [unusual] }, products: [unusual], brand: '全部', quality: '全部' });
assert(markdown.includes(JSON.stringify(unusual, null, 2)), 'source text must not be escaped or truncated');
console.log(`Product share check passed: 12 categories, all brand/quality combinations, ${total} exported records round-tripped without field loss.`);
