const page = document.body.dataset.page;
const sidebar = document.querySelector('.sidebar');
const overlay = document.querySelector('.mobile-overlay');
const menuButton = document.querySelector('.menu-button');
const compactNavigation = window.matchMedia('(max-width: 980px)');
const workspace = document.querySelector('.workspace');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setSidebar(open, restoreFocus = true) {
  open = open && compactNavigation.matches;
  sidebar?.classList.toggle('open', open);
  if (sidebar) sidebar.inert = compactNavigation.matches && !open;
  if (workspace) workspace.inert = open;
  document.body.classList.toggle('nav-open', open);
  if (overlay) overlay.hidden = !open;
  menuButton?.setAttribute('aria-expanded', String(open));
  if (open) sidebar?.querySelector('.nav-close')?.focus();
  else if (restoreFocus && compactNavigation.matches) menuButton?.focus();
}

function statusClass(status) {
  return {
    待确认: 'pending', 进行中: 'active', 准备中: 'ready', 筹备: 'ready',
    受阻: 'blocked', 已完成: 'done', 归档: 'archived'
  }[status] || 'pending';
}

function statusMarkup(status) {
  if (/^(待确认|待审.*|进行中|准备中|筹备|受阻|已完成|归档)$/.test(status)) return '';
  return `<span class="status status-${statusClass(status)}">${escapeHtml(status)}</span>`;
}

function pageHeading(title, description = '') {
  return `<header class="page-heading"><h1>${escapeHtml(title)}</h1>${description ? `<p>${escapeHtml(description)}</p>` : ''}</header>`;
}

function sectionHead(title, action = '') {
  return `<div class="section-head"><h2>${escapeHtml(title)}</h2>${action}</div>`;
}

function topicLink(item) {
  return `<a class="topic-row" href="topic.html?slug=${encodeURIComponent(item.slug)}" data-searchable data-status="${escapeHtml(item.status)}">
    <strong>${escapeHtml(item.title)}</strong>
    ${statusMarkup(item.status)}
  </a>`;
}

function renderShell(data) {
  const activePage = page === 'topics' && location.pathname.endsWith('topic.html')
    ? new URLSearchParams(location.search).get('slug')
    : page;
  document.querySelector('#site-title').textContent = '海外用户运营';
  document.querySelector('#site-subtitle').textContent = 'OEDRO 工作台';
  document.querySelector('#nav-list').innerHTML = data.nav.map((item) => `
    <a href="${escapeHtml(item.file)}" data-page="${escapeHtml(item.id)}" ${item.external ? 'aria-label="' + escapeHtml(item.label) + '（离开工作台，进入样站）"' : ''} ${item.id === activePage ? 'aria-current="page"' : ''} class="${item.id === activePage ? 'active' : ''}${item.parent ? ' nav-child' : ''}${item.external ? ' nav-external' : ''}">
      <span>${escapeHtml(item.label)}</span>${item.external ? '<span aria-hidden="true">↗</span>' : ''}
    </a>`).join('');
  const current = data.nav.find((item) => item.id === activePage);
  document.querySelector('#breadcrumb-page').textContent = current?.label || (page === 'topics' ? '资料索引' : '');
}


function methodStageMarkup(stage) {
  return `<article class="method-detail" id="method-stage-${escapeHtml(stage.id)}" data-searchable>
    <header><span class="stage-number">${String(stage.id).padStart(2, '0')}</span><h2>${escapeHtml(stage.name)}</h2></header>
    <div class="method-content">
      <p><strong>前提</strong>${escapeHtml(stage.prerequisite)}</p>
      <ul>${stage.actions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
      <p><strong>产出</strong>${stage.deliverables.map(escapeHtml).join('；')}</p>
      <p><strong>完成</strong>${escapeHtml(stage.done_when)}</p>
    </div>
  </article>`;
}

