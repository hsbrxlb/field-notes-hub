#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const root = process.env.PUBLIC_SITE_ROOT ? path.resolve(repoRoot, process.env.PUBLIC_SITE_ROOT) : repoRoot;
const bundle = path.join(root, 'experiences', 'flipbooks');
const errors = [];

const hubPagePath = path.join(root, 'flipbooks.html');
const contentPath = path.join(root, 'data', 'content.json');
const resultsPath = path.join(root, 'data', 'content-studio.json');
const appPath = path.join(root, 'app.js');

const requiredImages = new Set([
  '出发封面_Departure_Cover.webp',
  '周末装载_Tonneau_Weekend_Load.webp',
  '夜晚归家_Homecoming_Back_Cover.webp',
  '家庭抵达_Running_Boards_Arrival.webp',
  '山路计划_Bumper_Trailhead.webp',
  '装备整理_Storage_Gear_Ready.webp',
  '雨天归来_Floor_Mats_Rain_Return.webp'
]);

function requireFile(relative) {
  const file = path.join(bundle, relative);
  if (!fs.existsSync(file)) errors.push(`缺少 ${relative}`);
  return file;
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const indexPath = requireFile('index.html');
requireFile('favicon.svg');
requireFile('assets/official/oedro-logo-reference.png');

const imageRoot = path.join(bundle, 'assets', 'v2');
const actualImages = fs.existsSync(imageRoot) ? new Set(fs.readdirSync(imageRoot)) : new Set();
for (const image of requiredImages) if (!actualImages.has(image)) errors.push(`缺少页面图 ${image}`);
for (const image of actualImages) if (!requiredImages.has(image)) errors.push(`包含未使用页面图 ${image}`);

for (const file of [hubPagePath, contentPath, resultsPath, appPath]) {
  if (!fs.existsSync(file)) errors.push(`缺少 Hub 入口文件 ${path.relative(root, file)}`);
}

if (fs.existsSync(hubPagePath) && !fs.readFileSync(hubPagePath, 'utf8').includes('data-page="flipbooks"')) {
  errors.push('flipbooks.html 未绑定专用页面');
}

if (fs.existsSync(contentPath)) {
  const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
  const nav = (content.nav || []).find((item) => item.id === 'flipbooks');
  if (!nav || nav.label !== 'Flip Book Demo' || nav.file !== 'flipbooks.html') errors.push('侧边栏缺少 Flip Book Demo');
  if (content.flipbooks?.title !== 'Flip Book Demo（翻页书）') errors.push('翻页书页面标题不正确');
  const entries = content.flipbooks?.entries;
  if (!Array.isArray(entries) || entries.length !== 2) {
    errors.push('Flip Book Demo 必须正好包含两本书');
  } else {
    const expectedTitles = ['品牌故事 · Brand Story', '车主问卷 · Car Owner Survey'];
    if (entries.some((entry, index) => entry.title !== expectedTitles[index])) errors.push('翻页书入口名称不正确');
    for (const entry of entries) {
      if (!entry.title || entry.description || entry.subtitle) errors.push('每本书必须只有一个用途标题');
      if (!/book=(?:edition-01|owner-field-notes)&return=\.\.\/\.\.\/flipbooks\.html$/.test(entry.href || '')) errors.push(`返回链接不正确：${entry.href}`);
    }
  }
  if (content.research?.interactive_book) errors.push('用户调研页仍含旧翻页书入口');
}

if (fs.existsSync(resultsPath)) {
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8')).results || [];
  if (results.some((item) => ['owner-field-notes', 'edition-01-field-book'].includes(item.id))) errors.push('内容成果页仍含旧翻页书入口');
}

if (fs.existsSync(appPath)) {
  const app = fs.readFileSync(appPath, 'utf8');
  if (!app.includes('renderFlipbooks') || app.includes('interactiveBookMarkup')) errors.push('Hub 页面渲染结构不正确');
}

const runtimeFiles = walk(bundle).filter((file) => ['.html', '.js', '.css'].includes(path.extname(file)));
const runtimeSource = runtimeFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

for (const marker of ['edition-01', 'owner-field-notes', 'localStorage', 'showPageCorners']) {
  if (!runtimeSource.includes(marker)) errors.push(`运行时缺少 ${marker}`);
}

const fetchCount = (runtimeSource.match(/\bfetch\s*\(/g) || []).length;
if (fetchCount !== 1) errors.push(`运行时 fetch 数量异常：${fetchCount}，预期仅保留 React 资源预加载`);
const storageReads = (runtimeSource.match(/localStorage\.getItem\("oedro-field-notes"\)/g) || []).length;
const storageWrites = (runtimeSource.match(/localStorage\.setItem\("oedro-field-notes"/g) || []).length;
if (storageReads !== 1 || storageWrites !== 1) errors.push(`回答存储边界异常：read=${storageReads}, write=${storageWrites}`);

const forbidden = [
  ['第三本标题', /Shop Companion/i],
  ['第三本代码', /shopCompanion|companion-book|light-companion|shop-dog|experience-layer--mascot/i],
  ['内部版本措辞', /Internal concept|Internal prototype/i],
  ['本机地址', /127\.0\.0\.1|localhost|\/Users\//i],
  ['主动提交接口', /sendBeacon\s*\(|new WebSocket\s*\(|XMLHttpRequest\s*\(|navigator\.sendBeacon|window\.fetch/i],
  ['根绝对资源', /(?:href|src)=["']\/(?:assets|fonts|favicon)|url\(\/(?:assets|fonts)/i]
];
for (const [label, pattern] of forbidden) if (pattern.test(runtimeSource)) errors.push(`发现${label}`);

const allowedRuntimeUrls = [
  'https://react.dev/errors/',
  'http://www.w3.org/'
];
for (const match of runtimeSource.matchAll(/https?:\/\/[^\s"'`)]+/g)) {
  if (!allowedRuntimeUrls.some((prefix) => match[0].startsWith(prefix))) errors.push(`发现外部运行时地址：${match[0]}`);
}

if (fs.existsSync(indexPath)) {
  const index = fs.readFileSync(indexPath, 'utf8');
  for (const match of index.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const target = match[1];
    if (/^(?:data:|https:|#)/.test(target)) continue;
    const resolved = path.resolve(bundle, target);
    if (!fs.existsSync(resolved)) errors.push(`index.html 断链：${target}`);
  }
}

for (const file of walk(bundle)) {
  if (fs.statSync(file).size > 600 * 1024) errors.push(`${path.relative(bundle, file)} 超过600KB`);
}

if (errors.length) {
  console.error('互动翻页书检查失败');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`互动翻页书检查通过（2 本，${requiredImages.size} 张页面图）`);
}
