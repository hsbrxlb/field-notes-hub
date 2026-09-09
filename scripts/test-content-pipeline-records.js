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
const current = config.records.find((record) => record.run_id === '2026-09-04-oedro-floor-mats-static');
const latest = config.records.find((record) => record.run_id === '2026-09-09-oedro-trail-passenger');
assert.ok(current && latest, '历史原稿必须保留');
const simulated = clone(latest);
simulated.run_id = 'simulation-primary-platforms';
simulated.date = '2099-01-01';
simulated.variants = ['instagram', 'x', 'youtube'].map((id) => ({ ...clone(latest.variants[0]), id, platform: id }));
const beforeRendering = JSON.stringify(config);
const html = renderer.renderPageMarkup({ ...config, active_run_id: simulated.run_id, records: [current, latest, simulated] });
assert.throws(() => renderer.renderPageMarkup({ ...config, active_run_id: 'missing-record' }), /当前内容记录不存在/, '不能悄悄显示其他旧稿');
assert.equal(renderer.sortRecords([latest, simulated])[0].run_id, simulated.run_id, '最新样稿优先');
assert.equal((html.match(/<article class="pipeline-record"/g) || []).length, 1, '审阅页只显示最新组');
assert.equal((html.match(/class="pipeline-platform"/g) || []).length, 3, '三个主平台完整展示');
assert.ok(!html.includes('id="' + latest.run_id + '"') && !html.includes('id="' + current.run_id + '"'), '旧作品不进入当前审阅页');
for (const record of [simulated]) {
  assert.ok(html.includes(escapeText(record.prompt)), 'Prompt完整可见');
  assert.ok(html.includes(escapeText(record.brief.desired_effect)), '目的可见');
}
for (const token of ['platform-review', 'pipeline-final-review', 'pipeline-evidence', 'pipeline-revisions', 'pipeline-criteria', '<figcaption', 'AI审核意见', 'AI复核结果', '产品来源与素材']) assert.ok(!html.includes(token), '不再渲染审核解释或图下注释：' + token);
for (const platform of ['facebook', 'pinterest', 'tiktok', 'youtube_shorts']) assert.ok(!html.includes('-' + platform + '"'), '非主平台不生成作品或跳转：' + platform);
assert.ok(!html.includes(latest.variants[0].platform_job), '删除平台解释副标题');
const tags = [...html.matchAll(/<details\b[^>]*>/g)].map((match) => match[0]);
assert.ok(tags.length > 0 && tags.every((tag) => /\bopen\b/.test(tag) && tag.includes('platform-translation')), '仅中文对照使用默认展开详情');
for (const variant of simulated.variants) {
  assert.ok(html.includes('id="' + simulated.run_id + '-' + variant.id + '"'), '三个主平台均有作品');
  for (const field of variant.fields) for (const b of field.blocks) assert.ok(html.includes(escapeText(b.en)) && html.includes(escapeText(b.zh)), '双语段落完整');
}
const injected = clone(simulated);
injected.prompt = '<script>alert(1)</script>';
injected.variants[0].fields[0].blocks[0] = { en: '<svg onload="alert(1)">', zh: '<img src=x onerror="alert(1)">' };
const escaped = renderer.recordMarkup(injected);
assert.ok(!escaped.includes('<script>') && !escaped.includes('<svg') && escaped.includes('&lt;svg'), 'Prompt与双语正文转义');
injected.variants[0].visual.image.src = 'javascript:alert(1)';
assert.throws(() => renderer.recordMarkup(injected), /图片路径/);
const noMedia = clone(simulated);
delete noMedia.variants[0].visual.image;
assert.ok(renderer.recordMarkup(noMedia).includes('图片待制作'), '缺图仍需明确显示');
assert.equal(JSON.stringify(config), beforeRendering, '渲染过滤不能删除历史数据或审核记录');
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, '所有DOM锚点唯一');

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
  fixtureConfig.active_run_id = latest.run_id;
  fixtureConfig.records[0].review_status = '图文样稿待你审核';
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
  fs.writeFileSync(path.join(mediaRoot, 'assets', 'primary-square.png'), makePng(1, 1));
  const primaryRecord = (record) => {
    const caption = clone(record.variants[0]);
    record.variants = ['instagram', 'x', 'youtube'].map((id) => {
      const variant = { ...clone(caption), id, platform: id };
      variant.visual.kind = 'generated_photo';
      if (id !== 'instagram') {
        variant.visual.aspect_ratio = '1:1';
        variant.visual.image = { src: 'assets/primary-square.png', alt: '测试图片', width: 1, height: 1 };
      }
      return variant;
    });
  };
  assert.equal(validateRecord(primaryRecord).status, 0, '主平台接受共享方图并保留来源审核字段');
  for (const [label, mutate, pattern] of [
    ['来源缺失', (record) => { delete record.source; }, /source.url/],
    ['审核缺失', (record) => { delete record.ai_review; }, /ai_review/],
    ['主平台变视频', (record) => { record.variants[2].visual.kind = 'external_video'; }, /generated_photo/],
    ['主平台插画冒充照片', (record) => { record.variants[0].visual.kind = 'illustration'; }, /generated_photo/],
    ['主平台缺图', (record) => { delete record.variants[1].visual.image; }, /缺少插画/],
    ['非展示字段泄露本机路径', (record) => { record.source.verification_status = '/Users/example/private'; }, /公开记录含有禁止内容/]
  ]) {
    const result = validateRecord((record) => { primaryRecord(record); mutate(record); });
    assert.equal(result.status, 1, label + '必须阻止发布');
    assert.match(result.stderr, pattern, label);
  }
  const rejected = validateRecord((record) => {
    record.review_status = '需要修改';
    record.ai_review.decision = '需要修改';
    record.variants.forEach((variant) => { variant.review.decision = '需要修改'; });
    const markup = renderer.recordMarkup(record);
    assert.ok(!markup.includes('record-status'), '作品页不展示审核状态');
    assert.ok(!markup.includes('AI审核意见'), '审核记录不显示在作品页');
    for (const variant of renderer.visibleVariants(record)) for (const field of variant.fields) for (const block of field.blocks) {
      assert.ok(markup.includes(escapeText(block.en)) && markup.includes(escapeText(block.zh)), '退回记录仍须保留双语原文');
    }
  });
  assert.equal(rejected.status, 0, '旧稿退回状态应通过现行校验：' + rejected.stderr);
  const invalidCases = [
    ['平台集合', (record) => record.variants.pop(), /完整的主平台/],
    ['重复平台', (record) => { record.variants[4].id = 'tiktok'; }, /完整的主平台/],
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
