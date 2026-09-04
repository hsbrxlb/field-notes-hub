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

if ('rounds' in mascot || !Array.isArray(mascot.characters) || mascot.characters.length !== 19) fail('the archive must contain exactly nineteen role-based character sections');

const expected = new Map([
  ['dog', 18], ['canyon-fox', 8], ['quiet-lynx', 8], ['bear', 4],
  ['raccoon', 7], ['bison', 6], ['armadillo', 7], ['badger', 5],
  ['mule', 4], ['gecko', 4], ['raven', 4], ['kestrel-scout', 4],
  ['compass', 4], ['spark', 4], ['route-engineer', 4], ['parts-spirit', 7],
  ['socket', 6], ['fitment', 3], ['guard', 3]
]);

const codes = [];
const sources = [];
const families = [];
for (const character of mascot.characters) {
  if (!character.id || !character.index || !character.family || !character.type || !character.name_cn || !character.name_en || !character.blurb) fail('a character section is missing identity or copy');
  if (!Array.isArray(character.assets) || character.assets.length !== expected.get(character.family)) fail(`${character.family} has the wrong image count`);
  families.push(character.family);
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

if (new Set(families).size !== 19) fail('each character family must appear in one section only');
if (codes.length !== 110 || new Set(codes).size !== 110 || new Set(sources).size !== 110) fail('110 unique independent images are required');

const historical = mascot.characters.flatMap((character) => character.assets).filter((asset) => /^round-[1-7]$/.test(asset.source_round));
if (historical.length !== 86 || new Set(historical.map((asset) => asset.src)).size !== 86) fail('all eighty-six historical images must remain exactly once');

for (let round = 8; round <= 13; round += 1) {
  const additions = mascot.characters.flatMap((character) => character.assets).filter((asset) => asset.source_round === `round-${round}`);
  if (additions.length !== 4) fail(`round-${round} must contain four new views of one character`);
}

const publicText = [JSON.stringify(mascot), html, script, css].join('\n');
if (/已淘汰|当前候选|候选|已选定|Rejected|Shortlisted|Selected/.test(publicText)) fail('selection labels must not appear');
if (/"date"\s*:|"goal"\s*:|独立画面|身份｜|结构｜|工作｜|动态｜/.test(JSON.stringify(mascot))) fail('dates or design-process copy must not appear in the role archive');
if (/\/Users\/|127\.0\.0\.1|localhost|API[_ -]?KEY|COOKIE|PASSWORD/i.test(publicText)) fail('local-only or sensitive text appears in the public mascot page');

console.log('Mascot role archive check passed: 19 single-character sections, 110 unique images, 86 historical images retained, 24 new images, no dates or process UI.');
