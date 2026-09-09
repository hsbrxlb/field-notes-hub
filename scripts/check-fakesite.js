const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const repo = path.resolve(__dirname,'..');
const publicRoot = process.env.PUBLIC_SITE_ROOT ? path.resolve(repo,process.env.PUBLIC_SITE_ROOT) : repo;
const root = path.join(publicRoot,'fakesite');
const pages = ['index.html','blog.html','faq.html','editor.html','how-to-measure-truck-bed-for-tonneau-cover.html','how-to-choose-running-boards-fitment.html'];
let references=0;
for (const page of pages) {
  const html = fs.readFileSync(path.join(root,page),'utf8');
  assert.match(html,/name="robots" content="noindex,nofollow"/,page);
  assert.equal((html.match(/<h1[ >]/g)||[]).length,1,page);
  assert.doesNotMatch(html,/127\.0\.0\.1|\/Users\/|file:\/\//,page);
  assert.doesNotMatch(html,/<script[^>]+src="https?:/,page);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length,`${page}: duplicate IDs`);
  for (const [,url] of html.matchAll(/(?:src|srcset|href)="([^"]+)"/g)) {
    if (/^(https:|data:|mailto:)/.test(url)) continue;
    const [target,hash] = url.split('#');
    const resolved = target ? path.resolve(root,target) : path.join(root,page);
    assert.ok(fs.existsSync(resolved),`${page}: missing ${url}`);
    if(hash && path.extname(resolved)==='.html') assert.match(fs.readFileSync(resolved,'utf8'),new RegExp(`id="${hash}"`),`${page}: missing target ${hash}`);
    references++;
  }
  assert.match(html,/href="\.\/faq.html"/);
}
const blog = fs.readFileSync(path.join(root,'blog.html'),'utf8');
assert.match(blog,/class="sr-only" role="status"/);
assert.match(blog,/cover-truck-bed.png/);
assert.match(blog,/cover-running-boards.png/);
const faq = fs.readFileSync(path.join(root,'faq.html'),'utf8');
assert.equal((faq.match(/class="faq-question"/g)||[]).length,10);
for (const page of pages.filter(page=>page.startsWith('how-to'))) {
  const html=fs.readFileSync(path.join(root,page),'utf8');
  assert.ok(html.replace(/<[^>]+>/g,' ').length>5000);
  assert.match(html,/<table>/);
}
const editor = require(path.join(root,'editor.js'));
const valid = {title:'Example',slug:'example',description:'A summary',category:'running-boards',author:'',bodyMarkdown:'<img src=x onerror=alert(1)>\n\n## Heading'};
const memory = new Map();
const storage = {setItem:(key,value)=>memory.set(key,value),getItem:key=>memory.get(key)??null};
editor.saveDraft(storage,valid);
assert.deepEqual(editor.restoreDraft(storage),editor.validateDraft(valid));
assert.equal(editor.restoreDraft(storage).status,'draft');
assert.throws(()=>editor.validateDraft({...valid,slug:'../unsafe'}));
assert.throws(()=>editor.saveDraft({setItem(){throw Error('storage unavailable');}},valid));
assert.equal(editor.markdownBlocks(valid.bodyMarkdown)[0].text,'<img src=x onerror=alert(1)>');
assert.match(fs.readFileSync(path.join(root,'editor.html'),'utf8'),/<form[^>]+inert/);
assert.doesNotMatch(fs.readFileSync(path.join(root,'editor.js'),'utf8'),/innerHTML|fetch\(|XMLHttpRequest/);
console.log(`Fakesite passes: ${pages.length} pages, ${references} references, 10 FAQs, draft safety checks.`);
