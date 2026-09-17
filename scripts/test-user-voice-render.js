const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const app = read('app.js');
const content = {};
const context = {
  URL,
  document: { querySelector: selector => selector === '#content' ? content : {} },
  pageHeading: title => `<h1>${title}</h1>`
};
vm.createContext(context);
vm.runInContext(app.slice(app.indexOf('function escapeHtml('), app.indexOf('function setSidebar(')), context);
vm.runInContext(app.slice(app.indexOf('function voiceThreadContext('), app.indexOf('function renderTopics(')), context);
const radar = JSON.parse(read('data/demand-radar.json'));
const original = JSON.stringify(radar);
const data = JSON.parse(read('data/content.json'));
const voice = JSON.parse(read('data/user-voice.json'));
context.renderUserVoice(data, voice, radar);
assert.equal((content.innerHTML.match(/class="voice-thread"/g) || []).length, radar.items.length);
for (const item of radar.items) assert.ok(content.innerHTML.includes(item.source_link));
assert.ok(content.innerHTML.includes('硬质货箱盖值得买吗？'));
assert.ok(content.innerHTML.includes('r/f150'));
assert.ok(!/数据可能过期|需要事实|核对产品事实|最近检查|radar-health|反馈怎么处理|继续做用户调研|已确认的洞察与行动/.test(content.innerHTML));
assert.equal(JSON.stringify(radar), original, 'display changes preserve source and safety data');
context.renderUserVoice(data, { actions: [
  { status: 'draft', public_topic: 'floor_mats', action_type: 'faq' },
  { status: 'approved', public_topic: 'running_boards', action_type: 'faq', source_count: 2, independent_voice_count: 2 }
] }, { items: [] });
assert.ok(content.innerHTML.includes('暂无公开问题记录'));
assert.ok(content.innerHTML.includes('脚踏板 · 常见问题'));
assert.ok(!content.innerHTML.includes('脚垫 · 常见问题'), 'unapproved insights stay hidden');
const fallback = context.voiceThreadContext({ source_link: 'https://www.reddit.com/r/trucks/comments/abc/new_topic', topic: 'complaint' });
assert.equal(fallback.heading, '产品讨论', 'unknown threads do not acquire invented complaints');
console.log('User voice rendering tests passed');
