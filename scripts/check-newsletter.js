const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const repo = path.resolve(__dirname, '..');
const root = process.env.PUBLIC_SITE_ROOT ? path.resolve(repo, process.env.PUBLIC_SITE_ROOT) : repo;
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const issue = JSON.parse(read('data/newsletter.json'));
const preview = read('assets/newsletter/001.html');
const expectedKeys = ['title', 'description', 'opening', 'sections', 'closing', 'editorial'];
assert.deepEqual(Object.keys(issue).sort(), expectedKeys.sort(), 'Public issue contains editorial fields only');
const normalize = text => text.replace(/\s+/g, ' ').trim();
const visibleEmail = normalize(preview.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' '));
const bilingual = pair => {
  assert.deepEqual(Object.keys(pair).sort(), ['en', 'zh']);
  assert.ok(pair.zh.trim(), 'Every English block has a Chinese counterpart');
  assert.ok(visibleEmail.includes(normalize(pair.en)), `Preview is missing approved copy: ${pair.en}`);
};
for (const key of ['title', 'description', 'opening', 'closing', 'editorial']) bilingual(issue[key]);
for (const section of issue.sections) {
  assert.ok(Object.keys(section).every(key => ['heading', 'paragraphs', 'steps'].includes(key)));
  bilingual(section.heading);
  for (const pair of [...(section.steps || []), ...section.paragraphs]) bilingual(pair);
}
assert.equal(issue.sections.length, 4);
assert.equal(issue.sections[2].steps.length, 3);
assert.doesNotMatch(preview, /{%|{{|Further reading|mailto:|<script\b|href=/i, 'Public preview has no recipient-specific action or extra reading section');
assert.doesNotMatch(read('newsletter.js'), /准备中|待发送|已发送|归档/);
assert.match(preview, /Unsubscribe<\/span>/);
console.log('Newsletter checks passed: complete bilingual copy, matching email, read-only public preview.');
