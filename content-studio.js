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
    { id: 'instagram', name: 'Instagram' },
    { id: 'x', name: 'X' },
    { id: 'youtube', name: 'YouTube 社区' }
  ];

  function diagram() {
    const steps = [
      { image: 'editorial-01', title: '确定要求', description: '提供主题、受众、目标平台，以及已确认的品牌事实和可用素材。', alt: '主题便签、受众肖像、平台清单与品牌摄影资料，沿细线汇成制作简报。' },
      { image: 'editorial-02', title: '生成图文', description: 'AI 按要求制作图片和英文文案，并提供对应的中文译文。', alt: '制作简报经 AI 制作形成汽车摄影成片，与英文文案和中文对照组成配套图文。' },
      { image: 'editorial-03', title: '适配平台', description: '按 Instagram、X、YouTube 社区的用途，调整图片画幅、文案角度与篇幅。', alt: '同一汽车主题形成 Instagram 竖图与配文、X 方图与短文、YouTube 社区方图与完整社区帖。' },
      { image: 'editorial-04', title: '人工审核交付', description: '人工核对画面、文案和事实，反馈修改；确认后整理素材，自行发布。', alt: '图文稿进入人工审核，有问题返回修改，确认后交付含图片、英文文案与中文对照的素材包，由人自行发布。' }
    ];
    return `<section class="automation-flow" aria-label="社媒图文生产的四个步骤"><ol class="automation-stages">${steps.map((step, index) => `<li>
      <h2><span class="automation-stage-number">${String(index + 1).padStart(2, '0')}</span>${step.title}</h2>
      <a href="assets/content-studio/${step.image}.webp" aria-label="查看原图：${step.title}"><img class="automation-stage-image" src="assets/content-studio/${step.image}.webp" width="1536" height="1024" alt="${step.alt}" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></a>
      <p>${step.description}</p>
    </li>`).join('')}</ol></section>`;
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
      ${sample(record)}`;
    document.title = '社媒内容自动化生产｜海外用户运营';
    document.querySelector('#breadcrumb-page').textContent = '社媒内容自动化生产';
  };
})();
