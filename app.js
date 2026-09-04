const page = document.body.dataset.page;
const sidebar = document.querySelector('.sidebar');
const overlay = document.querySelector('.mobile-overlay');
const menuButton = document.querySelector('.menu-button');
const searchInput = document.querySelector('#page-search');
const searchStatus = document.querySelector('#search-status');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value) {
  return String(value ?? '').toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ').trim();
}

function setSidebar(open) {
  sidebar?.classList.toggle('open', open);
  if (overlay) overlay.hidden = !open;
  menuButton?.setAttribute('aria-expanded', String(open));
}

function statusClass(status) {
  return {
    待确认: 'pending', 进行中: 'active', 准备中: 'ready', 筹备: 'ready',
    受阻: 'blocked', 已完成: 'done', 归档: 'archived'
  }[status] || 'pending';
}

function statusMarkup(status) {
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
  document.querySelector('#site-title').textContent = '海外用户运营';
  document.querySelector('#site-subtitle').textContent = 'OEDRO 工作台';
  if (searchInput) searchInput.placeholder = '搜索当前页面';
  document.querySelector('#nav-list').innerHTML = data.nav.map((item) => `
    <a href="${escapeHtml(item.file)}" data-page="${escapeHtml(item.id)}" class="${item.id === page ? 'active' : ''}">
      <span>${escapeHtml(item.label)}</span>
    </a>`).join('');
  const current = data.nav.find((item) => item.id === page);
  document.querySelector('#breadcrumb-page').textContent = current?.label || '';
}

function renderOverview(data, topics, results) {
  const o = data.overview;
  const recentResults = [...(results?.results || [])]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  document.title = `海外用户运营｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = o.meta_description;
  document.querySelector('#content').innerHTML = `
    ${pageHeading('海外用户运营')}
    <section class="section overview-focus" data-searchable>
      ${sectionHead('当前重点', '<a class="text-link" href="work.html">查看全部项目 →</a>')}
      <div class="priority-list">
        ${data.work.focus.map((item) => `<div class="priority-row"><strong>${escapeHtml(item.title)}</strong>${statusMarkup(item.status)}</div>`).join('')}
      </div>
    </section>
    <section class="section" data-searchable>
      ${sectionHead('最近成果', '<a class="text-link" href="content-studio.html">查看全部 →</a>')}
      <div class="topic-list">${recentResults.map((item) => `<a class="topic-row" href="content-studio.html#${encodeURIComponent(item.id)}"><div><span class="result-date">${escapeHtml(item.date)}</span><strong>${escapeHtml(item.title)}</strong></div>${statusMarkup(item.status)}</a>`).join('')}</div>
    </section>
    <section class="section" data-searchable>
      ${sectionHead('工作入口')}
      <nav class="workspace-links" aria-label="工作入口">
        ${data.nav.filter((item) => item.id !== 'overview').map((item) => `<a href="${escapeHtml(item.file)}"><span>${escapeHtml(item.label)}</span><b aria-hidden="true">→</b></a>`).join('')}
      </nav>
    </section>
    <section class="section" data-searchable>
      ${sectionHead('专题与经验', '<a class="text-link" href="topics.html">查看全部 →</a>')}
      <div class="topic-list">${topics.items.filter((item) => item.featured).map(topicLink).join('')}</div>
    </section>
    <div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div>`;
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
    <section class="section method-stack">${data.stages.map(methodStageMarkup).join('')}</section>
    <div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div>`;
}

