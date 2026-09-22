import {CATEGORIES, FAQ_CATEGORIES, SCHEMA_VERSION, createDocument, changeDocument, validateContent, validateDelta, renderDelta, escapeHtml, safeUrl, portableExport, portableExportParts, portableImport, publishedExport, assertWorkspaceWritable} from './model.mjs';

const $ = id => document.getElementById(id);
const e = escapeHtml;
const STORAGE = 'oedro-editorial-sandbox-v1';
const STATUS = {draft:'Draft',review:'In review',approved:'Approved',published:'Published in demo',withdrawn:'Withdrawn'};
const fields = ['title','slug','summary','seoTitle','metaDescription','category','coverUrl','coverAlt'];
let documents = [], selected = null, dirty = false, loadingEditor = false;
let embeddedCover = '', embeddedImage = '';
const editor = new Quill('#editor', {theme:'snow', formats:['bold','italic','underline','strike','header','list','blockquote','link','image','alt'], modules:{toolbar:'#toolbar', uploader:{mimetypes:[]}, history:{delay:700,maxStack:100,userOnly:true}}});
editor.root.setAttribute('aria-label', 'Article body');
const actor = () => ({id: $('role').value === 'writer' ? 'demo-writer' : 'demo-editor', role:$('role').value});
const current = () => documents.find(doc => doc.id === selected);
const notice = (message, error = false) => { $('message').textContent = message; $('message').classList.toggle('error', error); };
const run = operation => { try { operation(); } catch (error) { notice(error.message, true); } };
const dateLabel = value => new Date(value).toLocaleString(undefined, {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
const categoryLabel = value => value.split('-').map(word => word[0].toUpperCase()+word.slice(1)).join(' ');
const slugify = value => value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100) || 'untitled';

function readStored() {
  const raw = localStorage.getItem(STORAGE);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.documents)) throw new Error('Saved workspace is invalid. Export or recover browser data before continuing.');
  for (const doc of parsed.documents) {
    validateContent(doc.content, doc.type);
    if (!Object.hasOwn(STATUS, doc.status) || !Array.isArray(doc.history) || !Number.isSafeInteger(doc.version)) throw new Error('Saved workflow record is invalid.');
    for (const item of doc.history) validateContent(item.content, doc.type);
  }
  return parsed.documents;
}
function persist(next) {
  assertWorkspaceWritable(next);
  const payload = JSON.stringify({schemaVersion:SCHEMA_VERSION,documents:next});
  try { localStorage.setItem(STORAGE, payload); } catch { throw new Error('Browser storage is full or unavailable. Your unsaved text is still open; export a backup or reduce image/content size.'); }
  documents = next;
}
function drawLibrary() {
  const query = $('search').value.trim().toLowerCase();
  const visible = documents.filter(doc => ($('status-filter').value === 'all' || doc.status === $('status-filter').value) && ($('type-filter').value === 'all' || doc.type === $('type-filter').value) && `${doc.content.title} ${doc.content.slug}`.toLowerCase().includes(query)).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  $('rows').innerHTML = visible.map(doc => `<tr><td><button class="row-title" data-open="${e(doc.id)}">${e(doc.content.title)}</button><div class="slug-text">/${e(doc.content.slug)}</div></td><td>${doc.type === 'faq' ? 'FAQ' : 'Article'}<br><span class="muted">${e(categoryLabel(doc.content.category))}</span></td><td><span class="status status-${e(doc.status)}">${STATUS[doc.status]}</span>${doc.publishedVersion && doc.status !== 'published' ? '<br><span class="muted">Previous version published in demo</span>' : ''}</td><td class="muted">${e(dateLabel(doc.updatedAt))}<br>Version ${doc.version}</td></tr>`).join('') || '<tr><td colspan="4">No content matches these filters.</td></tr>';
  $('count').textContent = `${visible.length} of ${documents.length} items`;
}
function setDirty() {
  if (loadingEditor || !selected) return;
  dirty = true; $('save-state').textContent = 'Unsaved changes';
  updateCounts();
}
function updateCounts() {
  $('word-count').textContent = `${editor.getText().trim().split(/\s+/).filter(Boolean).length} words`;
  $('seo-count').textContent = `SEO title ${$('seoTitle').value.length} characters · Description ${$('metaDescription').value.length}`;
}
function confirmLeave() { return !dirty || window.confirm('Leave without saving these changes?'); }
function openDocument(id) {
  if (!confirmLeave()) return;
  selected = id; const doc = current();
  if (!doc) throw new Error('Content not found.');
  loadingEditor = true;
  $('category').innerHTML = (doc.type === 'faq' ? FAQ_CATEGORIES : CATEGORIES).map(value => `<option value="${e(value)}">${e(categoryLabel(value))}</option>`).join('');
  fields.forEach(key => { $(key).value = doc.content[key]; });
  embeddedCover = doc.content.coverUrl.startsWith('data:') ? doc.content.coverUrl : '';
  if (embeddedCover) $('coverUrl').value = '';
  updateCoverPreview(doc.content.coverUrl);
  editor.setContents(doc.content.delta); editor.history.clear();
  $('review-note').value = ''; loadingEditor = false; dirty = false;
  $('library').hidden = true; $('workspace').hidden = false;
  $('save-state').textContent = 'Saved in this browser';
  updateCounts(); updateWorkflow(); window.scrollTo(0,0); $('title').focus();
}
function updateWorkflow() {
  const doc = current(); if (!doc) return;
  const editable = doc.status === 'draft';
  const isEditor = actor().role === 'editor';
  fields.forEach(key => { $(key).disabled = !editable; });
  editor.enable(editable); $('save').disabled = !editable; $('add-image').disabled = !editable;
  $('cover-file').disabled = !editable;
  $('toolbar').querySelectorAll('button,select').forEach(control => { control.disabled = !editable; });
  $('document-state').textContent = `${doc.type === 'faq' ? 'FAQ' : 'Article'} · ${STATUS[doc.status]}`;
  $('version').textContent = `Version ${doc.version}${doc.publishedVersion && doc.status !== 'published' ? ` · Demo published snapshot v${doc.publishedVersion}` : ''}`;
  const options = [];
  if (doc.status === 'draft') options.push(['submit','Submit for review']);
  if (isEditor && doc.status === 'review') options.push(['return','Request changes'],['approve','Approve']);
  if (isEditor && doc.status === 'approved') options.push(['return','Request changes'],['publish','Publish in demo']);
  if (['published','withdrawn'].includes(doc.status)) options.push(['revise','Start revision']);
  if (isEditor && doc.publishedVersion) options.push(['withdraw','Withdraw from demo']);
  $('workflow-actions').innerHTML = options.map(([action,label]) => `<button data-action="${action}"${['submit','approve','publish'].includes(action) ? ' class="primary"' : ''}>${label}</button>`).join('');
}
function contentFromEditor() {
  return validateContent({...Object.fromEntries(fields.map(key => [key,$(key).value])),coverUrl:embeddedCover || $('coverUrl').value,delta:editor.getContents()}, current().type);
}
function commit(action, extra = {}) {
  const doc = current();
  const latest = readStored() || documents;
  const stored = latest.find(item => item.id === selected);
  if (!stored || stored.version !== doc.version) throw new Error('This item changed in another tab. Export unsaved text, then reload to continue.');
  const next = changeDocument(stored, {action,expectedVersion:doc.version,note:$('review-note').value,...extra}, actor());
  persist(latest.map(item => item.id === selected ? next : item));
  dirty = false; $('save-state').textContent = 'Saved in this browser'; updateWorkflow(); drawLibrary();
  return next;
}
function save() { commit('save', {content:contentFromEditor()}); notice('Draft saved. A new version is available in History.'); }
function newDocument(type) {
  if (!confirmLeave()) return;
  const id = crypto.randomUUID();
  const doc = createDocument({id,type,content:{title:type === 'faq' ? 'Untitled question' : 'Untitled article',slug:`${type}-${id.slice(0,8)}`,category:type === 'faq' ? FAQ_CATEGORIES[0] : 'ownership',delta:{ops:[{insert:'\n'}]}}}, actor());
  persist([...(readStored() || documents),doc]); dirty = false; openDocument(id); notice('New draft created.');
}
function showPreview(content = contentFromEditor(), label = 'Working draft') {
  $('preview-content').innerHTML = `<p class="muted">${e(label)} · ${e(categoryLabel(content.category))}</p><h1>${e(content.title)}</h1><p>${e(content.summary)}</p>${content.coverUrl ? `<img src="${e(content.coverUrl)}" alt="${e(content.coverAlt)}" referrerpolicy="no-referrer">` : ''}${renderDelta(content.delta)}`;
  $('preview-dialog').showModal();
}
function showHistory() {
  const doc = current();
  $('history-list').innerHTML = [...doc.history].reverse().map(item => `<div class="history-item"><div><strong>Version ${item.version} · ${e(item.action)}</strong><p>${e(dateLabel(item.at))} · ${e(item.role)} · ${e(STATUS[item.status] || item.status)}</p>${item.note ? `<p>${e(item.note)}</p>` : ''}</div><div class="actions"><button data-history-preview="${item.version}">View</button><button data-restore="${item.version}" ${['review','approved'].includes(doc.status) ? 'disabled' : ''}>Restore as draft</button></div></div>`).join('');
  $('history-dialog').showModal();
}
function download(payload, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
function updateCoverPreview(url) {
  $('cover-preview').hidden = !url;
  if (url && safeUrl(url,true)) $('cover-preview').src = url;
  else $('cover-preview').removeAttribute('src');
  $('coverUrl').placeholder = embeddedCover ? 'Local image selected; paste a URL to replace it' : 'https://…';
}
async function readRaster(file) {
  if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 2000000) throw new Error('Choose a JPG, PNG or WebP image up to 2 MB.');
  const bytes = new Uint8Array(await file.slice(0,12).arrayBuffer());
  const signature = String.fromCharCode(...bytes);
  const matches = file.type === 'image/jpeg' ? signature.startsWith('\xff\xd8\xff') : file.type === 'image/png' ? signature.startsWith('\x89PNG\r\n\x1a\n') : signature.startsWith('RIFF') && signature.slice(8,12) === 'WEBP';
  if (!matches) throw new Error('This file is not a valid JPG, PNG or WebP image.');
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 25000000) throw new Error('Choose an image with no more than 25 million pixels.');
    const canvas = document.createElement('canvas');
    let width = Math.min(bitmap.width,1600);
    for (let attempt=0;attempt<8;attempt++) {
      canvas.width = Math.round(width); canvas.height = Math.max(1,Math.round(width*bitmap.height/bitmap.width));
      const context = canvas.getContext('2d'); context.fillStyle = '#ffffff'; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const encoded = canvas.toDataURL('image/jpeg',.8);
      if (encoded.length <= 200000) return encoded;
      width *= .8;
    }
    throw new Error('This image cannot fit browser storage. Choose a smaller image.');
  } finally { bitmap.close(); }
}
function seedDelta(html) {
  const converted = editor.clipboard.convert({html});
  for (const op of converted.ops) {
    if (typeof op.insert === 'object' && op.insert.image) op.insert.image = op.insert.image.replace(/^(?:\.\/)?assets\//,'../assets/');
    if (op.attributes) {
      for (const key of Object.keys(op.attributes)) if (!['bold','italic','underline','strike','header','list','blockquote','link','alt'].includes(key)) delete op.attributes[key];
      if (op.attributes.header && ![2,3].includes(op.attributes.header)) op.attributes.header = 2;
      if (op.attributes.link && !safeUrl(op.attributes.link)) delete op.attributes.link;
      if (op.attributes.link && /^(?:\.\/)?[a-z0-9-]+\.html/.test(op.attributes.link)) op.attributes.link = `../${op.attributes.link.replace(/^\.\//,'')}`;
    }
  }
  if (typeof converted.ops.at(-1)?.insert !== 'string' || !converted.ops.at(-1).insert.endsWith('\n')) converted.ops.push({insert:'\n'});
  return validateDelta(converted);
}
function seedRecords(seed) {
  const writer = {id:'demo-writer',role:'writer'};
  const articles = Array.isArray(seed) ? seed : seed.articles || [];
  const faqs = Array.isArray(seed) ? [] : seed.faqs || [];
  return [...articles.map(article => ({type:'article',id:article.id || crypto.randomUUID(),title:article.title,slug:article.slug,summary:article.description || article.intro || '',seoTitle:article.seoTitle || article.title,metaDescription:article.description || '',category:article.category,coverUrl:article.cover?.src?.replace(/^(?:\.\/)?assets\//,'../assets/') || '',coverAlt:article.cover?.alt || '',html:`${article.intro && !(article.bodyHtml || '').includes(article.intro) ? `<p>${e(article.intro)}</p>` : ''}${article.bodyHtml || ''}`})),...faqs.map(faq => ({type:'faq',id:faq.id || crypto.randomUUID(),title:faq.question,slug:faq.id || `faq-${slugify(faq.question)}`,summary:'',seoTitle:faq.question,metaDescription:'',category:faq.category,coverUrl:'',coverAlt:'',html:faq.answerHtml || ''}))].map(item => {
    const {type,id,html,...content} = item;
    // Seed documents enter as drafts; the public edition is an independently built snapshot.
    return createDocument({id:`seed-${id}`,type,content:{...content,delta:seedDelta(html)}},writer);
  });
}

$('rows').addEventListener('click', event => { const button = event.target.closest('[data-open]'); if (button) run(() => openDocument(button.dataset.open)); });
['search','status-filter','type-filter'].forEach(id => $(id).addEventListener('input',drawLibrary));
fields.forEach(key => $(key).addEventListener('input',setDirty));
editor.on('text-change',setDirty);
$('new-article').onclick = () => run(() => newDocument('article'));
$('new-faq').onclick = () => run(() => newDocument('faq'));
$('save').onclick = () => run(save);
$('back').onclick = () => run(() => { if (!confirmLeave()) return; dirty = false; selected = null; $('workspace').hidden = true; $('library').hidden = false; drawLibrary(); });
$('role').onchange = () => { updateWorkflow(); $('export-published').hidden = actor().role !== 'editor'; notice(`Simulating ${actor().role}. This is not authentication.`); };
$('workflow-actions').onclick = event => { const button = event.target.closest('[data-action]'); if (!button) return; run(() => {
  if (dirty) throw new Error('Save your changes before changing workflow status.');
  const doc = commit(button.dataset.action); notice(button.dataset.action === 'publish' ? 'Published in this browser sandbox. Customer pages and the official site are unchanged.' : button.dataset.action === 'withdraw' ? 'Published snapshot withdrawn from the sandbox. The working draft is retained.' : `Content is now ${STATUS[doc.status].toLowerCase()}.`);
}); };
$('preview').onclick = () => run(() => showPreview(contentFromEditor(), dirty ? 'Unsaved working preview' : STATUS[current().status]));
$('history').onclick = () => run(showHistory);
$('history-list').onclick = event => run(() => {
  const preview = event.target.closest('[data-history-preview]'), restore = event.target.closest('[data-restore]');
  if (preview) { const version = Number(preview.dataset.historyPreview); const item = current().history.find(rev => rev.version === version); showPreview(item.content,`Version ${version} · ${STATUS[item.status]}`); }
  if (restore) { if (!confirmLeave()) return; commit('restore',{restoreVersion:Number(restore.dataset.restore)}); $('history-dialog').close(); openDocument(selected); notice('Revision restored as a new draft. Previous versions are retained.'); }
});
$('add-image').onclick = () => { embeddedImage = ''; $('image-form').reset(); $('image-error').textContent = ''; $('image-preview').hidden = true; $('image-dialog').showModal(); $('image-file').focus(); };
$('image-file').onchange = async event => {
  try { embeddedImage = await readRaster(event.target.files[0]); $('image-preview').src = embeddedImage; $('image-preview').hidden = false; $('image-url').value = ''; $('image-error').textContent = ''; }
  catch (error) { embeddedImage = ''; $('image-error').textContent = error.message; }
};
$('image-url').oninput = () => { embeddedImage = ''; $('image-preview').hidden = true; };
$('cover-file').onchange = async event => {
  try { embeddedCover = await readRaster(event.target.files[0]); $('coverUrl').value = ''; updateCoverPreview(embeddedCover); setDirty(); notice('Cover image added locally. Add its description, then save the draft.'); }
  catch (error) { notice(error.message,true); }
};
$('coverUrl').addEventListener('input',() => { embeddedCover = ''; updateCoverPreview($('coverUrl').value); });
$('image-form').onsubmit = event => { event.preventDefault(); run(() => {
  const url = embeddedImage || $('image-url').value.trim(), alt = $('image-alt').value.trim();
  if (!safeUrl(url,true) || !alt) throw new Error('Choose an image or enter an HTTPS image URL, and add a description.');
  const position = editor.getSelection(true)?.index ?? editor.getLength()-1;
  editor.insertEmbed(position,'image',url,'user'); editor.formatText(position,1,'alt',alt,'user'); editor.setSelection(position+1);
  $('image-dialog').close(); $('image-form').reset();
}); };
document.querySelectorAll('[data-close]').forEach(button => { button.onclick = () => $(button.dataset.close).close(); });
$('export-all').onclick = () => run(() => {
  const parts = portableExportParts(readStored() || documents);
  parts.forEach((payload,index) => download(payload,`oedro-content-backup-${new Date().toISOString().slice(0,10)}-part-${index+1}.json`));
  notice(`Workspace exported in ${parts.length} file(s), each within 500 documents and 4 MB. Imports create fresh drafts; history remains in the backup files.`);
});
$('export-published').onclick = () => run(() => { download(publishedExport(readStored() || documents,actor()),'oedro-published-review-package.json'); notice('Published snapshots exported for handoff. Source verification, production media upload and official delivery remain separate.'); });
$('export-draft').onclick = () => run(() => {
  const doc = {...current(),content:contentFromEditor(),history:[]};
  download(portableExport([doc]),`${doc.content.slug}-draft.json`);
  notice('Current text exported, including unsaved changes. Use Export workspace for revision history.');
});
$('import').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 4000000) throw new Error('Import is limited to 4 MB.');
    const latest = readStored() || documents;
    const incoming = portableImport(JSON.parse(await file.text()),actor(),() => crypto.randomUUID(),latest);
    persist([...latest,...incoming]); drawLibrary(); notice(`Imported ${incoming.length} items as new drafts.`);
  } catch (error) { notice(`Import failed: ${error.message}`,true); }
  event.target.value = '';
};
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('storage', event => { if (event.key === STORAGE) notice('This workspace changed in another tab. Reload after saving or exporting your work.',true); });
try {
  const stored = readStored();
  if (stored) documents = stored;
  else {
    const response = await fetch('./seed.json');
    if (!response.ok) throw new Error('Sample library could not load. Refresh once the site build is complete.');
    persist(seedRecords(await response.json()));
  }
  drawLibrary();
} catch (error) { notice(`Workspace could not load: ${error.message}`,true); $('new-article').disabled = true; $('new-faq').disabled = true; }
