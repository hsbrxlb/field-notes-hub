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
if (!script.includes('data/mascot.json') || !script.includes('evo-family-assets') || !css.includes('.evo-family-assets')) fail('history or large family layout code is incomplete');

const forbiddenUi = [
  'evo-filter', '<details', '<summary', 'evo-round-toggle', 'evo-status',
  'dialog', 'evo-lightbox', 'recommendedMarkup', 'data-evo-overview'
];
for (const token of forbiddenUi) {
  if (script.includes(token) || html.includes(token)) fail(`unnecessary interaction remains: ${token}`);
}
if (script.includes('<button')) fail('the mascot archive content must not add buttons');

if (!Array.isArray(mascot.rounds) || mascot.rounds.map((round) => round.id).join(',') !== 'round-1,round-2,round-3,round-4,round-5,round-6,round-7') {
  fail('Round 1 through Round 7 are required in order');
}

const expectedCounts = new Map([
  ['round-1', 3], ['round-2', 9], ['round-3', 21], ['round-4', 12],
  ['round-5', 20], ['round-6', 1], ['round-7', 20]
]);
const codes = [];
for (const round of mascot.rounds) {
  if (!round.date || !round.goal || !Array.isArray(round.assets) || !round.assets.length) fail(`${round.id} is missing history metadata or assets`);
  if (round.assets.length !== expectedCounts.get(round.id)) fail(`${round.id} has the wrong image count`);
  for (const asset of round.assets) {
    if (!asset.code || !asset.title || !asset.family || !asset.palette || !asset.style || !asset.alt || !asset.src) fail(`${round.id} contains an incomplete asset record`);
    const assetPath = path.join(root, asset.src);
    if (!fs.existsSync(assetPath) || fs.statSync(assetPath).size < 1000) fail(`${asset.code} asset is missing or empty`);
    const size = webpSize(assetPath);
    if (!size || size.width !== size.height || size.width < 1024) fail(`${asset.code} must remain a square WebP at least 1024px wide`);
    codes.push(asset.code);
  }
}

if (codes.length !== 86 || new Set(codes).size !== 86) fail('86 unique independent images are required');

for (const roundId of ['round-5', 'round-7']) {
  const round = mascot.rounds.find((item) => item.id === roundId);
  const families = [...new Set(round.assets.map((asset) => asset.family))];
  if (families.length !== 5) fail(`${round.label} must contain five distinct character families`);
  for (const family of families) {
    const familyAssets = round.assets.filter((asset) => asset.family === family);
    if (familyAssets.length !== 4 || new Set(familyAssets.map((asset) => asset.view)).size !== 4) {
      fail(`${round.label} family ${family} must contain four unique views or actions`);
    }
  }
}

const visiblePageText = [html, script].join('\n');
if (/已淘汰|当前候选|候选|已选定|Rejected|Shortlisted|Selected/.test(visiblePageText)) fail('the rendered page must leave selection decisions to Oliver');
const publicText = [JSON.stringify(mascot), html, script, css].join('\n');
if (/\/Users\/|127\.0\.0\.1|localhost|API[_ -]?KEY|COOKIE|PASSWORD/i.test(publicText)) fail('local-only or sensitive text appears in the public mascot page');

console.log('Mascot archive check passed: 7 rounds, 86 large static images, no filters, status labels or collapsible sections.');
