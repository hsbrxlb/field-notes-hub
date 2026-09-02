(() => {
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

  function formatDate(value) {
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric'
    }).format(date);
  }

  function sortRecords(records) {
    return [...records].sort((a, b) => {
      const dateOrder = text(b.date).localeCompare(text(a.date));
      return dateOrder || text(b.run_id).localeCompare(text(a.run_id));
    });
  }

  function copyBlock(label, en, zh) {
    return `<div class="copy-block"><span>${escapeHtml(label)}</span><p class="copy-en">${escapeHtml(en)}</p><p class="copy-zh">${escapeHtml(zh)}</p></div>`;
  }

  function variantMarkup(item, runId) {
    return `<article class="pipeline-platform" id="${escapeHtml(runId)}-${escapeHtml(item.id)}">
      <header><span class="platform-index">${escapeHtml(item.index)}</span><div><span class="eyebrow">${escapeHtml(item.platform)}</span><h3>${escapeHtml(item.angle)}</h3></div></header>
      ${copyBlock(item.hook_label, item.hook_en, item.hook_zh)}
      ${copyBlock(item.body_label, item.body_en, item.body_zh)}
      ${copyBlock(item.sequence_label, item.sequence_en, item.sequence_zh)}
      ${copyBlock('CTA', item.cta_en, item.cta_zh)}
      <div class="asset-note"><strong>素材要求</strong><p>${escapeHtml(item.asset_note)}</p></div>
    </article>`;
  }

  function reviewMarkup(review) {
    const round = (item, pass = false) => `<article><span class="review-step${pass ? ' review-pass' : ''}">${escapeHtml(item.label)}</span><h3>${escapeHtml(item.title)}</h3><ul>${item.items.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul></article>`;
    const examples = (review.examples || []).map((item) => `<article class="review-example">
      <span>${escapeHtml(item.platform)}</span>
      <p><strong>打回原句</strong>${escapeHtml(item.before)}</p>
      <p><strong>修改后</strong>${escapeHtml(item.after)}</p>
      <small>${escapeHtml(item.reason)}</small>
    </article>`).join('');
    return `<section class="section pipeline-review" data-searchable>
      <div class="section-head"><div><h2>AI 检查前后</h2><p class="section-note">第一轮没有直接交给人，而是指出具体问题并要求返工。</p></div></div>
      <div class="review-comparison">${round(review.round_one)}${round(review.round_two, true)}</div>
      ${examples ? `<div class="review-examples">${examples}</div>` : ''}
    </section>`;
  }

  function safetyMarkup(items) {
    return `<section class="section pipeline-safety" data-searchable>
      <div class="section-head"><div><h2>六种问题被拦住</h2><p class="section-note">这些结果只证明流程会阻止已知风险，不代表内容已经产生市场效果。</p></div></div>
      <ol class="safety-grid">${items.map((item, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><p><strong>${escapeHtml(item.title)}</strong>${escapeHtml(item.text)}</p></li>`).join('')}</ol>
    </section>`;
  }

  function socialMarkup(snapshot) {
    const rows = snapshot.rows.map((item) => {
      const platform = item.url
        ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.platform)} ↗</a>`
        : escapeHtml(item.platform);
      return `<tr><td class="cell-title" data-label="平台">${platform}</td><td data-label="公开规模与内容">${escapeHtml(item.metrics)}</td><td data-label="当前判断">${escapeHtml(item.assessment)}</td></tr>`;
    }).join('');
    const sources = snapshot.sources.map((item) => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.label)} ↗</a>`).join('；');
    return `<section class="section pipeline-social" data-searchable>
      <div class="section-head"><div><h2>当前可见的 OEDRO 社媒</h2><p class="section-note">${escapeHtml(snapshot.checked_on)} 公开核对。 ${escapeHtml(snapshot.note)}</p></div></div>
      <div class="data-table-wrap"><table class="data-table pipeline-social-table"><thead><tr><th>平台</th><th>公开规模与内容</th><th>当前判断</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="source-note">归属与近期内容核对：${sources}</p>
    </section>`;
  }

  function recordMarkup(record, index) {
    const platformList = record.platforms.map((item) => `<span>${escapeHtml(item)}</span>`).join('');
    const facts = record.overview.facts.map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`).join('');
    const boundaries = record.boundaries.map((item) => `<p><strong>${escapeHtml(item.label)}</strong>${escapeHtml(item.text)}</p>`).join('');
    const imageText = record.image_test.map((item) => `<p>${escapeHtml(item)}</p>`).join('');
    const latest = index === 0 ? '<span class="record-latest">最新记录</span>' : '';
    return `<details class="pipeline-record" id="${escapeHtml(record.run_id)}" open data-searchable>
      <summary>
        <span class="record-date">${escapeHtml(formatDate(record.date))}</span>
        <span class="record-title"><strong>${escapeHtml(record.product)}</strong><small>${escapeHtml(record.theme)}</small></span>
        <span class="record-platforms">${platformList}</span>
        <span class="record-status">${escapeHtml(record.review_status)}</span>
        ${latest}
        <span class="record-toggle" aria-hidden="true"></span>
      </summary>
      <div class="pipeline-record-body">
        <p class="record-summary">${escapeHtml(record.summary)}</p>
        <p class="record-id"><span>记录编号</span>${escapeHtml(record.run_id)}</p>
        <section class="section pipeline-hero">
          <figure>
            <img src="${escapeHtml(record.image.src)}" alt="${escapeHtml(record.image.alt)}" width="${escapeHtml(record.image.width)}" height="${escapeHtml(record.image.height)}" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async">
            <figcaption>${escapeHtml(record.image.caption)}</figcaption>
          </figure>
          <div class="pipeline-hero-copy">
            <span class="eyebrow">${escapeHtml(record.overview.eyebrow)}</span>
            <h2>${escapeHtml(record.overview.title)}</h2>
            <p>${escapeHtml(record.overview.text)}</p>
            <dl>${facts}</dl>
          </div>
        </section>
        <section class="section pipeline-platform-section" data-searchable>
          <div class="section-head"><div><h2>四个平台的最终版本</h2><p class="section-note">同一组事实，按平台使用习惯分别重写。英文可直接复制，中文紧随其后帮助内部检查。</p></div></div>
          <div class="pipeline-platforms">${record.variants.map((item) => variantMarkup(item, record.run_id)).join('')}</div>
        </section>
        ${reviewMarkup(record.review)}
        ${safetyMarkup(record.safety_tests)}
        <section class="section pipeline-image-test" data-searchable><div class="section-head"><div><h2>图像为什么返工</h2></div></div><div>${imageText}</div></section>
        ${socialMarkup(record.social_snapshot)}
        <section class="section pipeline-boundary" data-searchable><div class="section-head"><div><h2>工作边界</h2></div></div><div class="boundary-lines">${boundaries}</div></section>
      </div>
    </details>`;
  }

  function renderPageMarkup(config) {
    const records = sortRecords(config.records);
    const indexLinks = records.map((record, index) => `<a href="#${escapeHtml(record.run_id)}"><span>${index === 0 ? '最新' : escapeHtml(formatDate(record.date))}</span><strong>${escapeHtml(record.product)}</strong><small>${escapeHtml(record.theme)}</small></a>`).join('');
    return `<header class="page-heading pipeline-heading" data-searchable>
      <a class="text-link" href="content-studio.html">← 返回内容成果</a>
      <span class="eyebrow">OEDRO CONTENT TEST RECORDS</span>
      <h1>${escapeHtml(config.title)}</h1>
      <p>${escapeHtml(config.intro)}</p>
    </header>
    <nav class="pipeline-record-index" aria-label="内容测试记录">${indexLinks}</nav>
    <div class="pipeline-records">${records.map(recordMarkup).join('')}</div>
    <div class="empty-state search-empty" role="status" hidden>换个关键词试试</div>`;
  }

  async function initContentPipelineTests() {
    const response = await fetch('data/content-pipeline-tests.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('内容测试记录加载失败');
    const config = await response.json();
    if (!config || !Array.isArray(config.records) || !config.records.length) {
      throw new Error('内容测试记录格式不正确');
    }
    const content = document.querySelector('#content');
    content.innerHTML = renderPageMarkup(config);
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
