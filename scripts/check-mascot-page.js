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
  if (kind === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3)
    };
  }
  return null;
}

const mascot = JSON.parse(read('data/mascot.json'));
const content = JSON.parse(read('data/content.json'));
const html = read('mascot.html');
const script = read('mascot.js');
const css = read('mascot.css');

if (!content.nav.some((item) => item.id === 'mascot' && item.file === 'mascot.html')) fail('Hub navigation does not include mascot.html');
if (!html.includes('data-page="mascot"') || !html.includes('mascot.css') || !html.includes('mascot.js')) fail('mascot.html is missing the page id or dedicated assets');
if (!script.includes('data/mascot.json') || !script.includes('evo-family-filter') || !css.includes('.evo-family-assets')) fail('history, filters or family layout code is incomplete');
if (script.includes('evo-status-filter') || script.includes('statusLabels') || script.includes('recommendedMarkup') || script.includes('data-evo-overview')) {
  fail('selection status, current recommendations or overview collages must not drive the page');
}
if (!Array.isArray(mascot.rounds) || mascot.rounds.map((round) => round.id).join(',') !== 'round-1,round-2,round-3,round-4,round-5') {
  fail('Round 1 through Round 5 are required in order');
}

const codes = [];
for (const round of mascot.rounds) {
  if (!round.date || !round.goal || !Array.isArray(round.assets) || !round.assets.length) fail(`${round.id} is missing history metadata or assets`);
  for (const asset of round.assets) {
    if (!asset.code || !asset.title || !asset.family || !asset.palette || !asset.style || !asset.alt || !asset.src) {
      fail(`${round.id} contains an incomplete asset record`);
    }
    const assetPath = path.join(root, asset.src);
    if (!fs.existsSync(assetPath) || fs.statSync(assetPath).size < 1000) fail(`${asset.code} asset is missing or empty`);
    const size = webpSize(assetPath);
    if (!size || size.width !== size.height || size.width < 1024) fail(`${asset.code} must remain a square WebP at least 1024px wide`);
    codes.push(asset.code);
  }
}

if (codes.length !== 65 || new Set(codes).size !== 65) fail('65 unique independent images are required');
if (mascot.rounds.find((round) => round.id === 'round-2')?.assets.length !== 9) fail('Round 2 must retain nine independent images');
if (mascot.rounds.find((round) => round.id === 'round-3')?.assets.length !== 21) fail('Round 3 must retain twenty-one independent images');

const round5 = mascot.rounds.find((round) => round.id === 'round-5');
const round5Families = [...new Set(round5.assets.map((asset) => asset.family))];
if (round5Families.length !== 5) fail('Round 5 must contain five distinct character families');
for (const family of round5Families) {
  const familyAssets = round5.assets.filter((asset) => asset.family === family);
  if (familyAssets.length !== 4 || new Set(familyAssets.map((asset) => asset.view)).size !== 4) {
    fail(`Round 5 family ${family} must contain four unique views or actions`);
  }
}

const visiblePageText = [html, script].join('\n');
if (/已淘汰|当前候选|候选|已选定|Rejected|Shortlisted|Selected/.test(visiblePageText)) {
  fail('the rendered page must leave selection decisions to Oliver');
}
const publicText = [JSON.stringify(mascot), html, script, css].join('\n');
if (/\/Users\/|127\.0\.0\.1|localhost|API[_ -]?KEY|COOKIE|PASSWORD/i.test(publicText)) {
  fail('local-only or sensitive text appears in the public mascot page');
}

console.log('Mascot archive check passed: 5 rounds, 65 independent images, no selection labels or overview collage dependency.');
