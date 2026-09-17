const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'content-studio.js'), 'utf8');
const config = JSON.parse(fs.readFileSync(path.join(root, 'data/content-pipeline-tests.json'), 'utf8'));
const content = {};
const breadcrumb = {};
const context = {
  document: { body: { dataset: { page: 'studio' } }, querySelector: selector => selector === '#content' ? content : breadcrumb },
  location: { hash: '' }, window: {},
  fetch: async url => {
    assert.equal(url, 'data/content-pipeline-tests.json');
    return { ok: true, json: async () => config };
  }
};
vm.runInNewContext(source, context);
(async () => {
  await context.window.initContentStudio();
  assert.equal(breadcrumb.textContent, '社媒内容自动化生产');
  assert.ok(content.innerHTML.includes('<h1>社媒内容自动化生产</h1>'));
  assert.ok(content.innerHTML.indexOf('automation-flow') < content.innerHTML.indexOf('automation-sample'));
  assert.equal((content.innerHTML.match(/<img /g) || []).length, 7);
  for (const name of ['editorial-01', 'editorial-02', 'editorial-03', 'editorial-04']) {
    assert.ok(content.innerHTML.includes(`assets/content-studio/${name}.webp`));
    assert.ok(content.innerHTML.includes(`href="assets/content-studio/${name}.webp"`), 'each diagram retains its full-size image link');
    assert.ok(fs.existsSync(path.join(root, `assets/content-studio/${name}.webp`)));
  }
  assert.ok(!/01-requirements|02-create|03-adapt|04-review/.test(content.innerHTML), 'the rejected white slides must not return');
  assert.ok(!content.innerHTML.includes('trail-editorial-desk'), 'the rejected metaphor must not return');
  assert.ok(!content.innerHTML.includes('<svg'), 'the rejected landscape placeholders must not return');
  assert.ok(content.innerHTML.includes('确认后整理素材，自行发布。'));
  assert.ok(content.innerHTML.includes('content-pipeline-test.html'));
  assert.ok(content.innerHTML.includes('>样稿</span>'));
  assert.ok(content.innerHTML.includes('AI 围绕一个主题'));
  for (const title of ['确定要求', '生成图文', '适配平台', '人工审核交付']) assert.ok(content.innerHTML.includes(title));
  assert.ok(content.innerHTML.includes('配图与英文文案，附中文对照'));
  assert.ok(!/提供什么|拿到什么|起点是|校看与使用|徒步后的泥鞋/.test(content.innerHTML));
  const record = config.records.find(item => item.run_id === config.active_run_id);
  for (const variant of record.variants.filter(item => ['instagram', 'x', 'youtube'].includes(item.id))) {
    assert.ok(content.innerHTML.includes(variant.visual.image.src));
    assert.ok(fs.existsSync(path.join(root, variant.visual.image.src)));
  }
  assert.ok(!content.innerHTML.includes('<button'), 'overview does not invent production controls');
  context.fetch = async () => ({ ok: false });
  await assert.rejects(context.window.initContentStudio, /社媒样稿加载失败/);
  context.fetch = async () => ({ ok: true, json: async () => ({ records: [], active_run_id: 'missing' }) });
  await assert.rejects(context.window.initContentStudio, /当前社媒样稿不存在/);
  console.log('Content automation rendering and failure tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
