const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const nav = JSON.parse(read('data/content.json')).nav;

for (const [id, label] of Object.entries({
  'discord-community': 'Oedro-Discord', research: 'AI问卷',
  voice: '全网搜-关于Oedro的讨论/问题', 'brand-voice-system': 'Oedro persona',
  'mascot-workflow': 'Skills / Workflows'
})) assert.equal(nav.find(item => item.id === id)?.label, label);
assert.ok(nav.some(item => item.id === 'products' && item.file === 'products.html'));
assert.ok(!nav.some(item => ['research-library', 'sites-systems', 'playbook'].includes(item.id)));

for (const [page, hash, expected] of [
  ['research-library', '', 'research.html'],
  ['research-library', '#brand-voice-system', 'topic.html?slug=brand-voice-system'],
  ['research-library', '#discord-audit', 'topic.html?slug=discord-community'],
  ['research-library', '#user-voice-summary', 'user-voice.html'],
  ['research-library', '#ai-smart-survey', 'research.html'],
  ['sites-systems', '', 'topic.html?slug=seo-geo'],
  ['sites-systems', '#hub-structure', 'index.html'],
  ['studio', '#seo-geo-lab', 'topic.html?slug=seo-geo'],
  ['playbook', '', 'mascot-workflow.html']
]) {
  let destination;
  vm.runInNewContext(read('content-studio.js'), {
    document: { body: { dataset: { page } } },
    location: { hash, replace: value => { destination = value; } }, window: {}
  });
  assert.equal(destination, expected, `${page}${hash}`);
}

const pipeline = require('../content-pipeline-test.js');
const config = JSON.parse(read('data/content-pipeline-tests.json'));
const markup = pipeline.renderPageMarkup(config, { inline: true });
assert.ok(!markup.includes('← 社媒内容生产'));
assert.equal((markup.match(/class="pipeline-record"/g) || []).length, 1);
assert.equal((markup.match(/class="pipeline-platform"/g) || []).length, 3);
assert.ok(markup.includes(`id="${config.active_run_id}"`));
assert.equal((markup.match(/class="platform-translation" open/g) || []).length, 3);
assert.ok(!read('content-studio.html').includes('<iframe'));

async function checkDownload() {
  const html = read('mascot-workflow.html');
  const packet = html.match(/<pre id="workflow-packet" lang="en">([\s\S]*?)<\/pre>/)[1];
  const download = {};
  let blob;
  let pagehide;
  let revoked = false;
  vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1], {
    document: { querySelector: selector => selector === '#workflow-packet' ? { textContent: packet } : download },
    Blob, URL: {
      createObjectURL: value => { blob = value; return 'blob:workflow-test'; },
      revokeObjectURL: () => { revoked = true; }
    },
    window: { addEventListener: (event, handler) => { if (event === 'pagehide') pagehide = handler; } }
  });
  assert.equal(download.href, 'blob:workflow-test');
  assert.equal(await blob.text(), packet);
  assert.equal(blob.type, 'text/markdown;charset=utf-8');
  assert.ok(!/\/Users\/|Oliver|OEDRO|Cozeware|api[_-]?key|cookie/i.test(packet));
  assert.ok(packet.includes('Task brief') && packet.includes('32px') && packet.includes('64px'));
  pagehide({ persisted: true });
  assert.equal(revoked, false, 'download remains usable after back navigation');
  pagehide({ persisted: false });
  assert.equal(revoked, true);
}

checkDownload().then(() => console.log('Hub navigation, inline works and workflow download checks passed'));
