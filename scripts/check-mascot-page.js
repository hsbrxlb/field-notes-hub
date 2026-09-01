const fs = require('fs');
const path = require('path');

const root = path.resolve(process.env.PUBLIC_SITE_ROOT || path.join(__dirname, '..'));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const fail = (message) => { throw new Error(`Mascot page check failed: ${message}`); };
const webpSize = (file) => {
  const buffer = fs.readFileSync(file);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = buffer.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  return null;
};

const mascot = JSON.parse(read('data/mascot.json'));
const content = JSON.parse(read('data/content.json'));
const html = read('mascot.html');
const script = read('mascot.js');
const css = read('mascot.css');

if (!content.nav.some((item) => item.id === 'mascot' && item.file === 'mascot.html')) fail('Hub navigation does not include mascot.html');
if (!html.includes('data-page="mascot"') || !html.includes('mascot.css') || !html.includes('mascot.js')) fail('mascot.html is missing the page id or dedicated assets');
if (!script.includes('data/mascot.json') || !script.includes('evo-family-filter') || !css.includes('.evo-round-assets')) fail('history, filters or layout code is incomplete');
if (!Array.isArray(mascot.rounds) || mascot.rounds.map((round) => round.id).join(',') !== 'round-1,round-2,round-3,round-4') fail('Round 1 through Round 4 are required in order');

const allowedStatuses = new Set(['Exploring', 'Rejected', 'Shortlisted', 'Selected']);
const codes = [];
for (const round of mascot.rounds) {
  if (!round.date || !round.goal || !round.score || !round.change_reason || !allowedStatuses.has(round.status)) fail(`${round.id} is missing history metadata`);
  if (!Array.isArray(round.palette) || !round.palette.length || !Array.isArray(round.issues) || !round.issues.length) fail(`${round.id} is missing palette or issue history`);
  const overview = path.join(root, round.overview || '');
  if (!fs.existsSync(overview) || fs.statSync(overview).size < 1000) fail(`${round.id} overview is missing`);
  if (!Array.isArray(round.assets) || !round.assets.length) fail(`${round.id} has no independent images`);
  for (const asset of round.assets) {
    if (!asset.code || !asset.title || !asset.family || !asset.palette || !asset.style || !asset.alt || !allowedStatuses.has(asset.status)) fail(`${round.id} contains an incomplete asset record`);
    const assetPath = path.join(root, asset.src || '');
    if (!fs.existsSync(assetPath) || fs.statSync(assetPath).size < 1000) fail(`${asset.code} asset is missing or empty`);
    const size = webpSize(assetPath);
    if (!size || size.width !== 1254 || size.height !== 1254) fail(`${asset.code} must remain a 1254x1254 WebP`);
    codes.push(asset.code);
  }
}

if (codes.length !== 45 || new Set(codes).size !== 45) fail('45 unique historical images are required');
if (!Array.isArray(mascot.leader?.recommended) || mascot.leader.recommended.length !== 3) fail('leader view needs exactly three recommended candidates');
for (const code of mascot.leader.recommended) {
  const asset = mascot.rounds.flatMap((round) => round.assets).find((item) => item.code === code);
  if (!asset || asset.status !== 'Shortlisted') fail(`${code} is not a valid shortlisted recommendation`);
}
if (mascot.rounds.flatMap((round) => round.assets).some((asset) => asset.status === 'Selected')) fail('no concept may be marked Selected before a real decision');
const statusCounts = mascot.rounds.flatMap((round) => round.assets).reduce((counts, asset) => {
  counts[asset.status] = (counts[asset.status] || 0) + 1;
  return counts;
}, {});
if (statusCounts.Rejected !== 33 || statusCounts.Exploring !== 9 || statusCounts.Shortlisted !== 3 || (statusCounts.Selected || 0) !== 0) {
  fail('status distribution must remain 33 Rejected, 9 Exploring, 3 Shortlisted and 0 Selected');
}
if (mascot.rounds.slice(0, 3).some((round) => round.status !== 'Rejected' || round.assets.some((asset) => asset.status !== 'Rejected'))) {
  fail('Round 1 through Round 3 must remain rejected in the current view');
}

const publicText = [JSON.stringify(mascot), html, script, css].join('\n');
if (/\/Users\/|127\.0\.0\.1|localhost|API[_ -]?KEY|COOKIE|PASSWORD/i.test(publicText)) fail('local-only or sensitive text appears in the public mascot page');

console.log('Mascot evolution check passed: 4 rounds, 45 images, 3 shortlisted recommendations, no false selection.');
