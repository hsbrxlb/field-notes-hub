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
  'duplicate_actionable', 'open_items', 'youtube_videos_checked',
  'youtube_comments_checked', 'youtube_replies_checked', 'youtube_unavailable_videos',
  'bluesky_posts_checked'
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
const allowedFamilies = new Set(['reddit', 'forum', 'youtube', 'bluesky']);
const allowedReasons = new Set(['direct_oedro_question', 'relevant_product_question']);
const allowedNextActions = new Set(['verify_product_facts', 'review_reply_opportunity']);
const allowedTriage = new Set(['NEEDS_FACTS', 'DRAFT_READY']);
const allowedStatuses = new Set(['not_run', 'success', 'partial', 'failed']);
const allowedTruthStatuses = new Set(['unknown', 'current', 'blocked']);
const allowedSourceNames = new Set(['tavily', 'youtube', 'bluesky', 'official_facts']);
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
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  if (family === 'bluesky') {
    return host === 'bsky.app' && /^\/profile\/[^/]+\/post\/[^/]+\/?$/.test(url.pathname);
  }
  if (blockedPathPattern.test(url.pathname)) return false;
  if (family === 'reddit') return host === 'reddit.com' || host.endsWith('.reddit.com');
  if (family === 'youtube') return host === 'youtu.be' || host === 'youtube.com' || host.endsWith('.youtube.com');
  if (family === 'forum') return forumTokens.some((token) => host.includes(token));
  return false;
}

