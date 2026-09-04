#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const root = process.env.PUBLIC_SITE_ROOT ? path.resolve(repoRoot, process.env.PUBLIC_SITE_ROOT) : repoRoot;
const errors = [];
const publicRoots = ['assets', 'data', 'preview', 'experiences'];
const rootExtensions = new Set(['.html', '.js', '.css']);
const textExtensions = new Set(['.html', '.js', '.css', '.json', '.txt', '.md']);
const forbidden = [
  /\/Users\//i,
  /file:\/\//i,
  /TEST-FACT/i,
  /fact_ids/i,
  /approved_claim/i,
  /request_sha256/i,
  /output_sha256/i,
  /api[_-]?key/i,
  /password/i,
  /cookie/i,
  /secret/i,
  /internal error/i,
  /traceback/i
];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const rootFiles = fs.readdirSync(root)
  .filter((name) => rootExtensions.has(path.extname(name)))
  .map((name) => path.join(root, name));
const publicFiles = [
  ...rootFiles,
  ...publicRoots.flatMap((name) => walk(path.join(root, name)))
];

const codeFiles = publicFiles.filter((file) => ['.html', '.js'].includes(path.extname(file)));
const detailTags = [];
for (const file of codeFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/<details\b[^>]*>/gi)) {
    detailTags.push({ file, tag: match[0] });
    const intentionalHistory = /class="[^"]*evo-round/.test(match[0]);
    if (!intentionalHistory && !/\bopen\b/i.test(match[0])) errors.push(path.relative(root, file) + ' 有正文details未默认展开：' + match[0]);
  }
  for (const match of source.matchAll(/<[^>]+aria-expanded="false"[^>]*>/gi)) {
    if (!/class="[^"]*menu-button/.test(match[0])) errors.push(path.relative(root, file) + ' 有正文aria-expanded=false：' + match[0]);
  }
}
if (!detailTags.length) errors.push('没有找到可验证的正文details');

const appPath = path.join(root, 'app.js');
if (fs.existsSync(appPath)) {
  const app = fs.readFileSync(appPath, 'utf8');
  for (const forbiddenControl of ['data-research-tab', 'role="tabpanel"', 'data-stage=']) {
    if (app.includes(forbiddenControl)) errors.push('app.js 仍含正文隐藏控件：' + forbiddenControl);
  }
  if (/searchInput|searchStatus|page-search|search-empty|event\.key === ['"]\/['"]/.test(app)) {
    errors.push('app.js 仍含侧栏页内搜索逻辑');
  }
}

for (const file of publicFiles.filter((item) => textExtensions.has(path.extname(item)))) {
  const relative = path.relative(root, file);
  if (/^experiences\/flipbooks\/assets\/index-[^/]+\.js$/.test(relative)) continue;
  const source = fs.readFileSync(file, 'utf8');
  forbidden.forEach((pattern) => {
    if (pattern.test(source)) errors.push(relative + ' 含有公开禁止内容：' + pattern);
  });
}

for (const file of publicFiles.filter((item) => path.extname(item) === '.html')) {
  const source = fs.readFileSync(file, 'utf8');
  if (/sidebar-search|page-search|search-status|搜索本页内容|按 \/ 搜索/.test(source)) {
    errors.push(path.relative(root, file) + ' 仍含侧栏页内搜索');
  }
  for (const match of source.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = match[1];
    if (/^(?:https:|data:|#|mailto:|javascript:)/.test(target)) continue;
    const clean = target.split('#')[0].split('?')[0];
    if (!clean) continue;
    const resolved = path.resolve(path.dirname(file), clean);
    if (!fs.existsSync(resolved)) errors.push(path.relative(root, file) + ' 有断链：' + target);
  }
}

const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'content.json'), 'utf8'));
for (const item of data.nav || []) {
  if (!fs.existsSync(path.join(root, item.file))) errors.push('导航目标不存在：' + item.file);
}

if (errors.length) {
  console.error('公开页面检查失败');
  errors.forEach((error) => console.error('- ' + error));
  process.exitCode = 1;
} else {
  console.log('公开页面检查通过（' + detailTags.length + ' 个正文details默认展开）');
}
