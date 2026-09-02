#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = process.env.PUBLIC_SITE_ROOT
  ? path.resolve(process.env.PUBLIC_SITE_ROOT)
  : path.resolve(__dirname, '..');
const runtimeExtensions = new Set(['.html', '.js', '.css', '.json']);
const excludedDirectories = new Set(['.git', '.github', '.playwright-cli', 'scripts', 'build-artifacts', 'output']);
const forbiddenRuntime = [/\/api\//i, /localhost/i, /127\.0\.0\.1/i];
const allowedTopLevel = new Set(['schema_version', 'generated_at', 'method', 'actions']);
const allowedActionFields = new Set([
  'action_type', 'public_topic', 'status', 'evidence_strength',
  'source_count', 'independent_voice_count'
]);
const privateFieldPattern = /author|quote|mention|draft|reply|profile|url|question|handle|fact_id/i;
const allowedActionTypes = new Set([
  'faq', 'research_question', 'discord_topic', 'product_feedback', 'support_feedback',
  'content_idea', 'official_site_article_candidate'
]);
const allowedPublicTopics = new Set([
  'tonneau_cover', 'running_boards', 'floor_mats', 'bumper', 'fitment', 'installation',
  'warranty', 'product_quality', 'shipping_returns', 'support', 'community', 'general'
]);
const allowedEvidenceStrengths = new Set([
  'urgent_single_signal', 'repeated_multi_source', 'single_or_thin_signal', 'single_signal'
]);
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
  if (candidate?.schema_version !== 2 || candidate?.method !== 'human_reviewed_user_voice') {
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
    if (!allowedActionTypes.has(item.action_type)) issues.push(`data/user-voice.json: actions[${index}] has an invalid action type`);
    if (!allowedPublicTopics.has(item.public_topic)) issues.push(`data/user-voice.json: actions[${index}] has an invalid public topic`);
    if (!allowedEvidenceStrengths.has(item.evidence_strength)) issues.push(`data/user-voice.json: actions[${index}] has an invalid evidence strength`);
    for (const key of ['source_count', 'independent_voice_count']) {
      if (!Number.isInteger(item[key]) || item[key] < 0) issues.push(`data/user-voice.json: actions[${index}].${key} is invalid`);
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
