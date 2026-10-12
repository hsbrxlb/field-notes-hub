#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { validateDemandRadar, validateMentions, safeMentionLink, awareNanoseconds, orderMentionIntervals } = require('./check-demand-radar');
const root = path.resolve(__dirname, '..');
const legacy = JSON.parse(fs.readFileSync(path.join(root, 'data/demand-radar.json'), 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const publication = (published_at) => ({ date: published_at.slice(0, 10), published_at, precision: 'datetime', source_timezone: null });
const mention = (id, published_at = '2026-10-11T09:00:00Z') => ({
  platform: 'Reddit', object_id: `t3_${id}`, source_link: `https://www.reddit.com/r/trucks/comments/${id}/oedro/`,
  summary: `OEDRO安装讨论 ${id}`, publication: publication(published_at)
});
const current = mention('newpost');
const fixture = () => ({ schema_version: 1, batch: {
  id: '20261012-72h', window_start: '2026-10-09T01:30:00Z', window_end: '2026-10-12T01:30:00Z', items: [clone(current)]
}, history: [clone(current), mention('oldpost', '2026-09-01T06:00:00Z')] });
const radar = (mentions) => ({ ...clone(legacy), method: 'verified_mention_72h_cloud_batch', stale_after_hours: 96, mentions });
let checks = 0;
function check(label, run) { run(); checks += 1; console.log(`PASS ${label}`); }
function invalid(change, expected) {
  const candidate = fixture();
  change(candidate);
  assert(validateMentions(candidate).some((issue) => issue.includes(expected)));
}

check('legacy snapshot and optional extension stay compatible', () => {
  assert.equal(legacy.items.length, 9);
  assert.deepEqual(validateDemandRadar(legacy), []);
  assert.deepEqual(validateDemandRadar(radar(fixture())), []);
  const candidate = radar(fixture()); candidate.stale_after_hours = 36;
  assert(validateDemandRadar(candidate).some((issue) => issue.includes('96-hour')));
  for (const method of ['verified_mention_history_migration', 'verified_mention_72h_cloud_batch']) {
    const cloud = radar(fixture()); cloud.method = method;
    assert.deepEqual(validateDemandRadar(cloud), []);
    delete cloud.mentions;
    assert(validateDemandRadar(cloud).some((issue) => issue.includes('metadata')));
  }
});
check('unknown fields cannot publish private records', () => {
  for (const field of ['author', 'full_text', 'email', 'internal_notes', 'observed_at']) {
    invalid((candidate) => { candidate.batch.items[0][field] = 'private'; }, 'fields');
  }
  invalid((candidate) => { candidate.history[0].publication.observed_at = '2026-10-11'; }, 'precision');
  invalid((candidate) => { candidate.internal = {}; }, 'fields');
});
check('public summaries have a real bound and reject private material', () => {
  for (const summary of ['', ' ', '中'.repeat(301), ['sample', 'example.invalid'].join('@'), ['', 'Users', 'example', 'private'].join('/'), '<script>', 'api_key=private']) {
    invalid((candidate) => { candidate.batch.items[0].summary = summary; }, 'summary');
  }
  const candidate = fixture(); candidate.batch.items[0].summary = '中'.repeat(300);
  candidate.history[0] = clone(candidate.batch.items[0]);
  assert.deepEqual(validateMentions(candidate), []);
});
check('source links target public objects and exclude secrets or profiles', () => {
  const links = [
    ['Reddit', 'https://reddit.com/r/trucks/comments/abc123/oedro/'],
    ['汽车论坛', 'https://www.tacomaworld.com/threads/oedro.12345/'],
    ['汽车论坛', 'https://www.f150forum.com/f118/oedro-587129/'],
    ['YouTube', 'https://www.youtube.com/watch?v=abcdefghijk&lc=Ugx123'],
    ['YouTube', 'https://www.youtube.com/shorts/abcdefghijk'],
    ['Bluesky', 'https://bsky.app/profile/driver.test/post/3abc123'],
    ['X', 'https://x.com/driver/status/123456789'],
    ['Trustpilot', 'https://www.trustpilot.com/reviews/abc123def456']
  ];
  for (const [platform, link] of links) assert(safeMentionLink(link, platform), link);
  for (const [platform, link] of [
    ['Reddit', 'https://reddit.com/user/driver'], ['X', 'https://x.com/driver'],
    ['Bluesky', 'https://bsky.app/profile/driver.test'], ['YouTube', 'https://youtube.com/@driver'],
    ['汽车论坛', 'https://tacomaworld.com.evil.test/threads/oedro/'],
    ['Reddit', 'https://reddit.com/r/trucks/comments/abc123/oedro/?token=private'],
    ['YouTube', 'https://youtube.com/watch?v=abcdefghijk&access_token=private'],
    ['Reddit', 'https://private@reddit.com/r/trucks/comments/abc123/oedro/'],
    ['Trustpilot', 'https://www.trustpilot.com/review/oedro.com'],
    ['Reddit', 'http://reddit.com/r/trucks/comments/abc123/oedro/']
  ]) assert.equal(safeMentionLink(link, platform), false, link);
});
check('datetime boundaries use original aware instants', () => {
  for (const instant of ['2026-10-09T01:30:00Z', '2026-10-12T15:29:59+14:00']) {
    const candidate = fixture(); candidate.batch.items[0].publication = publication(instant);
    candidate.history[0] = clone(candidate.batch.items[0]);
    assert.deepEqual(validateMentions(candidate), []);
  }
  for (const instant of ['2026-10-12T01:30:00Z', '2026-10-09T01:29:59Z']) {
    invalid((candidate) => { candidate.batch.items[0].publication = publication(instant); }, 'inside');
  }
  for (const instant of ['2026-10-11T09:00:00', '2026-02-30T09:00:00Z', '2026-10-11T09:00:00+14:30']) {
    invalid((candidate) => { candidate.batch.items[0].publication = publication(instant); }, 'precision');
  }
});
check('fractional timestamps retain 1-9 digits and classify exact nanosecond boundaries', () => {
  assert.equal(awareNanoseconds('2026-10-11T09:00:00.123456789Z') - awareNanoseconds('2026-10-11T09:00:00.123456788Z'), 1n);
  assert.equal(awareNanoseconds('2026-10-11T17:00:00.123456789+08:00'), awareNanoseconds('2026-10-11T09:00:00.123456789Z'));
  for (const instant of ['2026-10-09T01:30:00.000000001Z', '2026-10-12T01:29:59.999999999Z', '2026-10-11T09:00:00.985000+00:00']) {
    const candidate = fixture(); candidate.batch.items[0].publication = publication(instant);
    candidate.history[0] = clone(candidate.batch.items[0]);
    assert.deepEqual(validateMentions(candidate), []);
    assert.equal(candidate.batch.items[0].publication.published_at, instant);
  }
  for (const instant of ['2026-10-09T01:29:59.999999999Z', '2026-10-12T01:30:00.000000001Z']) {
    invalid((candidate) => { candidate.batch.items[0].publication = publication(instant); }, 'inside');
  }
  invalid((candidate) => { candidate.batch.window_end = '2026-10-12T01:30:00.000000001Z'; }, '72-hour');
  const fractionalWindow = fixture();
  fractionalWindow.batch.window_start = '2026-10-09T01:30:00.123456789Z';
  fractionalWindow.batch.window_end = '2026-10-12T01:30:00.123456789Z';
  fractionalWindow.batch.items[0].publication = publication('2026-10-09T01:30:00.123456789Z');
  fractionalWindow.history = clone(fractionalWindow.batch.items);
  assert.deepEqual(validateMentions(fractionalWindow), []);
  fractionalWindow.batch.items[0].publication = publication('2026-10-09T01:30:00.123456788Z');
  assert(validateMentions(fractionalWindow).some((issue) => issue.includes('inside')));
});
check('platform IDs bind posts, specific comments, actor scopes and forum hosts', () => {
  const valid = [
    ['Reddit', 'https://reddit.com/r/trucks/comments/abc123/oedro/', 't3_abc123'],
    ['Reddit', 'https://reddit.com/r/trucks/comments/abc123/comment/def456/', 't1_def456'],
    ['YouTube', 'https://youtube.com/watch?v=abcdefghijk&lc=Ugx123', 'abcdefghijk:Ugx123'],
    ['YouTube', 'https://youtu.be/abcdefghijk', 'abcdefghijk'],
    ['Bluesky', 'https://bsky.app/profile/did:plc:abc123/post/3abc123', 'did:plc:abc123/3abc123'],
    ['Bluesky', 'https://bsky.app/profile/driver.test/post/3abc123', 'driver.test/3abc123'],
    ['汽车论坛', 'https://www.tacomaworld.com/threads/oedro.12345/', 'tacomaworld.com:12345'],
    ['汽车论坛', 'https://www.f150forum.com/f118/oedro-587129/', 'f150forum.com:587129'],
    ['X', 'https://x.com/driver/status/123456789', '123456789'],
    ['Trustpilot', 'https://trustpilot.com/reviews/6988abacd3525cdd90dd0f7a', '6988abacd3525cdd90dd0f7a']
  ];
  for (const [platform, link, id] of valid) {
    assert(safeMentionLink(link, platform, id), `${platform}:${id}`);
    assert.equal(safeMentionLink(link, platform, `${id}wrong`), false);
  }
  assert.equal(safeMentionLink(valid[1][1], 'Reddit', 't3_abc123'), false);
  assert.equal(safeMentionLink(valid[0][1], 'Reddit', 't1_def456'), false);
  assert.equal(safeMentionLink(valid[2][1], 'YouTube', 'abcdefghijk'), false);
  assert.equal(safeMentionLink(valid[3][1], 'YouTube', 'abcdefghijk:Ugx123'), false);
  assert.equal(safeMentionLink(valid[5][1], 'Bluesky', 'other.test/3abc123'), false);
  assert.equal(safeMentionLink(valid[6][1], '汽车论坛', 'f150forum.com:12345'), false);
});
check('date-only uncertainty is wholly enclosed without inventing time', () => {
  const day = { date: '2026-10-10', published_at: null, precision: 'date', source_timezone: null };
  for (const zone of [null, 'America/Los_Angeles', '-07:00', 'UTC+08:00']) {
    const candidate = fixture(); candidate.batch.items[0].publication = { ...day, source_timezone: zone };
    candidate.history[0] = clone(candidate.batch.items[0]);
    assert.deepEqual(validateMentions(candidate), []);
    assert.equal(candidate.batch.items[0].publication.published_at, null);
  }
  invalid((candidate) => { candidate.batch.items[0].publication = { ...day, date: '2026-10-11' }; }, 'inside');
  invalid((candidate) => { candidate.batch.items[0].publication = { ...day, date: '2026-02-30' }; }, 'precision');
  invalid((candidate) => { candidate.batch.items[0].publication = { ...day, published_at: '2026-10-10T00:00:00Z' }; }, 'precision');
});
check('unknown dates remain historical and cannot use observation time', () => {
  const unknown = mention('unknown'); unknown.publication = { date: null, published_at: null, precision: 'unknown', source_timezone: null };
  const candidate = fixture(); candidate.history.push(unknown);
  assert.deepEqual(validateMentions(candidate), []);
  invalid((value) => { value.batch.items[0] = unknown; }, 'inside');
  invalid((value) => { value.history[0].publication.date = '2026-10-12'; }, 'precision');
});
check('batch windows must be exactly 72 hours', () => {
  invalid((candidate) => { candidate.batch.window_end = '2026-10-12T02:30:00Z'; }, '72-hour');
  invalid((candidate) => { candidate.batch.window_start = '2026-10-09'; }, '72-hour');
});
check('history retains old records and refuses overflow rather than pruning', () => {
  const candidate = fixture(); candidate.history.push(mention('ancient', '2020-01-01T00:00:00Z'));
  assert.deepEqual(validateMentions(candidate), []);
  invalid((value) => { value.history = Array(10001).fill(current); }, 'overflow');
});
check('deduplication permits matching current/history and rejects conflicts', () => {
  assert.deepEqual(validateMentions(fixture()), []);
  invalid((candidate) => { candidate.batch.items.push(clone(current)); }, 'repeats');
  invalid((candidate) => { candidate.history.push(clone(current)); }, 'repeats');
  invalid((candidate) => { candidate.history[0].summary = 'Different overview'; }, 'conflicts');
});

const source = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const renderSource = source.slice(source.indexOf('function voiceThreadContext('), source.indexOf('\nfunction renderTopics('));
function render(mentions, method) {
  const content = { innerHTML: '' };
  const context = {
    URL, Date, document: { title: '', querySelector: (selector) => selector === '#content' ? content : {} },
    escapeHtml: (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])),
    pageHeading: (title) => `<h1>${title}</h1>`
  };
  vm.createContext(context); vm.runInContext(renderSource, context);
  context.renderUserVoice({ site: { title: 'Hub' } }, { actions: [
    { status: 'approved', public_topic: 'installation', action_type: 'faq', source_count: 2, independent_voice_count: 2 }
  ] }, mentions === undefined ? legacy : { ...radar(mentions), ...(method ? { method } : {}) });
  return content.innerHTML;
}
check('rendered sections sort publication, remove cross-batch duplicates, and preserve legacy insights', () => {
  const candidate = fixture();
  candidate.batch.items = [mention('earlier', '2026-10-11T10:00:00+08:00'), mention('later', '2026-10-11T03:00:00Z')];
  const unknown = mention('unknown'); unknown.publication = { date: null, published_at: null, precision: 'unknown', source_timezone: null };
  candidate.history = [unknown, ...clone(candidate.batch.items), mention('oldpost', '2026-09-01T06:00:00Z'),
    { ...mention('dateonly'), publication: { date: '2026-10-08', published_at: null, precision: 'date', source_timezone: null } }];
  assert.deepEqual(validateMentions(candidate), []);
  const html = render(candidate);
  assert(html.includes('id="recent-mentions-heading"')); assert(html.includes('id="history-mentions-heading"'));
  assert(html.indexOf('安装讨论 later') < html.indexOf('安装讨论 earlier'));
  assert.equal((html.match(/安装讨论 later/g) || []).length, 1);
  assert(html.indexOf('安装讨论 dateonly') < html.indexOf('安装讨论 oldpost'));
  assert(html.indexOf('安装讨论 oldpost') < html.indexOf('安装讨论 unknown'));
  assert(html.includes('<time datetime="2026-10-08">2026-10-08</time>')); assert(html.includes('日期不明'));
  assert(html.indexOf('历史提及') < html.indexOf('待核实的历史线索'));
  assert(html.includes('已确认的洞察与行动')); assert(html.includes('常见问题'));
  assert.equal((html.match(/voice-thread(?: voice-mention)?" data-searchable/g) || []).length, legacy.items.length + 5);
});
check('render empty state is exact and malformed current dates stay outside current section', () => {
  const html = render();
  assert(html.includes('三天批次尚待首次定时采集。'));
  const migration = fixture(); migration.batch.items = [];
  assert(render(migration, 'verified_mention_history_migration').includes('三天批次尚待首次定时采集。'));
  assert(!render(migration, 'verified_mention_history_migration').includes('最近3天暂无日期和原文均已核实的OEDRO提及。'));
  assert(render(migration, 'verified_mention_72h_cloud_batch').includes('最近3天暂无日期和原文均已核实的OEDRO提及。'));
  const candidate = fixture(); candidate.batch.items[0].publication.published_at = '2026-10-11T09:00:00';
  assert(render(candidate).includes('最近3天暂无日期和原文均已核实的OEDRO提及。'));
  candidate.batch.items = [mention('outside', '2026-09-01T09:00:00Z')];
  assert(render(candidate).includes('最近3天暂无日期和原文均已核实的OEDRO提及。'));
  candidate.batch.items = [mention('microinside', '2026-10-12T01:29:59.999999999Z')];
  assert(!render(candidate).includes('最近3天暂无日期和原文均已核实的OEDRO提及。'));
  candidate.batch.items = [mention('microoutside', '2026-10-12T01:30:00.000000001Z')];
  assert(render(candidate).includes('最近3天暂无日期和原文均已核实的OEDRO提及。'));
});
check('render date-only text survives timezone changes and HTML is escaped', () => {
  const candidate = fixture(); candidate.batch.items[0].publication = { date: '2026-10-10', published_at: null, precision: 'date', source_timezone: null };
  candidate.batch.items[0].summary = 'OEDRO <example> & installation'; candidate.history = [];
  const html = render(candidate);
  assert(html.includes('<time datetime="2026-10-10">2026-10-10</time>')); assert(html.includes('&lt;example&gt; &amp;'));
  assert(!html.includes('<example>'));
});
check('overlapping intervals preserve uncertainty but never invert definite chronology', () => {
  const older = mention('older', '2026-10-08T03:00:00.123456789Z');
  const first = mention('first', '2026-10-10T08:00:00.123456789Z');
  const day = { ...mention('day'), publication: { date: '2026-10-10', published_at: null, precision: 'date', source_timezone: null } };
  const earlier = mention('earlier', '2026-10-10T02:00:00.123456789Z');
  const bridge = { ...mention('bridge'), publication: { date: '2026-10-11', published_at: null, precision: 'date', source_timezone: null } };
  const nextday = mention('nextday', '2026-10-11T15:00:00.123456789Z');
  const newest = mention('newest', '2026-10-13T03:00:00.123456789Z');
  const unknown = { ...mention('undated'), publication: { date: null, published_at: null, precision: 'unknown', source_timezone: null } };
  const items = [older, unknown, first, day, earlier, bridge, nextday, newest];
  const expected = [newest, bridge, nextday, first, day, earlier, older, unknown];
  assert.deepEqual(orderMentionIntervals(items), expected);
  const candidate = fixture(); candidate.batch.items = []; candidate.history = items;
  const html = render(candidate);
  for (let index = 1; index < expected.length; index += 1) {
    assert(html.indexOf(expected[index - 1].summary) < html.indexOf(expected[index].summary));
  }
  const fine = [mention('fine1', '2026-10-11T03:00:00.000000001Z'), mention('fine2', '2026-10-11T03:00:00.000000002Z')];
  assert.deepEqual(orderMentionIntervals(fine), [fine[1], fine[0]]);
  const bridged = orderMentionIntervals([earlier, day, first]);
  assert(bridged.indexOf(first) < bridged.indexOf(earlier));
  assert.deepEqual(orderMentionIntervals([fine[0], fine[0]]), [fine[0], fine[0]]);
  const current = fixture(); current.batch.items = fine; current.history = clone(fine);
  assert(render(current).indexOf(fine[1].summary) < render(current).indexOf(fine[0].summary));
});
if (process.env.VERIFIED_PUBLIC_HISTORY) {
  check('actual independently verified eight-record history is accepted and rendered', () => {
    const history = JSON.parse(fs.readFileSync(process.env.VERIFIED_PUBLIC_HISTORY, 'utf8'));
    assert.equal(history.length, 8);
    const candidate = fixture(); candidate.batch.items = []; candidate.history = history;
    assert.deepEqual(validateDemandRadar(radar(candidate)), []);
    const html = render(candidate);
    assert.equal((html.match(/voice-thread(?: voice-mention)?" data-searchable/g) || []).length, legacy.items.length + history.length - 2);
    for (const record of history) {
      assert(html.includes(record.summary));
      assert(html.includes(record.publication.published_at || record.publication.date));
    }
  });
}
check('legacy own posts are deduplicated without merging distinct comments or deleting stored history', () => {
  const ownPost = { ...mention('1scctq2', '2026-04-04T15:55:37.288000Z'),
    source_link: 'https://www.reddit.com/r/chevycolorado/comments/1scctq2/oedro_running_boards/' };
  const ownComment = { ...mention('ofbf3yp', '2026-04-10T03:35:43.985000Z'), object_id: 't1_ofbf3yp',
    source_link: 'https://www.reddit.com/r/chevycolorado/comments/1sh85cx/comment/ofbf3yp/' };
  const candidate = fixture(); candidate.batch.items = []; candidate.history = [ownPost, ownComment];
  const html = render(candidate);
  assert.equal((html.match(/voice-thread(?: voice-mention)?" data-searchable/g) || []).length, legacy.items.length + 1);
  assert.equal(legacy.items.length, 9);
  assert(html.includes('comments/1sh85cx/please_help_me_pick_some_side_railsstepsrunning'));
  assert(html.includes('comments/1sh85cx/comment/ofbf3yp/'));
});
console.log(`Mention batch checks passed (${checks} behavior groups; legacy=${legacy.items.length})`);
