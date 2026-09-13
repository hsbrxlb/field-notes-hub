const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const invitation = read('assets/email/discord-invite.html');
const offer = read('assets/email/discord-member-offer-concept.html');
for (const html of [invitation, offer]) {
  assert.match(html, /{{ organization\.full_address }}/, 'Import file must retain the real address binding');
  assert.match(html, /{% unsubscribe 'Unsubscribe from marketing emails' %}/, 'Import file must retain unsubscribe functionality');
  assert.match(html, /assets\/brand\/oedro-logo-official\.png/);
  assert.doesNotMatch(html, /COMMUNITY \/ DISCORD|AN OPEN INVITATION|PROPOSED OFFER · NOT AVAILABLE/);
}
const inviteLinks = [...invitation.matchAll(/href="(https:[^"]+)"/g)].map((match) => match[1]);
assert.deepEqual(inviteLinks, ['https://discord.gg/CXM9tuFqG7'], 'Invitation should have one primary action');
assert.match(offer, /data-send-status="VERSION DISABLED"/);
assert.match(offer, /\[UNIQUE CODE AFTER APPROVAL\]/);
assert.doesNotMatch(offer, /href="https?:/, 'Unapproved offer must not have an active join or redemption link');
assert.ok(fs.existsSync(path.join(root, 'assets/brand/oedro-logo-official.png')));
console.log('Email source checks passed: official logos, one invitation action, functional import footer, inactive coupon concept.');
