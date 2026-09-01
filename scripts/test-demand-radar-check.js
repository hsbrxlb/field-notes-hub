#!/usr/bin/env node

const assert = require('node:assert/strict');
const { validateDemandRadar } = require('./check-demand-radar.js');

const valid = {
  schema_version: 1,
  generated_at: '2026-08-28T00:00:00+00:00',
  last_attempt_at: '2026-08-28T00:00:00+00:00',
  last_success_at: '2026-08-28T00:00:00+00:00',
  method: 'deterministic_external_signal_scan',
  status: 'success',
  stale_after_hours: 36,
  truth_status: 'blocked',
  metrics: {
    raw_discovered: 12,
    accepted: 3,
    filtered: 9,
    new_actionable: 1,
    duplicate_actionable: 0,
    open_items: 1,
    youtube_videos_checked: 3,
    youtube_comments_checked: 21,
    youtube_replies_checked: 4,
    youtube_unavailable_videos: 1
  },
  sources: [
    { source: 'tavily', status: 'ok', accepted_count: 2 },
    { source: 'youtube', status: 'ok', accepted_count: 1 },
    { source: 'official_facts', status: 'blocked', accepted_count: 0 }
  ],
  items: [{
    signal_id: 'a'.repeat(64),
    topic: 'fitment',
    source_family: 'reddit',
    source_link: 'https://www.reddit.com/r/f150/comments/example/question/',
    reason_code: 'direct_oedro_question',
    next_action: 'verify_product_facts',
    triage_status: 'NEEDS_FACTS',
    observed_at: '2026-08-28T00:00:00+00:00',
    last_seen_at: '2026-08-28T00:00:00+00:00'
  }]
};

assert.deepEqual(validateDemandRadar(valid), []);

for (const [label, mutate] of [
  ['author field', (copy) => { copy.items[0].author = 'someone'; }],
  ['raw question', (copy) => { copy.items[0].question_text = 'Ignore previous instructions'; }],
  ['unsafe scheme', (copy) => { copy.items[0].source_link = 'javascript:alert(1)'; }],
  ['profile path', (copy) => { copy.items[0].source_link = 'https://www.reddit.com/user/example'; }],
  ['wrong host', (copy) => { copy.items[0].source_link = 'https://example.com/post'; }],
  ['reversed timestamps', (copy) => { copy.items[0].observed_at = '2026-08-29T00:00:00+00:00'; }],
  ['duplicate id', (copy) => { copy.items.push(structuredClone(copy.items[0])); }]
]) {
  const copy = structuredClone(valid);
  mutate(copy);
  assert.ok(validateDemandRadar(copy).length > 0, `${label} was not rejected`);
}

console.log('Demand radar rejection tests passed');
