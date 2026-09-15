const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const nav = JSON.parse(read('data/content.json')).nav;

for (const [id, label] of Object.entries({
  'discord-community': 'Oedro-Discord', research: 'AI问卷',
  voice: 'OEDRO讨论全网捕捉', 'brand-voice-system': 'Oedro persona',
  'merch-plan': 'Oedro周边', 'first-outreach': '首批触达用户', 'discord-invite-plan': '邀请加入Discord活动方案',
  products: '产品知识库', 'mascot-workflow': '吉祥物设计的skill'
})) assert.equal(nav.find(item => item.id === id)?.label, label);
assert.equal(nav.at(-1).id, 'discord-community');
const emailIndex = nav.findIndex(item => item.id === 'email-templates');
assert.deepEqual(nav.slice(emailIndex + 1, emailIndex + 3).map(item => item.id), ['first-outreach', 'discord-invite-plan']);
for (const id of ['first-outreach', 'discord-invite-plan']) {
  assert.ok(read(`${id}.html`).includes(`data-page="${id}"`));
  assert.ok(read('app.js').includes(`'${id}'`), 'static pages retain their content during navigation loading');
}
assert.ok(nav.some(item => item.id === 'products' && item.file === 'products.html'));
assert.ok(!nav.some(item => ['research-library', 'sites-systems', 'playbook'].includes(item.id)));

const discord = JSON.parse(read('data/topics/discord-community.json'));
const discordContent = {};
const discordRenderer = read('app.js').match(/function renderDiscord\(topic, data\) \{[\s\S]*?\n\}/)[0];
const discordContext = {
  document: { querySelector: selector => selector === '#content' ? discordContent : {} },
  escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  pageHeading: title => `<h1>${title}</h1>`
};
vm.createContext(discordContext);
vm.runInContext(discordRenderer, discordContext);
discordContext.renderDiscord(discord, { site: { title: 'Hub' } });
assert.ok(!discordContent.innerHTML.includes('discord-configuration'), 'omit empty settings and unsupported bot claims');
assert.ok(!/已安装|未开启/.test(discordContent.innerHTML));
for (const server of discord.servers) {
  assert.ok(discordContent.innerHTML.includes(`id="${server.id}"`));
  for (const group of server.groups) for (const channel of group.channels) assert.ok(discordContent.innerHTML.includes(channel));
}
const configuredDiscord = structuredClone(discord);
configuredDiscord.servers[0].bots = [{ name: 'Example bot', purpose: 'Handle <help> requests' }];
configuredDiscord.servers[0].settings = [['Example setting', 'Enabled']];
discordContext.renderDiscord(configuredDiscord, { site: { title: 'Hub' } });
assert.equal((discordContent.innerHTML.match(/class="discord-configuration"/g) || []).length, 1);
assert.ok(discordContent.innerHTML.indexOf('discord-configuration') > discordContent.innerHTML.indexOf('garage-talk'));
assert.ok(discordContent.innerHTML.includes('Handle &lt;help&gt; requests'));
assert.ok(discordContent.innerHTML.includes('<dt>Example setting</dt><dd>Enabled</dd>'));

const persona = JSON.parse(read('data/topics/brand-voice-system.json'));
const topicVisibility = read('app.js').match(/function visibleTopicSections\(topic\) \{[\s\S]*?\n\}/)[0];
const topicContext = {};
vm.createContext(topicContext);
vm.runInContext(topicVisibility, topicContext);
const visiblePersona = topicContext.visibleTopicSections(persona);
for (const id of ['brand-name', 'everyday-example', 'discord-example', 'fitment-example', 'support-example', 'research-example', 'ugc-example']) {
  assert.ok(visiblePersona.some(section => section.id === id && section.paragraphs.length >= 2), `${id} reaches the page renderer`);
}
assert.ok(!visiblePersona.some(section => section.id === 'validation'), 'internal review state stays out of the reading page');

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
