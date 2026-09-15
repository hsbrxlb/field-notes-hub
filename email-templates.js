window.initEmailTemplates = async function () {
  const templates = [
    {
      id: 'discord-invite', title: 'Discord 社群邀请',
      file: 'assets/email/discord-invite.html',
      subject: 'Come take a look at OEDRO on Discord',
      subjectTranslation: '来看看 OEDRO 的 Discord',
      preview: 'Share a photo, ask a quick question, or just browse.',
      previewTranslation: '发张照片，问个小问题，或者随便逛逛。',
      translation: ['聊聊日常用车的地方', '周末开完车，脚垫上全是泥。后备箱里全是狗毛。这些日常用车的事，都欢迎发到 OEDRO 的 Discord。发张照片，就能聊起来。', '这个空间刚起步。你可以进来说说你的用车问题，也可以随便逛逛，看看什么有意思。', '加入 OEDRO 的 Discord']
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
