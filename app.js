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

function navDescription(data, id) {
  return ({
    playbook: '稳定的工作原则和完成标准',
    work: '项目状态、待办、阻塞和下一步',
    research: '当前研究、方法、参与方式和用户权利',
    voice: '公开问题处理工作的阶段性汇总',
    studio: '已经形成的内容、研究、方案和工作成果',
    topics: '关键决定、稳定方法和专题经验'
  })[id] || data[id]?.description || '';
}

function topicLink(item) {
  return `<a class="topic-row" href="topic.html?slug=${encodeURIComponent(item.slug)}" data-searchable data-status="${escapeHtml(item.status)}">
    <div><span class="eyebrow">${escapeHtml(item.area)}</span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary)}</p></div>
    ${statusMarkup(item.status)}
  </a>`;
}

function renderShell(data) {
  document.querySelector('#site-title').textContent = '海外用户运营';
  document.querySelector('#site-subtitle').textContent = 'OEDRO 工作台';
  searchInput.placeholder = '搜索当前页面';
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
      ${sectionHead('下一步计划', '<a class="text-link" href="work.html">查看进展与待办 →</a>')}
      <div class="priority-list">
        ${data.work.next_items.slice(0, 5).map((item) => `<div class="priority-row"><strong>${escapeHtml(item)}</strong><span class="eyebrow">待推进</span></div>`).join('')}
      </div>
    </section>
    <section class="section" data-searchable>
      ${sectionHead('最近成果', '<a class="text-link" href="content-studio.html">查看全部 →</a>')}
      <div class="topic-list">${recentResults.map((item) => `<a class="topic-row" href="content-studio.html#${encodeURIComponent(item.id)}"><div><span class="eyebrow">${escapeHtml(item.date)} · ${escapeHtml(item.type)}</span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.description)}</p></div>${statusMarkup(item.status)}</a>`).join('')}</div>
    </section>
    <section class="section" data-searchable>
      ${sectionHead(o.decisions_title || '关键决定')}
      <div class="topic-list">${(o.decisions || []).map((item) => `<div class="topic-row"><div><span class="eyebrow">${escapeHtml(item.date)}</span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary)}</p></div></div>`).join('')}</div>
    </section>
    <section class="section" data-searchable>
      ${sectionHead('工作入口')}
      <nav class="workspace-links" aria-label="工作入口">
        ${data.nav.filter((item) => item.id !== 'overview').map((item) => `<a href="${escapeHtml(item.file)}"><span>${escapeHtml(item.label)}</span><small>${escapeHtml(navDescription(data, item.id))}</small><b aria-hidden="true">→</b></a>`).join('')}
      </nav>
    </section>
    <section class="section" data-searchable>
      ${sectionHead('专题与经验', '<a class="text-link" href="topics.html">查看全部 →</a>')}
      <div class="topic-list">${topics.items.filter((item) => item.featured).map(topicLink).join('')}</div>
    </section>
    <section class="section">
      <details class="disclosure">
        <summary>工作背景</summary>
        <div class="disclosure-body background-grid" data-searchable>
          <div>${o.why_paragraphs.map((item) => `<p>${escapeHtml(item)}</p>`).join('')}</div>
          <div><h3>已有基础</h3><ul>${o.foundations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul><h3>待补齐</h3><ul>${o.gaps.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
          <div class="background-scope"><h3>工作范围</h3><ul>${data.capabilities.map((item) => `<li><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.purpose)}</span></li>`).join('')}</ul></div>
        </div>
      </details>
    </section>
    <div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div>`;
}

function renderMethodDetail(stage) {
  const target = document.querySelector('#method-detail');
  if (!target) return;
  target.innerHTML = `
    <header><span class="eyebrow">阶段 ${String(stage.id).padStart(2, '0')}</span><h2>${escapeHtml(stage.name)}</h2><p>${escapeHtml(stage.summary)}</p></header>
    <div class="method-grid">
      <section><h3>开始前</h3><p>${escapeHtml(stage.prerequisite)}</p></section>
      <section><h3>要做的事</h3><ul>${stage.actions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>
      <section><h3>产出</h3><ul>${stage.deliverables.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>
      <section><h3>完成标准</h3><p>${escapeHtml(stage.done_when)}</p></section>
    </div>`;
}

function renderPlaybook(data) {
  const p = data.playbook;
  document.title = `工作方法｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = p.meta_description;
  document.querySelector('#content').innerHTML = `
    ${pageHeading('工作方法')}
    <section class="section method-layout" data-searchable>
      <nav class="method-rail" aria-label="工作阶段">
        ${data.stages.map((stage, index) => `<button type="button" data-stage="${stage.id}" class="${index === 0 ? 'active' : ''}"><span>${String(stage.id).padStart(2, '0')}</span><strong>${escapeHtml(stage.name)}</strong></button>`).join('')}
      </nav>
      <article class="method-detail" id="method-detail"></article>
    </section>
    <section class="section">
      <details class="disclosure"><summary>最终要形成什么</summary><div class="disclosure-body outcome-list" data-searchable>
        ${p.results.map((item) => `<div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.description)}</p></div>`).join('')}
      </div></details>
    </section>
    <div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div>`;
  renderMethodDetail(data.stages[0]);
  document.querySelectorAll('[data-stage]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-stage]').forEach((item) => item.classList.toggle('active', item === button));
    renderMethodDetail(data.stages.find((stage) => String(stage.id) === button.dataset.stage));
  }));
}

