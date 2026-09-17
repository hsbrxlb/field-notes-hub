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

function voiceThreadContext(item) {
  const url = new URL(item.source_link);
  const reddit = url.pathname.match(/^\/r\/([^/]+)\/comments\/[^/]+\/([^/]+)/);
  const forum = url.pathname.match(/\/threads\/([^/.]+)/);
  const slug = reddit?.[2] || forum?.[1] || '';
  // These headings translate only the public URL slugs, never unverified comment bodies.
  const headings = {
    tonneau_covers: 'Nissan Frontier 货箱盖讨论',
    oedro_running_boards: 'OEDRO 脚踏板讨论',
    please_help_me_pick_some_side_railsstepsrunning: '侧护栏、踏步、脚踏板怎么选？',
    oedro_low_profile_hard_quad_fold_tonneau_cover: 'OEDRO 低平四折硬质货箱盖讨论',
    recommendations_for_a_truck_bed_cover: '想选一款货箱盖，有什么推荐？',
    hard_tonneau_worth_it: '硬质货箱盖值得买吗？',
    'oedro-low-profile-tri-fold-tonneau-cover': 'OEDRO 低平三折货箱盖讨论',
    '4-fold-low-prifile-tonneau-cover-409-79': '低平四折货箱盖讨论'
  };
  const topicLabels = {
    tonneau_cover: '货箱盖', running_boards: '脚踏板', floor_mats: '脚垫', bumper: '保险杠',
    complaint: '产品讨论', recommendation: '选购建议', fitment: '车型适配', installation: '安装',
    warranty: '保修', product_quality: '产品质量', shipping_returns: '配送与退换', support: '售后支持', general: '产品讨论'
  };
  return {
    heading: headings[slug] || topicLabels[item.topic] || '产品讨论',
    community: reddit ? `r/${reddit[1]}` : url.hostname.replace(/^www\./, ''),
    category: topicLabels[item.topic] || '产品讨论'
  };
}

