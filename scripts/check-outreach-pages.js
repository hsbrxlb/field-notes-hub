#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.PUBLIC_SITE_ROOT ? path.resolve(__dirname, '..', process.env.PUBLIC_SITE_ROOT) : path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const application = read('app.js');
const startup = application.slice(application.indexOf("const mainContent = document.querySelector('#content');"));
async function check() {
  for (const id of ['first-outreach', 'discord-invite-plan']) {
    const html = read(`${id}.html`);
    assert.equal((html.match(/<h1>/g) || []).length, 1, `${id}: one heading`);
    assert.ok(!/CONTENT_PENDING|待填|\[[^\]]*待[^\]]*\]|@|客户ID|customer[_-]?id/i.test(html), `${id}: no unfinished copy or customer identifiers`);
    assert.ok((html.match(/<section\b/g) || []).length >= 3, `${id}: useful reading sections`);
    if (id === 'first-outreach') {
      assert.ok(!/会话|名单生成|User-ID|客户标识|候选池/.test(html), 'audience page: keep the user-requested plain-language copy');
    } else {
      assert.ok(!/Oliver|尚未启动|不保证 100 人入群/.test(html), 'invitation page: keep removed names and redundant notes out');
    }
    for (const stylesheet of ['base.css', 'theme.css', 'brand-plan.css', 'outreach-plan.css']) {
      assert.ok(html.includes(`href="${stylesheet}?`), `${id}: shared reading styles`);
    }
    const content = { innerHTML: html, setAttribute() {} };
    const context = {
      page: id,
      document: { querySelector: selector => selector === '#content' ? content : null },
      init: () => Promise.reject(new Error('navigation unavailable')),
      console: { error() {} }
    };
    vm.runInNewContext(startup, context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(content.innerHTML, html, `${id}: navigation failure preserves the reading page`);
  }
  console.log('Outreach page structure, public copy and navigation-failure checks passed');
}
check().catch(error => { console.error(error); process.exitCode = 1; });