function renderWork(data) {
  const w = data.work;
  document.title = `${w.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = w.meta_description;
  document.querySelector('#content').innerHTML = `
    ${pageHeading(w.title)}
    <section class="section work-surface">
      <div class="table-toolbar">
        <div class="filter-row"><label for="status-filter">状态</label><select id="status-filter"><option>全部</option>${w.statuses.map((item) => `<option>${escapeHtml(item.name)}</option>`).join('')}</select><span class="count-note" id="project-count"></span></div>
      </div>
      <div class="data-table-wrap"><table class="data-table project-table"><thead><tr><th>项目</th><th>状态</th><th>当前情况</th><th>下一步</th><th>需要配合</th></tr></thead><tbody id="project-rows">
        ${w.projects.map((item) => `<tr data-searchable data-status="${escapeHtml(item.status)}"><td class="cell-title" data-label="项目">${escapeHtml(item.name)}</td><td data-label="状态">${statusMarkup(item.status)}</td><td data-label="当前情况">${escapeHtml(item.progress)}</td><td data-label="下一步">${escapeHtml(item.next)}</td><td data-label="需要配合">${escapeHtml(item.dependency)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div>
    </section>
    <section class="section" data-searchable>${sectionHead('当前阻塞')}<div class="topic-list">${w.blocked.map((item) => `<div class="topic-row"><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.reason)}</p></div>${statusMarkup('受阻')}</div>`).join('')}</div></section>
    `;
  document.querySelector('#status-filter')?.addEventListener('change', runSearch);
  runSearch();
}

function researchMethodsMarkup(r) {
  return `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>方法</th><th>适合回答什么</th><th>需要准备</th></tr></thead><tbody>${r.methods.map((item) => `<tr data-searchable><td class="cell-title" data-label="方法">${escapeHtml(item.name)}</td><td data-label="适合回答什么">${escapeHtml(item.use)}</td><td data-label="需要准备">${escapeHtml(item.needs)}</td></tr>`).join('')}</tbody></table></div>`;
}

function researchProgramsMarkup(r) {
  return `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>类型</th><th>启动条件</th><th>参与动作</th><th>获得什么</th><th>留下什么记录</th></tr></thead><tbody>${r.programs.map((item) => `<tr data-searchable><td class="cell-title" data-label="类型">${escapeHtml(item.name)}</td><td data-label="启动条件">${escapeHtml(item.start)}</td><td data-label="参与动作">${escapeHtml(item.task)}</td><td data-label="获得什么">${escapeHtml(item.return)}</td><td data-label="留下什么记录">${escapeHtml(item.record)}</td></tr>`).join('')}</tbody></table></div>`;
}

function researchRightsMarkup(r) {
  return `<div class="rights-list">${r.rights_groups.map((group) => `<section data-searchable><h3>${escapeHtml(group.title)}</h3>${group.items.map((item) => `<p>${escapeHtml(item)}</p>`).join('')}</section>`).join('')}</div>`;
}

function smartSurveyMarkup(r) {
  const image = r.case_image;
  return `<div class="smart-survey-case" data-searchable>
    <div class="smart-survey-copy">
      <p class="tab-intro">${escapeHtml(r.case_text)}</p>
    </div>
    <figure class="smart-survey-visual"><img src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" width="${escapeHtml(image.width)}" height="${escapeHtml(image.height)}" loading="lazy" decoding="async"></figure>
  </div>`;
}

function researchPanelMarkup(data, tabId) {
  const r = data.research;
  const project = data.work.projects.find((item) => item.id === 'work-light-research');
  const panels = {
    current: `<div class="current-research" data-searchable><div><h3>${escapeHtml(project.name)}</h3>${statusMarkup(project.status)}</div><p>${escapeHtml(project.progress)}</p></div>`,
    methods: researchMethodsMarkup(r),
    programs: researchProgramsMarkup(r),
    rights: researchRightsMarkup(r),
    'smart-survey': smartSurveyMarkup(r)
  };
  return panels[tabId] || panels.current;
}

