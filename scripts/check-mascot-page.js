const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const root = path.resolve(process.env.PUBLIC_SITE_ROOT || path.join(__dirname, '..'));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => { throw new Error(`Mascot page check failed: ${message}`); };

function webpSize(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = buffer.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === 'VP8X') return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  return null;
}

const mascot = JSON.parse(read('data/mascot.json'));
const content = JSON.parse(read('data/content.json'));
const html = read('mascot.html');
const script = read('mascot.js');
const css = read('mascot.css');

if (!content.nav.some((item) => item.id === 'mascot' && item.file === 'mascot.html')) fail('Hub navigation does not include mascot.html');
if (!html.includes('data-page="mascot"') || !html.includes('mascot.css') || !html.includes('mascot.js')) fail('mascot.html is missing the page id or dedicated assets');
if (!script.includes('data.characters') || !script.includes('evo-toc') || !script.includes('evo-character-list')) fail('character gallery or jump navigation is incomplete');
if (!css.includes('grid-template-columns: 150px minmax(0, 1fr)') || !css.includes('scroll-margin-top') || !css.includes('overflow-x: auto')) fail('reserved desktop navigation or mobile anchor layout is incomplete');

const forbiddenUi = [
  'evo-filter', '<details', '<summary', '<time', 'evo-round-toggle', 'evo-status',
  'dialog', 'evo-lightbox', 'recommendedMarkup', 'data-evo-overview'
];
const buttons = script.match(/<button\b[^>]*>/g) || [];
if (buttons.length !== 1 || buttons[0] !== '<button type="button" id="retry-mascot">') fail('only the loading-error retry button is allowed');
for (const token of forbiddenUi) {
  if (script.includes(token)) fail(`unnecessary mascot interaction remains: ${token}`);
}

if ('rounds' in mascot || !Array.isArray(mascot.characters) || mascot.characters.length !== 1) fail('the gallery must contain only the Bruno character family');

const codes = [];
const sources = [];
const families = [];
for (const character of mascot.characters) {
  if (!character.id || !character.index || !character.family || !character.type || !character.name_cn || !character.name_en || !character.blurb) fail('a character section is missing identity or copy');
  if (!Array.isArray(character.assets) || character.assets.length !== 5) fail(`${character.family} has the wrong image count`);
  families.push(character.family);
  if (character.versions || character.sizePreview) fail('the current gallery must not reintroduce version comparisons');
  for (const asset of character.assets) {
    if (!asset.code || !asset.caption || !asset.alt || !asset.src || !asset.source_round) fail(`${character.family} contains an incomplete asset record`);
    const assetPath = path.join(root, asset.src);
    if (!fs.existsSync(assetPath) || fs.statSync(assetPath).size < 1000) fail(`${asset.code} asset is missing or empty`);
    const size = webpSize(assetPath);
    if (!size || size.width !== size.height || size.width < 1024) fail(`${asset.code} must remain a square WebP at least 1024px wide`);
    codes.push(asset.code);
    sources.push(asset.src);
  }
}

if (families.join(',') !== 'bison') fail('only the Bruno family belongs in the current gallery');
if (codes.length !== 5 || new Set(codes).size !== 5 || new Set(sources).size !== 5) fail('five unique Bruno gallery images are required');
if (mascot.characters[0].role !== 'brand' || mascot.characters[0].index !== '01') fail('Bruno must retain the brand identity');

const bull = mascot.characters[0];
if (bull.name_cn !== '布诺' || bull.name_en !== 'Bruno'
  || bull.assets.some((asset) => asset.source_round !== 'bull-v2')) fail('the updated bull identity is missing');
const expectedCodes = Array.from({ length: 5 }, (_, index) => `BULL-V2-0${index + 1}`);
if (codes.join(',') !== expectedCodes.join(',')
  || bull.assets.some((asset) => asset.src !== `assets/mascot-evolution/bull-v2/${asset.code}.webp`)) fail('the five accepted Bruno images must remain in order');
if (bull.avatar_src !== 'assets/mascot-evolution/bull-v2/BULL-V2-AVATAR.webp'
  || !fs.existsSync(path.join(root, bull.avatar_src))) fail('the Bruno gallery avatar is missing');
if (!Array.isArray(mascot.applications) || mascot.applications.length !== 2) fail('social and merchandise applications are required');
if (mascot.applications.map((asset) => asset.code).join(',') !== 'BULL-V2-SOCIAL,BULL-V2-MERCH') fail('both accepted Bruno scenes must remain');
for (const asset of mascot.applications) {
  if (asset.source_round !== 'bull-v2' || asset.src !== `assets/mascot-evolution/bull-v2/${asset.code}.webp`) fail('a scene uses an obsolete mascot version');
  if (!asset.code || !asset.caption || !asset.alt || !asset.src) fail('an application is incomplete');
  const size = webpSize(path.join(root, asset.src));
  if (!size || size.width < 1024 || size.height < 1024
    || size.width !== asset.width || size.height !== asset.height) fail(`${asset.code} dimensions are incorrect`);
  if (sources.includes(asset.src) || codes.includes(asset.code)) fail('an application duplicates a character image');
  sources.push(asset.src);
  codes.push(asset.code);
}
if (new Set(sources).size !== sources.length || new Set(codes).size !== codes.length) fail('application images are duplicated');

