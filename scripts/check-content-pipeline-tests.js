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
const recordStatuses = new Set(['等待Oliver判断', '文案可审，图片待完善', '图文样稿待你审核', '需要修改', '已通过']);
const variantDecisions = new Set(['文案可审', '需要修改', '不适用']);
const aiDecisions = new Set(['可交给人审', '待人工判断', '图片待完善', '需要修改', '停止']);
const expectedRatios = { instagram: '4:5', facebook: '4:5', pinterest: '2:3', tiktok: '9:16', youtube_shorts: '9:16' };
const expectedFields = { instagram: 'caption', facebook: 'caption', pinterest: 'title,description', tiktok: 'caption', youtube_shorts: 'title,description' };
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

function imageDimensions(buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && buffer.toString('ascii', 12, 16) === 'IHDR') {
    return { type: 'png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 4 && buffer.readUInt16BE(0) === 0xffd8) {
    let offset = 2;
    while (offset + 4 <= buffer.length && buffer[offset] === 0xff) {
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (length < 2 || offset + length + 2 > buffer.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
        return { type: 'jpeg', width: buffer.readUInt16BE(offset + 7), height: buffer.readUInt16BE(offset + 5) };
      }
      offset += length + 2;
    }
  }
  if (buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { type: 'webp', width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
    if (chunk === 'VP8 ' && buffer.toString('hex', 23, 26) === '9d012a') return { type: 'webp', width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L' && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      return { type: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
  }
  throw new Error('无法识别 PNG、JPEG 或 WebP 图片');
}

function validateImage(image, label, ratio) {
  requiredString(image?.alt, label + '.alt');
  if (!Number.isInteger(image?.width) || image.width <= 0 || !Number.isInteger(image?.height) || image.height <= 0) errors.push(label + ' 尺寸必须是正整数');
  if (!/^assets\/[a-zA-Z0-9/_-]+\.(?:png|jpe?g|webp)$/.test(image?.src || '')) {
    errors.push(label + ' 必须是仓库内 assets 图片相对路径');
    return;
  }
  const asset = path.resolve(root, image.src);
  try {
    if (!fs.realpathSync(asset).startsWith(fs.realpathSync(root) + path.sep)) throw new Error('图片不能指向仓库外部');
    if (!fs.statSync(asset).isFile()) throw new Error('图片路径不是文件');
    const actual = imageDimensions(fs.readFileSync(asset));
    const extension = path.extname(asset).slice(1).replace('jpg', 'jpeg');
    if (actual.type !== extension) errors.push(label + ' 扩展名与真实文件类型不符');
    if (image.width !== actual.width || image.height !== actual.height) errors.push(label + ' 声明尺寸与实际图片尺寸不符');
    if (ratio) {
      const [width, height] = ratio.split(':').map(Number);
      if (Math.abs(actual.width / actual.height - width / height) > 0.005) errors.push(label + ' 实际图片比例与平台不匹配');
    }
  } catch (error) {
    errors.push(label + ' 图片无效：' + error.message);
  }
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
      const variants = Array.isArray(record.variants) ? record.variants : [];
      const platforms = variants.map((item) => item.id).sort().join(',');
      const fivePlatforms = platforms === 'facebook,instagram,pinterest,tiktok,youtube_shorts';
      if (!fivePlatforms && platforms !== 'facebook,instagram,pinterest') errors.push(label + '.variants 必须是完整的三个或五个平台，且不能重复');
      variants.forEach((variant, variantIndex) => {
        const variantLabel = label + '.variants[' + variantIndex + ']';
        for (const key of ['id', 'platform', 'platform_job', 'format']) requiredString(variant[key], variantLabel + '.' + key);
        if (variant.fields !== undefined || fivePlatforms) {
          const fields = Array.isArray(variant.fields) ? variant.fields : [];
          if (fields.map((field) => field.key).join(',') !== expectedFields[variant.id]) errors.push(variantLabel + '.fields 必须包含按发布顺序排列的完整平台字段');
          fields.forEach((field, fieldIndex) => {
            const fieldLabel = variantLabel + '.fields[' + fieldIndex + ']';
            if (!Array.isArray(field.blocks) || !field.blocks.length) errors.push(fieldLabel + '.blocks 不能为空');
            else field.blocks.forEach((block, blockIndex) => {
              requiredString(block.en, fieldLabel + '.blocks[' + blockIndex + '].en');
              requiredString(block.zh, fieldLabel + '.blocks[' + blockIndex + '].zh');
            });
          });
        } else {
          for (const key of ['hook_en', 'body_en', 'cta_en']) requiredString(variant[key], variantLabel + '.' + key);
        }
        requiredString(variant.visual?.aspect_ratio, variantLabel + '.visual.aspect_ratio');
        requiredString(variant.visual?.note, variantLabel + '.visual.note');
        requiredString(variant.review?.decision, variantLabel + '.review.decision');
        requiredString(variant.review?.rationale, variantLabel + '.review.rationale');
        requiredString(variant.review?.success_signal, variantLabel + '.review.success_signal');
        if (!Array.isArray(variant.review?.checks) || variant.review.checks.length < 3) errors.push(variantLabel + '.review.checks 至少三项');
        if (!variantDecisions.has(variant.review?.decision)) errors.push(variantLabel + '.review.decision 不受支持');
        if (variant.visual?.aspect_ratio !== expectedRatios[variant.id]) errors.push(variantLabel + '.visual.aspect_ratio 与平台不匹配');
        const videoPlatform = ['tiktok', 'youtube_shorts'].includes(variant.id);
        if (videoPlatform) {
          if (variant.visual?.kind !== 'external_video' || variant.visual?.image !== undefined) errors.push(variantLabel + ' 视频平台必须使用 external_video 且不能包含图片');
        } else if (variant.visual?.kind !== undefined || fivePlatforms) {
          if (variant.visual?.kind !== 'illustration') errors.push(variantLabel + '.visual.kind 必须是 illustration');
          if (variant.visual?.image) validateImage(variant.visual.image, variantLabel + '.visual.image', expectedRatios[variant.id]);
          else if (record.review_status === '图文样稿待你审核') errors.push(variantLabel + ' 图文样稿缺少插画');
        } else if (variant.visual?.image !== undefined) errors.push(variantLabel + ' 图片必须说明 visual.kind');
      });
      if (record.image) validateImage(record.image, label + '.image');
      else if (!fivePlatforms) errors.push(label + '.image 不完整');
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