function renderResearch(data) {
  const r = data.research;
  document.title = `用户调研/问卷｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = r.meta_description;
  const sections = [['current', '当前调研'], ['methods', '调研方法'], ['programs', '参与方式'], ['rights', '用户权利'], ['smart-survey', 'AI智能对话问卷']];
  document.querySelector('#content').innerHTML = `
    ${pageHeading('用户调研/问卷')}
    <section class="section research-surface">
      <div class="research-stack">${sections.map(([id, label]) => `<section class="research-expanded-section" data-searchable><h2>${escapeHtml(label)}</h2><div class="research-panel">${researchPanelMarkup(data, id)}</div></section>`).join('')}</div>
      <div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div>
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
    </section>
    <div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div>`;
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
      <div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div>
    </section>`;
}

function renderTopics(data, topics) {
  document.title = `${topics.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = 'OEDRO海外用户运营专题与当前状态。';
  document.querySelector('#content').innerHTML = `
    ${pageHeading(topics.title)}
    <section class="section topic-index-surface">
      <div class="table-toolbar"><div class="filter-row"><label for="topic-filter">状态</label><select id="topic-filter"><option>全部</option><option>筹备</option><option>待确认</option><option>进行中</option><option>受阻</option><option>已完成</option><option>归档</option></select><span class="count-note" id="topic-count"></span></div></div>
      <div class="topic-list" id="topic-list">${topics.items.map(topicLink).join('')}</div>
      <div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div>
    </section>`;
  document.querySelector('#topic-filter')?.addEventListener('change', runSearch);
  runSearch();
}

const topicTitleMap = {
  当前判断: '品牌声音', 'OEDRO怎么说': '表达原则', 不同渠道怎么变: '渠道语气',
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

function discordSections(topic) {
  return [
    { title: '当前情况', paragraphs: topic.summary },
    { title: '启动前', items: topic.before_launch },
    { title: '前30天', rows: topic.first_month },
    { title: '参与边界', items: topic.boundaries }
  ];
}

function visibleTopicSections(topic) {
  if (!topic.sections?.length) return discordSections(topic);
  const ids = {
    'brand-voice-system': ['current', 'principles', 'channels', 'donts'],
    'external-signals-to-relationships': ['external-signals', 'repeat-issue-threshold', 'turning-into-work', 'rights-and-platform-boundaries'],
    'seo-geo': ['current', 'milestones', 'baseline', 'next']
  }[topic.slug];
  return ids ? topic.sections.filter((section) => ids.includes(section.id)) : topic.sections;
}

function renderTopicSources(sources) {
  return sources.map((item) => `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.label)} ↗</a></li>`).join('');
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
  const sections = visibleTopicSections(topic);
  document.title = `${topic.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = topic.description;
  document.querySelector('#content').innerHTML = `
    ${pageHeading(topic.title)}
    <div class="topic-status-bar"><div><span class="eyebrow">${escapeHtml(topic.area)}</span>${statusMarkup(topic.status)}</div><a class="text-link" href="topics.html">返回专题列表 →</a></div>
    <div class="topic-layout">
      <article class="topic-body">${sections.map(topicSectionMarkup).join('')}
        ${renderRelatedPages(topic.related_pages)}
        <details class="disclosure source-disclosure" open><summary>来源</summary><div class="disclosure-body"><ul class="source-list">${renderTopicSources(topic.sources)}</ul></div></details>
      </article>
      <nav class="topic-toc" aria-label="页内导航"><strong>本页内容</strong>${sections.map((section, index) => `<a href="#topic-section-${index}">${escapeHtml(cleanTopicTitle(section.title))}</a>`).join('')}${topic.related_pages?.length ? '<a href="#topic-related">相关页面</a>' : ''}</nav>
    </div>
    <div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div>`;
}

