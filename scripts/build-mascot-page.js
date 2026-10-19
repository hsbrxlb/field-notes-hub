#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(process.env.PUBLIC_SITE_ROOT || path.join(__dirname, '..'));
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

async function renderMascotPage() {
  const elements = new Map();
  const element = (selector) => {
    if (!elements.has(selector)) elements.set(selector, { innerHTML: '', textContent: '', content: '', setAttribute() {} });
    return elements.get(selector);
  };
  const context = {
    window: { fetchHubJSON: async (name) => JSON.parse(read(name)) },
    document: { body: { dataset: {} }, querySelector: element, getElementById: () => null },
    location: { pathname: '/mascot.html', hash: '' },
    console: { error(error) { throw error; } },
    data: JSON.parse(read('data/content.json'))
  };
  vm.createContext(context);
  // Reuse the shared navigation renderer without executing browser startup.
  const app = read('app.js');
  const functions = ['escapeHtml', 'renderShell'].map((name) => {
    const match = app.match(new RegExp(`function ${name}\\([^]*?\\n}`, 'm'));
    if (!match) throw new Error(`Cannot find shared renderer: ${name}`);
    return match[0];
  });
  vm.runInContext(`const page = 'mascot';\n${functions.join('\n')}\nrenderShell(data);`, context);
  vm.runInContext(read('mascot.js'), context);
  await context.window.initMascot();
  const content = element('#content').innerHTML;
  if (!content.includes('class="evo-character-list"')) throw new Error('Mascot renderer did not produce the gallery');
  let html = read('mascot.html');
  for (const [name, value] of [
    ['styles', '<style id="mascot-styles">' + ['base.css', 'theme.css', 'mascot.css'].map((name) => `/* ${name} */\n${read(name)}`).join('\n') + '</style>'],
    ['nav', element('#nav-list').innerHTML],
    ['breadcrumb', element('#breadcrumb-page').textContent],
    ['content', content]
  ]) {
    const pattern = new RegExp(`(<!-- mascot-${name}:start -->)[^]*?(<!-- mascot-${name}:end -->)`);
    if (!pattern.test(html)) throw new Error(`Missing mascot snapshot markers: ${name}`);
    html = html.replace(pattern, (_, start, end) => start + value + end);
  }
  const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  html = html.replace(/<title>[^]*?<\/title>/, () => `<title>${escape(context.document.title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(">)/, (_, start, end) => start + escape(element('meta[name="description"]').content) + end);
  return html;
}

if (require.main === module) renderMascotPage().then((html) => {
  if (process.argv.includes('--check')) {
    if (html !== read('mascot.html')) throw new Error('Mascot HTML snapshot is stale; run node scripts/build-mascot-page.js');
    console.log('Mascot static snapshot is synchronized.');
  } else {
    fs.writeFileSync(path.join(root, 'mascot.html'), html);
    console.log('Built mascot static navigation and complete gallery.');
  }
}).catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = { renderMascotPage };
