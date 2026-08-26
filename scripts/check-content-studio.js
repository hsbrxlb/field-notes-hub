#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dataPath = path.join(root, 'data/content-studio.json');
const htmlPath = path.join(root, 'content-studio.html');
const sourcePath = path.join(root, 'content-studio.js');
const errors = [];
const allowedConfigKeys = new Set(['title', 'intro', 'categories', 'results']);
const allowedCategoryKeys = new Set(['id', 'label']);
const allowedResultKeys = new Set(['id', 'date', 'project', 'type', 'category', 'title', 'description', 'purpose', 'status', 'related_work', 'links']);
const allowedLinkKeys = new Set(['label', 'href']);
const categoryIds = ['all', 'content', 'research', 'system'];
const statuses = new Set(['已完成', '进行中', '概念', '待确认']);
const forbiddenText = [
  /localStorage/i, /sessionStorage/i, /indexedDB/i, /XMLHttpRequest/i,
  /(?:^|["'`])\/api\//i, /api[_-]?key/i, /openai/i, /anthropic/i,
  /deepseek/i, /supabase/i, /firebase/i, /cloudflare/i, /password/i,
  /cookie/i, /token/i, /secret/i, /localhost/i, /127\.0\.0\.1/i,
  /file:\/\//i, /\/Users\//i, /\/var\//i, /\b(?:prompt|generate|approve|review|import|export|backup|login)\b/i,
  /生成/, /审核/, /批准/, /导入/, /导出/, /备份/, /登录/, /密码/
];
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const phonePattern = /(?:\+\d[\d ()-]{8,}\d|\b1[3-9]\d{9}\b|\b\d{3}[ .-]\d{3}[ .-]\d{4}\b)/;

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(`${path.relative(root, file)} 无法读取或不是有效 JSON：${error.message}`);
    return null;
  }
}

function checkKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${label} 必须是对象`);
    return;
  }
  Object.keys(value).forEach((key) => {
    if (!allowed.has(key)) errors.push(`${label} 含有不允许的字段：${key}`);
  });
}

function checkDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    errors.push(`${label} 必须使用 YYYY-MM-DD 日期`);
    return;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    errors.push(`${label} 不是有效日期`);
  }
}

function checkLink(link, label) {
  checkKeys(link, allowedLinkKeys, label);
  if (typeof link?.label !== 'string' || !link.label.trim()) errors.push(`${label}.label 不能为空`);
  if (typeof link?.href !== 'string' || !link.href.trim()) {
    errors.push(`${label}.href 不能为空`);
    return;
  }
  const href = link.href.trim();
  const isHttps = /^https:\/\/[^\s]+$/.test(href);
  const isRelative = /^[A-Za-z0-9][^\s:]*$/.test(href) && !/(?:^|\/)\.\.(?:\/|$)/.test(href);
  if (!isHttps && !isRelative) {
    errors.push(`${label}.href 必须是相对链接或 HTTPS 链接`);
  }
}

function checkResult(result, index) {
  const label = `results[${index}]`;
  checkKeys(result, allowedResultKeys, label);
  for (const field of ['id', 'date', 'project', 'type', 'category', 'title', 'description', 'purpose', 'status', 'related_work']) {
    if (typeof result?.[field] !== 'string' || !result[field].trim()) errors.push(`${label}.${field} 不能为空`);
  }
  checkDate(result?.date, `${label}.date`);
  if (!statuses.has(result?.status)) errors.push(`${label}.status 不在允许范围内`);
  if (!categoryIds.includes(result?.category)) errors.push(`${label}.category 不在允许范围内`);
  if (!Array.isArray(result?.links)) {
    errors.push(`${label}.links 必须是数组`);
  } else {
    result.links.forEach((link, linkIndex) => checkLink(link, `${label}.links[${linkIndex}]`));
  }
}

function checkPublicText(value, label) {
  const source = typeof value === 'string' ? value : JSON.stringify(value);
  if (emailPattern.test(source)) errors.push(`${label} 不得包含邮箱地址`);
  if (phonePattern.test(source)) errors.push(`${label} 不得包含疑似电话号码`);
  forbiddenText.forEach((pattern) => {
    if (pattern.test(source)) errors.push(`${label} 含有禁止内容：${pattern}`);
  });
}

const config = readJson(dataPath);
if (config) {
  checkKeys(config, allowedConfigKeys, 'content-studio.json');
  for (const field of ['title', 'intro']) {
    if (typeof config[field] !== 'string' || !config[field].trim()) errors.push(`${field} 不能为空`);
  }
  if (config.title !== '内容成果') errors.push('title 必须是“内容成果”');
  if (!Array.isArray(config.categories)) {
    errors.push('categories 必须是数组');
  } else {
    const ids = config.categories.map((item) => item?.id);
    if (JSON.stringify(ids) !== JSON.stringify(categoryIds)) errors.push('categories 必须依次为全部、内容、研究与方案、网站与系统');
    const seen = new Set();
    config.categories.forEach((item, index) => {
      checkKeys(item, allowedCategoryKeys, `categories[${index}]`);
      if (typeof item?.id !== 'string' || !item.id.trim()) errors.push(`categories[${index}].id 不能为空`);
      if (typeof item?.label !== 'string' || !item.label.trim()) errors.push(`categories[${index}].label 不能为空`);
      if (seen.has(item?.id)) errors.push(`categories[${index}].id 重复`);
      seen.add(item?.id);
    });
  }
  if (!Array.isArray(config.results) || !config.results.length) {
    errors.push('results 必须是非空数组');
  } else {
    const seen = new Set();
    config.results.forEach((item, index) => {
      checkResult(item, index);
      if (seen.has(item?.id)) errors.push(`results[${index}].id 重复`);
      seen.add(item?.id);
    });
  }
  checkPublicText(config, 'content-studio.json');
}

for (const file of [htmlPath, sourcePath]) {
  const source = fs.readFileSync(file, 'utf8');
  checkPublicText(source, path.relative(root, file));
}

if (errors.length) {
  console.error('内容成果检查失败');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`内容成果检查通过（${config.results.length} 项公开记录）`);
}
