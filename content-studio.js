(() => {
  const pages = {
    studio: { category: 'content', title: '社媒内容生产', description: '已制作的社媒图文内容。', href: 'content-studio.html' },
    'research-library': { category: 'research', title: '研究与方案', description: '用户研究、运营分析与工作方案。', href: 'research-library.html' },
    'sites-systems': { category: 'system', title: '网站与系统', description: '网站、工具与系统的制作成果。', href: 'sites-systems.html' }
  };
  const page = pages[document.body.dataset.page];
  const allowedStatuses = new Set(['已完成', '进行中', '概念', '待确认']);
  let resultsConfig;

  function text(value) {
    return String(value ?? '');
  }

  function escapeHtml(value) {
    return text(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function resultLink(link) {
    const href = text(link.href);
    const external = href.startsWith('https://');
    const target = external ? ' target="_blank" rel="noreferrer"' : '';
    return `<a class="result-link" href="${escapeHtml(href)}"${target}>${escapeHtml(link.label)} <span aria-hidden="true">→</span></a>`;
  }

  function resultMarkup(item) {
    const links = (item.links || []).map(resultLink).join('');
    return `<article class="result-entry" id="${escapeHtml(item.id)}" data-searchable data-result-category="${escapeHtml(item.category)}">
      <header class="result-entry-head">
        <h2>${escapeHtml(item.title)}</h2>
      </header>
      <p class="result-description">${escapeHtml(item.description)}</p>
      <div class="result-links" aria-label="成果入口">${links || '<span class="result-link-muted">暂无单独入口</span>'}</div>
    </article>`;
  }

  function visibleResults() {
    return resultsConfig.results
      .filter((item) => item.category === page.category)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function renderResults() {
    const content = document.querySelector('#content');
    if (!content) return;
    const results = visibleResults();
    content.innerHTML = `
      <header class="page-heading">
        <h1 id="results-list-title">${escapeHtml(page.title)}</h1>
      </header>
      <section class="section results-surface" aria-labelledby="results-list-title">
        <div class="result-list" id="result-list">${results.map(resultMarkup).join('')}</div>
        <div class="empty-state result-empty" id="result-empty"${results.length ? ' hidden' : ''}><strong>暂无${escapeHtml(page.title)}记录</strong></div>
      </section>`;

    const anchor = decodeURIComponent(window.location.hash.slice(1));
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }));
  }

  window.initContentStudio = async () => {
    if (!page) throw new Error('内容页面入口不正确');
    const response = await fetch('data/content-studio.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('社媒内容生产数据加载失败');
    const config = await response.json();
    if (!config || config.title !== '社媒内容生产' || !Array.isArray(config.results)) {
      throw new Error('社媒内容生产数据格式不正确');
    }
    config.results.forEach((item) => {
      if (!item.id || !item.date || !allowedStatuses.has(item.status) || !Object.values(pages).some((entry) => entry.category === item.category)) {
        throw new Error('内容成果中有未完成的记录');
      }
    });
    resultsConfig = config;
    const anchor = decodeURIComponent(window.location.hash.slice(1));
    const linkedResult = config.results.find((item) => item.id === anchor);
    if (linkedResult && linkedResult.category !== page.category) {
      const destination = Object.values(pages).find((entry) => entry.category === linkedResult.category);
      window.location.replace(`${destination.href}#${encodeURIComponent(anchor)}`);
      return;
    }
    document.title = `${page.title}｜海外用户运营`;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = page.description;
    renderResults();
  };
})();