const kit = JSON.parse(read('data/mascot-kit.json'));
if (kit.display_name !== 'Bruno') fail('the display name must be Bruno');
if (kit.examples.length !== 6 || kit.examples.some((example) => example.speaker !== 'Bruno')) fail('all six application speakers must be Bruno');
if (!kit.examples[0].copy.includes('AI research guide') || !script.includes('AI身份在首次互动')) fail('AI identity must remain in the introduction');
for (const asset of kit.assets) {
  if (!/^assets\/mascot-kit\/[a-z0-9.-]+$/.test(asset.src)) fail('public kit asset path is unsafe');
  const bytes = fs.readFileSync(path.join(root, asset.src));
  if (bytes.length !== asset.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== asset.sha256) fail(`public kit asset changed: ${asset.id}`);
  if (/^pose-(welcome|explain)-512-png$/.test(asset.id)
    && (bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a' || bytes[25] !== 6)) fail(`${asset.id} must remain a transparent RGBA PNG`);
  if (/^avatar-\d+-png$/.test(asset.id)) {
    const size = Number(asset.id.split('-')[1]);
    if (bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a' || bytes[25] !== 6
      || bytes.readUInt32BE(16) !== size || bytes.readUInt32BE(20) !== size) fail(`${asset.id} must be an RGBA PNG of its declared size`);
  }
}
for (const id of ['avatar-32-png', 'avatar-64-png', 'avatar-128-png', 'avatar-256-png', 'pose-welcome-512-png', 'pose-explain-512-png', 'pose-welcome-768-webp', 'pose-explain-768-webp']) {
  if (!kit.assets.some((asset) => asset.id === id)) fail(`missing kit asset: ${id}`);
}
if (!fs.existsSync(path.join(root, kit.download)) || !fs.existsSync(path.join(root, kit.usage))) fail('kit downloads are missing');
if (!content.nav.some((item) => item.id === 'mascot-applications' && item.file === 'mascot.html#applications' && item.parent === 'mascot')) fail('application navigation is missing');
const publicText = [JSON.stringify(mascot), JSON.stringify(kit), read(kit.usage), html, script, css].join('\n');
if (/Sunny|阿朗|Ollie|小欧|Tread|踏踏|MR-BOARD|bull-v1|ollie-halo|ollie-kit|chat-refresh|meeting-refresh/i.test(publicText)) fail('an obsolete independent mascot remains in the current page');
if (/已淘汰|当前候选|候选|已选定|首选|备选|Rejected|Shortlisted|Selected/.test(publicText)) fail('selection labels must not appear');
if (/"date"\s*:|"goal"\s*:|独立画面|身份｜|结构｜|工作｜|动态｜/.test(JSON.stringify(mascot))) fail('dates or design-process copy must not appear in the character gallery');
if (/\/Users\/|127\.0\.0\.1|localhost|API[_ -]?KEY|COOKIE|PASSWORD/i.test(publicText)) fail('local-only or sensitive text appears in the public mascot page');

async function checkRenderedPage() {
  const main = { innerHTML: '', setAttribute() {} };
  const description = { content: '' };
  const page = { window: { fetchHubJSON: async (file) => JSON.parse(read(file)) }, document: {
    body: { dataset: {} },
    querySelector: (selector) => selector === '#content' ? main : description,
    getElementById: () => null
  }, location: { hash: '' }, fetch: async (file) => ({ ok: true, json: async () => JSON.parse(read(file)) }) };
  vm.runInNewContext(script, page);
  await page.window.initMascot();
  const rendered = main.innerHTML;
  if ((rendered.match(/class="evo-character"/g) || []).length !== 1
    || (rendered.match(/class="evo-asset"/g) || []).length !== 7) fail('rendered gallery must show one family and all seven accepted images');
  if ((rendered.match(/<strong>Bruno<\/strong>/g) || []).length !== 6) fail('rendered applications must keep all six Bruno speakers');
  for (const id of [bull.id, 'applications', 'character-voice', 'digital-assets']) {
    if (!rendered.includes(`href="#${id}"`) || !rendered.includes(`id="${id}"`)) fail(`rendered page anchor is missing: ${id}`);
  }
  for (const src of [...sources, kit.download, kit.usage]) {
    if (!rendered.includes(`href="${src}"`)) fail(`rendered image or download is missing: ${src}`);
  }
  if (!rendered.includes('AI research guide') || !rendered.includes('救援板小伙伴')) fail('rendered AI introduction or Bruno companion is missing');
  if (/Sunny|阿朗|Ollie|小欧|Tread|踏踏|MR-BOARD|bull-v1/i.test(rendered + description.content)) fail('an obsolete mascot is rendered');
  console.log('Mascot gallery check passed: Bruno only, 5 unique character images, 2 accepted scenes, 6 applications, transparent assets and downloads; rendered anchors and AI disclosure intact.');
}

checkRenderedPage().catch((error) => { console.error(error.message); process.exitCode = 1; });
