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
