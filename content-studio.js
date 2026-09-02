(() => {
  const categories = [
    { id: 'all', label: '全部' },
    { id: 'content', label: '内容' },
    { id: 'research', label: '研究与方案' },
    { id: 'system', label: '网站与系统' }
  ];
  const allowedStatuses = new Set(['已完成', '进行中', '概念', '待确认']);
  let resultsConfig;
  let activeCategory = 'all';

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

  function statusClass(status) {
    return {
      已完成: 'done',
      进行中: 'active',
      概念: 'ready',
      待确认: 'pending'
    }[status] || 'pending';
  }

  function formatDate(value) {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric'
    }).format(date);
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
        <div>
          <time class="result-date" datetime="${escapeHtml(item.date)}">${escapeHtml(formatDate(item.date))}</time>
          <h2>${escapeHtml(item.title)}</h2>
        </div>
        <span class="status status-${statusClass(item.status)}">${escapeHtml(item.status)}</span>
      </header>
      <dl class="result-facts">
        <div><dt>项目</dt><dd>${escapeHtml(item.project)}</dd></div>
        <div><dt>成果类型</dt><dd>${escapeHtml(item.type)}</dd></div>
        <div><dt>关联工作</dt><dd>${escapeHtml(item.related_work)}</dd></div>
      </dl>
      <p class="result-description">${escapeHtml(item.description)}</p>
      <p class="result-purpose"><strong>用途</strong>${escapeHtml(item.purpose)}</p>
      <div class="result-links" aria-label="成果入口">${links || '<span class="result-link-muted">暂无单独入口</span>'}</div>
    </article>`;
  }

  function visibleResults() {
    return resultsConfig.results
      .filter((item) => activeCategory === 'all' || item.category === activeCategory)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function renderResults() {
    const content = document.querySelector('#content');
    if (!content) return;
    const results = visibleResults();
    const total = resultsConfig.results.length;
    const categoryLabel = categories.find((item) => item.id === activeCategory)?.label || '全部';
    const featured = resultsConfig.results.find((item) => item.id === 'multiplatform-content-test');
    content.innerHTML = `
      <header class="page-heading">
        <h1>${escapeHtml(resultsConfig.title)}</h1>
        <p>${escapeHtml(resultsConfig.intro)}</p>
      </header>
      ${featured ? `<a class="featured-result" href="content-pipeline-test.html" data-searchable>
        <span class="eyebrow">最新案例</span>
        <strong>${escapeHtml(featured.title)}</strong>
        <p>${escapeHtml(featured.description)}</p>
        <b>查看内容测试记录 <span aria-hidden="true">→</span></b>
      </a>` : ''}
      <section class="section results-surface" aria-labelledby="results-list-title">
        <div class="section-head">
          <div><h2 id="results-list-title">已经形成的工作结果</h2><p class="section-note">按类别查看，完整底稿仍保存在本地。</p></div>
          <span class="count-note" id="results-count">${results.length} 项</span>
        </div>
        <div class="results-filter" role="tablist" aria-label="成果类别">
          ${categories.map((item) => `<button type="button" role="tab" aria-selected="${item.id === activeCategory}" data-results-category="${item.id}" class="${item.id === activeCategory ? 'active' : ''}">${escapeHtml(item.label)}</button>`).join('')}
        </div>
        <div class="result-list" id="result-list">${results.map(resultMarkup).join('')}</div>
        <div class="empty-state result-empty" id="result-empty"${results.length ? ' hidden' : ''}><strong>暂无${escapeHtml(categoryLabel)}成果</strong><span>本地 Codex 完成新的工作后，再把适合公开的结果记到这里。</span></div>
        <div class="empty-state search-empty" role="status" hidden>换个关键词试试</div>
      </section>`;

    content.querySelectorAll('[data-results-category]').forEach((button) => {
      button.addEventListener('click', () => {
        activeCategory = button.dataset.resultsCategory || 'all';
        renderResults();
        window.runSearch?.();
      });
    });
    window.runSearch?.();
    const anchor = decodeURIComponent(window.location.hash.slice(1));
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ block: 'start' }));
  }

  window.initContentStudio = async () => {
    const response = await fetch('data/content-studio.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('内容成果数据加载失败');
    const config = await response.json();
    if (!config || config.title !== '内容成果' || !Array.isArray(config.results)) {
      throw new Error('内容成果数据格式不正确');
    }
    config.results.forEach((item) => {
      if (!item.id || !item.date || !allowedStatuses.has(item.status) || !categories.some((category) => category.id === item.category)) {
        throw new Error('内容成果中有未完成的记录');
      }
    });
    resultsConfig = config;
    document.title = `${config.title}｜海外用户运营`;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = config.intro;
    renderResults();
  };
})();
