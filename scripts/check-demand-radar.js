#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const root = process.env.PUBLIC_SITE_ROOT
  ? path.resolve(process.env.PUBLIC_SITE_ROOT)
  : path.resolve(__dirname, '..');
const payloadPath = path.join(root, 'data', 'demand-radar.json');
const allowedTopLevel = new Set([
  'schema_version', 'generated_at', 'last_attempt_at', 'last_success_at', 'method',
  'status', 'stale_after_hours', 'truth_status', 'metrics', 'sources', 'items'
]);
const allowedMetricFields = new Set([
  'raw_discovered', 'accepted', 'filtered', 'new_actionable',
  'duplicate_actionable', 'open_items'
]);
const allowedSourceFields = new Set(['source', 'status', 'accepted_count']);
const allowedItemFields = new Set([
  'signal_id', 'topic', 'source_family', 'source_link', 'reason_code',
  'next_action', 'triage_status', 'observed_at', 'last_seen_at'
]);
const allowedTopics = new Set([
  'complaint', 'support', 'installation', 'fitment', 'recommendation',
  'tonneau_cover', 'running_boards', 'floor_mats', 'bumper', 'general'
]);
const allowedFamilies = new Set(['reddit', 'forum', 'youtube']);
const allowedReasons = new Set(['direct_oedro_question', 'relevant_product_question']);
const allowedNextActions = new Set(['verify_product_facts', 'review_reply_opportunity']);
const allowedTriage = new Set(['NEEDS_FACTS', 'DRAFT_READY']);
const allowedStatuses = new Set(['not_run', 'success', 'partial', 'failed']);
const allowedTruthStatuses = new Set(['unknown', 'current', 'blocked']);
const allowedSourceNames = new Set(['tavily', 'youtube', 'official_facts']);
const allowedSourceStatuses = new Set(['not_run', 'ok', 'failed', 'disabled', 'blocked']);
const privateFieldPattern = /author|quote|mention|draft|reply|profile|handle|fact_id|question|excerpt/i;
const blockedPathPattern = /\/(?:user|users|profile|profiles|member|members|account|accounts)(?:\/|$)/i;
const forumTokens = [
  'f150forum', 'mavericktruckclub', 'tacomaworld', 'tundras.com', 'ramforum',
  'silveradosierra', 'jeepforum', 'jlwranglerforums', 'jeepgladiatorforum', 'coloradofans'
];

function exactKeys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === allowed.size && keys.every((key) => allowed.has(key));
}

function isIso(value, nullable = false) {
  if (nullable && value === null) return true;
  return typeof value === 'string' && value.trim() && !Number.isNaN(Date.parse(value));
}

function safeSourceLink(value, family) {
  if (typeof value !== 'string' || !value.trim()) return false;
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || blockedPathPattern.test(url.pathname)) return false;
  const host = url.hostname.toLowerCase();
  if (family === 'reddit') return host === 'reddit.com' || host.endsWith('.reddit.com');
  if (family === 'youtube') return host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com');
  if (family === 'forum') return forumTokens.some((token) => host.includes(token));
  return false;
}

