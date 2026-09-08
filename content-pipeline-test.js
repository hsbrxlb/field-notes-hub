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

  function factsMarkup(record) {
    if (!/^https:\/\//.test(value(record.source.url))) throw new Error('来源链接必须使用 HTTPS');
    return `<details class="pipeline-evidence" open>
      <summary>产品来源与素材</summary>
      <div class="pipeline-evidence-layout${record.image ? '' : ' evidence-text-only'}">
      <div class="pipeline-evidence-copy">
        <dl>${record.facts.map((item) => `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`).join('')}</dl>
        <p><strong>${escapeHtml(record.source.verification_status)}</strong><a class="text-link" href="${escapeHtml(record.source.url)}" target="_blank" rel="noreferrer">打开${escapeHtml(record.source.label)} →</a></p>
        <p>${escapeHtml(record.brief.asset_decision)}</p>
      </div>
      ${record.image ? `<figure>${imageMarkup(record.image)}<figcaption>官方产品参考图</figcaption></figure>` : ''}
      </div>
    </details>`;
  }

  function imageMarkup(image) {
    if (!/^assets\/[a-zA-Z0-9/_-]+\.(?:png|jpe?g|webp)$/.test(value(image.src))) throw new Error('图片路径不正确');
    return `<img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" width="${escapeHtml(image.width)}" height="${escapeHtml(image.height)}" loading="lazy" decoding="async">`;
  }

  function fieldsMarkup(fields, language) {
    return fields.map((field) => field.blocks.map((block) => {
      const tag = field.key === 'title' ? 'h4' : 'p';
      return `<${tag}>${escapeHtml(block[language])}</${tag}>`;
    }).join('')).join('');
  }

  function mediaMarkup(visual) {
    if (visual.kind === 'external_video') return '<p class="platform-media-state media-external">文案样稿 · 搭配公司既有视频</p>';
    if (visual.kind === 'illustration' && visual.image) {
      return `<figure class="platform-illustration">${imageMarkup(visual.image)}<figcaption>主题插画，非产品实拍</figcaption></figure>`;
    }
    return `<p class="platform-media-state">${escapeHtml(visual.aspect_ratio)} 配图待制作</p>`;
  }

  function variantMarkup(item, record) {
    const id = `${record.run_id}-${item.id}`;
    return `<article class="pipeline-platform" id="${escapeHtml(id)}" data-searchable>
      <header class="platform-head">
        <h3>${escapeHtml(item.platform)}</h3>
        <p>${escapeHtml(item.platform_job)}</p>
      </header>
      <div class="platform-post${item.visual.kind === 'illustration' && item.visual.image ? ' post-with-image' : ''}" aria-label="${escapeHtml(item.platform)} 文案草稿">
        ${mediaMarkup(item.visual)}
        <div class="platform-text">
        <div class="platform-copy" lang="en">
          ${item.fields ? fieldsMarkup(item.fields, 'en') : `${item.id === 'pinterest' ? `<h4>${escapeHtml(item.hook_en)}</h4>` : `<p>${escapeHtml(item.hook_en)}</p>`}
          <p>${escapeHtml(item.body_en)}</p>
          <p>${escapeHtml(item.cta_en)}</p>`}
        </div>
        ${item.fields ? `<details class="platform-translation" open><summary>中文对照</summary><div class="platform-copy" lang="zh-CN">${fieldsMarkup(item.fields, 'zh')}</div></details>` : ''}
        </div>
      </div>
      <details class="platform-review" open>
        <summary>AI审核意见 · ${escapeHtml(item.review.decision)}</summary>
        <p>${escapeHtml(item.review.rationale)}</p>
        <ul>${item.review.checks.map((check) => `<li>${escapeHtml(check)}</li>`).join('')}</ul>
        <p>发布后观察：${escapeHtml(item.review.success_signal)}</p>
      </details>
    </article>`;
  }

  function reviewMarkup(record) {
    return `<section class="pipeline-final-review" aria-labelledby="${escapeHtml(record.run_id)}-review-title">
      <div>
        <div class="section-head"><h2 id="${escapeHtml(record.run_id)}-review-title">AI复核结果</h2><span class="record-status status-${statusClass(record.ai_review.decision)}">${escapeHtml(record.ai_review.decision)}</span></div>
        <p>${escapeHtml(record.ai_review.summary)}</p>
        <details class="pipeline-revisions" open><summary>${record.ai_review.revision_count ? `修改记录 · ${escapeHtml(record.ai_review.revision_count)} 次退稿` : '检查记录'}</summary>
        <ul>${record.ai_review.corrections.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        </details>
      </div>
      <div class="human-review">
        <details class="pipeline-criteria" open><summary>评审问题与效果观察</summary>
        <ol>${record.human_questions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ol>
        <p>${escapeHtml(record.brief.post_publish_signals)}</p>
        <ul>${record.brief.success_criteria.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        <p>${escapeHtml(record.brief.creative_direction)}</p>
        </details>
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
        <h2 id="${escapeHtml(record.run_id)}-purpose-title">${escapeHtml(record.brief.purpose)}</h2>
        <p>面向${escapeHtml(record.brief.audience)}。${escapeHtml(record.brief.desired_effect)}。</p>
      </section>
      <section class="pipeline-outputs" aria-labelledby="${escapeHtml(record.run_id)}-outputs-title">
        <div class="section-head"><h2 id="${escapeHtml(record.run_id)}-outputs-title">各平台作品</h2></div>
        <nav class="platform-index" aria-label="本组平台文案">${record.variants.map((item) => `<a href="#${escapeHtml(record.run_id)}-${escapeHtml(item.id)}">${escapeHtml(item.platform)}</a>`).join('')}</nav>
        ${record.variants.map((item) => variantMarkup(item, record)).join('')}
      </section>
      ${reviewMarkup(record)}
      ${factsMarkup(record)}
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
