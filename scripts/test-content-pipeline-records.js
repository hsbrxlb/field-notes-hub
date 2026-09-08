#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { deflateSync } = require('node:zlib');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'data', 'content-pipeline-tests.json');
const originalSource = fs.readFileSync(sourcePath, 'utf8');
const config = JSON.parse(originalSource);
const renderer = require(path.join(root, 'content-pipeline-test.js'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const escapeText = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const current = config.records.find((record) => record.variants.length === 3);
const latest = config.records.find((record) => record.variants.length === 5);
assert.ok(current && latest, '必须保留旧三平台和新五平台记录');
const simulated = clone(latest);
simulated.run_id = 'simulation-2026-09-08-second-record';

const records = renderer.sortRecords([current, simulated]);
assert.equal(records[0].run_id, simulated.run_id, '最新记录应排在最前');
const html = renderer.renderPageMarkup({ ...config, records: [current, simulated] });
assert.equal((html.match(/<article class="pipeline-record"/g) || []).length, 2, '两条记录应使用同一模板');
assert.equal((html.match(/class="pipeline-platform"/g) || []).length, 8, '两条记录分别保留三个和五个平台');
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
const detailTags = [...html.matchAll(/<details\b[^>]*>/g)].map(x => x[0]);
assert.ok(detailTags.length > 0 && detailTags.every(tag => /\bopen\b/.test(tag)), '全部评审与翻译默认可见');
const firstEvidence = html.indexOf('class="pipeline-evidence"');
assert.ok(firstEvidence > firstReview, '产品来源必须位于文案及审核之后');
assert.ok(html.includes('<details class="pipeline-evidence" open>'), '来源详情默认展开');
assert.ok(!html.includes('<dt>Hook</dt>') && !html.includes('<dt>CTA</dt>'), '完整帖子不能被内部文案字段拆成表格');
assert.equal((html.match(/class="platform-post(?: post-with-image)?"/g) || []).length, 8, '每个平台都有独立完整帖子');
assert.equal((html.match(/class="platform-media-state"/g) || []).length, 3, '旧三平台仍披露配图缺失');
assert.equal((html.match(/class="platform-illustration"/g) || []).length, 3, '新三个静态平台显示插画');
assert.equal((html.match(/文案样稿 · 搭配公司既有视频/g) || []).length, 2, '两个视频平台明确既有视频用途');
assert.equal((html.match(/官方产品参考图/g) || []).length, 1, '仅旧记录显示官方参考图');
current.variants.forEach((variant) => {
  assert.ok(html.includes(variant.body_en.replaceAll('&', '&amp;')), variant.platform + '必须保留完整原稿');
  assert.ok(html.includes(`href="#${current.run_id}-${variant.id}"`), variant.platform + '缺少页内导航');
  const articleStart = html.indexOf(`<article class="pipeline-platform" id="${current.run_id}-${variant.id}"`);
  const article = html.slice(articleStart, html.indexOf('</article>', articleStart));
  const visiblePost = article.split('<details')[0];
  assert.ok(visiblePost.includes(variant.body_en.replaceAll('&', '&amp;')), variant.platform + '正文必须位于首个折叠区之前');
});
simulated.variants.forEach((variant) => {
  const start = html.indexOf(`<article class="pipeline-platform" id="${simulated.run_id}-${variant.id}"`);
  const article = html.slice(start, html.indexOf('</article>', start));
  const visiblePost = article.split('<details')[0];
  let previous = -1;
  for (const field of variant.fields) for (const block of field.blocks) {
    const tag = field.key === 'title' ? 'h4' : 'p';
    const position = visiblePost.indexOf(`<${tag}>${escapeText(block.en)}</${tag}>`);
    assert.ok(position > previous, variant.platform + '英文字段顺序与段落必须保留且默认可见');
    previous = position;
    assert.ok(article.includes(`<${tag}>${escapeText(block.zh)}</${tag}>`), variant.platform + '中文必须完整显示');
  }
  assert.ok(article.includes('<details class="platform-translation" open>'), '中文默认展开');
  if (variant.visual.kind === 'external_video') assert.ok(!article.includes('<img') && !article.includes('配图待制作'), '视频配文不能冒充图片作品');
});
const injected = JSON.parse(JSON.stringify(current));
injected.prompt = '<img src=x onerror="alert(1)">';
injected.variants[0].body_en = '<script>alert(1)</script>';
const escaped = renderer.recordMarkup(injected);
assert.ok(!escaped.includes('<script>') && !escaped.includes('<img src=x'), 'Prompt和文案中的HTML必须作为文字展示');
assert.ok(escaped.includes('&lt;script&gt;'), 'HTML文案必须可见而非丢失');
const newInjected = clone(simulated);
newInjected.variants[0].fields[0].blocks[0] = { en: '<script>alert(1)</script>', zh: '<svg onload="alert(1)">' };
newInjected.variants[0].visual.image.alt = '" onerror="alert(1)';
const newEscaped = renderer.recordMarkup(newInjected);
assert.ok(!newEscaped.includes('<script>') && !newEscaped.includes('<svg') && !newEscaped.includes('alt="" onerror='), '新字段与图片属性必须转义');
assert.ok(newEscaped.includes('&lt;script&gt;') && newEscaped.includes('&lt;svg'), '双语注入文本不能丢失');
newInjected.variants[0].visual.image.src = 'javascript:alert(1)';
assert.throws(() => renderer.recordMarkup(newInjected), /图片路径/);
const maliciousLink = clone(simulated);
maliciousLink.source.url = 'javascript:alert(1)';
assert.throws(() => renderer.recordMarkup(maliciousLink), /HTTPS/);
const noMedia = clone(simulated);
delete noMedia.variants[0].visual.image;
noMedia.ai_review.revision_count = 0;
const noMediaHtml = renderer.recordMarkup(noMedia);
assert.ok(noMediaHtml.includes('4:5 配图待制作') && noMediaHtml.includes('检查记录') && !noMediaHtml.includes('0 次退稿'), '缺图与零次退稿必须如实展示');
assert.ok(html.includes('record-status status-blocked">文案可审，图片待完善'), '图片未完成时总状态必须使用阻塞色');
assert.ok(html.includes('record-status status-pending">图文样稿待你审核'), '新记录不能显示为已通过');
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, '追加记录后DOM id必须保持唯一');
assert.ok(html.includes(current.run_id), '当前记录锚点缺失');
assert.ok(html.includes(simulated.run_id), '模拟记录锚点缺失');
assert.ok(!fs.readFileSync(path.join(root, 'data', 'content-pipeline-tests.json'), 'utf8').includes(simulated.run_id), '模拟记录不得写入公开数据');

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-review-disclosure-'));
try {
  fs.mkdirSync(path.join(fixtureRoot, 'data'));
  fs.writeFileSync(path.join(fixtureRoot, 'data/content.json'), JSON.stringify({ nav: [] }));
  const validateDetails = (file, markup) => {
    fs.writeFileSync(path.join(fixtureRoot, file), markup);
    const result = spawnSync(process.execPath, [path.join(__dirname, 'check-public-pages.js')], {
      env: { ...process.env, PUBLIC_SITE_ROOT: fixtureRoot }, encoding: 'utf8'
    });
    fs.unlinkSync(path.join(fixtureRoot, file));
    assert.ifError(result.error);
    return result;
  };
  assert.equal(validateDetails('content-pipeline-test.js', '<details class="platform-review"></details>').status, 1, '折叠评审附件必须拒绝');
  assert.equal(validateDetails('content-pipeline-test.js', '<details class="platform-translation"></details>').status, 1, '折叠中文对照必须拒绝');
  const hiddenPost = validateDetails('content-pipeline-test.js', '<details class="platform-post"></details>');
  assert.equal(hiddenPost.status, 1, '实际帖子仍禁止默认隐藏');
  assert.match(hiddenPost.stderr, /正文details未默认展开/);
  assert.equal(validateDetails('other-page.js', '<details class="platform-review"></details>').status, 1, '其他页面不能借用评审页例外');
} finally {
  fs.rmSync(fixtureRoot, { recursive: true });
}

function makePng(width, height) {
  const chunk = (type, data) => {
    const payload = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of payload) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, payload, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc((width * 3 + 1) * height))), chunk('IEND', Buffer.alloc(0))]);
}

const mediaRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-pipeline-media-'));
try {
  fs.mkdirSync(path.join(mediaRoot, 'data'));
  for (const file of ['content-pipeline-test.html', 'content-pipeline-test.js', 'data/content-studio.json']) fs.copyFileSync(path.join(root, file), path.join(mediaRoot, file));
  const fixtureConfig = { ...config, records: [clone(latest), clone(current)] };
  for (const record of fixtureConfig.records) {
    if (record.image) {
      fs.mkdirSync(path.dirname(path.join(mediaRoot, record.image.src)), { recursive: true });
      fs.copyFileSync(path.join(root, record.image.src), path.join(mediaRoot, record.image.src));
    }
    for (const variant of record.variants) if (variant.visual.image) {
      const [width, height] = variant.visual.aspect_ratio.split(':').map(Number);
      Object.assign(variant.visual.image, { width, height });
      variant.visual.image.src = variant.visual.image.src.replace(/\.(?:jpe?g|webp)$/, '.png');
      fs.mkdirSync(path.dirname(path.join(mediaRoot, variant.visual.image.src)), { recursive: true });
      fs.writeFileSync(path.join(mediaRoot, variant.visual.image.src), makePng(width, height));
    }
  }
  const validateRecord = (mutate) => {
    const fixture = clone(fixtureConfig);
    mutate(fixture.records[0], fixture.records[1]);
    fs.writeFileSync(path.join(mediaRoot, 'data/content-pipeline-tests.json'), JSON.stringify(fixture));
    const result = spawnSync(process.execPath, [path.join(__dirname, 'check-content-pipeline-tests.js')], { env: { ...process.env, PUBLIC_SITE_ROOT: mediaRoot }, encoding: 'utf8' });
    assert.ifError(result.error);
    return result;
  };
  const valid = validateRecord(() => {});
  assert.equal(valid.status, 0, valid.stderr);
  const invalidCases = [
    ['平台集合', (record) => record.variants.pop(), /完整的三个或五个平台/],
    ['重复平台', (record) => { record.variants[4].id = 'tiktok'; }, /完整的三个或五个平台/],
    ['缺少标题', (record) => record.variants[2].fields.shift(), /完整平台字段/],
    ['缺少翻译', (record) => { delete record.variants[0].fields[0].blocks[0].zh; }, /\.zh 不能为空/],
    ['空段落', (record) => { record.variants[0].fields[0].blocks = []; }, /blocks 不能为空/],
    ['外部路径', (record) => { record.variants[0].visual.image.src = '../outside.png'; }, /相对路径/],
    ['缺失文件', (record) => { record.variants[0].visual.image.src = 'assets/missing.png'; }, /图片无效/],
    ['假尺寸', (record) => { record.variants[0].visual.image.width = 8; }, /声明尺寸/],
    ['错误比例', (record) => { record.variants[0].visual.image = clone(record.variants[2].visual.image); }, /实际图片比例/],
    ['视频附图', (record) => { record.variants[3].visual.image = clone(record.variants[0].visual.image); }, /不能包含图片/],
    ['假视频完成', (record) => { record.variants[3].visual.kind = 'illustration'; }, /external_video/],
    ['缺少样稿插画', (record) => { delete record.variants[0].visual.image; }, /缺少插画/],
    ['旧参考图丢失', (_, record) => { delete record.image; }, /image 不完整/],
    ['旧正文丢失', (_, record) => { delete record.variants[0].body_en; }, /body_en 不能为空/]
  ];
  for (const [label, mutate, pattern] of invalidCases) {
    const result = validateRecord(mutate);
    assert.equal(result.status, 1, label + '必须阻止发布');
    assert.match(result.stderr, pattern, label);
  }
  const optional = validateRecord((record) => {
    record.review_status = '文案可审，图片待完善';
    record.ai_review.revision_count = 0;
    delete record.variants[0].visual.image;
  });
  assert.equal(optional.status, 0, '标明缺图的记录允许零次修改：' + optional.stderr);
  const imageFile = path.join(mediaRoot, fixtureConfig.records[0].variants[0].visual.image.src);
  fs.copyFileSync(imageFile, imageFile.replace(/\.png$/, '.jpg'));
  const wrongExtension = validateRecord((record) => { record.variants[0].visual.image.src = record.variants[0].visual.image.src.replace(/\.png$/, '.jpg'); });
  assert.equal(wrongExtension.status, 1, 'PNG伪装成JPEG必须拒绝');
  assert.match(wrongExtension.stderr, /扩展名与真实文件类型不符/);
  fs.writeFileSync(imageFile, 'This is text, not an image.');
  const invalidType = validateRecord(() => {});
  assert.equal(invalidType.status, 1, '伪图片文件必须拒绝');
  assert.match(invalidType.stderr, /无法识别/);
} finally {
  fs.rmSync(mediaRoot, { recursive: true });
}

assert.equal(fs.readFileSync(sourcePath, 'utf8'), originalSource, '测试不能改写公开记录');
console.log('内容样稿追加结构测试通过');
