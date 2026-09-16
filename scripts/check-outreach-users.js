const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', process.env.PUBLIC_SITE_ROOT || '.');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const rows = JSON.parse(read('data/first-outreach-users.json'));
assert.equal(rows.length, 1365);
assert.equal(new Set(rows.map(row => row.customer_id)).size, 1365);
const keys = ['customer_id', 'masked_email', 'historical_orders', 'historical_order_usd', 'email_status'].sort();
for (const row of rows) {
  assert.deepEqual(Object.keys(row).sort(), keys);
  assert.match(row.customer_id, /^\d+$/);
  assert.ok(row.masked_email.includes('*') && !row.masked_email.includes('@'));
  assert.ok(Number.isInteger(Number(row.historical_orders)) && Number(row.historical_orders) >= 0);
  assert.ok(Number.isFinite(Number(row.historical_order_usd)) && Number(row.historical_order_usd) >= 0);
}
assert.equal(rows.filter(row => row.email_status === '订阅' && Number(row.historical_orders) > 0).length, 861);
assert.equal(rows.filter(row => row.email_status === '订阅' && Number(row.historical_orders) === 0).length, 490);
assert.equal(rows.filter(row => row.email_status !== '订阅').length, 14);
assert.match(read('first-outreach.html'), /class="outreach-count-link" href="first-outreach-users.html"/);
assert.doesNotMatch(read('first-outreach-users.html'), /<input|type="search"|type="file"/);
console.log('Outreach list PASS: 1365 unique masked records, exact fields, 861/490/14 counts, online link and no search/upload input');

const combined = JSON.parse(read('data/outreach-users.json'));
const summary = JSON.parse(read('data/outreach-summary.json'));
assert.equal(summary.high, 3922);
assert.equal(combined.length, summary.total);
assert.equal(new Set(combined.map(row => row.customer_id)).size, combined.length);
const originalIds = new Set(rows.map(row => row.customer_id));
const expandedKeys = [...keys, 'sources'].sort();
for (const row of combined) {
  assert.deepEqual(Object.keys(row).sort(), expandedKeys);
  assert.match(row.customer_id, /^\d+$/);
  assert.ok(row.masked_email.includes('*') && !row.masked_email.includes('@'));
  assert.ok(Number.isInteger(Number(row.historical_orders)) && Number(row.historical_orders) >= 0);
  assert.ok(Number.isFinite(Number(row.historical_order_usd)) && Number(row.historical_order_usd) >= 0);
  assert.ok(Array.isArray(row.sources) && row.sources.length > 0);
  assert.equal(new Set(row.sources).size, row.sources.length);
  assert.ok(row.sources.every(source => ['recent', 'high'].includes(source)));
  assert.equal(row.sources.includes('recent'), originalIds.has(row.customer_id));
  if (row.sources.includes('high')) assert.ok(Number(row.historical_order_usd) >= 1000);
}
const count = predicate => combined.filter(predicate).length;
assert.equal(count(row => row.sources.includes('recent')), 1365);
assert.equal(count(row => row.sources.includes('high')), summary.high);
assert.equal(count(row => row.sources.length === 2), summary.overlap);
assert.equal(summary.total, 1365 + summary.high - summary.overlap);
assert.equal(count(row => row.email_status !== '订阅'), summary.excluded);
assert.equal(count(row => row.email_status === '订阅' && Number(row.historical_orders) > 0), summary.priority);
for (const group of ['all', 'high', 'buyers', 'prospects', 'excluded']) {
  assert.ok(read('first-outreach-users.html').includes(`data-segment="${group}"`));
}
assert.ok(read('first-outreach-users.js').includes("fetch('data/outreach-users.json')"));
assert.doesNotMatch(read('first-outreach.html'), /长期没有访问记录的用户，暂不列入首批/);
console.log(`Expanded outreach PASS: ${summary.total} unique, ${summary.high} high, ${summary.overlap} overlap, ${summary.excluded} excluded`);
