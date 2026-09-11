(() => {
  const value = (input) => String(input ?? '');
  const escapeHtml = (input) => value(input)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function sortRecords(records) {
    return [...records].sort((left, right) => {
      const byDate = value(right.date).localeCompare(value(left.date));
      return byDate || value(right.run_id).localeCompare(value(left.run_id));
    });
  }

  const primaryPlatforms = new Set(['instagram', 'x', 'youtube']);
  const visibleVariants = (record) => record.variants.filter((item) => primaryPlatforms.has(item.id));

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
    if (visual.image) return `<figure class="platform-image">${imageMarkup(visual.image)}</figure>`;
    return '<p class="platform-media-state">图片待制作</p>';
  }

  function variantMarkup(item, record) {
    const id = `${record.run_id}-${item.id}`;
    return `<article class="pipeline-platform" id="${escapeHtml(id)}" data-searchable>
      <header class="platform-head">
        <h3>${escapeHtml(item.platform)}</h3>
      </header>
      <div class="platform-post${item.visual.image ? ' post-with-image' : ''}" aria-label="${escapeHtml(item.platform)} 文案草稿">
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
    </article>`;
  }

  function recordMarkup(record) {
    return `<article class="pipeline-record" id="${escapeHtml(record.run_id)}">
      <header class="pipeline-record-head">
        <div><h2>${escapeHtml(record.product)}</h2></div>
      </header>
      <section class="pipeline-prompt" aria-labelledby="${escapeHtml(record.run_id)}-prompt-title">
        <h2 id="${escapeHtml(record.run_id)}-prompt-title">输入 Prompt</h2>
        <blockquote>${escapeHtml(record.prompt)}</blockquote>
      </section>
      <section class="pipeline-purpose" aria-labelledby="${escapeHtml(record.run_id)}-purpose-title">
        <h2 id="${escapeHtml(record.run_id)}-purpose-title">${escapeHtml(record.brief.purpose)}</h2>
        <p>${escapeHtml(record.brief.desired_effect)}</p>
      </section>
      <section class="pipeline-outputs" aria-label="平台作品">
        ${visibleVariants(record).map((item) => variantMarkup(item, record)).join('')}
      </section>
    </article>`;
  }

  function renderPageMarkup(config) {
    const record = config.active_run_id
      ? config.records.find((item) => item.run_id === config.active_run_id)
      : sortRecords(config.records)[0];
    if (!record) throw new Error('当前内容记录不存在');
    return `<header class="page-heading pipeline-heading"><a class="text-link" href="content-studio.html">← 社媒内容生产</a><h1>${escapeHtml(config.title)}</h1></header>${recordMarkup(record)}`;
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
    if (description) description.content = 'OEDRO社媒内容生产的 Prompt、目的、平台作品。';
  }

  const api = { sortRecords, recordMarkup, renderPageMarkup, visibleVariants };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.initContentPipelineTests = initContentPipelineTests;
    window.ContentPipelineTest = api;
  }
})();
