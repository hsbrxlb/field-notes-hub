window.initEmailTemplates = async function () {
  const templates = [
    {
      id: 'discord-invite', number: '01', title: 'Discord 社群邀请', label: '无优惠版本',
      file: 'assets/email/discord-invite.html',
      subject: 'An invitation to OEDRO on Discord',
      preview: 'Talk fitment, compare setups, and share what you’re working on.',
      purpose: '承接问卷反馈，邀请愿意继续交流的人进入 Discord。语气像一位懂车库工作的伙伴，不假定对方买过产品或拥有某辆车。',
      condition: '发送前按实际名单核对邮件和社群邀请许可，替换真实邮寄地址，并在 Klaviyo 预览中验证退订。问卷参与本身不等于营销许可。',
      translation: '谢谢你花时间分享反馈。欢迎到 OEDRO 的 Discord 聊聊适配问题、安装经历和产品建议。进入后阅读 welcome-and-rules，自愿介绍正在做的项目；也可以先看看。',
      cta: 'Join OEDRO on Discord'
    },
    {
      id: 'discord-member-offer', number: '02', title: '入群专属优惠券', label: '方案示例 · 未批准 · 不可直接发送',
      file: 'assets/email/discord-member-offer-concept.html',
      subject: '[Join OEDRO on Discord for your member offer]',
      preview: '[Join OEDRO on Discord and receive the approved member offer.]',
      purpose: '以“加入 Discord 后领取专属优惠券”为增长方案，供讨论入群动机、邮件呈现和兑换机制。问卷答谢是另一事项，不在本方案中替代处理。',
      condition: 'VERSION DISABLED。主案提请审批：满 75 美元享 15% 优惠，每单最多减 30 美元，已购客户也可用，首批最多 15 人、单次使用、60 天有效、不叠加。入群与经济奖励绑定存在 Discord 平台政策冲突，本页不能发送或发券。',
      translation: '谢谢你分享反馈。[加入 OEDRO 的 Discord 社群，即可按批准后的条件获得专属优惠券。] [方案示例：满 75 美元享 15% 优惠，每单最高减 30 美元，新老客户均可使用；单次使用、不可叠加、60 天有效。实际优惠码和截止日期待填。]',
      cta: '[Join Discord and get the offer]'
    }
  ];
  const section = (item) => `
    <section class="email-section" id="${item.id}">
      <header class="email-section-head"><h2>${item.number} / ${item.title}</h2><span>${item.label}</span></header>
      <div class="email-layout">
        <div class="email-canvas"><iframe class="email-frame" title="${item.title}邮件预览" data-file="${item.file}" sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe></div>
        <aside class="email-details" aria-label="${item.title}使用说明">
          <h3>邮件内容</h3>
          <dl><dt>Subject</dt><dd lang="en">${item.subject}</dd><dt>Preview text</dt><dd lang="en">${item.preview}</dd><dt>CTA</dt><dd lang="en">${item.cta}</dd></dl>
          <div class="email-actions"><a href="${item.file}" download>下载 HTML</a><a href="${item.file}" target="_blank" rel="noopener">完整预览 ↗</a></div>
          <p>${item.purpose}</p>
          <div class="email-condition"><strong>${item.id === 'discord-invite' ? '使用条件' : '方案示例 · 未批准'}</strong><p>${item.condition}</p></div>
          <h3>中文对照</h3><p>${item.translation}</p>
        </aside>
      </div>
    </section>`;
  document.querySelector('#content').innerHTML = `
    <header class="page-heading"><h1>用户邮件模板</h1><p>完整邮件预览与可导入 Klaviyo 的 HTML 文件。</p></header>
    <nav class="email-index" aria-label="邮件模板目录"><a href="#discord-invite">01 无优惠邀请</a><a href="#discord-member-offer">02 入群优惠券方案</a></nav>
    ${templates.map(section).join('')}
    <section class="email-proposal" aria-labelledby="offer-proposal-title"><h3 id="offer-proposal-title">入群优惠券方案说明</h3>
      <p>主案提请审批：满 75 美元享 15% 优惠，单次最高减 30 美元，已购客户也可用；首批最多 15 人，每人一张唯一单次码，发放后 60 天有效，不叠加。拟议流程为点击邀请、加入社群、核对资格后领取优惠码。</p>
      <p><a href="https://www.oedro.com/" target="_blank" rel="noopener noreferrer">OEDRO 官网订阅优惠为 10% ↗</a>，因此旧的满 100 美元减 10 美元方案不足以体现专属价值。新主案提高折扣比例并拟向已购客户开放，但有 30 美元封顶：订单达到 300 美元时与 10% 相当，更高金额时可能不如 10%，不能称为“最优惠”。</p>
      <p>若全部按上限兑换，主案券面让利最多 450 美元，不代表利润损失，也不保证入群或销售效果。商城是否支持百分比折扣封顶仍需核实；若不支持，低预算备选为满 75 美元减 15 美元，同样最多 15 张，券面让利最多 225 美元。</p>
      <p>适用品类、地区、税费与运费是否计入门槛，以及发券、核销和防重复领取机制均待核实。上述数字是审批方案，没有已发放优惠券。</p>
      <p>该机制把经济奖励与加入服务器绑定，与 <a href="https://discord.com/safety/platform-manipulation-policy-explainer" target="_blank" rel="noopener noreferrer">Discord 平台操纵政策 ↗</a>存在直接冲突。模板展示不代表平台允许或方案获批；即使内部批准优惠，平台冲突仍需解决。</p>
      <p>无优惠邀请保留为对照版本。问卷答谢需另行确定现金、礼品卡等形式，本页没有把购物优惠券当作问卷补偿。</p>
      <p>优惠结构参考：<a href="https://www.anker.com/hot-deals" target="_blank" rel="noopener noreferrer">Anker 首购 15% ↗</a>、<a href="https://weathertech-uk.com/pages/newsletter-signup" target="_blank" rel="noopener noreferrer">WeatherTech 英国站新订阅 15% ↗</a>。这两例属于首购与订阅活动，不能作为 Discord 入群案例或效果证据。</p>
    </section>
    <section class="email-proposal" aria-labelledby="email-use-title"><h3 id="email-use-title">导入与发送前检查</h3>
      <p>在 Klaviyo 新建 HTML 模板，导入下载文件，单独填写 Subject 和 Preview text。邮件正文、按钮和页脚都是真实文字，图片关闭后仍能读懂并进入 Discord。</p>
      <p>署名为 Oliver / OEDRO，回复入口为 service@oedro.com。该地址来自历史欢迎邮件，使用前须在当前 Klaviyo 账户核对 From、Reply-To 和收件处理安排。</p>
      <p>邀请邮件使用 AI 生成的通用车库场景，不是真实用户照片或产品适配证明。公开 JPEG 约 374KB，保留完整画面。</p>
      <ul><li>替换页脚方括号中的真实邮寄地址；用 Klaviyo 的预览与测试邮件验证退订链接。</li><li>图片采用公开 HTTPS 地址。若改用品牌素材库，请上传图片并替换 HTML 中的图片地址。</li><li>正式发送前，在手机、Gmail 和 Outlook 中检查测试邮件；本页预览不等于邮件客户端验收。</li></ul>
    </section>`;
  for (const frame of document.querySelectorAll('.email-frame')) {
    const resize = () => {
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      frame.style.height = `${doc.body.scrollHeight}px`;
    };
    frame.addEventListener('load', () => {
      frame.contentDocument.querySelector('.email-image')?.addEventListener('load', resize);
      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(frame.contentDocument.body);
    });
    const response = await fetch(frame.dataset.file);
    if (!response.ok) throw new Error('邮件模板加载失败');
    frame.srcdoc = (await response.text())
      .replace('https://hsbrxlb.github.io/field-notes-hub/assets/email/community-garage-hero.jpg', new URL('assets/email/community-garage-hero.jpg', location.href).href)
      .replace("{% unsubscribe 'Unsubscribe from marketing emails' %}", '<span style="text-decoration:underline;">Unsubscribe from marketing emails</span>');
  }
};