function runSearch() {
  const query = normalize(searchInput?.value);
  const statusFilter = document.querySelector('#status-filter')?.value || '全部';
  const topicFilter = document.querySelector('#topic-filter')?.value || '全部';
  const items = [...document.querySelectorAll('[data-searchable]')];
  let matches = 0;
  items.forEach((item) => {
    const textMatch = !query || normalize(item.textContent).includes(query);
    const projectStatusMatch = !item.matches('#project-rows tr') || statusFilter === '全部' || item.dataset.status === statusFilter;
    const topicStatusMatch = !item.matches('#topic-list [data-status]') || topicFilter === '全部' || item.dataset.status === topicFilter;
    item.hidden = !(textMatch && projectStatusMatch && topicStatusMatch);
    if (!item.hidden) matches += 1;
  });
  const rows = [...document.querySelectorAll('#project-rows tr')];
  const count = document.querySelector('#project-count');
  if (count) count.textContent = `共 ${rows.filter((row) => !row.hidden).length} 个项目`;
  const topicRows = [...document.querySelectorAll('#topic-list [data-status]')];
  const topicCount = document.querySelector('#topic-count');
  if (topicCount) topicCount.textContent = `共 ${topicRows.filter((row) => !row.hidden).length} 个专题`;
  const empty = document.querySelector('.search-empty');
  if (empty) empty.hidden = matches > 0 || !query;
  if (searchStatus) searchStatus.textContent = query ? `找到 ${matches} 项` : '按 / 搜索';
}

menuButton?.addEventListener('click', () => setSidebar(!sidebar?.classList.contains('open')));
overlay?.addEventListener('click', () => setSidebar(false));
searchInput?.addEventListener('input', runSearch);
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && document.activeElement !== searchInput && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
    event.preventDefault();
    searchInput?.focus();
  }
  if (event.key === 'Escape') {
    setSidebar(false);
    if (document.activeElement === searchInput) searchInput.blur();
  }
});

async function init() {
  const [dataResponse, topicsResponse, voiceResponse, resultsResponse, radarResponse] = await Promise.all([
    fetch('data/content.json', { cache: 'no-store' }),
    fetch('data/topics.json', { cache: 'no-store' }),
    page === 'voice' ? fetch('data/user-voice.json', { cache: 'no-store' }) : Promise.resolve(null),
    page === 'overview' ? fetch('data/content-studio.json', { cache: 'no-store' }) : Promise.resolve(null),
    page === 'voice' ? fetch('data/demand-radar.json', { cache: 'no-store' }) : Promise.resolve(null)
  ]);
  if (!dataResponse.ok || !topicsResponse.ok || (page === 'voice' && (!voiceResponse?.ok || !radarResponse?.ok)) || (page === 'overview' && !resultsResponse?.ok)) throw new Error('页面数据加载失败');
  const [data, topics, voice, results, radar] = await Promise.all([
    dataResponse.json(),
    topicsResponse.json(),
    voiceResponse ? voiceResponse.json() : Promise.resolve(null),
    resultsResponse ? resultsResponse.json() : Promise.resolve(null),
    radarResponse ? radarResponse.json() : Promise.resolve(null)
  ]);
  renderShell(data);
  if (page === 'overview') renderOverview(data, topics, results);
  if (page === 'playbook') renderPlaybook(data);
  if (page === 'work') renderWork(data);
  if (page === 'research') renderResearch(data);
  if (page === 'flipbooks') renderFlipbooks(data);
  if (page === 'voice') renderUserVoice(data, voice, radar);
  if (page === 'topics' && location.pathname.endsWith('topics.html')) renderTopics(data, topics);
  if (page === 'topics' && location.pathname.endsWith('topic.html')) await renderTopic(data);
  if (page === 'studio' && location.pathname.endsWith('content-pipeline-test.html')) await window.initContentPipelineTests?.();
  if (page === 'studio' && !location.pathname.endsWith('content-pipeline-test.html')) await window.initContentStudio?.();
  if (page === 'mascot') await window.initMascot?.();
}

init().catch((error) => {
  document.querySelector('#content').innerHTML = `<div class="load-error"><strong>页面暂时无法加载</strong><p>${escapeHtml(error.message)}</p></div>`;
  console.error(error);
});
