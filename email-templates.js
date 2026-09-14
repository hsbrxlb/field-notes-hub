window.initEmailTemplates = async function () {
  const templates = [
    {
      id: 'discord-invite', title: 'Discord 社群邀请',
      file: 'assets/email/discord-invite.html',
      subject: 'OEDRO on Discord: bring your garage stories',
      subjectTranslation: '来 OEDRO 的 Discord，聊聊车库里的故事',
      preview: 'A photo from the garage, with the story that goes with it.',
      previewTranslation: '一张车库里的照片，还有它背后的故事。',
      translation: ['有没有那种“你看看这个”的照片？', '周末开完车后沾满泥的脚垫。一个小改动让装东西更省事。有些用车照片，确实得配几句说明。', '我们正在 OEDRO 的 Discord 上开一个地方，聊聊这些故事。来看看，想分享的话就发一个。', '加入 OEDRO 的 Discord']
    }
  ];
  const section = (item) => `
    <section class="email-section" id="${item.id}">
      <h2>${item.title}</h2>
      <div class="email-layout">
        <div class="email-canvas"><iframe class="email-frame" title="${item.title}邮件预览" data-file="${item.file}" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe></div>
        <div class="email-details">
          <dl><dt>邮件标题</dt><dd lang="en">${item.subject}</dd><dd>${item.subjectTranslation}</dd><dt>收件箱摘要</dt><dd lang="en">${item.preview}</dd><dd>${item.previewTranslation}</dd></dl>
          <h3>中文对照</h3>${item.translation.map((paragraph) => `<p>${paragraph}</p>`).join('')}
        </div>
      </div>
    </section>`;
  document.querySelector('#content').innerHTML = `
    <header class="page-heading"><h1>用户邮件模板</h1></header>
    ${templates.map(section).join('')}`;
  for (const frame of document.querySelectorAll('.email-frame')) {
    frame.addEventListener('load', () => {
      const doc = frame.contentDocument;
      const resize = () => { frame.style.height = `${doc.body.scrollHeight}px`; };
      for (const img of doc.images) img.addEventListener('load', resize);
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(doc.body);
    });
    const response = await fetch(frame.dataset.file);
    if (!response.ok) throw new Error('邮件模板加载失败');
    frame.srcdoc = (await response.text())
      .replaceAll('https://hsbrxlb.github.io/field-notes-hub/assets/', new URL('assets/', location.href).href)
      .replace('<br>{{ organization.full_address }}', '')
      .replace("{% unsubscribe 'Unsubscribe from marketing emails' %}", '<span style="text-decoration:underline;">Unsubscribe from marketing emails</span>');
  }
};
