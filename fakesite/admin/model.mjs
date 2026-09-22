export const SCHEMA_VERSION = 1;
export const MAX_DOCUMENTS = 500;
export const MAX_TRANSFER_BYTES = 4000000;
export const byteLength = value => new TextEncoder().encode(JSON.stringify(value)).length;
export const CATEGORIES = ['bed-covers', 'running-boards', 'floor-mats', 'bumpers', 'ownership'];
export const FAQ_CATEGORIES = ['Buying & fitment','Measuring','Installation & safety','Orders','Shipping','Returns & warranty','Care & troubleshooting'];
export class ContentError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = (message, status) => { throw new ContentError(message, status); };
const copy = value => structuredClone(value);
export const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function safeUrl(value, image = false) {
  if (image && typeof value === 'string' && /^data:image\/(?:jpeg|png|webp);base64,/.test(value)) {
    if (value.length > 250000 || !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
    try {
      const bytes = atob(value.slice(value.indexOf(',') + 1));
      if (value.startsWith('data:image/jpeg;')) return bytes.startsWith('\xff\xd8\xff');
      if (value.startsWith('data:image/png;')) return bytes.startsWith('\x89PNG\r\n\x1a\n');
      return bytes.startsWith('RIFF') && bytes.slice(8,12) === 'WEBP';
    } catch { return false; }
  }
  if (typeof value !== 'string' || value.length > 2048 || /[\s<>"'\\]/.test(value)) return false;
  if (!image && /^(?:(?:\.\/|\.\.\/)?[a-z0-9]+(?:-[a-z0-9]+)*\.html(?:#[a-zA-Z0-9_-]+)?|#[a-zA-Z0-9_-]+)$/.test(value)) return true;
  if (image && /^(?:\.\/|\.\.\/)?assets\/[a-zA-Z0-9_./-]+$/.test(value) && !value.includes('/../')) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password; } catch { return false; }
}
function plain(value, name, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`${name}: ${required ? 'required, ' : ''}maximum ${max} characters.`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) fail(`${name}: invalid control character.`);
  return value.trim();
}
export function validateDelta(delta) {
  if (!delta || !Array.isArray(delta.ops) || delta.ops.length > 10000 || JSON.stringify(delta).length > 1000000) fail('Body is invalid or exceeds 1 MB.');
  const ops = delta.ops.map(op => {
    if (!op || Object.keys(op).some(key => !['insert', 'attributes'].includes(key))) fail('Body contains unsupported operations.');
    let insert;
    if (typeof op.insert === 'string') insert = op.insert;
    else if (op.insert && Object.keys(op.insert).length === 1 && safeUrl(op.insert.image, true)) insert = {image: op.insert.image};
    else fail('Body embeds must be raster images, HTTPS images or site assets.');
    const attributes = {};
    for (const [key, value] of Object.entries(op.attributes || {})) {
      if (['bold', 'italic', 'underline', 'strike', 'blockquote'].includes(key) && value === true) attributes[key] = true;
      else if (key === 'header' && [2, 3].includes(value)) attributes[key] = value;
      else if (key === 'list' && ['ordered', 'bullet'].includes(value)) attributes[key] = value;
      else if (key === 'link' && safeUrl(value)) attributes[key] = value;
      else if (key === 'alt' && typeof value === 'string' && value.length <= 250) attributes[key] = value;
      else fail(`Unsupported body format: ${key}.`);
    }
    return Object.keys(attributes).length ? {insert, attributes} : {insert};
  });
  return {ops};
}
export function validateContent(input, type = 'article') {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Content object required.');
  const allowed = ['title','slug','summary','seoTitle','metaDescription','category','coverUrl','coverAlt','delta'];
  if (Object.keys(input).some(key => !allowed.includes(key))) fail('Unknown content field. HTML payloads are not accepted.');
  const content = {
    title: plain(input.title, 'Title', 180, true), slug: plain(input.slug, 'Slug', 120, true),
    summary: plain(input.summary || '', 'Summary', 600), seoTitle: plain(input.seoTitle || '', 'SEO title', 180),
    metaDescription: plain(input.metaDescription || '', 'Meta description', 320), category: input.category,
    coverUrl: plain(input.coverUrl || '', 'Cover URL', 250000), coverAlt: plain(input.coverAlt || '', 'Cover description', 250),
    delta: validateDelta(input.delta)
  };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(content.slug)) fail('Slug: use lowercase words separated by hyphens.');
  if (type === 'article' && ['index','blog','faq'].includes(content.slug)) fail('This URL belongs to a fixed site page.',409);
  if (!(type === 'faq' ? FAQ_CATEGORIES : CATEGORIES).includes(content.category)) fail('Choose a valid category.');
  if (content.coverUrl && !safeUrl(content.coverUrl, true)) fail('Cover: choose a raster image file, an HTTPS image or a site asset path.');
  if (content.coverUrl && !content.coverAlt) fail('Describe the cover image for screen readers.');
  if (!['article', 'faq'].includes(type)) fail('Unknown content type.');
  return content;
}
export function renderDelta(delta) {
  const validated = validateDelta(delta);
  let html = '', line = '', list = '';
  const closeList = () => { if (list) { html += `</${list}>`; list = ''; } };
  for (const op of validated.ops) {
    const a = op.attributes || {};
    if (typeof op.insert !== 'string') { line += `<img src="${escapeHtml(op.insert.image)}" alt="${escapeHtml(a.alt || '')}" loading="lazy" referrerpolicy="no-referrer">`; continue; }
    const parts = op.insert.split('\n');
    for (let i = 0; i < parts.length; i++) {
      let text = escapeHtml(parts[i]);
      for (const [key, tag] of [['bold','strong'],['italic','em'],['underline','u'],['strike','s']]) if (a[key]) text = `<${tag}>${text}</${tag}>`;
      if (a.link) text = `<a href="${escapeHtml(a.link)}" rel="noopener noreferrer" target="_blank">${text}</a>`;
      line += text;
      if (i === parts.length - 1) continue;
      if (a.list) {
        const tag = a.list === 'ordered' ? 'ol' : 'ul';
        if (list !== tag) { closeList(); html += `<${tag}>`; list = tag; }
        html += `<li>${line || '<br>'}</li>`;
      } else { closeList(); const tag = a.header ? `h${a.header}` : a.blockquote ? 'blockquote' : 'p'; html += `<${tag}>${line || '<br>'}</${tag}>`; }
      line = '';
    }
  }
  closeList(); if (line) html += `<p>${line}</p>`;
  return html;
}
function revision(doc, actor, action, note = '') {
  doc.version += 1; doc.updatedAt = new Date().toISOString();
  doc.history.push({version: doc.version, at: doc.updatedAt, actor: actor.id, role: actor.role, action, note, status: doc.status, content: copy(doc.content)});
  return doc;
}
export function createDocument({id, type = 'article', content}, actor) {
  if (!actor || !['writer','editor'].includes(actor.role)) fail('Writing access required.', 403);
  return revision({id, type, ownerId: actor.id, status: 'draft', version: 0, content: validateContent(content, type), history: [], publishedVersion: null}, actor, 'create');
}
export function changeDocument(original, command, actor) {
  if (!actor || !['writer','editor'].includes(actor.role)) fail('Writing access required.', 403);
  if (actor.role === 'writer' && original.ownerId !== actor.id) fail('You can edit only your own content.', 403);
  if (command.expectedVersion !== original.version) fail('A newer version exists. Reload before editing.', 409);
  const doc = copy(original), action = command.action;
  if (action === 'save') {
    if (doc.status !== 'draft') fail('Start a new draft before editing this content.', 409);
    doc.content = validateContent(command.content, doc.type);
  } else if (action === 'submit') {
    if (doc.status !== 'draft') fail('Only a draft can be submitted.', 409);
    if (!doc.content.delta.ops.some(op => typeof op.insert === 'string' && op.insert.trim())) fail('Write the body before submitting.');
    if (doc.type === 'article' && (!doc.content.summary || !doc.content.metaDescription || !doc.content.seoTitle)) fail('Add summary, SEO title and meta description before review.');
    doc.status = 'review';
  } else if (action === 'withdraw') {
    if (actor.role !== 'editor') fail('An editor must perform this action.', 403);
    if (!doc.publishedVersion) fail('There is no published snapshot to withdraw.', 409);
    doc.publishedVersion = null;
    if (doc.status === 'published') doc.status = 'withdrawn';
  } else if (['approve','publish','return'].includes(action)) {
    if (actor.role !== 'editor') fail('An editor must perform this action.', 403);
    const from = {approve: 'review', publish: 'approved', return: ['review','approved']}[action];
    if (!(Array.isArray(from) ? from.includes(doc.status) : doc.status === from)) fail(`Cannot ${action} from ${doc.status}.`, 409);
    if (action === 'return' && !String(command.note || '').trim()) fail('Add an editorial note before returning the draft.');
    doc.status = {approve:'approved',publish:'published',return:'draft'}[action];
    if (action === 'publish') doc.publishedVersion = doc.version + 1;
  } else if (action === 'revise' || action === 'restore') {
    if (['review','approved'].includes(doc.status)) fail('An editor must return this content before revision.', 409);
    if (action === 'revise' && !['published','withdrawn'].includes(doc.status)) fail('This content is already a draft.', 409);
    if (action === 'restore') {
      const prior = doc.history.find(item => item.version === command.restoreVersion);
      if (!prior) fail('Revision not found.', 404);
      doc.content = copy(prior.content);
    }
    doc.status = 'draft';
  } else fail('Unknown action.');
  return revision(doc, actor, action, plain(command.note || '', 'Editorial note', 2000));
}
export function portableExport(documents) {
  const payload = {schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), environment: 'disconnected-editorial-workspace', documents: documents.map(doc => ({type: doc.type, content: copy(doc.content), history: copy(doc.history)}))};
  if (documents.length > MAX_DOCUMENTS || byteLength(payload) > MAX_TRANSFER_BYTES) fail('Backup exceeds 500 documents or 4 MB. Export smaller parts or the current draft.');
  return payload;
}
export function portableImport(payload, actor, idFactory, existing = []) {
  if (!payload || payload.schemaVersion !== SCHEMA_VERSION || !Array.isArray(payload.documents) || payload.documents.length > MAX_DOCUMENTS || byteLength(payload) > MAX_TRANSFER_BYTES) fail('Choose a version 1 export with at most 500 documents and 4 MB.');
  if (existing.length + payload.documents.length > MAX_DOCUMENTS) fail('This import would exceed the 500-document workspace limit. No documents were added.');
  const incoming = payload.documents.map(item => createDocument({id: idFactory(), type: item.type, content: item.content}, actor));
  const occupied = new Set(existing.flatMap(reservedRoutes));
  for (const doc of incoming) {
    const originalSlug = doc.content.slug;
    let suffix = 0;
    while (occupied.has(publicRoute(doc.type,doc.content.slug))) doc.content.slug = `${originalSlug.slice(0,95)}-copy-${doc.id.slice(0,8)}${suffix++ ? `-${suffix}` : ''}`;
    doc.history[0].content.slug = doc.content.slug;
    occupied.add(publicRoute(doc.type,doc.content.slug));
  }
  assertWorkspaceWritable([...existing,...incoming]);
  return incoming;
}
export function publicRoute(type,slug) {
  return type === 'faq' ? `faq.html#${slug}` : `${slug}.html`;
}
export function reservedRoutes(doc) {
  const routes = [publicRoute(doc.type,doc.content.slug)];
  if (doc.publishedVersion) {
    const snapshot = doc.history.find(item => item.version === doc.publishedVersion && item.action === 'publish');
    if (!snapshot) fail('Published snapshot is missing.',409);
    routes.push(publicRoute(doc.type,snapshot.content.slug));
  }
  return [...new Set(routes)];
}
export function assertRouteReservations(documents) {
  const routes = new Map([['index.html','fixed-page'],['blog.html','fixed-page'],['faq.html','fixed-page']]);
  const ids = new Set();
  for (const doc of documents) {
    if (ids.has(doc.id)) fail('Duplicate document ID.',409);
    ids.add(doc.id);
    for (const route of reservedRoutes(doc)) {
      if (routes.has(route)) fail(`Slug already exists or is reserved by a published snapshot: ${route}`,409);
      routes.set(route,doc.id);
    }
  }
}
export function assertDocumentAvailable(document,documents) {
  assertWorkspaceWritable([...documents.filter(doc => doc.id !== document.id),document]);
}
export function assertWorkspaceWritable(documents) {
  if (documents.length > MAX_DOCUMENTS) fail('The workspace is limited to 500 documents. Export a backup before starting another workspace.');
  if (byteLength({schemaVersion:SCHEMA_VERSION,documents}) > MAX_TRANSFER_BYTES - 1024) fail('The workspace has reached its 4 MB backup limit. Export the saved workspace or the unsaved current draft before continuing.');
  assertRouteReservations(documents);
}
export function portableExportParts(documents) {
  const parts = [];
  let batch = [];
  for (const doc of documents) {
    try { portableExport([...batch,doc]); batch.push(doc); }
    catch (error) {
      if (!batch.length) throw error;
      parts.push(portableExport(batch)); batch = [doc]; portableExport(batch);
    }
  }
  if (batch.length || !parts.length) parts.push(portableExport(batch));
  return parts;
}
export function publishedExport(documents, actor) {
  if (actor?.role !== 'editor') fail('An editor must export published snapshots.', 403);
  const snapshots = documents.filter(doc => doc.publishedVersion).map(doc => {
    const published = doc.history.find(item => item.version === doc.publishedVersion);
    if (!published || published.action !== 'publish') fail('Published snapshot is missing.', 409);
    return {id:doc.id,type:doc.type,version:published.version,publishedAt:published.at,content:validateContent(published.content,doc.type)};
  });
  const publicRoutes = new Set(['index.html','blog.html','faq.html']);
  for (const snapshot of snapshots) {
    const route = publicRoute(snapshot.type,snapshot.content.slug);
    if (publicRoutes.has(route)) fail(`Duplicate public route: ${route}`,409);
    publicRoutes.add(route);
  }
  const articles = snapshots.filter(item => item.type === 'article').map(item => {
    const c = item.content;
    return {id:item.id,slug:c.slug,title:c.title,description:c.metaDescription,seoTitle:c.seoTitle,category:c.category,categoryLabel:c.category.split('-').join(' '),author:{name:'OEDRO Editorial',type:'Organization'},publishedAt:item.publishedAt,modifiedAt:item.publishedAt,readingMinutes:Math.max(1,Math.ceil(c.delta.ops.map(op => typeof op.insert === 'string' ? op.insert : '').join('').split(/\s+/).length/220)),cover:{src:c.coverUrl.replace(/^\.\.\/assets\//,'assets/'),alt:c.coverAlt,caption:''},intro:c.summary,bodyHtml:renderPublicBody(c.delta),sections:[],related:[],productLinks:[],sources:[],factNotes:['Workflow export: source verification and official publication approval are separate release requirements.']};
  });
  const faqs = snapshots.filter(item => item.type === 'faq').map(item => ({id:item.content.slug,category:item.content.category,question:item.content.title,answerHtml:renderPublicBody(item.content.delta),sources:[],related:[]}));
  return {schemaVersion:SCHEMA_VERSION,environment:'disconnected-editorial-workspace',delivery:'review-package-not-deployed',exportedAt:new Date().toISOString(),snapshots,articles,faqs,mediaRequiresProductionUpload:snapshots.some(item => item.content.coverUrl.startsWith('data:') || item.content.delta.ops.some(op => typeof op.insert === 'object' && op.insert.image.startsWith('data:')))};
}
function renderPublicBody(delta) {
  return renderDelta(delta).replace(/\b(src|href)="\.\.\//g,'$1="./');
}
