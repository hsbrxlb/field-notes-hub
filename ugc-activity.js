(() => {
  const canvas = document.querySelector('.newsletter-canvas');
  const viewport = document.querySelector('.newsletter-viewport');
  const frame = document.querySelector('.newsletter-frame');
  const controls = document.querySelectorAll('[data-preview]');
  let mode = window.matchMedia('(max-width: 600px)').matches ? 'mobile' : 'desktop';
  let documentHeight = 0;
  const resize = () => {
    const available = canvas.clientWidth;
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
  frame.addEventListener('load', () => {
    const doc = frame.contentDocument;
    if (!doc?.querySelector('.shell')) {
      canvas.innerHTML = '<p class="preview-error">邮件预览未能加载，请用上方链接打开完整邮件。</p>';
      return;
    }
    const measure = () => { documentHeight = doc.body.scrollHeight; resize(); };
    new ResizeObserver(measure).observe(doc.body);
    for (const image of doc.images) image.addEventListener('load', measure);
    measure();
  }, { once: true });
  new ResizeObserver(resize).observe(canvas);
  selectMode();
  frame.src = 'assets/email/garage-stories.html';
})();
