const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'customer-analytics.js'), 'utf8');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/customer-analytics.json')));
const view = { innerHTML: '', addEventListener() {} };
const denominator = {};
const context = { Intl, document: {
  querySelector: selector => selector === '#analytics-view' ? view : denominator,
  querySelectorAll: () => []
}, testApi: null };
vm.runInNewContext(source.replace('  load();\n})();', `  testApi = { amountPlot, linearGroup, arcChart, renderData(data,name) { dataset=data; scope=name; render(); } };\n})();`), context);
const api = context.testApi;
assert.ok(api, 'test entry must bind the actual renderer');
for (const scope of ['snapshot','outreach']) {
  api.renderData(data,scope);
  assert.match(view.innerHTML, /class="ring-composition"/);
  assert.match(view.innerHTML, /class="arc-composition"/);
  assert.doesNotMatch(view.innerHTML, /商城客户快照|订阅状态不等于当前可发送|data-detail=/);
  assert.equal(denominator.textContent, new Intl.NumberFormat('en-US').format(data[scope].total)+' 人');
}
const rows=[0,1,10,100,1000,10000,100000,1000000].map((count,i)=>({key:String(i),label:String(count),count}));
const positions=[...api.amountPlot(rows,1111111).matchAll(/--position:([\d.]+)%/g)].map(match=>Number(match[1]));
assert.equal(positions.length,8);
assert.equal(positions[0],0);
assert.equal(positions[1],8);
assert.equal(positions.at(-1),100);
for(let i=2;i<positions.length;i++) assert.ok(Math.abs(positions[i]-positions[i-1]-92/6)<1e-8, 'each tenfold increase occupies the same distance');
const linear=api.linearGroup([{count:24468,label:'2–3单'},{count:2435,label:'4–9单'},{count:126,label:'10单及以上'}],511392,'repeat',2);
const dots=[...linear.matchAll(/--position:([\d.]+)%/g)].map(match=>Number(match[1]));
assert.ok(Math.abs(dots[2]-126/30000*100)<1e-9, 'small values keep their true position');
assert.equal((linear.match(/class="plot-dot"/g)||[]).length,3);
assert.doesNotMatch(api.arcChart([{count:0,label:'none'},{count:100,label:'all'}],100,'test'), /NaN|Infinity/);
const broken=structuredClone(data); broken.snapshot.dimensions[0].buckets[0].count++;
api.renderData(broken,'snapshot');
assert.match(view.innerHTML,/数据未通过完整性核对/);
console.log('Customer chart scales, scope rendering and invalid-data tests passed');
