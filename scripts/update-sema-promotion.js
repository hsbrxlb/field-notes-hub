#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const dataPath = path.join(root, 'data/sema-promotion.json');
const allowed = ['channel', 'post_id', 'published_at', 'text', 'url', 'destination_url', 'status'];
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
function validate(record) {
  if (!record || Object.keys(record).some(key => !allowed.includes(key))) throw new Error('Unexpected public record field');
  for (const key of ['channel', 'published_at', 'text', 'url', 'status']) {
    if (typeof record[key] !== 'string' || !record[key].trim()) throw new Error(`Missing ${key}`);
  }
  if (!['live', 'pending'].includes(record.status)) throw new Error('Status must be live or pending');
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d)$/.test(record.published_at) || !Number.isFinite(Date.parse(record.published_at))) throw new Error('An explicit timestamp with timezone is required');
  for (const key of ['url', 'destination_url']) {
    if (record[key] === undefined && key === 'destination_url') continue;
    const url = new URL(record[key]);
    if (url.protocol !== 'https:' || url.username || [...url.searchParams.keys()].some(key => /token|delete|edit|auth/i.test(key)) || /(?:delete|manage|admin)/i.test(url.pathname)) throw new Error('Use a public HTTPS post link');
  }
  if (record.post_id !== undefined && typeof record.post_id !== 'string') throw new Error('Invalid post_id');
  return record;
}
const identity = record => `${record.channel.trim().toLowerCase()}|${record.post_id || record.url.replace(/\/$/, '')}`;
const textHash = record => crypto.createHash('sha256').update(record.text.trim()).digest('hex');
function merge(records, incoming) {
  const record = validate(incoming);
  const index = records.findIndex(item => identity(item) === identity(record)
    || item.channel === record.channel && item.url === record.url && textHash(item) === textHash(record));
  if (index < 0) return [...records, record];
  if (textHash(records[index]) !== textHash(record)) throw new Error('Existing post has different text; reconcile before replacing');
  if (records[index].status === 'pending' && record.status === 'live') records[index] = { ...records[index], ...record };
  return records;
}
function build(records) {
  const timestamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const entries = [...records].sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at)).map(record => `<article class="promotion-record">
          <div class="promotion-meta"><time datetime="${escape(record.published_at)}">${timestamp.format(new Date(record.published_at))} 上海</time><h2>${escape(record.channel)}</h2><span class="promotion-status" data-status="${record.status}">${record.status}</span></div>
          <p class="promotion-text" lang="en">${escape(record.text)}</p>
          <div class="promotion-links"><a href="${escape(record.url)}" target="_blank" rel="noopener noreferrer">查看原帖 ↗</a>${record.destination_url ? `<a href="${escape(record.destination_url)}" target="_blank" rel="noopener noreferrer">帖内活动链接 ↗</a>` : ''}</div>
        </article>`).join('\n        ');
  const template = fs.readFileSync(path.join(root, 'sema-plan.html'), 'utf8');
  return template.replaceAll('sema-plan', 'sema-promotion').replaceAll('SEMA门票活动', 'SEMA宣传记录')
    .replace(/<meta name="description"[^>]*>/, '<meta name="description" content="SEMA宣传记录：发布时间、渠道、发帖原文和原帖链接。">')
    .replace('<link rel="stylesheet" href="brand-plan.css?v=20260916-type">', '<link rel="stylesheet" href="sema-promotion.css">')
    .replace(/<main\b[^>]*>[\s\S]*?<\/main>/, `<main class="main-content" id="content"><header class="page-heading"><h1>SEMA宣传记录</h1></header><section class="promotion-list" aria-label="宣传记录">${entries || '<p class="section">暂无宣传记录</p>'}</section></main>`);
}
if (require.main === module) {
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  data.records.forEach(validate);
  const inputIndex = process.argv.indexOf('--input');
  if (inputIndex >= 0) data.records = merge(data.records, JSON.parse(fs.readFileSync(process.argv[inputIndex + 1], 'utf8')));
  const html = build(data.records);
  if (process.argv.includes('--check')) {
    if (html !== fs.readFileSync(path.join(root, 'sema-promotion.html'), 'utf8')) throw new Error('SEMA promotion page is stale');
  } else {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n');
    fs.writeFileSync(path.join(root, 'sema-promotion.html'), html);
  }
  console.log(`${data.records.length} SEMA promotion record(s)`);
}
module.exports = { validate, merge, build };
