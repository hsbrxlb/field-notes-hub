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
simulated.date = '2026-09-05';
simulated.product = '模拟产品，仅做结构测试';

const records = renderer.sortRecords([current, simulated]);
assert.equal(records[0].run_id, simulated.run_id, '最新记录应排在最前');
const html = renderer.renderPageMarkup({ ...config, records: [current, simulated] });
assert.equal((html.match(/<article class="pipeline-record"/g) || []).length, 2, '两条记录应使用同一模板');
assert.equal((html.match(/class="pipeline-platform"/g) || []).length, 6, '两条记录各自保留三个平台');
assert.equal((html.match(/class="pipeline-prompt"/g) || []).length, 2, '每条记录必须显示输入Prompt');
assert.equal((html.match(/class="pipeline-purpose"/g) || []).length, 2, '每条记录必须显示内容目的');
assert.equal((html.match(/class="pipeline-final-review"/g) || []).length, 2, '每条记录必须显示审核结论');
assert.ok(html.includes(current.prompt), '当前记录的Prompt没有渲染');
assert.ok(html.includes(current.brief.desired_effect), '期望效果没有渲染');
current.variants.forEach((variant) => assert.ok(html.includes(variant.platform_job), variant.platform + '的平台任务没有渲染'));
const firstPrompt = html.indexOf('class="pipeline-prompt"');
const firstPurpose = html.indexOf('class="pipeline-purpose"');
const firstOutputs = html.indexOf('class="pipeline-outputs"');
const firstReview = html.indexOf('class="pipeline-final-review"');
assert.ok(firstPrompt < firstPurpose && firstPurpose < firstOutputs && firstOutputs < firstReview, '页面必须按Prompt、目的、平台成品、复核结论排列');
assert.ok(html.includes('record-status status-blocked">文案可审，图片待完善'), '图片未完成时总状态必须使用阻塞色');
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, '追加记录后DOM id必须保持唯一');
assert.ok(html.includes(current.run_id), '当前记录锚点缺失');
assert.ok(html.includes(simulated.run_id), '模拟记录锚点缺失');
assert.ok(!fs.readFileSync(path.join(root, 'data', 'content-pipeline-tests.json'), 'utf8').includes(simulated.run_id), '模拟记录不得写入公开数据');

console.log('内容样稿追加结构测试通过');
