const fs = require('fs');
const path = require('path');

const root = process.env.PUBLIC_SITE_ROOT ? path.resolve(process.env.PUBLIC_SITE_ROOT) : path.resolve(__dirname, '..');
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const fail = (message) => { throw new Error(message); };

const manifest = readJson('data/products/manifest.json');
if (!fs.existsSync(path.join(root, 'products.html'))) fail('products.html is missing');
if (!fs.existsSync(path.join(root, 'products.js'))) fail('products.js is missing');
if (!fs.existsSync(path.join(root, 'products.css'))) fail('products.css is missing');
if (manifest.productCount !== 1209) fail(`expected 1209 products, got ${manifest.productCount}`);
if (!Array.isArray(manifest.categories) || manifest.categories.length !== 12) fail('expected 12 product categories');

let count = 0;
const ids = new Set();
let duplicateRecords = 0;
for (const category of manifest.categories) {
  const data = readJson(category.file.replace(/^data\//, 'data/'));
  if (data.categoryId !== category.id) fail(`category mismatch for ${category.id}`);
  if (data.products.length !== category.count) fail(`count mismatch for ${category.id}`);
  for (const product of data.products) {
    count += 1;
    const key = `${product.brand}:${product.id}`;
    if (ids.has(key)) duplicateRecords += 1;
    ids.add(key);
    if (!/^https:\/\/www\.oedro\.com\//.test(product.url)) fail(`non-official product URL for ${key}`);
    if (!product.name || !product.categoryId || !product.brand) fail(`missing identity fields for ${key}`);
    const serialized = JSON.stringify(product);
    if (/raw_snapshot|\/Users\/oliver|\.html\.gz/.test(serialized)) fail(`private path leaked for ${key}`);
  }
}
if (count !== manifest.productCount) fail(`manifest total ${manifest.productCount} differs from ${count}`);
if (duplicateRecords !== manifest.duplicateRecords) fail(`duplicate record count differs: ${duplicateRecords}`);

const nav = readJson('data/content.json').nav;
if (!nav.some((item) => item.id === 'products' && item.file === 'products.html')) fail('product catalog is missing from shared navigation');
const html = fs.readFileSync(path.join(root, 'products.html'), 'utf8');
if (!/data-page="products"/.test(html) || !/products\.js/.test(html) || !/products\.css/.test(html)) fail('product page shell is incomplete');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
if (!/page === 'products'/.test(app) || !/initProducts/.test(app)) fail('app.js does not initialize the product catalog');
const productsJs = fs.readFileSync(path.join(root, 'products.js'), 'utf8');
if (!/requestId !== state\.requestId/.test(productsJs)) fail('category requests are missing stale-response protection');
if (!/retry-category/.test(productsJs) || !/retry-policies/.test(productsJs)) fail('interactive data loads are missing retry controls');

console.log(`Product catalog check passed: ${count} products, ${manifest.categories.length} categories.`);
