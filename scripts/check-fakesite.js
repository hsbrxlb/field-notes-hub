const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname, '..');
const publicRoot = process.env.PUBLIC_SITE_ROOT ? path.resolve(repo, process.env.PUBLIC_SITE_ROOT) : repo;
const root = path.join(publicRoot, 'fakesite');
const seed = JSON.parse(fs.readFileSync(path.join(root,'admin/seed.json'),'utf8'));
assert.ok(seed.articles.length >= 12 && seed.faqs.length >= 30, 'Complete editorial library required');
const pages = ['index.html','blog.html','faq.html',...seed.articles.map(a=>a.slug+'.html')];
let references = 0;
const titles = new Set(), descriptions = new Set();
for (const page of pages) {
  const html = fs.readFileSync(path.join(root,page),'utf8');
  assert.match(html,/name="robots" content="noindex,follow"/,page);
  assert.equal((html.match(/<h1[ >]/g)||[]).length,1,page);
  assert.doesNotMatch(html,/127\.0\.0\.1|\/Users\/|file:\/\//,page);
  assert.doesNotMatch(html,/<script[^>]+src="https?:/,page);
  assert.doesNotMatch(html,/<a[^>]+href="(?:\.\/)?(?:admin\/|editor\.html)/,'No customer route to employee workspace');
  const title=html.match(/<title>([^<]+)<\/title>/)?.[1], description=html.match(/name="description" content="([^"]+)"/)?.[1];
  assert.ok(title && description && !titles.has(title) && !descriptions.has(description),page);
  titles.add(title); descriptions.add(description);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,page+': duplicate IDs');
  for (const [,url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (/^(https:|data:|mailto:)/.test(url)) continue;
    const parsed = new URL(url,'https://example.invalid/'+page);
    const resolved=path.join(root,decodeURIComponent(parsed.pathname));
    assert.ok(fs.existsSync(resolved),page+': missing '+url);
    if(parsed.hash && path.extname(resolved)==='.html') assert.ok(fs.readFileSync(resolved,'utf8').includes('id="'+decodeURIComponent(parsed.hash.slice(1))+'"'),page+': missing anchor '+url);
    references++;
  }
  assert.match(html,/href="\.\/faq.html"/);
  assert.match(html,/rel="canonical"/);
  for (const attr of ['og:title','og:image','og:url','og:description']) assert.ok(html.includes('property="'+attr+'"'),page);
  const article = seed.articles.find(a=>page===a.slug+'.html');
  if (article) {
    const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)[1]);
    const schema = graph.find(g=>g['@type']==='BlogPosting');
    assert.equal(schema.headline,article.title);
    assert.equal(schema.datePublished,article.publishedAt);
    assert.equal(schema.dateModified,article.modifiedAt);
    assert.ok(html.includes('datetime="'+schema.datePublished+'"') && html.includes('datetime="'+schema.dateModified+'"'));
    assert.ok(article.bodyHtml.replace(/<[^>]+>/g,' ').split(/\s+/).length >= 550);
    assert.ok(article.sources.length >= 2 && article.related.length >= 2);
  }
}
const faq=fs.readFileSync(path.join(root,'faq.html'),'utf8');
assert.equal((faq.match(/class="faq-item"/g)||[]).length,seed.faqs.length);
assert.doesNotMatch(faq,/"@type":"FAQPage"/);
assert.match(fs.readFileSync(path.join(root,'blog.html'),'utf8'),/data-filter-status aria-live="polite"/);
const admin=fs.readFileSync(path.join(root,'admin/index.html'),'utf8');
assert.match(admin,/noindex,nofollow/);
assert.match(admin,/Content-Security-Policy/);
assert.match(admin,/Role switching is a simulation/);
assert.match(admin,/Official publishing is disconnected/);
assert.doesNotMatch(admin,/class="site-header"/);
assert.ok(fs.existsSync(path.join(root,'admin/model.mjs')));
assert.doesNotMatch(fs.readFileSync(path.join(root,'admin/seed.json'),'utf8'),/factNotes|\/Users\//);
assert.match(fs.readFileSync(path.join(root,'editor.html'),'utf8'),/url=admin\/index.html/);
assert.doesNotMatch(fs.readFileSync(path.join(root,'sitemap.xml'),'utf8'),/admin\/|editor\.html/);
console.log('Fakesite passes: '+pages.length+' public pages, '+references+' references, '+seed.articles.length+' researched guides, '+seed.faqs.length+' FAQs, separated CMS.');
