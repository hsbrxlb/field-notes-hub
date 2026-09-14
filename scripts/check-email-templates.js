const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const invitation = read('assets/email/discord-invite.html');
const source = read('email-templates.js');
for (const html of [invitation]) {
  assert.match(html, /{{ organization\.full_address }}/, 'Import file must retain the real address binding');
  assert.match(html, /{% unsubscribe 'Unsubscribe from marketing emails' %}/, 'Import file must retain unsubscribe functionality');
  assert.match(html, /assets\/brand\/oedro-logo-official\.png/);
  assert.doesNotMatch(html, /COMMUNITY \/ DISCORD|AN OPEN INVITATION|PROPOSED OFFER · NOT AVAILABLE/);
}
const inviteLinks = [...invitation.matchAll(/href="(https:[^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(inviteLinks, ['https://discord.gg/CXM9tuFqG7'], 'Invitation should have one primary action');
assert.ok(!fs.existsSync(path.join(root, 'assets/email/discord-member-offer-concept.html')), 'Withdrawn coupon must not remain publicly available');
assert.match(invitation, /<td class="email-pad" style="padding:0 40px;"><img class="email-image"[^>]+width="520"/);
assert.match(invitation, /\.email-pad \{ padding-left:24px !important; padding-right:24px !important;/);
assert.match(invitation, /bgcolor="#195c96"/);
assert.doesNotMatch(invitation, /#d6e289|Thanks for sharing your feedback|Let’s talk cars|A community invitation from OEDRO/);
assert.match(invitation, /A muddy floor mat after a weekend drive/);
assert.doesNotMatch(source, /优惠券|<details|AI 生成|发送安排|download|Company mailing address/);
assert.ok(fs.existsSync(path.join(root, 'assets/brand/oedro-logo-official.png')));
const content = { innerHTML: '' };
const frame = { dataset: { file: 'assets/email/discord-invite.html' }, addEventListener() {} };
const context = {
  window: {}, location: { href: 'https://example.test/email-templates.html' }, URL,
  document: { querySelector: () => content, querySelectorAll: () => [frame] },
  fetch: async () => ({ ok: true, text: async () => invitation })
};
require('node:vm').runInNewContext(source, context);
(async () => {
  await context.window.initEmailTemplates();
  assert.equal((content.innerHTML.match(/<iframe /g) || []).length, 1);
  assert.doesNotMatch(frame.srcdoc, /Company mailing address|organization\.full_address|{% unsubscribe/);
  assert.match(frame.srcdoc, /Unsubscribe from marketing emails/);
  const preheader = invitation.match(/mso-hide:all;">([^<]+)<\/div>/)[1];
  assert.ok(content.innerHTML.includes(preheader), 'Inbox summary must match the email preheader');
  assert.match(content.innerHTML, /OEDRO on Discord: bring your garage stories/);
  console.log('Email checks passed: one preview, matching preheader, aligned padding, blue CTA, import tokens, no public coupon.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