function renderStatusLegend(statuses) {
  return `<details class="status-legend"><summary>状态说明</summary><div>${statuses.map((item) => `<p>${statusMarkup(item.name)}<span>${escapeHtml(item.description)}</span></p>`).join('')}</div></details>`;
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
        ${renderStatusLegend(w.statuses)}
      </div>
      <div class="data-table-wrap"><table class="data-table project-table"><thead><tr><th>项目</th><th>状态</th><th>当前情况</th><th>下一步</th><th>需要配合</th></tr></thead><tbody id="project-rows">
        ${w.projects.map((item) => `<tr data-searchable data-status="${escapeHtml(item.status)}"><td class="cell-title" data-label="项目">${escapeHtml(item.name)}</td><td data-label="状态">${statusMarkup(item.status)}</td><td data-label="当前情况">${escapeHtml(item.progress)}</td><td data-label="下一步">${escapeHtml(item.next)}</td><td data-label="需要配合">${escapeHtml(item.dependency)}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div>
    </section>
    <section class="section" data-searchable>${sectionHead('待办与计划')}<div class="priority-list">${w.next_items.map((item) => `<div class="priority-row"><strong>${escapeHtml(item)}</strong><span class="eyebrow">待推进</span></div>`).join('')}</div></section>
    <section class="section" data-searchable>${sectionHead('当前阻塞')}<div class="topic-list">${w.blocked.map((item) => `<div class="topic-row"><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.reason)}</p></div>${statusMarkup('受阻')}</div>`).join('')}</div></section>
    <section class="section"><details class="disclosure"><summary>已有基础</summary><div class="disclosure-body" data-searchable><ul>${w.foundation_items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div></details></section>`;
  document.querySelector('#status-filter')?.addEventListener('change', runSearch);
  runSearch();
}

function researchMethodsMarkup(r) {
  return `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>方法</th><th>适合回答什么</th><th>开始前</th></tr></thead><tbody>${r.methods.map((item) => `<tr data-searchable><td class="cell-title" data-label="方法">${escapeHtml(item.name)}</td><td data-label="适合回答什么">${escapeHtml(item.use)}</td><td data-label="开始前">${escapeHtml(item.needs)}</td></tr>`).join('')}</tbody></table></div>`;
}

function researchProgramsMarkup(r) {
  return `<div class="data-table-wrap"><table class="data-table"><thead><tr><th>类型</th><th>邀请条件</th><th>参与动作</th><th>能获得什么</th><th>需要记录</th></tr></thead><tbody>${r.programs.map((item) => `<tr data-searchable><td class="cell-title" data-label="类型">${escapeHtml(item.name)}</td><td data-label="邀请条件">${escapeHtml(item.start)}</td><td data-label="参与动作">${escapeHtml(item.task)}</td><td data-label="能获得什么">${escapeHtml(item.return)}</td><td data-label="需要记录">${escapeHtml(item.record)}</td></tr>`).join('')}</tbody></table></div>`;
}

function researchRightsMarkup(r) {
  return `<div class="rights-list">${r.rights_groups.map((group) => `<section data-searchable><h3>${escapeHtml(group.title)}</h3>${group.items.map((item) => `<p>${escapeHtml(item)}</p>`).join('')}</section>`).join('')}</div>`;
}

function researchCaseMarkup(r) {
  return `<p class="tab-intro">${escapeHtml(r.case_text)}</p><div class="light-lab-gallery">${r.case_images.map((item) => `<figure class="light-lab-figure light-lab-${escapeHtml(item.orientation)}"><img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt)}" width="${escapeHtml(item.width)}" height="${escapeHtml(item.height)}" loading="lazy" decoding="async"><figcaption>${escapeHtml(item.caption)}</figcaption></figure>`).join('')}</div>`;
}