function validateDemandRadar(candidate) {
  const issues = [];
  if (!exactKeys(candidate, allowedTopLevel)) issues.push('demand-radar: top-level fields do not match schema');
  if (candidate?.schema_version !== 1 || candidate?.method !== 'deterministic_external_signal_scan') {
    issues.push('demand-radar: metadata is invalid');
  }
  if (!isIso(candidate?.generated_at) || !isIso(candidate?.last_attempt_at, true) || !isIso(candidate?.last_success_at, true)) {
    issues.push('demand-radar: timestamps are invalid');
  }
  if (!allowedStatuses.has(candidate?.status)) issues.push('demand-radar: status is invalid');
  if (!allowedTruthStatuses.has(candidate?.truth_status)) issues.push('demand-radar: truth_status is invalid');
  if (!Number.isInteger(candidate?.stale_after_hours) || candidate.stale_after_hours < 1 || candidate.stale_after_hours > 168) {
    issues.push('demand-radar: stale_after_hours is invalid');
  }
  if (!exactKeys(candidate?.metrics, allowedMetricFields)) {
    issues.push('demand-radar: metrics fields do not match schema');
  } else {
    for (const [key, value] of Object.entries(candidate.metrics)) {
      if (!Number.isInteger(value) || value < 0) issues.push(`demand-radar: metrics.${key} is invalid`);
    }
  }
  if (!Array.isArray(candidate?.sources) || candidate.sources.length !== 3) {
    issues.push('demand-radar: sources must contain exactly three entries');
  } else {
    const names = new Set();
    candidate.sources.forEach((item, index) => {
      if (!exactKeys(item, allowedSourceFields)) issues.push(`demand-radar: sources[${index}] fields are invalid`);
      if (!allowedSourceNames.has(item?.source) || names.has(item?.source)) issues.push(`demand-radar: sources[${index}].source is invalid`);
      names.add(item?.source);
      if (!allowedSourceStatuses.has(item?.status)) issues.push(`demand-radar: sources[${index}].status is invalid`);
      if (!Number.isInteger(item?.accepted_count) || item.accepted_count < 0) issues.push(`demand-radar: sources[${index}].accepted_count is invalid`);
    });
  }
  if (!Array.isArray(candidate?.items) || candidate.items.length > 100) {
    issues.push('demand-radar: items must be an array with at most 100 entries');
  } else {
    const ids = new Set();
    candidate.items.forEach((item, index) => {
      if (!exactKeys(item, allowedItemFields)) issues.push(`demand-radar: items[${index}] fields are invalid`);
      if (Object.keys(item || {}).some((key) => privateFieldPattern.test(key))) issues.push(`demand-radar: items[${index}] contains a private field`);
      if (typeof item?.signal_id !== 'string' || !/^[a-f0-9]{64}$/.test(item.signal_id) || ids.has(item.signal_id)) {
        issues.push(`demand-radar: items[${index}].signal_id is invalid`);
      }
      ids.add(item?.signal_id);
      if (!allowedTopics.has(item?.topic)) issues.push(`demand-radar: items[${index}].topic is invalid`);
      if (!allowedFamilies.has(item?.source_family)) issues.push(`demand-radar: items[${index}].source_family is invalid`);
      if (!safeSourceLink(item?.source_link, item?.source_family)) issues.push(`demand-radar: items[${index}].source_link is unsafe`);
      if (!allowedReasons.has(item?.reason_code)) issues.push(`demand-radar: items[${index}].reason_code is invalid`);
      if (!allowedNextActions.has(item?.next_action)) issues.push(`demand-radar: items[${index}].next_action is invalid`);
      if (!allowedTriage.has(item?.triage_status)) issues.push(`demand-radar: items[${index}].triage_status is invalid`);
      if (!isIso(item?.observed_at) || !isIso(item?.last_seen_at)) issues.push(`demand-radar: items[${index}] timestamps are invalid`);
      if (isIso(item?.observed_at) && isIso(item?.last_seen_at) && Date.parse(item.observed_at) > Date.parse(item.last_seen_at)) {
        issues.push(`demand-radar: items[${index}] observed_at is after last_seen_at`);
      }
    });
  }
  return issues;
}

let payload;
try {
  payload = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
} catch (error) {
  console.error(`Demand radar check failed: ${error.message}`);
  process.exit(1);
}

const issues = validateDemandRadar(payload);
if (require.main === module) {
  if (issues.length) {
    console.error('Demand radar check failed');
    issues.forEach((issue) => console.error(`- ${issue}`));
    process.exitCode = 1;
  } else {
    console.log(`Demand radar check passed (${payload.items.length} public signals)`);
  }
}

module.exports = { validateDemandRadar, safeSourceLink };
