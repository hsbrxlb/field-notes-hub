#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const root = process.env.PUBLIC_SITE_ROOT ? path.resolve(repoRoot, process.env.PUBLIC_SITE_ROOT) : repoRoot;
const dataPath = path.join(root, 'data', 'content-pipeline-tests.json');
const pagePath = path.join(root, 'content-pipeline-test.html');
const scriptPath = path.join(root, 'content-pipeline-test.js');
const studioDataPath = path.join(root, 'data', 'content-studio.json');
const errors = [];
const forbidden = [
  /\/Users\//i,
  /file:\/\//i,
  /TEST-FACT/i,
  /fact_ids/i,
  /approved_claim/i,
  /request_sha256/i,
  /output_sha256/i,
  /Klaviyo/i,
  /api[_-]?key/i,
  /password/i,
  /cookie/i,
  /secret/i,
  /internal error/i,
  /traceback/i
];

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(path.relative(root, file) + ' 无法读取或不是有效JSON：' + error.message);
    return null;
  }
}

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) errors.push(label + ' 不能为空');
}

const config = readJson(dataPath);
if (config) {
  requiredString(config.title, 'title');
  requiredString(config.intro, 'intro');
  if (!Array.isArray(config.records) || !config.records.length) {
    errors.push('records 必须是非空数组');
  } else {
    const ids = new Set();
    config.records.forEach((record, index) => {
      const label = 'records[' + index + ']';
      for (const key of ['run_id', 'date', 'product', 'theme', 'review_status', 'summary']) {
        requiredString(record[key], label + '.' + key);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date || '')) errors.push(label + '.date 必须使用YYYY-MM-DD');
      if (!/^[a-z0-9][a-z0-9._-]{2,80}$/.test(record.run_id || '')) errors.push(label + '.run_id 格式不正确');
      if (ids.has(record.run_id)) errors.push(label + '.run_id 重复');
      ids.add(record.run_id);
      if (!Array.isArray(record.platforms) || record.platforms.length !== 4) errors.push(label + '.platforms 必须有四个平台');
      if (!Array.isArray(record.variants) || record.variants.length !== 4) errors.push(label + '.variants 必须有四个平台版本');
      if (!record.image || typeof record.image.src !== 'string') {
        errors.push(label + '.image 不完整');
      } else {
        const asset = path.join(root, record.image.src);
        if (!fs.existsSync(asset)) errors.push(label + '.image 文件不存在：' + record.image.src);
      }
      if (!record.review?.round_one?.items?.length || !record.review?.round_two?.items?.length) errors.push(label + '.review 不完整');
      if (!Array.isArray(record.safety_tests) || record.safety_tests.length !== 6) errors.push(label + '.safety_tests 必须有六项');
      if (!record.social_snapshot?.rows?.length) errors.push(label + '.social_snapshot 不完整');
      if (!Array.isArray(record.boundaries) || !record.boundaries.length) errors.push(label + '.boundaries 不完整');
    });
  }
  const publicText = JSON.stringify(config);
  forbidden.forEach((pattern) => {
    if (pattern.test(publicText)) errors.push('公开记录含有禁止内容：' + pattern);
  });
}

for (const file of [pagePath, scriptPath]) {
  if (!fs.existsSync(file)) errors.push(path.relative(root, file) + ' 不存在');
}
if (fs.existsSync(pagePath)) {
  const html = fs.readFileSync(pagePath, 'utf8');
  for (const required of ['content-pipeline-test.js', 'content-pipeline.css', 'data-page="studio"']) {
    if (!html.includes(required)) errors.push('content-pipeline-test.html 缺少：' + required);
  }
}
if (fs.existsSync(scriptPath)) {
  const source = fs.readFileSync(scriptPath, 'utf8');
  for (const required of ['sortRecords', 'renderPageMarkup', 'pipeline-record', ' open data-searchable']) {
    if (!source.includes(required)) errors.push('content-pipeline-test.js 缺少：' + required);
  }
}

const studio = readJson(studioDataPath);
const entry = studio?.results?.find((item) => item.id === 'multiplatform-content-test');
if (!entry) errors.push('Content Studio 缺少内容测试记录入口');
if (!entry?.links?.some((item) => item.href === 'content-pipeline-test.html')) errors.push('Content Studio 入口没有指向新页面');

if (errors.length) {
  console.error('内容测试记录检查失败');
  errors.forEach((error) => console.error('- ' + error));
  process.exitCode = 1;
} else {
  console.log('内容测试记录检查通过（' + config.records.length + ' 条公开记录）');
}