function renderResearchPanel(data, tabId) {
  const r = data.research;
  const project = data.work.projects.find((item) => item.id === 'work-light-research');
  const panel = document.querySelector('#research-panel');
  if (!panel) return;
  const panels = {
    current: `<div class="current-research" data-searchable><div><span class="eyebrow">当前项目</span><h2>${escapeHtml(project.name)}</h2>${statusMarkup(project.status)}</div><dl><div><dt>当前情况</dt><dd>${escapeHtml(project.progress)}</dd></div><div><dt>下一步</dt><dd>${escapeHtml(project.next)}</dd></div><div><dt>需要配合</dt><dd>${escapeHtml(project.dependency)}</dd></div></dl></div>`,
    methods: researchMethodsMarkup(r),
    programs: researchProgramsMarkup(r),
    rights: researchRightsMarkup(r),
    lightlab: researchCaseMarkup(r)
  };
  panel.innerHTML = panels[tabId] || panels.current;
}

function renderResearch(data) {
  const r = data.research;
  document.title = `用户研究｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = r.meta_description;
  const tabs = [['current', '当前研究'], ['methods', '研究方法'], ['programs', '参与方式'], ['rights', '用户权利'], ['lightlab', 'Light Lab']];
  document.querySelector('#content').innerHTML = `
    ${pageHeading('用户研究')}
    <section class="section research-surface">
      <div class="tabs" role="tablist" aria-label="用户研究内容">${tabs.map(([id, label], index) => `<button type="button" role="tab" aria-selected="${index === 0}" data-research-tab="${id}" class="${index === 0 ? 'active' : ''}">${label}</button>`).join('')}</div>
      <div class="research-panel" id="research-panel" role="tabpanel"></div>
      <div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div>
    </section>`;
  renderResearchPanel(data, 'current');
  document.querySelectorAll('[data-research-tab]').forEach((button) => button.addEventListener('click', () => {
    document.querySelectorAll('[data-research-tab]').forEach((item) => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-selected', String(active));
    });
    renderResearchPanel(data, button.dataset.researchTab);
  }));
}

function renderUserVoice(data, voice) {
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
    fitment: '车型适配', installation: '安装', warranty: '保修', product_quality: '产品质量',
    shipping_returns: '配送与退换', support: '售后支持', community: '社区', general: '通用问题'
  };
  document.title = `${copy.title || '问题与反馈'}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = copy.meta_description || 'OEDRO海外用户运营公开问题与反馈汇总。';
  document.querySelector('#content').innerHTML = `
    ${pageHeading(copy.title || '问题与反馈', copy.description || '')}
    <section class="section" data-searchable>
      <div class="section-head"><h2>${escapeHtml(copy.snapshot_title || '最近汇总')}</h2></div>
      <div class="outcome-list">
        ${(copy.snapshot || []).map((item) => `<div><span class="eyebrow">${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong><p>${escapeHtml(item.note)}</p></div>`).join('')}
      </div>
    </section>
    <section class="section" data-searchable>
      <div class="section-head"><h2>${escapeHtml(copy.findings_title || '当前结论')}</h2></div>
      <div class="priority-list">${(copy.findings || []).map((item) => `<div class="priority-row"><strong>${escapeHtml(item)}</strong></div>`).join('')}</div>
    </section>
    <section class="section user-voice-surface">
      <div class="section-head"><div><h2>${escapeHtml(copy.public_title || '可公开洞察')}</h2><p>${escapeHtml(copy.public_description || '')}</p></div></div>
      <div class="voice-insights" id="voice-insights">
        ${insights.map((item) => `<article class="voice-insight" data-searchable>
          <div><span class="eyebrow">${escapeHtml(actionLabels[item.action_type] || item.action_type)}</span></div>
          <div><h3>${escapeHtml(topicLabels[item.public_topic] || item.public_topic)} · ${escapeHtml(actionLabels[item.action_type] || item.action_type)}</h3><p class="voice-evidence">${escapeHtml(strengthLabels[item.evidence_strength] || item.evidence_strength)} · ${Number(item.source_count) || 0} 个公开来源 · ${Number(item.independent_voice_count) || 0} 个独立声音</p></div>
        </article>`).join('')}
      </div>
      <div class="empty-state voice-empty" id="voice-empty"${insights.length ? ' hidden' : ''}><strong>${escapeHtml(copy.empty_message || '暂无可公开洞察')}</strong><span>${escapeHtml(copy.empty_detail || '')}</span></div>
      <div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div>
    </section>
    <section class="section">
      <details class="disclosure"><summary>${escapeHtml(copy.workflow_title || '处理方法')}</summary><div class="disclosure-body"><div class="voice-workflow">
        ${(copy.workflow || []).map((item, index) => `<div><span>${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.description)}</p></div>`).join('')}
      </div></div></details>
    </section>
    <section class="section">
      <div class="section-head"><h2>${escapeHtml(copy.related_title || '接着处理')}</h2></div>
      <nav class="workspace-links" aria-label="相关入口">
        ${(copy.related || []).map((item) => `<a href="${escapeHtml(item.file)}"><span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.description)}</small><b aria-hidden="true">→</b></a>`).join('')}
      </nav>
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
    { title: '用途', items: topic.purpose },
    { title: '启动条件', items: topic.before_launch },
    { title: '前30天', rows: topic.first_month },
    { title: '内容安排', items: topic.weekly },
    { title: '判断标准', items: topic.measure },
    { title: '参与边界', items: topic.boundaries },
    { title: '待确认', items: topic.pending }
  ];
}

function renderTopicSources(sources) {
  return sources.map((item) => {
    const note = [item.published_or_updated, item.supports].filter(Boolean).join(' · ');
    return `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.label)} ↗</a>${note ? `<p>${escapeHtml(note)}</p>` : ''}</li>`;
  }).join('');
}

function renderRelatedPages(pages = []) {
  if (!pages.length) return '';
  return `<section class="topic-content-section topic-related" id="topic-related" data-searchable>
    <h2>接着去哪里</h2>
    <div class="related-page-list">${pages.map((item) => `<a href="${escapeHtml(item.href)}"><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.description)}</p><span aria-hidden="true">→</span></a>`).join('')}</div>
  </section>`;
}

async function renderTopic(data) {
  const slug = new URLSearchParams(window.location.search).get('slug') || 'discord-community';
  const response = await fetch(`data/topics/${encodeURIComponent(slug)}.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error('专题加载失败');
  const topic = await response.json();
  const sections = topic.sections?.length ? topic.sections : discordSections(topic);
  document.title = `${topic.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = topic.description;
  document.querySelector('#content').innerHTML = `
    ${pageHeading(topic.title, topic.description)}
    <div class="topic-status-bar"><div><span class="eyebrow">${escapeHtml(topic.area)}</span>${statusMarkup(topic.status)}</div><a class="text-link" href="topics.html">返回专题列表 →</a></div>
    <div class="topic-layout">
      <article class="topic-body">${sections.map(topicSectionMarkup).join('')}
        ${renderRelatedPages(topic.related_pages)}
        <details class="disclosure source-disclosure"><summary>来源</summary><div class="disclosure-body"><ul class="source-list">${renderTopicSources(topic.sources)}</ul></div></details>
      </article>
      <nav class="topic-toc" aria-label="页内导航"><strong>本页内容</strong>${sections.map((section, index) => `<a href="#topic-section-${index}">${escapeHtml(cleanTopicTitle(section.title))}</a>`).join('')}${topic.related_pages?.length ? '<a href="#topic-related">接着去哪里</a>' : ''}</nav>
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
  const [dataResponse, topicsResponse, voiceResponse, resultsResponse] = await Promise.all([
    fetch('data/content.json', { cache: 'no-store' }),
    fetch('data/topics.json', { cache: 'no-store' }),
    page === 'voice' ? fetch('data/user-voice.json', { cache: 'no-store' }) : Promise.resolve(null),
    page === 'overview' ? fetch('data/content-studio.json', { cache: 'no-store' }) : Promise.resolve(null)
  ]);
  if (!dataResponse.ok || !topicsResponse.ok || (page === 'voice' && !voiceResponse?.ok) || (page === 'overview' && !resultsResponse?.ok)) throw new Error('页面数据加载失败');
  const [data, topics, voice, results] = await Promise.all([
    dataResponse.json(),
    topicsResponse.json(),
    voiceResponse ? voiceResponse.json() : Promise.resolve(null),
    resultsResponse ? resultsResponse.json() : Promise.resolve(null)
  ]);
  renderShell(data);
  if (page === 'overview') renderOverview(data, topics, results);
  if (page === 'playbook') renderPlaybook(data);
  if (page === 'work') renderWork(data);
  if (page === 'research') renderResearch(data);
  if (page === 'voice') renderUserVoice(data, voice);
  if (page === 'topics' && location.pathname.endsWith('topics.html')) renderTopics(data, topics);
  if (page === 'topics' && location.pathname.endsWith('topic.html')) await renderTopic(data);
  if (page === 'studio') await window.initContentStudio?.();
}

init().catch((error) => {
  document.querySelector('#content').innerHTML = `<div class="load-error"><strong>页面暂时无法加载</strong><p>${escapeHtml(error.message)}</p></div>`;
  console.error(error);
});
