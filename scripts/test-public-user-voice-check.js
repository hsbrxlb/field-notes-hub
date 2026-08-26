#!/usr/bin/env node

const assert = require('node:assert/strict');
const { validateVoicePayload } = require('./check-public-user-voice.js');

const valid = {
  schema_version: 1,
  generated_at: '2026-08-26T00:00:00+00:00',
  method: 'human_reviewed_user_voice',
  actions: [{
    action_type: 'faq',
    public_topic: 'fitment',
    status: 'approved',
    evidence_strength: 'repeated_multi_source',
    source_count: 2,
    independent_voice_count: 3
  }]
};

assert.deepEqual(validateVoicePayload(valid), []);

const withAuthor = structuredClone(valid);
withAuthor.actions[0].author_handle = 'private-user';
assert.ok(validateVoicePayload(withAuthor).some((error) => error.includes('approved schema')));

const withReply = structuredClone(valid);
withReply.actions[0].reply_url = 'https://example.com/reply';
assert.ok(validateVoicePayload(withReply).some((error) => error.includes('approved schema')));

const withUrlValue = structuredClone(valid);
withUrlValue.actions[0].title = 'Read https://example.com/private';
assert.ok(validateVoicePayload(withUrlValue).some((error) => error.includes('approved schema')));

const withPrivateContent = structuredClone(valid);
withPrivateContent.actions[0].title = 'Does it fit?';
assert.ok(validateVoicePayload(withPrivateContent).some((error) => error.includes('approved schema')));

const withUncontrolledTopic = structuredClone(valid);
withUncontrolledTopic.actions[0].public_topic = 'does-it-fit';
assert.ok(validateVoicePayload(withUncontrolledTopic).some((error) => error.includes('invalid public topic')));

console.log('Public user voice rejection tests passed');