function renderPlaybook(data) {
  const p = data.playbook;
  document.title = `工作方法｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = p.meta_description;
  document.querySelector('#content').innerHTML = `
    ${pageHeading('工作方法')}
    <section class="section method-stack">${data.stages.map(methodStageMarkup).join('')}</section>`;
}

function renderResearch(data) {
  const r = data.research;
  document.title = `${r.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = r.meta_description;
  document.querySelector('#content').innerHTML = `
    ${pageHeading(r.title)}
    <section class="section research-entry">
      <a class="research-preview" href="https://oedro-light-research.onrender.com/" target="_blank" rel="noopener" aria-label="预览并打开 AI 调研问卷">
        <img src="assets/light-research/hawthorne-preview.jpg?v=20260914-r2" alt="OEDRO AI 调研问卷演示界面" width="1440" height="900">
      </a>
      <div class="research-launch-copy">
        <p>工作灯调研演示：AI 根据回答继续追问。</p>
        <a class="research-open" href="https://oedro-light-research.onrender.com/" target="_blank" rel="noopener">开始AI调研问卷 ↗</a>
      </div>
    </section>`;
}

function renderFlipbooks(data) {
  const flipbooks = data.flipbooks;
  document.title = `${flipbooks.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = 'OEDRO互动翻页书演示。';
  document.querySelector('#content').innerHTML = `
    ${pageHeading(flipbooks.title)}
    <section class="section flipbook-demo-grid" aria-label="两本翻页书">
      ${flipbooks.entries.map((entry) => `<article class="flipbook-demo-item" data-searchable>
        <h2>${escapeHtml(entry.title)}</h2>
        <a href="${escapeHtml(entry.href)}" aria-label="打开${escapeHtml(entry.title)}">
          <img src="${escapeHtml(entry.image)}" alt="${escapeHtml(entry.image_alt)}" width="${escapeHtml(entry.image_width)}" height="${escapeHtml(entry.image_height)}" loading="eager" decoding="async">
        </a>
      </article>`).join('')}
    </section>`;
}

function renderUserVoice(data, voice, radar) {
  const copy = data.user_voice || {};
  const insights = Array.isArray(voice.actions)
    ? voice.actions.filter((item) => item && ['approved', 'routed', 'closed'].includes(item.status))
    : [];
  const actionLabels = {
    faq: '常见问题', research_question: '研究问题', discord_topic: '社群话题',
    product_feedback: '产品反馈', support_feedback: '支持反馈', content_idea: '内容方向',
    official_site_article_candidate: '官网内容'
  };
  const strengthLabels = {
    urgent_single_signal: '需优先关注', repeated_multi_source: '多来源重复出现',
    single_or_thin_signal: '证据仍少', single_signal: '单一信号'
  };
  const topicLabels = {
    tonneau_cover: '货箱盖', running_boards: '脚踏板', floor_mats: '脚垫', bumper: '保险杠',
    complaint: '产品问题', recommendation: '选购建议', fitment: '车型适配', installation: '安装', warranty: '保修', product_quality: '产品质量',
    shipping_returns: '配送与退换', support: '售后支持', community: '社区', general: '通用问题'
  };
  const sourceLabels = { reddit: 'Reddit', forum: '车型论坛', youtube: 'YouTube', bluesky: 'Bluesky', tavily: '网页搜索', official_facts: '产品事实库' };
  const sourceStatusLabels = { ok: '正常', blocked: '受阻', failed: '失败', skipped: '跳过' };
  const radarTopicTitles = {
    complaint: '产品问题', support: '售后支持', installation: '安装问题', fitment: '车型适配',
    recommendation: '选购建议', tonneau_cover: '货箱盖问题', running_boards: '脚踏板问题',
    floor_mats: '脚垫问题', bumper: '保险杠问题', general: '其他问题'
  };
  const actionLabelsRadar = {
    verify_product_facts: '核对产品事实',
    review_reply_opportunity: '查看是否值得人工回复'
  };
  const radarItems = Array.isArray(radar?.items) ? radar.items : [];
  const lastSuccess = radar?.last_success_at ? new Date(radar.last_success_at) : null;
  const staleAfter = Number(radar?.stale_after_hours) || 36;
  const stale = !lastSuccess || Number.isNaN(lastSuccess.getTime()) || Date.now() - lastSuccess.getTime() > staleAfter * 3600000;
  const formatTime = (value) => {
    if (!value) return '尚未成功运行';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '时间无效' : date.toLocaleString('zh-CN', { hour12: false });
  };
  const radarStatus = radar?.status === 'success' ? '检查完成' : radar?.status === 'partial' ? '部分来源失败' : radar?.status === 'failed' ? '检查失败' : '尚未运行';
  document.title = `${copy.title || '问题与反馈'}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = 'OEDRO公开问题检查、值得查看的问题和已确认行动汇总。';
  document.querySelector('#content').innerHTML = `
    ${pageHeading(copy.title || '问题与反馈')}
    <section class="section demand-radar-summary" data-searchable>
      <div class="section-head"><h2>最近检查</h2><span class="status ${stale ? 'status-blocked' : radar?.status === 'success' ? 'status-done' : 'status-pending'}">${stale ? '数据可能过期' : escapeHtml(radarStatus)}</span></div>
      <p class="radar-updated">${escapeHtml(formatTime(radar?.last_success_at))}</p>
      <dl class="radar-health">
        <div><dt>产品事实</dt><dd>${escapeHtml(radar?.truth_status === 'verified' ? '已核对' : radar?.truth_status === 'blocked' ? '受阻' : '待核对')}</dd></div>
        ${(Array.isArray(radar?.sources) ? radar.sources : []).map((item) => `<div><dt>${escapeHtml(sourceLabels[item.source] || item.source)}</dt><dd>${escapeHtml(sourceStatusLabels[item.status] || item.status)} · ${Number(item.accepted_count) || 0} 条采用</dd></div>`).join('')}
      </dl>
    </section>
    <section class="section demand-radar-items" data-searchable>
      <div class="section-head"><h2>值得查看的问题</h2></div>
      <div class="radar-item-list">
        ${radarItems.map((item) => `<article class="radar-item">
          <div class="radar-item-meta"><span class="eyebrow">${escapeHtml(sourceLabels[item.source_family] || item.source_family)}</span><span class="status ${item.triage_status === 'DRAFT_READY' ? 'status-done' : 'status-pending'}">${item.triage_status === 'DRAFT_READY' ? '可评估回复' : '需要事实'}</span></div>
          <h3>${escapeHtml(radarTopicTitles[item.topic] || topicLabels[item.topic] || item.topic)}</h3>
          <div class="radar-item-footer"><strong>${escapeHtml(actionLabelsRadar[item.next_action] || item.next_action)}</strong><a href="${escapeHtml(item.source_link)}" target="_blank" rel="noreferrer">打开原帖 →</a></div>
        </article>`).join('')}
      </div>
      <div class="empty-state voice-empty"${radarItems.length ? ' hidden' : ''}><strong>暂无值得处理的问题</strong></div>
    </section>
    <section class="section user-voice-surface">
      <div class="section-head"><h2>已确认的洞察与行动</h2></div>
      <div class="voice-insights" id="voice-insights">
        ${insights.map((item) => `<article class="voice-insight" data-searchable>
          <div><span class="eyebrow">${escapeHtml(actionLabels[item.action_type] || item.action_type)}</span></div>
          <div><h3>${escapeHtml(topicLabels[item.public_topic] || item.public_topic)} · ${escapeHtml(actionLabels[item.action_type] || item.action_type)}</h3><p class="voice-evidence">${escapeHtml(strengthLabels[item.evidence_strength] || item.evidence_strength)} · ${Number(item.source_count) || 0} 个公开来源 · ${Number(item.independent_voice_count) || 0} 个独立声音</p></div>
        </article>`).join('')}
      </div>
      <div class="empty-state voice-empty" id="voice-empty"${insights.length ? ' hidden' : ''}><strong>${escapeHtml(copy.empty_message || '暂无可公开洞察')}</strong></div>
    </section>
    <section class="section feedback-method" id="feedback-method">
      <h2>反馈怎么处理</h2>
      <ol>
        <li>保留评论来源与上下文，合并重复记录，区分适配、安装和使用问题。</li>
        <li>人工核对事实与重复主题；涉及安全、适配或产品损坏的问题优先处理。</li>
        <li>把确认的问题用于 FAQ、调研、内容或产品反馈，并记录后续处理结果。</li>
      </ol>
      <p>公开评论不等于营销许可。继续邀请调研、社群或复用用户内容，需要分别取得同意。</p>
      <a class="text-link" href="research.html">继续做用户调研 →</a>
    </section>`;
}

function renderTopics(data, topics) {
  document.title = `${topics.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = 'OEDRO海外用户运营专题与当前状态。';
  document.querySelector('#content').innerHTML = `
    ${pageHeading(topics.title)}
    <section class="section topic-index-surface">
      <div class="table-toolbar"><span class="count-note" id="topic-count"></span></div>
      <div class="topic-list" id="topic-list">${topics.items.map(topicLink).join('')}</div>
    </section>`;
  document.querySelector('#topic-filter')?.addEventListener('change', runFilters);
  runFilters();
}

const topicTitleMap = {
  当前判断: '品牌表达', 'OEDRO怎么说': '表达原则', 不同渠道怎么变: '各渠道的语气',
  明确不采用: '禁用表达', 当前验证状态: '验证状态'
};

function cleanTopicTitle(title) {
  return topicTitleMap[title] || title;
}

function topicSectionMarkup(section, index) {
  const title = cleanTopicTitle(section.title);
  const paragraphs = (section.paragraphs || []).map((item) => `<p>${escapeHtml(item)}</p>`).join('');
  const items = section.items?.length ? `<ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
  const rows = section.rows?.length ? `<div class="topic-steps">${section.rows.map((item) => `<div><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.text)}</p></div>`).join('')}</div>` : '';
  return `<section class="topic-content-section" id="topic-section-${index}" data-searchable><h2>${escapeHtml(title)}</h2>${paragraphs}${items}${rows}</section>`;
}

