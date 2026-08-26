#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'data/content-studio.json'), 'utf8'));
const source = fs.readFileSync(path.join(root, 'content-studio.js'), 'utf8');
const theme = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');
const base = fs.readFileSync(path.join(root, 'base.css'), 'utf8');
const errors = [];

const quickIds = config.quick_steps.flatMap((step) => step.fields);
const expectedQuickIds = ['title', 'audience', 'target_action', 'confirmed_facts'];
if (config.quick_steps.length !== 3) errors.push('quick flow must have exactly 3 steps');
if (JSON.stringify(quickIds) !== JSON.stringify(expectedQuickIds)) {
  errors.push(`quick fields must be ${expectedQuickIds.join(', ')}`);
}

const commonFields = new Map(config.common_fields.map((field) => [field.id, field]));
for (const fieldId of quickIds) {
  if (!commonFields.get(fieldId)?.required) errors.push(`${fieldId} must remain a required quick field`);
}

for (const module of config.modules) {
  const defaults = module.quick_defaults || {};
  if (!defaults.goal) errors.push(`${module.id}: quick default goal is missing`);
  if (!Array.isArray(defaults.channels) || !defaults.channels.length) errors.push(`${module.id}: quick channels are missing`);
  if (defaults.permission_status !== '只做内部草稿') errors.push(`${module.id}: quick mode must default to internal draft permission`);
}

for (const forbidden of [/api[_-]?key/i, /openai/i, /anthropic/i, /deepseek/i, /codex app/i, /\/api\//i]) {
  if (forbidden.test(source)) errors.push(`content-studio.js contains forbidden integration marker ${forbidden}`);
}

for (const required of [
  "const STORAGE_KEY = 'oedro-content-studio-jobs-v1'",
  "const DRAFT_KEY = 'oedro-content-studio-draft-v2'",
  'function exportBackup()',
  'async function restoreBackup(file)',
  'function renderAnswerSummary()',
  "document.querySelector('#review-output-editor').addEventListener('input', scheduleEditorSave)",
  'function discardBrokenDraft()'
]) {
  if (!source.includes(required)) errors.push(`content-studio.js is missing: ${required}`);
}

if (!theme.includes('--text: #FFFFFF')) errors.push('primary text is not pure white');
if (!base.includes('Full-site legibility floor')) errors.push('full-site legibility floor is missing');
if (!base.includes('.main-content') || !base.includes('background: transparent')) errors.push('main content must remain transparent');
if (/body::after/.test(theme + base)) errors.push('full-page overlay selector body::after is not allowed');
if (/\.mobile-overlay\s*\{[^}]*background:\s*rgba\([^)]*,\s*\.[1-9]/s.test(base)) errors.push('mobile navigation must not add a dark full-page overlay');

if (errors.length) {
  console.error('Content studio check failed');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Content studio check passed (${config.modules.length} templates, ${config.quick_steps.length} quick steps)`);
}
