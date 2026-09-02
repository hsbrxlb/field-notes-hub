#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const root = process.env.PUBLIC_SITE_ROOT ? path.resolve(repoRoot, process.env.PUBLIC_SITE_ROOT) : repoRoot;
const errors = [];
const runtimeExtensions = new Set(['.html', '.js', '.css', '.json']);
const highRiskCopy = [
  ['只…不…', /只[^。！？\n]{0,80}不/],
  ['先…再…', /先[^。！？\n]{0,80}再/],
  ['不是…而是…', /不是[^。！？\n]{0,80}而是/],
  ['不只…还/更…', /不只[^。！？\n]{0,80}(?:还|更)/],
  ['not just…but…', /\bnot\s+just\b.{0,100}\bbut\b/is],
  ['not…but…', /\bnot\b.{1,80}\bbut\b/is]
];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const files = [
  ...fs.readdirSync(root).filter((name) => ['.html', '.js', '.css'].includes(path.extname(name))).map((name) => path.join(root, name)),
  ...walk(path.join(root, 'data')),
  ...walk(path.join(root, 'preview'))
].filter((file) => runtimeExtensions.has(path.extname(file)));

for (const file of files) {
  const relative = path.relative(root, file);
  const source = fs.readFileSync(file, 'utf8');
  if (path.extname(file) !== '.css') {
    for (const [label, pattern] of highRiskCopy) {
      const match = source.match(pattern);
      if (match) errors.push(`${relative}: 高风险模板句式 ${label}: ${match[0]}`);
    }
    const helperCount = ['<small', 'section-note', 'helper-text', 'class="muted"'].reduce((count, marker) => count + source.split(marker).length - 1, 0);
    if (helperCount >= 5) errors.push(`${relative}: 同页解释性小字标记达到 ${helperCount} 处`);
  } else {
    if (/text-shadow\s*:/i.test(source)) errors.push(`${relative}: 禁止文字阴影`);
    if (/backdrop-filter\s*:/i.test(source)) errors.push(`${relative}: 禁止装饰性模糊滤镜`);
    for (const match of source.matchAll(/font-size\s*:\s*([0-9.]+)px/gi)) {
      if (Number(match[1]) < 12) errors.push(`${relative}: 可见字号低于12px: ${match[0]}`);
    }
    if (/url\([^)]*background\.png/i.test(source)) errors.push(`${relative}: 常规页面不得加载全页装饰背景`);
    if (/@import\s+url\([^)]*fonts\./i.test(source)) errors.push(`${relative}: 字体不得通过CSS @import加载`);
  }
}

const assetRoot = path.join(root, 'assets');
for (const file of walk(assetRoot)) {
  if (fs.statSync(file).size > 600 * 1024) errors.push(`${path.relative(root, file)}: 单个公开素材超过600KB`);
}

if (!process.env.PUBLIC_SITE_ROOT && !fs.existsSync(path.join(root, 'design.md'))) errors.push('缺少 design.md');
const theme = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');
for (const token of ['--surface:', '--touch-size:', '--content-max:', '--content-wide:', '--content-gallery:', '--sidebar-width:', '--topbar-height:', '--type-h1:', '--space-8:', '--motion-slow:', '--radius-control:']) {
  if (!theme.includes(token)) errors.push(`theme.css 缺少设计token ${token}`);
}

if (errors.length) {
  console.error('Hub anti-slop 检查失败');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Hub anti-slop 检查通过（${files.length} 个运行时文件）`);
}
