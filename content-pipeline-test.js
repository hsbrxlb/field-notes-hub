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

  function statusClass(status) {
    if (status.includes('待完善') || status.includes('需改') || status.includes('放弃')) return 'blocked';
    if (status.includes('文案可审') || status.includes('可交给人审')) return 'ready';
    if (status.includes('通过')) return 'done';
    return 'pending';
  }

  function briefMarkup(brief) {
    const rows = [
      ['内容目的', brief.purpose],
      ['面向谁', brief.audience],
      ['希望产生什么效果', brief.desired_effect],
      ['内容主线', brief.creative_direction],
      ['素材选择', brief.asset_decision],
      ['发布后看什么', brief.post_publish_signals]
    ];
    return `<dl class="pipeline-brief">${rows.map(([label, text]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(text)}</dd></div>`).join('')}</dl>`;
  }

  function factsMarkup(record) {
    return `<section class="pipeline-evidence" aria-labelledby="${escapeHtml(record.run_id)}-evidence-title">
      <div class="pipeline-evidence-copy">
        <h2 id="${escapeHtml(record.run_id)}-evidence-title">产品事实</h2>
        <dl>${record.facts.map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`).join('')}</dl>
        <p><strong>${escapeHtml(record.source.verification_status)}</strong><a class="text-link" href="${escapeHtml(record.source.url)}" target="_blank" rel="noreferrer">打开${escapeHtml(record.source.label)} →</a></p>
      </div>
      <img src="${escapeHtml(record.image.src)}" alt="${escapeHtml(record.image.alt)}" width="${escapeHtml(record.image.width)}" height="${escapeHtml(record.image.height)}" loading="eager" decoding="async">
    </section>`;
  }

  function variantMarkup(item, record) {
    const id = `${record.run_id}-${item.id}`;
    return `<article class="pipeline-platform" id="${escapeHtml(id)}" data-searchable>
      <header class="platform-head">
        <div><h3>${escapeHtml(item.platform)}</h3><p>${escapeHtml(item.platform_job)}</p></div>
        <span class="record-status status-${statusClass(item.review.decision)}">${escapeHtml(item.review.decision)}</span>
      </header>
      <div class="platform-layout">
        <figure class="platform-preview platform-preview-${escapeHtml(item.id)}">
          <div class="platform-asset-placeholder" role="img" aria-label="${escapeHtml(item.platform)} 平台图片待制作，目标比例 ${escapeHtml(item.visual.aspect_ratio)}"><strong>${escapeHtml(item.visual.aspect_ratio)}</strong><span>平台图片待制作</span></div>
          <figcaption><strong>${escapeHtml(item.format)}</strong>${escapeHtml(item.visual.note)}</figcaption>
        </figure>
        <dl class="platform-copy">
          <div><dt>Hook</dt><dd>${escapeHtml(item.hook_en)}</dd></div>
          <div><dt>正文</dt><dd>${escapeHtml(item.body_en)}</dd></div>
          <div><dt>CTA</dt><dd>${escapeHtml(item.cta_en)}</dd></div>
        </dl>
      </div>
      <div class="platform-review">
        <p><strong>AI判断</strong>${escapeHtml(item.review.rationale)}</p>
        <p><strong>检查结果</strong>${item.review.checks.map(escapeHtml).join(' · ')}</p>
        <p><strong>发布后看</strong>${escapeHtml(item.review.success_signal)}</p>
      </div>
    </article>`;
  }

  function reviewMarkup(record) {
    return `<section class="pipeline-final-review" aria-labelledby="${escapeHtml(record.run_id)}-review-title">
      <div>
        <div class="section-head"><h2 id="${escapeHtml(record.run_id)}-review-title">AI复核结果</h2><span class="record-status status-${statusClass(record.ai_review.decision)}">${escapeHtml(record.ai_review.decision)}</span></div>
        <p>${escapeHtml(record.ai_review.summary)}</p>
        <p><strong>打回 ${escapeHtml(record.ai_review.revision_count)} 次</strong></p>
        <ul>${record.ai_review.corrections.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      </div>
      <div class="human-review">
        <h2>请你判断</h2>
        <ol>${record.human_questions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>
      </div>
    </section>`;
  }

  function recordMarkup(record) {
    return `<article class="pipeline-record" id="${escapeHtml(record.run_id)}">
      <header class="pipeline-record-head">
        <div><time datetime="${escapeHtml(record.date)}">${escapeHtml(formatDate(record.date))}</time><h2>${escapeHtml(record.product)}</h2><span>${escapeHtml(record.version)}</span></div>
        <span class="record-status status-${statusClass(record.review_status)}">${escapeHtml(record.review_status)}</span>
      </header>
      <section class="pipeline-prompt" aria-labelledby="${escapeHtml(record.run_id)}-prompt-title">
        <h2 id="${escapeHtml(record.run_id)}-prompt-title">输入 Prompt</h2>
        <blockquote>${escapeHtml(record.prompt)}</blockquote>
      </section>
      <section class="pipeline-purpose" aria-labelledby="${escapeHtml(record.run_id)}-purpose-title">
        <h2 id="${escapeHtml(record.run_id)}-purpose-title">这次内容要完成什么</h2>
        ${briefMarkup(record.brief)}
        <div class="success-criteria"><strong>发布前成功标准</strong><ul>${record.brief.success_criteria.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
      </section>
      ${factsMarkup(record)}
      <section class="pipeline-outputs" aria-labelledby="${escapeHtml(record.run_id)}-outputs-title">
        <div class="section-head"><h2 id="${escapeHtml(record.run_id)}-outputs-title">平台成品</h2></div>
        ${record.variants.map((item) => variantMarkup(item, record)).join('')}
      </section>
      ${reviewMarkup(record)}
    </article>`;
  }

  function renderPageMarkup(config) {
    const records = sortRecords(config.records);
    const index = records.length > 1
      ? `<nav class="pipeline-record-index" aria-label="内容测试记录">${records.map((record) => `<a href="#${escapeHtml(record.run_id)}"><time datetime="${escapeHtml(record.date)}">${escapeHtml(formatDate(record.date))}</time><strong>${escapeHtml(record.product)}</strong></a>`).join('')}</nav>`
      : '';
    return `<header class="page-heading pipeline-heading"><a class="text-link" href="content-studio.html">← 内容成果</a><h1>${escapeHtml(config.title)}</h1></header>${index}${records.map(recordMarkup).join('')}`;
  }

  async function initContentPipelineTests() {
    const response = await fetch('data/content-pipeline-tests.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('内容生产测试加载失败');
    const config = await response.json();
    if (!config || !Array.isArray(config.records) || !config.records.length) throw new Error('内容生产测试格式不正确');
    document.querySelector('#content').innerHTML = renderPageMarkup(config);
    document.title = `${config.title}｜海外用户运营`;
    const breadcrumb = document.querySelector('#breadcrumb-page');
    if (breadcrumb) breadcrumb.textContent = config.title;
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = 'OEDRO社媒内容生产的 Prompt、目的、平台成品和审核结果。';
  }

  const api = { sortRecords, recordMarkup, renderPageMarkup };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.initContentPipelineTests = initContentPipelineTests;
    window.ContentPipelineTest = api;
  }
})();
