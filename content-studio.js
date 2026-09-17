(() => {
  const destinations = {
    'brand-voice-system': 'topic.html?slug=brand-voice-system',
    'discord-audit': 'topic.html?slug=discord-community',
    'user-voice-summary': 'user-voice.html',
    'ai-smart-survey': 'research.html',
    'seo-geo-lab': 'topic.html?slug=seo-geo',
    'hub-structure': 'index.html'
  };
  const defaults = {
    'research-library': 'research.html',
    'sites-systems': 'topic.html?slug=seo-geo',
    playbook: 'mascot-workflow.html'
  };
  const page = document.body.dataset.page;
  const destination = destinations[location.hash.slice(1)] || defaults[page];
  if (destination) {
    location.replace(destination);
    return;
  }
  const text = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const platforms = [
    { id: 'instagram', name: 'Instagram', format: '竖版图片 · 配文', shape: 'portrait' },
    { id: 'x', name: 'X', format: '图片 · 短文', shape: 'square' },
    { id: 'youtube', name: 'YouTube 社区', format: '图片 · 社区帖', shape: 'square' }
  ];

  function diagram() {
    return `<section class="automation-flow" aria-label="一个选题做成各平台图文，人工确认后使用">
      <div class="automation-origin"><span class="automation-step">01 / 选题</span><div class="automation-topic-symbol" aria-hidden="true"><i></i><i></i><i></i></div><h2>一个选题</h2><p>输入选题与受众目的。</p></div>
      <span class="automation-arrow" aria-hidden="true">→</span>
      <div class="automation-outputs"><span class="automation-step">02 / AI 图文制作</span><div class="automation-platforms">${platforms.map(platform => `<div class="automation-platform"><div class="automation-print ${platform.shape}" aria-hidden="true"><svg viewBox="0 0 120 100"><path d="M0 90 38 40 66 70 92 30 120 61V100H0Z"/><circle cx="30" cy="24" r="9"/></svg><span></span><span></span></div><h3>${platform.name}</h3><p>${platform.format}</p></div>`).join('')}</div></div>
      <span class="automation-arrow" aria-hidden="true">→</span>
      <div class="automation-use"><span class="automation-step">03 / 人工确认</span><div class="automation-check" aria-hidden="true">✓</div><h2>确认后使用</h2><p>终点是人确认可用后自行发布。</p></div>
    </section>`;
  }

  function sample(record) {
    return `<section class="automation-sample" aria-labelledby="sample-heading"><header class="automation-section-head"><div><span class="automation-step">样稿</span><h2 id="sample-heading">${text(record.product)}</h2></div><a href="content-pipeline-test.html">查看完整样稿 <span aria-hidden="true">↗</span></a></header>
      <div class="automation-sample-grid">${platforms.map(platform => {
        const variant = record.variants.find(item => item.id === platform.id);
        if (!variant?.visual?.image) throw new Error('平台样稿图片缺失');
        const image = variant.visual.image;
        if (!/^assets\/[a-zA-Z0-9/_-]+\.(?:png|jpe?g|webp)$/.test(image.src)) throw new Error('样稿图片路径不正确');
        const caption = variant.fields?.flatMap(field => field.blocks.map(block => block.en)).join(' ');
        if (!caption) throw new Error('平台样稿文案缺失');
        return `<figure class="automation-example"><img src="${text(image.src)}" alt="${text(image.alt)}" width="${Number(image.width)}" height="${Number(image.height)}" loading="lazy" decoding="async"><figcaption><h3>${platform.name}</h3><p lang="en">${text(caption)}</p></figcaption></figure>`;
      }).join('')}</div></section>`;
  }

  window.initContentStudio = async () => {
    const response = await fetch('data/content-pipeline-tests.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('社媒样稿加载失败');
    const config = await response.json();
    const record = config.records?.find(item => item.run_id === config.active_run_id);
    if (!record) throw new Error('当前社媒样稿不存在');
    document.querySelector('#content').innerHTML = `<header class="page-heading automation-heading"><h1>社媒内容自动化生产</h1><p>AI 围绕一个主题，为 Instagram、X 和 YouTube 社区分别制作配图与英文文案，附中文对照，省去每个平台从零重做。</p></header>
      ${diagram()}
      <section class="automation-brief" aria-label="输入与交付"><div><h2>输入</h2><p>输入需选题、目标平台、品牌语气、已确认产品信息和可用素材。</p></div><div><h2>交付</h2><p>交付为成套图文供人工确认后使用，现有案例仍为样稿。</p></div></section>
      ${sample(record)}`;
    document.title = '社媒内容自动化生产｜海外用户运营';
    document.querySelector('#breadcrumb-page').textContent = '社媒内容自动化生产';
  };
})();
