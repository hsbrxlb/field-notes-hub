#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'data', 'content-pipeline-tests.json'), 'utf8'));
const renderer = require(path.join(root, 'content-pipeline-test.js'));
const current = config.records[0];
const simulated = JSON.parse(JSON.stringify(current));
simulated.run_id = 'simulation-2026-09-02-second-record';
simulated.date = '2026-09-02';
simulated.product = '模拟产品，仅做结构测试';

const records = renderer.sortRecords([current, simulated]);
assert.equal(records[0].run_id, simulated.run_id, '最新记录应排在最前');
const html = renderer.renderPageMarkup({ ...config, records: [current, simulated] });
assert.equal((html.match(/<details class="pipeline-record"/g) || []).length, 2, '两条记录应使用同一模板');
assert.equal((html.match(/<details class="pipeline-record"[^>]* open /g) || []).length, 2, '所有记录首次打开必须展开');
assert.equal((html.match(/class="pipeline-platform"/g) || []).length, 6, '两条记录各自保留三个平台');
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, '追加记录后DOM id必须保持唯一');
assert.ok(html.includes(current.run_id), '当前记录锚点缺失');
assert.ok(html.includes(simulated.run_id), '模拟记录锚点缺失');
assert.ok(!fs.readFileSync(path.join(root, 'data', 'content-pipeline-tests.json'), 'utf8').includes(simulated.run_id), '模拟记录不得写入公开数据');

console.log('内容样稿追加结构测试通过');
