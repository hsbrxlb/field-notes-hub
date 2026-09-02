(() => {
  const value = (input) => String(input ?? '');
  const escapeHtml = (input) => value(input)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function formatDate(input) {
    const date = new Date(`${input}T00:00:00`);
    if (Number.isNaN(date.getTime())) return input;
    return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
  }

  function sortRecords(records) {
    return [...records].sort((left, right) => {
      const byDate = value(right.date).localeCompare(value(left.date));
      return byDate || value(right.run_id).localeCompare(value(left.run_id));
    });
  }

  function variantMarkup(item, runId) {
    return `<article class="pipeline-platform" id="${escapeHtml(runId)}-${escapeHtml(item.id)}">
      <h3>${escapeHtml(item.platform)}</h3>
      <p class="platform-hook">${escapeHtml(item.hook_en)}</p>
      <p class="platform-copy">${escapeHtml(item.body_en)}</p>
      <p class="platform-cta"><strong>CTA</strong>${escapeHtml(item.cta_en)}</p>
    </article>`;
  }

  function recordMarkup(record, index) {
    const facts = record.facts.map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`).join('');
    const latest = index === 0 ? '<span class="record-latest">最新</span>' : '';
    return `<details class="pipeline-record" id="${escapeHtml(record.run_id)}" open data-searchable>
      <summary>
        <time class="record-date" datetime="${escapeHtml(record.date)}">${escapeHtml(formatDate(record.date))}</time>
        <strong class="record-title">${escapeHtml(record.product)}</strong>
        <span class="record-status">${escapeHtml(record.review_status)}</span>
        ${latest}
        <span class="record-toggle" aria-hidden="true"></span>
      </summary>
      <div class="pipeline-record-body">
        <section class="pipeline-hero">
          <img src="${escapeHtml(record.image.src)}" alt="${escapeHtml(record.image.alt)}" width="${escapeHtml(record.image.width)}" height="${escapeHtml(record.image.height)}" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async">
          <div class="pipeline-facts">
            <h2>${escapeHtml(record.title)}</h2>
            <dl>${facts}</dl>
            <a class="text-link" href="${escapeHtml(record.source_url)}" target="_blank" rel="noreferrer">查看产品页 →</a>
          </div>
        </section>
        <section class="section" data-searchable>
          <div class="section-head"><h2>平台成稿</h2></div>
          <div class="pipeline-platforms">${record.variants.map((item) => variantMarkup(item, record.run_id)).join('')}</div>
        </section>
      </div>
    </details>`;
  }

  function renderPageMarkup(config) {
    const records = sortRecords(config.records);
    const indexLinks = records.map((record, index) => `<a href="#${escapeHtml(record.run_id)}"><span>${index === 0 ? '最新' : escapeHtml(formatDate(record.date))}</span><strong>${escapeHtml(record.product)}</strong></a>`).join('');
    return `<header class="page-heading pipeline-heading" data-searchable>
      <a class="text-link" href="content-studio.html">← 内容成果</a>
      <h1>${escapeHtml(config.title)}</h1>
      <p>${escapeHtml(config.intro)}</p>
    </header>
    <nav class="pipeline-record-index" aria-label="内容样稿记录">${indexLinks}</nav>
    <div class="pipeline-records">${records.map(recordMarkup).join('')}</div>
    <div class="empty-state search-empty" role="status" hidden>没有匹配结果</div>`;
  }

  async function initContentPipelineTests() {
    const response = await fetch('data/content-pipeline-tests.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('内容样稿加载失败');
    const config = await response.json();
    if (!config || !Array.isArray(config.records) || !config.records.length) throw new Error('内容样稿格式不正确');
    document.querySelector('#content').innerHTML = renderPageMarkup(config);
    document.title = `${config.title}｜海外用户运营`;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = config.intro;
    window.runSearch?.();
  }

  const api = { sortRecords, recordMarkup, renderPageMarkup };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.initContentPipelineTests = initContentPipelineTests;
    window.ContentPipelineTest = api;
  }
})();
