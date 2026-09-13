window.initEmailTemplates = async function () {
  const templates = [
    {
      id: 'discord-invite', title: 'Discord 社群邀请',
      file: 'assets/email/discord-invite.html',
      subject: 'An invitation to OEDRO on Discord',
      preview: 'A place for installation questions, projects, and product feedback.',
      translation: '我们来聊聊车。感谢你向 OEDRO 分享反馈。我们想邀请你加入 Discord 社群。有安装问题或正在改车？带张照片来，聊聊经验，或告诉我们你希望产品哪里不一样。加入 OEDRO 的 Discord，发帖前可以先逛逛。'
    },
    {
      id: 'discord-member-offer', title: '入群专属优惠券方案',
      file: 'assets/email/discord-member-offer-concept.html',
      subject: '[An invitation and a coupon from OEDRO]',
      preview: '[Join us on Discord and get a coupon for your next OEDRO order.]',
      translation: '感谢你向 OEDRO 分享反馈。[加入我们的 Discord，即可获得下次 OEDRO 订单的优惠券。] [订单满75美元享85折，最多减30美元。] [新老客户均可用；限用一次；60天有效；不可叠加。]'
    }
  ];
  const section = (item) => `
    <section class="email-section" id="${item.id}">
      <h2>${item.title}</h2>
      ${item.id === 'discord-member-offer' ? '<p class="email-proposal-note">优惠规则待审批，以下为效果稿。</p>' : ''}
      <div class="email-layout">
        <div class="email-canvas"><iframe class="email-frame" title="${item.title}邮件预览" data-file="${item.file}" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe></div>
        <div class="email-details">
          <dl><dt>邮件标题</dt><dd lang="en">${item.subject}</dd><dt>收件箱摘要</dt><dd lang="en">${item.preview}</dd></dl>
          <h3>中文对照</h3><p>${item.translation}</p>
        </div>
      </div>
    </section>`;
  document.querySelector('#content').innerHTML = `
    <header class="page-heading"><h1>用户邮件模板</h1></header>
    <nav class="email-index" aria-label="邮件模板目录"><a href="#discord-invite">社群邀请</a><a href="#discord-member-offer">入群优惠券方案</a></nav>
    ${templates.map(section).join('')}
    <section class="email-proposal" aria-labelledby="offer-proposal-title"><h2 id="offer-proposal-title">优惠券建议</h2>
      <p>满75美元打85折，最多减30美元，新老客户可用，首批15人，每人唯一码，限用一次，60天有效，不叠加；券面总上限450美元。若商城不支持百分比封顶，备选满75减15美元，总券面225美元。</p>
      <p>OEDRO订阅原有10%优惠，满100减10没有新增吸引力。新方案折扣更高，但300美元以上订单因封顶未必优于10%。目前没有转化效果数据。</p>
      <p>下一步确认适用商品、地区、运费是否计入门槛，以及谁负责发券。入群奖励与 Discord 现行规则存在冲突，需解决后才能执行。</p>
    </section>
    <section class="email-proposal" aria-labelledby="email-use-title"><h2 id="email-use-title">发送安排</h2>
      <ol><li>确认可联系的人及优惠规则。</li><li>将模板导入 Klaviyo（公司使用的邮件系统），填好邮件标题。</li><li>给自己发测试，检查手机显示、公司地址、退订和回复去向，确认是否进垃圾箱后再决定客户发送。</li></ol>
      <p>示意图为 AI 生成，未使用真实用户照片。</p>
      <details class="email-files"><summary>导入邮件系统用文件</summary><p>HTML 是 Klaviyo 能导入的邮件版式文件，普通看稿无需下载。</p>
        <a href="assets/email/discord-invite.html" download>社群邀请文件</a>
        <a href="assets/email/discord-member-offer-concept.html" download>优惠券效果稿文件</a>
      </details>
    </section>`;
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
      .replace('{{ organization.full_address }}', 'Company mailing address')
      .replace("{% unsubscribe 'Unsubscribe from marketing emails' %}", '<span style="text-decoration:underline;">Unsubscribe from marketing emails</span>');
  }
};
