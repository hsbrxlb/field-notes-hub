(function (root) {
  'use strict';
  const STORAGE_KEY = 'oedro-blog-draft-v1';
  const categories = {'tonneau-covers': 'Tonneau covers', 'running-boards': 'Running boards'};
  const fields = ['title', 'slug', 'description', 'category', 'author', 'bodyMarkdown'];
  function normalizeDraft(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Draft data is invalid.');
    const draft = {schemaVersion: 1, status: 'draft'};
    for (const key of fields) draft[key] = typeof value[key] === 'string' ? value[key].trim() : '';
    return draft;
  }
  function validateDraft(value) {
    const draft = normalizeDraft(value);
    if (!draft.title || draft.title.length > 180) throw new Error('Enter a title of 1–180 characters.');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug) || draft.slug.length > 120) throw new Error('Use a slug with lowercase letters, numbers, and single hyphens.');
    if (!draft.description || draft.description.length > 500) throw new Error('Enter a summary of 1–500 characters.');
    if (!Object.hasOwn(categories, draft.category)) throw new Error('Choose a category.');
    if (draft.author.length > 120) throw new Error('Keep the author name under 121 characters.');
    if (!draft.bodyMarkdown) throw new Error('Add body text.');
    return draft;
  }
  function markdownBlocks(markdown) {
    const blocks = [];
    for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
      if (!line.trim()) { blocks.push({type: 'break'}); continue; }
      const heading = /^(#{1,6})\s+(.+)$/.exec(line);
      const bullet = /^[-*]\s+(.+)$/.exec(line);
      if (heading) blocks.push({type: 'heading', level: Math.min(heading[1].length + 2, 6), text: heading[2]});
      else if (bullet) blocks.push({type: 'listItem', text: bullet[1]});
      else blocks.push({type: 'paragraph', text: line});
    }
    return blocks;
  }
  function saveDraft(storage, value) {
    const draft = validateDraft(value);
    storage.setItem(STORAGE_KEY, JSON.stringify(draft));
    return draft;
  }
  function restoreDraft(storage) {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (parsed.schemaVersion !== 1 || parsed.status !== 'draft') throw new Error('Saved draft format is unsupported.');
    return validateDraft(parsed);
  }
  function toMarkdown(value) {
    const draft = validateDraft(value);
    // JSON-quoted strings are valid YAML scalars and cannot inject front matter.
    const metadata = ['schemaVersion: 1', 'status: draft', ...['title', 'slug', 'description', 'category', 'author'].map(key => key + ': ' + JSON.stringify(draft[key]))];
    return '---\n' + metadata.join('\n') + '\n---\n\n' + draft.bodyMarkdown + '\n';
  }
  const api = {normalizeDraft, validateDraft, markdownBlocks, saveDraft, restoreDraft, toMarkdown, STORAGE_KEY};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root.document) return;
  function start() {
    const document = root.document;
    const form = document.getElementById('draft-form');
    if (!form) return;
    const status = document.getElementById('draft-status');
    const preview = document.getElementById('draft-preview-content');
    let dirty = false;
    function message(text, error = false) {status.textContent = text; status.dataset.error = String(error);}
    function read() {return normalizeDraft(Object.fromEntries(fields.map(key => [key, form.elements.namedItem(key).value])));}
    function node(tag, text, className) {const element = document.createElement(tag); element.textContent = text; if (className) element.className = className; return element;}
    function render() {
      const draft = read();
      preview.replaceChildren();
      if (!fields.some(key => draft[key])) {preview.append(node('p', 'Your draft will appear here as you type.', 'draft-empty')); return;}
      preview.append(node('h2', draft.title || 'Untitled draft'));
      const meta = [categories[draft.category], draft.author ? 'By ' + draft.author : ''].filter(Boolean).join(' · ');
      if (meta) preview.append(node('p', meta, 'draft-preview-meta'));
      if (draft.description) preview.append(node('p', draft.description, 'draft-preview-description'));
      const body = node('div', '', 'draft-preview-body');
      let current = null;
      for (const block of markdownBlocks(draft.bodyMarkdown)) {
        if (block.type === 'break') {current = null; continue;}
        if (block.type === 'listItem') {if (!current || current.tagName !== 'UL') {current = document.createElement('ul');body.append(current);} current.append(node('li', block.text));}
        else if (block.type === 'paragraph' && current && current.tagName === 'P') current.textContent += '\n' + block.text;
        else {current = node(block.type === 'heading' ? 'h' + block.level : 'p', block.text);body.append(current);if (block.type === 'heading') current = null;}
      }
      preview.append(body);
    }
    function fill(draft) {for (const key of fields) form.elements.namedItem(key).value = draft[key] || '';render();}
    function canReplace() {return !dirty || root.confirm('Replace your unsaved changes?');}
    function validated() {if (!form.reportValidity()) return null;try {return validateDraft(read());} catch (error) {message(error.message, true);return null;}}
    form.addEventListener('input', () => {dirty = true;render();message('Unsaved changes. Save in this browser or download a copy.');});
    form.addEventListener('submit', event => {event.preventDefault();const draft = validated();if (!draft) return;try {const previous=root.localStorage.getItem(STORAGE_KEY);if(previous && previous!==JSON.stringify(draft) && !root.confirm("Replace the draft already saved in this browser? Cancel to restore and download it first."))return;saveDraft(root.localStorage, draft);dirty = false;message('Saved in this browser. Nothing has been published.');} catch (error) {message('Could not save in this browser. Download a copy to keep your work.', true);}});
    document.getElementById('draft-restore').addEventListener('click', () => {try {const draft = restoreDraft(root.localStorage);if (!draft) {message('No saved draft found in this browser.');return;}if (!canReplace()) return;fill(draft);dirty = false;message('Restored the saved draft from this browser.');} catch (error) {message('Could not restore a valid saved draft. Your current text is unchanged.', true);}});
    document.getElementById('draft-sample').addEventListener('click', () => {if (!canReplace()) return;fill({title:'Before choosing a tonneau cover',slug:'before-choosing-a-tonneau-cover',description:'A short checklist to start your fitment research.',category:'tonneau-covers',author:'',bodyMarkdown:'## Start with your truck\n\n- Record the year, make, and model.\n- Measure the inside bed length.\n- Check the product listing for fitment details.\n\nConfirm compatibility before ordering.'});dirty = true;message('Sample loaded. It has not been saved.');});
    document.getElementById('draft-clear').addEventListener('click', () => {if (!root.confirm('Clear the current text and delete the saved draft from this browser? This cannot be undone.')) return;try {root.localStorage.removeItem(STORAGE_KEY);} catch (error) {message('Could not delete the saved draft. Current text has been kept.', true);return;}fill({});dirty = false;message('Current text and the saved browser draft were cleared.');});
    function download(format) {const draft = validated();if (!draft) return;let url;try {const content = format === 'md' ? toMarkdown(draft) : JSON.stringify(draft, null, 2) + '\n';url = root.URL.createObjectURL(new root.Blob([content], {type:format === 'md' ? 'text/markdown;charset=utf-8' : 'application/json'}));const link = document.createElement('a');link.href = url;link.download = draft.slug + '.' + format;document.body.append(link);link.click();link.remove();message('Download requested. Check your browser downloads. This does not save changes in the editor.');} catch (error) {message('Could not start the download. Your text is still in the editor.', true);} finally {if (url) root.setTimeout(() => root.URL.revokeObjectURL(url), 1000);}}
    document.getElementById('draft-markdown').addEventListener('click', () => download('md'));
    document.getElementById('draft-json').addEventListener('click', () => download('json'));
    root.addEventListener('beforeunload', event => {if (dirty) {event.preventDefault();event.returnValue = '';}});
    render();
    form.inert = false;
    try {if(root.localStorage.getItem(STORAGE_KEY))message("A saved draft is available. Restore it to continue. This browser keeps one saved draft.");} catch {message("Browser saving is unavailable. You can still write and download a draft.",true);}
  }
  if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, {once:true}); else start();
})(typeof window === 'undefined' ? globalThis : window);
