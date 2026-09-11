#!/usr/bin/env node

const assert = require('node:assert/strict');
const { validateVoicePayload, validateRuntimeContent } = require('./check-public-user-voice.js');

const valid = {
  schema_version: 2,
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

assert.deepEqual(validateRuntimeContent('app.js', '<a href="https://oedro-light-research.onrender.com/">Open interview</a>'), []);
for (const [file, content] of [
  ['app.js', '<a href="http://127.0.0.1:54810/">Old local entry</a>'],
  ['data/user-voice.json', 'http://127.0.0.1:54810/'],
  ['app.js', 'fetch("http://127.0.0.1:54810/")'],
  ['app.js', '<a href="http://127.0.0.1:54810/api/study/delete">Delete</a>'],
  ['app.js', '<a href="http://127.0.0.1:54811/">Other service</a>'],
  ['app.js', '<a href="http://localhost:54810/">Other origin</a>'],
]) assert.ok(validateRuntimeContent(file, content).length, file + ' must remain blocked');
console.log('Cloud interview launch and local-runtime boundaries passed');