function validateDemandRadar(candidate) {
  const issues = [];
  const topFields = candidate && Object.hasOwn(candidate, 'mentions')
    ? new Set([...allowedTopLevel, 'mentions']) : allowedTopLevel;
  if (!exactKeys(candidate, topFields)) issues.push('demand-radar: top-level fields do not match schema');
  if (candidate && Object.hasOwn(candidate, 'mentions')) {
    issues.push(...validateMentions(candidate.mentions));
    if (candidate.stale_after_hours !== 96) issues.push('demand-radar: mentions require a 96-hour stale threshold');
  }
  const allowedMethod = candidate?.method === 'deterministic_external_signal_scan'
    || candidate?.mentions && ['verified_mention_history_migration', 'verified_mention_72h_cloud_batch'].includes(candidate.method);
  if (candidate?.schema_version !== 1 || !allowedMethod) {
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
  if (!Array.isArray(candidate?.sources) || candidate.sources.length !== 4) {
    issues.push('demand-radar: sources must contain exactly four entries');
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

const mentionFields = new Set(['platform', 'object_id', 'source_link', 'summary', 'publication']);
const publicationFields = new Set(['date', 'published_at', 'precision', 'source_timezone']);
const platforms = new Set(['Reddit', '汽车论坛', 'YouTube', 'Bluesky', 'X', 'Trustpilot']);
const forumDomains = ['f150forum.com', 'mavericktruckclub.com', 'tacomaworld.com', 'tundras.com',
  'ramforum.com', 'silveradosierra.com', 'jeepforum.com', 'jlwranglerforums.com', 'jeepgladiatorforum.com', 'coloradofans.com'];
const awareIsoPattern = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;

function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function awareNanoseconds(value) {
  if (typeof value !== 'string' || !awareIsoPattern.test(value) || !calendarDate(value.slice(0, 10))
    || /[+-]14:(?!00)/.test(value)) return null;
  const wholeSecond = Date.parse(value.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/, ''));
  if (!Number.isFinite(wholeSecond)) return null;
  const fraction = /\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/.exec(value)?.[1] || '';
  return BigInt(wholeSecond) * 1000000n + BigInt(fraction.padEnd(9, '0'));
}

function awareTimestamp(value) { return awareNanoseconds(value) !== null; }

function safeMentionLink(value, platform, objectId) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\]/.test(value)) return false;
  let url;
  try { url = new URL(value); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return false;
  const host = url.hostname.toLowerCase();
  const onDomain = (domain) => host === domain || host === `www.${domain}`;
  const query = [...url.searchParams.keys()];
  const matchesId = (id) => objectId === undefined || objectId === id;
  if (platform === 'YouTube') {
    const videoPath = /^\/(?:shorts\/|live\/)?([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname);
    if (onDomain('youtu.be') || onDomain('youtube.com') && /^\/(?:shorts|live)\//.test(url.pathname)) {
      return !query.length && !!videoPath && matchesId(videoPath[1]);
    }
    const videoId = url.searchParams.get('v');
    const commentId = url.searchParams.get('lc');
    return onDomain('youtube.com') && url.pathname === '/watch'
      && query.every((key) => ['v', 'lc'].includes(key)) && query.length <= 2
      && /^[A-Za-z0-9_-]{11}$/.test(videoId || '')
      && (!url.searchParams.has('lc') || /^[A-Za-z0-9_.-]{1,200}$/.test(commentId))
      && matchesId(commentId ? `${videoId}:${commentId}` : videoId);
  }
  if (query.length) return false;
  if (platform === 'Reddit') {
    const post = /^\/(?:r\/[^/]+\/)?comments\/([a-z0-9]+)(?:\/([^/]+))?(?:\/([a-z0-9]+))?\/?$/i.exec(url.pathname);
    return (onDomain('reddit.com') || host === 'old.reddit.com') && !!post
      && matchesId(post[3] ? `t1_${post[3]}` : `t3_${post[1]}`);
  }
  if (platform === 'Bluesky') {
    const post = /^\/profile\/([^/]+)\/post\/([A-Za-z0-9]+)\/?$/.exec(url.pathname);
    return host === 'bsky.app' && !!post && matchesId(`${post[1]}/${post[2]}`);
  }
  if (platform === 'X') {
    const post = /^\/(?:[^/]+|i\/web)\/status\/(\d+)\/?$/.exec(url.pathname);
    return (onDomain('x.com') || onDomain('twitter.com')) && !!post && matchesId(post[1]);
  }
  if (platform === 'Trustpilot') {
    const review = /^\/reviews\/([a-f0-9]+)\/?$/i.exec(url.pathname);
    return onDomain('trustpilot.com') && !!review && matchesId(review[1]);
  }
  const forumHost = host.replace(/^www\./, '');
  if (platform === '汽车论坛' && ['ram-rho.com', 'f150lightningforum.com'].includes(forumHost)) {
    const replyPattern = forumHost === 'ram-rho.com'
      ? /^\/threads\/[^/]+\.\d+\/post-(\d+)\/?$/i
      : /^\/forum\/threads\/[^/]+\.\d+\/post-(\d+)\/?$/i;
    const reply = replyPattern.exec(url.pathname);
    return !!reply && matchesId(`${forumHost}:${reply[1]}`);
  }
  const forumPath = onDomain('mavericktruckclub.com')
    ? url.pathname.replace(/^\/forum(?=\/threads\/)/, '') : url.pathname;
  const forumId = /^\/(?:threads|posts)\/(?:[^/]*[.-])?(\d+)\/?$/i.exec(forumPath)?.[1]
    || /^\/f\d+\/[^/]+-(\d+)\/?$/i.exec(forumPath)?.[1];
  return platform === '汽车论坛' && forumDomains.some((domain) => host === domain || host.endsWith(`.${domain}`))
    && !!forumId && !blockedPathPattern.test(url.pathname) && matchesId(`${host.replace(/^www\./, '')}:${forumId}`);
}

function publicationBounds(publication) {
  if (publication.precision === 'datetime') {
    const instant = awareNanoseconds(publication.published_at);
    return [instant, instant];
  }
  if (publication.precision !== 'date') return null;
  const [year, month, day] = publication.date.split('-').map(Number);
  const midnight = Date.UTC(year, month - 1, day);
  const zone = publication.source_timezone;
  const offset = typeof zone === 'string' && /^(?:UTC)?([+-])(\d{2}):(\d{2})$/.exec(zone);
  let minutes = null;
  if (zone === 'UTC' || zone === 'Z') minutes = 0;
  else if (offset && Number(offset[2]) <= 14 && Number(offset[3]) < 60
    && (Number(offset[2]) < 14 || Number(offset[3]) === 0)) {
    minutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '+' ? 1 : -1);
  }
  // A source date without a usable offset spans all civil time zones (UTC-12 through UTC+14).
  const bounds = minutes === null ? [midnight - 14 * 3600000, midnight + 36 * 3600000]
    : [midnight - minutes * 60000, midnight + 86400000 - minutes * 60000];
  return [BigInt(bounds[0]) * 1000000n, BigInt(bounds[1]) * 1000000n - 1n];
}

