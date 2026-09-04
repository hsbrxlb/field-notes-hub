#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const repoRoot = path.resolve(__dirname, '..');
const root = process.env.PUBLIC_SITE_ROOT ? path.resolve(repoRoot, process.env.PUBLIC_SITE_ROOT) : repoRoot;
const errors = [];
const identityBackground = 'assets/background.png';
const identityBackgroundSha256 = '7dc174d8d78bca4d895935e355ea81dca234d2bf5eb93b03aa9e70271b84ab92';
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
    for (const match of source.matchAll(/url\([^)]*background\.png[^)]*\)/gi)) {
      if (relative !== 'theme.css' || match[0] !== `url('${identityBackground}')`) {
        errors.push(`${relative}: 只有 theme.css 的 Hub 固定流体背景可以作为全页背景`);
      }
    }
    if (/@import\s+url\([^)]*fonts\./i.test(source)) errors.push(`${relative}: 字体不得通过CSS @import加载`);
  }
}

const assetRoot = path.join(root, 'assets');
for (const file of walk(assetRoot)) {
  const relative = path.relative(root, file);
  if (relative !== identityBackground && fs.statSync(file).size > 600 * 1024) errors.push(`${relative}: 单个公开素材超过600KB`);
}

const identityBackgroundPath = path.join(root, identityBackground);
if (!fs.existsSync(identityBackgroundPath)) {
  errors.push(`${identityBackground}: Hub 固定流体背景缺失`);
} else {
  const actualHash = crypto.createHash('sha256').update(fs.readFileSync(identityBackgroundPath)).digest('hex');
  if (actualHash !== identityBackgroundSha256) errors.push(`${identityBackground}: 固定流体背景被替换`);
}

if (!process.env.PUBLIC_SITE_ROOT && !fs.existsSync(path.join(root, 'design.md'))) errors.push('缺少 design.md');
const theme = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');
const identityReferences = theme.match(/url\('assets\/background\.png'\)/g) || [];
const bodyBefore = theme.match(/body::before\s*\{([^}]*)\}/s)?.[1] || '';
if (identityReferences.length !== 1 || !bodyBefore.includes(`url('${identityBackground}')`)) {
  errors.push(`theme.css: ${identityBackground} 必须且只能由 body::before 引用一次`);
}
if (/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$)/i.test(bodyBefore)) {
  errors.push('theme.css: Hub 固定流体背景不得隐藏');
}

function rgbaAlpha(token) {
  const match = theme.match(new RegExp(`${token}:\\s*rgba\\([^,]+,[^,]+,[^,]+,\\s*([0-9]*\\.?[0-9]+)\\s*\\)`));
  return match ? Number(match[1]) : null;
}

for (const token of ['--workspace-surface', '--content-surface']) {
  const alpha = rgbaAlpha(token);
  if (alpha === null || alpha <= 0 || alpha >= 1) errors.push(`theme.css: ${token} 必须是可见且半透明的阅读面`);
}
if (!/\.workspace\s*\{[^}]*background\s*:\s*var\(--workspace-surface\)/s.test(fs.readFileSync(path.join(root, 'base.css'), 'utf8'))) {
  errors.push('base.css: 工作区必须使用半透明背景面');
}
if (!/\.main-content\s*\{[^}]*background\s*:\s*var\(--content-surface\)/s.test(fs.readFileSync(path.join(root, 'base.css'), 'utf8'))) {
  errors.push('base.css: 正文必须使用半透明阅读面');
}
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
