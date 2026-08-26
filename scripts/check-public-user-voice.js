#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = process.env.PUBLIC_SITE_ROOT
  ? path.resolve(process.env.PUBLIC_SITE_ROOT)
  : path.resolve(__dirname, '..');
const runtimeExtensions = new Set(['.html', '.js', '.css', '.json']);
const excludedDirectories = new Set(['.git', '.github', 'scripts', 'build-artifacts']);
const forbiddenRuntime = [/\/api\//i, /localhost/i, /127\.0\.0\.1/i];
const allowedTopLevel = new Set(['schema_version', 'generated_at', 'method', 'actions']);
const allowedActionFields = new Set([
  'action_type', 'title', 'status', 'insight_slug', 'evidence_strength',
  'source_count', 'independent_voice_count'
]);
const privateFieldPattern = /author|quote|mention|draft|reply|profile|url|question|handle|fact_id/i;
const privateValuePattern = /(?:original\s+question|question[_\s-]*text|author[_\s-]*(?:id|handle)|fact\s*ids?|(?:FACT|CL|FL)-[A-Z0-9-]+|原始?问题|作者账号|内部编号|回复链接|草稿正文)/i;
const directIdentifierPattern = /(?:https?:\/\/|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|(?:^|\s)@[A-Za-z0-9_]{2,})/i;
const errors = [];

function collectRuntimeFiles(directory, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const relativePath = path.join(prefix, entry.name);
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectRuntimeFiles(absolutePath, relativePath));
    else if (runtimeExtensions.has(path.extname(entry.name).toLowerCase())) files.push(relativePath);
  }
  return files.sort();
}

const runtimeFiles = collectRuntimeFiles(root);

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`${relativePath}: missing`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

for (const relativePath of runtimeFiles) {
  const content = read(relativePath);
  for (const pattern of forbiddenRuntime) {
    if (pattern.test(content)) errors.push(`${relativePath}: contains ${pattern}`);
  }
}

const voiceText = read('data/user-voice.json');
let voice;
try {
  voice = JSON.parse(voiceText);
} catch (error) {
  errors.push(`data/user-voice.json: invalid JSON (${error.message})`);
}

function validateVoicePayload(candidate) {
  const issues = [];
  const rootKeys = Object.keys(candidate || {});
  if (rootKeys.length !== allowedTopLevel.size || rootKeys.some((key) => !allowedTopLevel.has(key))) {
    issues.push('data/user-voice.json: top-level fields do not match the approved schema');
  }
  if (candidate?.schema_version !== 1 || candidate?.method !== 'human_reviewed_user_voice') {
    issues.push('data/user-voice.json: metadata is invalid');
  }
  if (typeof candidate?.generated_at !== 'string' || !candidate.generated_at.trim()) {
    issues.push('data/user-voice.json: generated_at is required');
  }
  if (!Array.isArray(candidate?.actions)) issues.push('data/user-voice.json: actions must be an array');
  for (const [index, item] of (candidate?.actions || []).entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      issues.push(`data/user-voice.json: actions[${index}] must be an object`);
      continue;
    }
    const keys = Object.keys(item);
    if (keys.length !== allowedActionFields.size || keys.some((key) => !allowedActionFields.has(key))) {
      issues.push(`data/user-voice.json: actions[${index}] fields do not match the approved schema`);
    }
    if (keys.some((key) => privateFieldPattern.test(key))) {
      issues.push(`data/user-voice.json: actions[${index}] contains a private field`);
    }
    if (!['approved', 'routed', 'closed'].includes(item.status)) {
      issues.push(`data/user-voice.json: actions[${index}] is not approved`);
    }
    for (const key of ['source_count', 'independent_voice_count']) {
      if (!Number.isInteger(item[key]) || item[key] < 0) issues.push(`data/user-voice.json: actions[${index}].${key} is invalid`);
    }
    for (const value of Object.values(item)) {
      if (typeof value === 'string' && directIdentifierPattern.test(value)) {
        issues.push(`data/user-voice.json: actions[${index}] contains a direct identifier`);
      }
    }
    if (privateValuePattern.test(String(item.title || '')) || privateValuePattern.test(String(item.insight_slug || ''))) {
      issues.push(`data/user-voice.json: actions[${index}] contains private-looking content`);
    }
  }
  return issues;
}

if (voice) errors.push(...validateVoicePayload(voice));

if (require.main === module) {
  if (errors.length) {
    console.error('Public user voice check failed');
    errors.forEach((error) => console.error(`- ${error}`));
    process.exitCode = 1;
  } else {
    console.log(`Public user voice check passed (${runtimeFiles.length} runtime files scanned)`);
  }
}

module.exports = { validateVoicePayload };
