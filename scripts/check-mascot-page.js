const fs = require('fs');
const path = require('path');

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
if (!script.includes('data.characters') || !script.includes('evo-toc') || !script.includes('evo-character-list')) fail('character archive or jump navigation is incomplete');
if (!css.includes('grid-template-columns: 150px minmax(0, 1fr)') || !css.includes('scroll-margin-top') || !css.includes('overflow-x: auto')) fail('reserved desktop navigation or mobile anchor layout is incomplete');

const forbiddenUi = [
  'evo-filter', '<details', '<summary', '<time', 'evo-round-toggle', 'evo-status',
  'dialog', 'evo-lightbox', 'recommendedMarkup', 'data-evo-overview', '<button'
];
for (const token of forbiddenUi) {
  if (script.includes(token)) fail(`unnecessary mascot interaction remains: ${token}`);
}

if ('rounds' in mascot || !Array.isArray(mascot.characters) || mascot.characters.length !== 23) fail('the archive must contain exactly twenty-three role-based character sections');

const expected = new Map([
  ['dog', 18], ['canyon-fox', 8], ['quiet-lynx', 8], ['bear', 4],
  ['raccoon', 7], ['bison', 6], ['armadillo', 7], ['badger', 5],
  ['mule', 4], ['gecko', 4], ['raven', 4], ['kestrel-scout', 4],
  ['compass', 4], ['spark', 4], ['route-engineer', 4], ['parts-spirit', 7],
  ['socket', 6], ['fitment', 3], ['guard', 3],
  ['spring-flex', 4], ['toggle-latch', 4], ['strap-reel', 4], ['fin-light', 4]
]);

const codes = [];
const sources = [];
const families = [];
for (const character of mascot.characters) {
  if (!character.id || !character.index || !character.family || !character.type || !character.name_cn || !character.name_en || !character.blurb) fail('a character section is missing identity or copy');
  if (!Array.isArray(character.assets) || character.assets.length !== expected.get(character.family)) fail(`${character.family} has the wrong image count`);
  families.push(character.family);
  if (character.versions) {
    const grouped = character.versions.flatMap((version) => version.codes);
    if (grouped.length !== character.assets.length || new Set(grouped).size !== grouped.length
      || grouped.some((code) => !character.assets.some((asset) => asset.code === code))) fail(`${character.family} version grouping must retain every image exactly once`);
    if (character.versions.some((version) => !version.name || !version.description)) fail(`${character.family} version names or descriptions are missing`);
    if (character.versions.some((version) => version.sizePreview && !version.codes.includes(version.sizePreview.code))) fail(`${character.family} preview belongs to a different version`);
  }
  const previews = [character.sizePreview, ...(character.versions || []).map((version) => version.sizePreview)].filter(Boolean);
  for (const preview of previews) {
    if (!character.assets.some((asset) => asset.code === preview.code)) fail(`${character.family} preview refers to another character`);
    for (const size of [32, 64]) {
      const src = preview[`src${size}`];
      if (!src || path.basename(src) !== `${preview.code}-${size}.png`) fail('small preview version or size does not match its source code');
      const image = fs.readFileSync(path.join(root, src));
      if (image.toString('hex', 0, 8) !== '89504e470d0a1a0a' || image.readUInt32BE(16) !== size || image.readUInt32BE(20) !== size) fail(`${src} is not the declared PNG size`);
    }
  }
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

if (new Set(families).size !== 23) fail('each character family must appear in one section only');
if (codes.length !== 126 || new Set(codes).size !== 126 || new Set(sources).size !== 126) fail('126 unique independent images are required');
const mechanicalFamilies = new Set(['spring-flex', 'toggle-latch', 'strap-reel', 'fin-light', 'parts-spirit', 'socket', 'fitment', 'guard', 'compass', 'spark']);
if (mascot.characters.slice(0, 10).some((character) => !mechanicalFamilies.has(character.family) || character.type !== 'mechanical')
  || mascot.characters.slice(10).some((character) => mechanicalFamilies.has(character.family))) fail('mechanical and accessory families must precede animals and people');
if (mascot.characters.at(-1).family !== 'route-engineer') fail('the human character belongs at the end');
if (mascot.characters.some((character, index) => character.index !== String(index + 1).padStart(2, '0'))) fail('navigation numbering must follow the display order');

const historical = mascot.characters.flatMap((character) => character.assets).filter((asset) => /^round-[1-7]$/.test(asset.source_round));
if (historical.length !== 86 || new Set(historical.map((asset) => asset.src)).size !== 86) fail('all eighty-six historical images must remain exactly once');

for (let round = 8; round <= 17; round += 1) {
  const additions = mascot.characters.flatMap((character) => character.assets).filter((asset) => asset.source_round === `round-${round}`);
  if (additions.length !== 4) fail(`round-${round} must contain four new views of one character`);
}

const publicText = [JSON.stringify(mascot), html, script, css].join('\n');
if (/已淘汰|当前候选|候选|已选定|首选|备选|Rejected|Shortlisted|Selected/.test(publicText)) fail('selection labels must not appear');
if (/"date"\s*:|"goal"\s*:|独立画面|身份｜|结构｜|工作｜|动态｜/.test(JSON.stringify(mascot))) fail('dates or design-process copy must not appear in the role archive');
if (/\/Users\/|127\.0\.0\.1|localhost|API[_ -]?KEY|COOKIE|PASSWORD/i.test(publicText)) fail('local-only or sensitive text appears in the public mascot page');

console.log('Mascot role archive check passed: 23 single-character sections, 126 unique images, mechanical families first, historical images retained, no selection labels or process UI.');
