#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..');
const root = process.env.PUBLIC_SITE_ROOT ? path.resolve(repoRoot, process.env.PUBLIC_SITE_ROOT) : repoRoot;
const plans = [
  { id: 'social-brand', title: 'OEDRO 社媒品牌升级', other: 'merch-plan' },
  { id: 'merch-plan', title: 'OEDRO Merch 企划', other: 'social-brand' }
];
const navigation = JSON.parse(fs.readFileSync(path.join(root, 'data/content.json'), 'utf8')).nav;
const application = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const startup = application.slice(application.indexOf("const mainContent = document.querySelector('#content');"));

async function checkPlan(plan) {
  const html = fs.readFileSync(path.join(root, `${plan.id}.html`), 'utf8');
  assert.equal(html.match(/<title>([^<]+)<\/title>/)?.[1], plan.title, `${plan.id}: document title`);
  assert.equal(html.match(/<h1>([^<]+)<\/h1>/)?.[1], plan.title, `${plan.id}: visible title`);
  assert.equal((html.match(/<h1>/g) || []).length, 1, `${plan.id}: one main title`);
  assert.ok(html.includes(`data-page="${plan.id}"`), `${plan.id}: route identity`);
  assert.ok(navigation.some(item => item.id === plan.other && item.file === `${plan.other}.html`), `${plan.id}: companion page remains available in shared navigation`);
  assert.match(html, /<script src="app\.js(?:\?[^\"]*)?"><\/script>/, `${plan.id}: shared shell script`);
  for (const stylesheet of ['base.css', 'theme.css', 'brand-plan.css']) {
    assert.ok([...html.matchAll(/href="([^\"]+)"/g)].some(match => match[1].split('?')[0] === stylesheet), `${plan.id}: shared stylesheet ${stylesheet}`);
  }
  assert.match(html, /<nav[^>]+id="nav-list"[^>]*><\/nav>/, `${plan.id}: navigation is supplied by the shared shell`);
  assert.ok(navigation.some(item => item.id === plan.id && item.file === `${plan.id}.html`), `${plan.id}: registered navigation route`);
  const body = html.replace(/<!--[\s\S]*?-->/g, '');
  assert.doesNotMatch(body, /<(?:form|input|select|textarea|details)\b/i, `${plan.id}: reference page must not collect data or hide content`);
  assert.doesNotMatch(body, /\/Users\/|file:\/\/|Oliver|Blair|张叶丛|姜安頔|\b(?:api[_-]?key|password|cookie|token)\b/i, `${plan.id}: private information`);
  assert.doesNotMatch(body, /class="[^"]*\bstatus(?:-|\s|"\b)|20\d{2}-\d{2}-\d{2}/, `${plan.id}: no date or status badge`);
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const target = match[1];
    if (/^(?:https?:|data:)/.test(target)) continue;
    if (target.startsWith('#')) {
      assert.ok(ids.has(target.slice(1)), `${plan.id}: missing anchor ${target}`);
      continue;
    }
    assert.ok(fs.existsSync(path.join(root, target.split(/[?#]/)[0])), `${plan.id}: missing local resource ${target}`);
  }
  const footer = html.match(/<footer class="plan-sources">([\s\S]*?)<\/footer>/)?.[1] || '';
  const sourceFile = path.join(root, `data/${plan.id}-sources.json`);
  const sourceData = fs.existsSync(sourceFile) ? JSON.parse(fs.readFileSync(sourceFile, 'utf8')) : {};
  const sources = sourceData.sources || [];
  const sourceCount = sources.length || [...footer.matchAll(/href="https:\/\//g)].length;
  assert.ok(sourceCount >= 4, `${plan.id}: retained research references`);
  for (const source of sources) assert.match(source.url, /^https:\/\//, `${plan.id}: valid reference URL`);
  for (const reference of sourceData.reference_images || []) {
    assert.match(reference.source, /^https:\/\//, `${plan.id}: official image source retained`);
    assert.ok(fs.existsSync(path.join(root, reference.asset)), `${plan.id}: referenced image exists ${reference.asset}`);
  }
  if (plan.id === 'merch-plan') {
    assert.doesNotMatch(html, /xiexingift\.com|ouyihats\.com|亚克力印刷款与软胶款/, 'merch-plan: superseded sourcing direction must not return');
    assert.match(html, /不是正式报价或已批准预算/, 'merch-plan: planning numbers cannot become approved quote or budget');
  }
  if (plan.id === 'social-brand') {
    assert.match(html, /不是真实用户留言/, 'social-brand: illustrative comment examples remain distinguishable from testimony');
    assert.doesNotMatch(html, /<h[23][^>]*>[^<]*半年/, 'social-brand: no invented duration in test topic heading');
  }
  if (sources.length) assert.equal(footer, '', `${plan.id}: references stay outside reading UI`);
  assert.doesNotMatch(html, /<figcaption[^>]*>[\s\S]*?概念效果图/, `${plan.id}: no repeated concept caption boilerplate`);
  if (plan.id === 'merch-plan') assert.match(html, /周边设计与试验建议/, 'merch-plan: proposal context remains clear');
  for (const image of html.matchAll(/<img\b[^>]*>/g)) {
    assert.match(image[0], /\balt="[^"]+"/, `${plan.id}: descriptive image alternative`);
    assert.match(image[0], /\bwidth="\d+"/, `${plan.id}: image width`);
    assert.match(image[0], /\bheight="\d+"/, `${plan.id}: image height`);
    assert.match(image[0], /\bloading="lazy"/, `${plan.id}: below-fold image loading`);
  }
  // Exercise the actual startup on both data outcomes: a network error must not erase a readable static plan.
  for (const failed of [false, true]) {
    const element = { innerHTML: '<article>Readable plan</article>', attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
    const reportedErrors = [];
    const nav = { innerHTML: '', querySelector: () => null };
    const context = {
      page: plan.id,
      document: { querySelector: selector => selector === '#nav-list' ? nav : element },
      init: () => failed ? Promise.reject(new Error('offline fixture')) : Promise.resolve(),
      console: { error(error) { reportedErrors.push(error); } }
    };
    vm.runInNewContext(startup, context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(element.innerHTML, '<article>Readable plan</article>', `${plan.id}: static content survives ${failed ? 'failed' : 'successful'} initialization`);
    assert.equal(element.attributes['aria-busy'], 'false', `${plan.id}: startup settles busy state`);
    assert.equal(reportedErrors.length, failed ? 1 : 0, `${plan.id}: initialization errors remain observable`);
    if (failed) assert.match(nav.innerHTML, /role="alert"[\s\S]*重新加载[\s\S]*返回首页/, `${plan.id}: navigation failure offers visible recovery`);
  }
}

Promise.all(plans.map(checkPlan)).then(() => {
  console.log('Brand plans PASS: page content, routes, local resources, proposal context, and static startup on success/failure.');
}).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