function renderUserVoice(data, voice, radar) {
  const copy = data.user_voice || {};
  const insights = Array.isArray(voice?.actions)
    ? voice.actions.filter((item) => item && ['approved', 'routed', 'closed'].includes(item.status))
    : [];
  const actionLabels = {
    faq: '常见问题', research_question: '研究问题', discord_topic: '社群话题',
    product_feedback: '产品反馈', support_feedback: '支持反馈', content_idea: '内容方向',
    official_site_article_candidate: '官网内容'
  };
  const topicLabels = {
    tonneau_cover: '货箱盖', running_boards: '脚踏板', floor_mats: '脚垫', bumper: '保险杠',
    complaint: '产品问题', recommendation: '选购建议', fitment: '车型适配', installation: '安装', warranty: '保修', product_quality: '产品质量',
    shipping_returns: '配送与退换', support: '售后支持', community: '社区', general: '通用问题'
  };
  const sourceLabels = { reddit: 'Reddit', forum: '车型论坛', youtube: 'YouTube', bluesky: 'Bluesky' };
  const radarItems = Array.isArray(radar?.items) ? radar.items : [];
  document.title = `${copy.title || '问题与反馈'}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = 'OEDRO 货箱盖、脚踏板与车型相关的公开讨论和原帖。';
  document.querySelector('#content').innerHTML = `
    ${pageHeading(copy.title || '问题与反馈')}
    <section class="voice-discussions" aria-label="公开讨论">
      <div class="voice-card-grid">
        ${radarItems.map((item, index) => {
          const thread = voiceThreadContext(item);
          return `<article class="voice-thread" data-searchable>
            <div class="voice-thread-top"><span class="voice-thread-category">${escapeHtml(thread.category)}</span><span class="voice-thread-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span></div>
            <h2>${escapeHtml(thread.heading)}</h2>
            <p class="voice-thread-community">${escapeHtml(thread.community)}</p>
            <div class="voice-thread-bottom"><span>${escapeHtml(sourceLabels[item.source_family] || item.source_family)}</span><a href="${escapeHtml(item.source_link)}" target="_blank" rel="noopener noreferrer" aria-label="查看原帖：${escapeHtml(thread.heading)}">查看原帖 <span aria-hidden="true">↗</span></a></div>
          </article>`;
        }).join('')}
      </div>
      ${radarItems.length ? '' : '<p class="empty-state">暂无公开问题记录</p>'}
    </section>
    ${insights.length ? `<section class="section user-voice-surface">
      <div class="section-head"><h2>已确认的洞察与行动</h2></div>
      <div class="voice-insights">
        ${insights.map((item) => `<article class="voice-insight" data-searchable>
          <h3>${escapeHtml(topicLabels[item.public_topic] || item.public_topic)} · ${escapeHtml(actionLabels[item.action_type] || item.action_type)}</h3>
          <p class="voice-evidence">${Number(item.source_count) || 0} 个公开来源 · ${Number(item.independent_voice_count) || 0} 个独立声音</p>
        </article>`).join('')}
      </div>
    </section>` : ''}`;
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
    <p>频道核对日期：${escapeHtml(topic.checked_at)}。成员总数本次未核实，暂不展示。</p>
    ${topic.servers.map(server => `
      <section class="discord-server section" id="${escapeHtml(server.id)}">
        <header class="discord-server-heading"><h2>${escapeHtml(server.name)}</h2>${server.members ? `<span>${escapeHtml(server.members)}</span>` : ''}</header>
        ${server.scope ? `<p>${escapeHtml(server.scope)}</p>` : ''}
        <div class="discord-layout">
          <section class="discord-channel-map" aria-label="${escapeHtml(server.name)} 频道结构">
            <h3>频道结构</h3>
            <div class="discord-groups">${server.groups.map(group => `
              <section class="discord-group"><h4>${escapeHtml(group.name)}</h4>
                <ul>${group.channels.map(channel => `<li><span aria-hidden="true">#</span> ${escapeHtml(channel)}</li>`).join('')}</ul>
              </section>`).join('')}</div>
          </section>
          ${server.bots.length || server.settings.length ? `<section class="discord-configuration"><h3>设置与机器人</h3>
            <dl>${server.bots.map(bot => `<div><dt>${escapeHtml(bot.name)}</dt><dd>${escapeHtml(bot.purpose)}</dd></div>`).join('')}${server.settings.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
          </section>` : ''}
        </div>
      </section>`).join('')}`;
}

function visibleTopicSections(topic) {
  if (!topic.sections?.length) return [];
  const ids = {
    'brand-voice-system': ['current', 'brand-name', 'everyday-example', 'discord-example', 'fitment-example', 'support-example', 'research-example', 'ugc-example', 'principles', 'channels', 'donts'],
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
  document.querySelector('#content').dataset.topic = slug;
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
  if (page === 'research') renderResearch(data);
  if (page === 'flipbooks') renderFlipbooks(data);
  if (page === 'voice') {
    renderUserVoice(data, voice, radar);
    if (location.hash === '#feedback-method') document.querySelector('.voice-discussions')?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  if (page === 'topics' && location.pathname.endsWith('topics.html')) renderTopics(data, topics);
  if (page === 'topics' && location.pathname.endsWith('topic.html')) await renderTopic(data);
  if (page === 'studio' && location.pathname.endsWith('content-pipeline-test.html')) await window.initContentPipelineTests?.();
  if (page === 'studio' && !location.pathname.endsWith('content-pipeline-test.html')) await window.initContentStudio?.();
  if (page === 'mascot') await window.initMascot?.();
  if (page === 'email-templates') await window.initEmailTemplates?.();
  if (page === 'products') await window.initProducts?.();
}

const mainContent = document.querySelector('#content');
const staticContentPage = ['customer-analytics', 'mascot-workflow', 'social-brand', 'merch-plan', 'first-outreach', 'discord-invite-plan'].includes(page);
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
