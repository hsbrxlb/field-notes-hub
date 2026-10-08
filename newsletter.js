window.initNewsletter = async function () {
  const response = await fetch('data/newsletter.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('Newsletter 内容加载失败');
  const issue = await response.json();
  const pair = (text, tag = 'p', extraClass = '', number = '') => `
    <div class="newsletter-pair ${extraClass}">
      <${tag} lang="en">${number}${escapeHtml(text.en)}</${tag}>
      <${tag} lang="zh-CN">${number}${escapeHtml(text.zh)}</${tag}>
    </div>`;
  document.querySelector('#content').innerHTML = `
    <header class="page-heading"><h1>The Glovebox Newsletter</h1><p>由 OEDRO 编辑部策划，围绕实用汽配 tips、用车生活和社区故事展开。</p></header>
    <section class="newsletter-issue" aria-labelledby="newsletter-issue-title">
      <h2 id="newsletter-issue-title">首期：冷天早晨，胎压灯为什么会亮？</h2>
      <div class="newsletter-controls" role="group" aria-label="邮件预览尺寸">
        <button type="button" data-preview="desktop" aria-pressed="true">桌面</button>
        <button type="button" data-preview="mobile" aria-pressed="false">手机</button>
        <a href="assets/newsletter/001.html" target="_blank" rel="noopener">打开完整邮件 ↗</a>
      </div>
      <div class="newsletter-canvas"><div class="newsletter-viewport"><iframe class="newsletter-frame" title="The Glovebox 首期邮件预览" sandbox="allow-same-origin"></iframe></div></div>
    </section>
    <section class="newsletter-comparison" aria-labelledby="newsletter-comparison-title">
      <h2 id="newsletter-comparison-title">英文与中文对照</h2>
      <div class="newsletter-pair newsletter-language-labels"><span lang="en">ENGLISH</span><span>中文</span></div>
      ${pair(issue.title, 'h3', 'newsletter-title-pair')}
      ${pair(issue.description)}${pair(issue.opening)}
      ${issue.sections.map(section => `<section class="newsletter-section">
        ${pair(section.heading, 'h3')}
        ${(section.steps || []).map((step, index) => pair(step, 'p', '', `<span class="newsletter-step-number">${index + 1}.</span>`)).join('')}
        ${section.paragraphs.map(paragraph => pair(paragraph)).join('')}
      </section>`).join('')}
      <div class="newsletter-closing">${pair(issue.closing)}${pair(issue.editorial)}</div>
    </section>`;

  const canvas = document.querySelector('.newsletter-canvas');
  const viewport = document.querySelector('.newsletter-viewport');
  const frame = document.querySelector('.newsletter-frame');
  const controls = document.querySelectorAll('[data-preview]');
  let mode = window.matchMedia('(max-width: 600px)').matches ? 'mobile' : 'desktop';
  let documentHeight = 0;
  const resize = () => {
    const available = canvas.clientWidth;
    // The desktop email needs a viewport wider than its 660px stacking breakpoint.
    const width = mode === 'desktop' ? 760 : Math.max(320, Math.min(390, available));
    const scale = Math.min(1, available / width);
    frame.style.width = `${width}px`;
    frame.style.transform = `scale(${scale})`;
    documentHeight = frame.contentDocument?.body?.scrollHeight || documentHeight;
    frame.style.height = `${documentHeight}px`;
    viewport.style.width = `${width * scale}px`;
    viewport.style.height = `${documentHeight * scale}px`;
  };
  const selectMode = () => {
    for (const button of controls) button.setAttribute('aria-pressed', String(button.dataset.preview === mode));
    resize();
  };
  for (const button of controls) button.addEventListener('click', () => {
    mode = button.dataset.preview;
    selectMode();
  });
  const observeEmail = () => {
    const doc = frame.contentDocument;
    if (!doc?.body) return;
    // The body's height can shrink on a mode change; the iframe viewport cannot.
    const measure = () => { documentHeight = doc.body.scrollHeight; resize(); };
    new ResizeObserver(measure).observe(doc.body);
    for (const image of doc.images) image.addEventListener('load', measure);
    measure();
  };
  new ResizeObserver(resize).observe(canvas);
  selectMode();
  await new Promise((resolve, reject) => {
    frame.addEventListener('load', () => {
      if (!frame.contentDocument?.querySelector('.shell')) {
        reject(new Error('邮件预览加载失败'));
        return;
      }
      observeEmail();
      resolve();
    }, { once: true });
    frame.src = 'assets/newsletter/001.html';
  });
};