function renderDiscord(topic, data) {
  document.title = `${topic.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = topic.description;
  document.querySelector('#content').innerHTML = `
    ${pageHeading(topic.title)}
    <nav class="discord-server-nav" aria-label="服务器">
      ${topic.servers.map(server => `<a href="#${escapeHtml(server.id)}">${escapeHtml(server.name)}</a>`).join('')}
    </nav>
    ${topic.servers.map(server => `
      <section class="discord-server section" id="${escapeHtml(server.id)}">
        <header class="discord-server-heading"><h2>${escapeHtml(server.name)}</h2><span>${escapeHtml(server.members)}</span></header>
        <div class="discord-layout">
          <section class="discord-channel-map" aria-label="${escapeHtml(server.name)} 频道结构">
            <h3>频道结构</h3>
            <div class="discord-groups">${server.groups.map(group => `
              <section class="discord-group"><h4>${escapeHtml(group.name)}</h4>
                <ul>${group.channels.map(channel => `<li><span aria-hidden="true">#</span> ${escapeHtml(channel)}</li>`).join('')}</ul>
              </section>`).join('')}</div>
          </section>
          <section class="discord-configuration"><h3>设置与机器人</h3>
            <p class="discord-bots">已安装：${server.bots.map(escapeHtml).join(' · ')}</p>
            <dl>${server.settings.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
          </section>
        </div>
      </section>`).join('')}`;
}

function visibleTopicSections(topic) {
  if (!topic.sections?.length) return [];
  const ids = {
    'brand-voice-system': ['current', 'principles', 'channels', 'donts'],
    'seo-geo': ['current', 'milestones', 'baseline', 'next']
  }[topic.slug];
  return ids ? topic.sections.filter((section) => ids.includes(section.id)) : topic.sections;
}

function renderRelatedPages(pages = []) {
  if (!pages.length) return '';
  return `<section class="topic-content-section topic-related" id="topic-related" data-searchable>
    <h2>相关页面</h2>
    <div class="related-page-list">${pages.map((item) => `<a href="${escapeHtml(item.href)}"><strong>${escapeHtml(item.label)}</strong><span aria-hidden="true">→</span></a>`).join('')}</div>
  </section>`;
}

async function renderTopic(data) {
  const slug = new URLSearchParams(window.location.search).get('slug') || 'discord-community';
  const response = await fetch(`data/topics/${encodeURIComponent(slug)}.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error('专题加载失败');
  const topic = await response.json();
  if (slug === 'discord-community') return renderDiscord(topic, data);
  const sections = visibleTopicSections(topic);
  document.title = `${topic.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = topic.description;
  document.querySelector('#content').innerHTML = `
    ${pageHeading(topic.title)}
    <div class="topic-layout">
      <article class="topic-body">${sections.map(topicSectionMarkup).join('')}
        ${renderRelatedPages(topic.related_pages)}
      </article>
    </div>`;
}

function runFilters() {
  const statusFilter = document.querySelector('#status-filter')?.value || '全部';
  const topicFilter = document.querySelector('#topic-filter')?.value || '全部';
  const items = [...document.querySelectorAll('[data-searchable]')];
  items.forEach((item) => {
    const projectStatusMatch = !item.matches('#project-rows tr') || statusFilter === '全部' || item.dataset.status === statusFilter;
    const topicStatusMatch = !item.matches('#topic-list [data-status]') || topicFilter === '全部' || item.dataset.status === topicFilter;
    item.hidden = !(projectStatusMatch && topicStatusMatch);
  });
  const rows = [...document.querySelectorAll('#project-rows tr')];
  const count = document.querySelector('#project-count');
  if (count) count.textContent = `共 ${rows.filter((row) => !row.hidden).length} 个项目`;
  const empty = document.querySelector('#project-empty');
  if (empty) empty.hidden = rows.some((row) => !row.hidden);
  const topicRows = [...document.querySelectorAll('#topic-list [data-status]')];
  const topicCount = document.querySelector('#topic-count');
  if (topicCount) topicCount.textContent = `共 ${topicRows.filter((row) => !row.hidden).length} 个专题`;
}

if (sidebar) {
  sidebar.id = 'workspace-navigation';
  sidebar.insertAdjacentHTML('afterbegin', '<button class="nav-close" type="button" aria-label="关闭导航">×</button>');
  sidebar.querySelector('.nav-close').addEventListener('click', () => setSidebar(false));
}
menuButton?.setAttribute('aria-controls', 'workspace-navigation');
setSidebar(false, false);
compactNavigation.addEventListener('change', () => setSidebar(false, false));
menuButton?.addEventListener('click', () => setSidebar(!sidebar?.classList.contains('open')));
overlay?.addEventListener('click', () => setSidebar(false));
document.addEventListener('keydown', (event) => {
  if (!sidebar?.classList.contains('open')) return;
  if (event.key === 'Escape') { event.preventDefault(); setSidebar(false); }
  if (event.key === 'Tab') {
    const items = [...sidebar.querySelectorAll('a[href],button')];
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

async function init() {
  if (location.pathname.endsWith('topic.html') && new URLSearchParams(location.search).get('slug') === 'external-signals-to-relationships') {
    location.replace('user-voice.html#feedback-method');
    return;
  }
  const [dataResponse, topicsResponse, voiceResponse, radarResponse] = await Promise.all([
    fetch('data/content.json', { cache: 'no-store' }),
    fetch('data/topics.json', { cache: 'no-store' }),
    page === 'voice' ? fetch('data/user-voice.json', { cache: 'no-store' }) : Promise.resolve(null),
    page === 'voice' ? fetch('data/demand-radar.json', { cache: 'no-store' }) : Promise.resolve(null)
  ]);
  if (!dataResponse.ok || !topicsResponse.ok || (page === 'voice' && (!voiceResponse?.ok || !radarResponse?.ok))) throw new Error('页面数据加载失败');
  const [data, topics, voice, radar] = await Promise.all([
    dataResponse.json(),
    topicsResponse.json(),
    voiceResponse ? voiceResponse.json() : Promise.resolve(null),
    radarResponse ? radarResponse.json() : Promise.resolve(null)
  ]);
  renderShell(data);
  if (page === 'playbook') renderPlaybook(data);
  if (page === 'research') renderResearch(data);
  if (page === 'flipbooks') renderFlipbooks(data);
  if (page === 'voice') {
    renderUserVoice(data, voice, radar);
    if (location.hash === '#feedback-method') document.querySelector('#feedback-method').scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  if (page === 'topics' && location.pathname.endsWith('topics.html')) renderTopics(data, topics);
  if (page === 'topics' && location.pathname.endsWith('topic.html')) await renderTopic(data);
  if (page === 'studio' && location.pathname.endsWith('content-pipeline-test.html')) await window.initContentPipelineTests?.();
  if (['studio', 'research-library', 'sites-systems'].includes(page) && !location.pathname.endsWith('content-pipeline-test.html')) await window.initContentStudio?.();
  if (page === 'mascot') await window.initMascot?.();
  if (page === 'email-templates') await window.initEmailTemplates?.();
}

const mainContent = document.querySelector('#content');
const staticContentPage = ['mascot-workflow', 'social-brand', 'merch-plan'].includes(page);
mainContent.setAttribute('tabindex', '-1');
mainContent.setAttribute('aria-busy', 'true');
if (!staticContentPage) mainContent.innerHTML = '<p class="loading-state" role="status">正在加载…</p>';
init().catch((error) => {
  if (staticContentPage) {
    const navigation = document.querySelector('#nav-list');
    if (navigation && !navigation.querySelector('a')) {
      navigation.innerHTML = '<p role="alert">导航暂时无法加载</p><a href="">重新加载</a><a href="index.html">返回首页</a>';
    }
    console.error(error);
    return;
  }
  mainContent.innerHTML = '<div class="load-error" role="alert"><h1>页面暂时无法加载</h1><p>检查连接后重试，或返回首页。</p><button type="button" id="reload-page">重试</button><a href="index.html">返回首页</a></div>';
  document.querySelector('#reload-page').addEventListener('click', () => location.reload());
  console.error(error);
}).finally(() => mainContent.setAttribute('aria-busy', 'false'));