function orderMentionIntervals(items) {
  const known = [], unknown = [];
  items.forEach((item, index) => {
    const bounds = publicationBounds(item.publication);
    if (bounds) known.push({ item, index, start: bounds[0], end: bounds[1] });
    else unknown.push(item);
  });
  const ordered = [];
  while (known.length) {
    const latestStart = known.reduce((latest, record) => record.start > latest ? record.start : latest, known[0].start);
    // Only incomparable intervals retain input order; definite chronology always wins.
    const nextIndex = known.findIndex((record) => record.end >= latestStart);
    ordered.push(known.splice(nextIndex, 1)[0].item);
  }
  return ordered.concat(unknown);
}

function validateMentions(candidate) {
  const issues = [];
  if (!exactKeys(candidate, new Set(['schema_version', 'batch', 'history'])) || candidate?.schema_version !== 1) {
    return ['mentions: fields or schema_version are invalid'];
  }
  const batch = candidate.batch;
  if (!exactKeys(batch, new Set(['id', 'window_start', 'window_end', 'items']))
    || typeof batch?.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(batch.id)
    || !awareTimestamp(batch.window_start) || !awareTimestamp(batch.window_end)
    || awareNanoseconds(batch.window_end) - awareNanoseconds(batch.window_start) !== 72n * 3600000000000n) {
    issues.push('mentions: batch must identify an exact 72-hour window');
  }
  const collections = [['batch.items', batch?.items], ['history', candidate.history]];
  const records = new Map();
  for (const [name, items] of collections) {
    if (!Array.isArray(items) || items.length > 10000) {
      issues.push(`mentions: ${name} must contain at most 10000 records; overflow cannot be truncated`);
      continue;
    }
    const ids = new Set();
    for (const [index, item] of items.entries()) {
      const label = `mentions: ${name}[${index}]`;
      if (!exactKeys(item, mentionFields) || !platforms.has(item?.platform)
        || typeof item?.object_id !== 'string' || !/^[A-Za-z0-9_.:/-]{1,200}$/.test(item.object_id)
        || !safeMentionLink(item?.source_link, item?.platform, item?.object_id)) issues.push(`${label} fields or original source link are invalid`);
      if (typeof item?.summary !== 'string' || !item.summary.trim() || item.summary !== item.summary.trim()
        || [...item.summary].length > 300 || /[<>\u0000-\u001f\u007f]|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\/Users\/|file:|localhost|127\.0\.0\.1)|(?:api[_ -]?key|access[_ -]?token|password|cookie)\s*[:=]/i.test(item.summary)) {
        issues.push(`${label} summary is not a bounded public-safe overview`);
      }
      const publication = item?.publication;
      const validPublication = exactKeys(publication, publicationFields)
        && (publication.source_timezone === null || typeof publication.source_timezone === 'string'
          && publication.source_timezone.trim() === publication.source_timezone && publication.source_timezone.length <= 80
          && /^(?:UTC|Z|(?:UTC)?[+-]\d{2}:\d{2}|[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*|[A-Z]{2,5})$/.test(publication.source_timezone))
        && (publication.precision === 'datetime' && awareTimestamp(publication.published_at)
          && publication.date === publication.published_at.slice(0, 10)
          || publication.precision === 'date' && calendarDate(publication.date) && publication.published_at === null
          || publication.precision === 'unknown' && publication.date === null && publication.published_at === null);
      if (!validPublication) issues.push(`${label} publication precision is invalid`);
      if (name === 'batch.items' && validPublication) {
        const bounds = publicationBounds(publication);
        const windowStart = awareNanoseconds(batch.window_start), windowEnd = awareNanoseconds(batch.window_end);
        if (!bounds || windowStart === null || windowEnd === null || bounds[0] < windowStart || bounds[1] >= windowEnd) {
          issues.push(`${label} publication is not wholly inside the window`);
        }
      }
      const key = `${item?.platform}:${item?.object_id}`;
      if (ids.has(key)) issues.push(`${label} repeats an object`);
      ids.add(key);
      const signature = JSON.stringify([item?.platform, item?.object_id, item?.source_link, item?.summary,
        publication?.date, publication?.published_at, publication?.precision, publication?.source_timezone]);
      if (records.has(key) && records.get(key) !== signature) issues.push(`${label} conflicts with the same object in another collection`);
      records.set(key, signature);
    }
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

module.exports = { validateDemandRadar, safeSourceLink, validateMentions, safeMentionLink, publicationBounds, awareNanoseconds, orderMentionIntervals };
