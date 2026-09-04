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
const recordStatuses = new Set(['等待Oliver判断', '文案可审，图片待完善', '需要修改', '已通过']);
const variantDecisions = new Set(['文案可审', '需要修改', '不适用']);
const aiDecisions = new Set(['可交给人审', '图片待完善', '需要修改', '停止']);
const expectedRatios = { instagram: '4:5', facebook: '4:5', pinterest: '2:3' };
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
  if (!Array.isArray(config.records) || !config.records.length) {
    errors.push('records 必须是非空数组');
  } else {
    const ids = new Set();
    config.records.forEach((record, index) => {
      const label = 'records[' + index + ']';
      for (const key of ['run_id', 'date', 'version', 'product', 'review_status', 'prompt']) {
        requiredString(record[key], label + '.' + key);
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date || '')) errors.push(label + '.date 必须使用YYYY-MM-DD');
      if (!/^[a-z0-9][a-z0-9._-]{2,80}$/.test(record.run_id || '')) errors.push(label + '.run_id 格式不正确');
      if (!recordStatuses.has(record.review_status)) errors.push(label + '.review_status 不受支持');
      if (ids.has(record.run_id)) errors.push(label + '.run_id 重复');
      ids.add(record.run_id);
      for (const key of ['purpose', 'audience', 'desired_effect', 'creative_direction', 'asset_decision', 'post_publish_signals']) {
        requiredString(record.brief?.[key], label + '.brief.' + key);
      }
      if (!Array.isArray(record.brief?.success_criteria) || record.brief.success_criteria.length < 3) errors.push(label + '.brief.success_criteria 至少三项');
      if (!record.source || !/^https:\/\//.test(record.source.url || '')) errors.push(label + '.source.url 必须是https链接');
      requiredString(record.source?.label, label + '.source.label');
      requiredString(record.source?.verification_status, label + '.source.verification_status');
      if (!Array.isArray(record.variants) || record.variants.length !== 3) errors.push(label + '.variants 必须有三个平台版本');
      const platforms = (record.variants || []).map((item) => item.id).sort();
      if (platforms.join(',') !== 'facebook,instagram,pinterest') errors.push(label + '.variants 平台必须是 Instagram、Facebook 和 Pinterest');
      (record.variants || []).forEach((variant, variantIndex) => {
        const variantLabel = label + '.variants[' + variantIndex + ']';
        for (const key of ['id', 'platform', 'platform_job', 'format', 'hook_en', 'body_en', 'cta_en']) requiredString(variant[key], variantLabel + '.' + key);
        requiredString(variant.visual?.aspect_ratio, variantLabel + '.visual.aspect_ratio');
        requiredString(variant.visual?.note, variantLabel + '.visual.note');
        requiredString(variant.review?.decision, variantLabel + '.review.decision');
        requiredString(variant.review?.rationale, variantLabel + '.review.rationale');
        requiredString(variant.review?.success_signal, variantLabel + '.review.success_signal');
        if (!Array.isArray(variant.review?.checks) || variant.review.checks.length < 3) errors.push(variantLabel + '.review.checks 至少三项');
        if (!variantDecisions.has(variant.review?.decision)) errors.push(variantLabel + '.review.decision 不受支持');
        if (variant.visual?.aspect_ratio !== expectedRatios[variant.id]) errors.push(variantLabel + '.visual.aspect_ratio 与平台不匹配');
      });
      if (!record.image || typeof record.image.src !== 'string') {
        errors.push(label + '.image 不完整');
      } else {
        const asset = path.resolve(root, record.image.src);
        if (!asset.startsWith(root + path.sep) || record.image.src.includes('..')) errors.push(label + '.image 必须是仓库内相对路径');
        if (!fs.existsSync(asset)) errors.push(label + '.image 文件不存在：' + record.image.src);
      }
      if (!Array.isArray(record.facts) || !record.facts.length) errors.push(label + '.facts 不完整');
      requiredString(record.ai_review?.decision, label + '.ai_review.decision');
      requiredString(record.ai_review?.summary, label + '.ai_review.summary');
      if (!Number.isInteger(record.ai_review?.revision_count) || record.ai_review.revision_count < 0) errors.push(label + '.ai_review.revision_count 必须是非负整数');
      if (!Array.isArray(record.ai_review?.corrections) || !record.ai_review.corrections.length) errors.push(label + '.ai_review.corrections 不完整');
      if (!aiDecisions.has(record.ai_review?.decision)) errors.push(label + '.ai_review.decision 不受支持');
      if (!Array.isArray(record.human_questions) || record.human_questions.length < 3) errors.push(label + '.human_questions 至少三项');
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
  for (const required of ['sortRecords', 'renderPageMarkup', 'pipeline-record', 'pipeline-prompt', 'pipeline-purpose', 'pipeline-final-review']) {
    if (!source.includes(required)) errors.push('content-pipeline-test.js 缺少：' + required);
  }
}

const studio = readJson(studioDataPath);
const entry = studio?.results?.find((item) => item.id === 'multiplatform-content-test');
if (!entry) errors.push('Content Studio 缺少内容样稿入口');
if (!entry?.links?.some((item) => item.href === 'content-pipeline-test.html')) errors.push('Content Studio 入口没有指向新页面');
if (entry?.status !== '待确认') errors.push('Content Studio 内容生产测试状态必须是待确认');

if (errors.length) {
  console.error('内容样稿检查失败');
  errors.forEach((error) => console.error('- ' + error));
  process.exitCode = 1;
} else {
  console.log('内容样稿检查通过（' + config.records.length + ' 条公开记录）');
}
