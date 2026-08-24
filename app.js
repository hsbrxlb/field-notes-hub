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

function statusMarkup(status) {
  return `<span class="status status-${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}

function pageHeading(title, description, label) {
  return `<div class="page-heading"><div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p></div><span class="page-tag">${escapeHtml(label)}</span></div>`;
}

function sectionHead(title, label) {
  return `<div class="section-head"><h2>${escapeHtml(title)}</h2>${label ? `<p>${escapeHtml(label)}</p>` : ''}</div>`;
}

function socialMediaMarkup(data) {
  const social = data.social_media;
  return `<div class="social-media-intro"><p>${escapeHtml(social.summary)}</p></div>
    <ol class="social-media-steps">
      ${social.steps.map((item, index) => `<li data-searchable><span class="social-step-index">0${index + 1}</span><div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.description)}</p></div></li>`).join('')}
    </ol>`;
}

function navDescription(data, id) {
  if (id === 'playbook') return data.playbook.description;
  if (id === 'work') return data.work.description;
  if (id === 'research') return data.research.description;
  if (id === 'topics') return '按主题查看目标、当前情况、启动条件和后续安排。';
  return '';
}

function topicLink(item) {
  return `<a class="topic-row" href="topic.html?slug=${encodeURIComponent(item.slug)}" data-searchable data-status="${escapeHtml(item.status)}">
    <div><span class="topic-area">${escapeHtml(item.area)}</span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.summary)}</p></div>
    ${statusMarkup(item.status)}
  </a>`;
}

function renderShell(data) {
  document.querySelector('#site-title').textContent = '海外用户运营';
  document.querySelector('#site-subtitle').textContent = 'OEDRO 工作台';
  searchInput.placeholder = data.site.search_hint;
  document.querySelector('#nav-list').innerHTML = data.nav.map((item, index) => `
    <a href="${escapeHtml(item.file)}" data-page="${escapeHtml(item.id)}" class="${item.id === page ? 'active' : ''}">
      <span>${escapeHtml(item.label)}</span><span class="nav-index">0${index + 1}</span>
    </a>`).join('');
  const current = data.nav.find((item) => item.id === page);
  document.querySelector('#breadcrumb-page').textContent = current?.label || '';
}

function renderOverview(data, topics) {
  const o = data.overview;
  document.title = `${o.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = o.meta_description;
  const content = document.querySelector('#content');
  content.innerHTML = `
    ${pageHeading(o.title, o.description, '总览')}
    <section class="section" data-searchable>${sectionHead(o.why_title, '')}
      <div class="grid-two">
        <article class="panel"><span class="panel-label">${escapeHtml(o.why_label)}</span>${o.why_paragraphs.map((item) => `<p>${escapeHtml(item)}</p>`).join('')}</article>
        <article class="panel"><span class="panel-label">${escapeHtml(o.maturity_label)}</span><h3 class="maturity-title">${escapeHtml(o.maturity_title)}</h3><p>${escapeHtml(o.maturity_description)}</p></article>
      </div>
    </section>
    <section class="section">${sectionHead(o.stages_title, o.stages_label)}<div class="stage-strip">
      ${data.stages.map((stage) => `<a class="stage-link" href="playbook.html#stage-${stage.id}" data-searchable><span class="stage-number">0${stage.id}</span><strong>${escapeHtml(stage.name)}</strong><span>${escapeHtml(stage.summary)}</span></a>`).join('')}
    </div></section>
    <section class="section">${sectionHead(o.entry_title, o.entry_label)}<div class="page-links">
      ${data.nav.filter((item) => item.id !== 'overview').map((item) => `<a class="page-link" href="${escapeHtml(item.file)}" data-searchable><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(navDescription(data, item.id))}</span></a>`).join('')}
    </div></section>
    <section class="section">${sectionHead(o.topics_title, '')}<p class="section-intro">${escapeHtml(o.topics_text)}</p><div class="topic-list">
      ${topics.items.filter((item) => item.featured).map(topicLink).join('')}
    </div></section>
    <section class="section">${sectionHead(o.timeline_title, o.timeline_label)}<div class="timeline">
      ${o.timeline.map((item) => `<article class="timeline-item" data-searchable><time>${escapeHtml(item.period)}</time><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p></article>`).join('')}
    </div></section>
    <section class="section">${sectionHead(o.foundations_title, o.foundations_label)}<div class="grid-two">
      <article class="panel" data-searchable><h3>${escapeHtml(o.foundations_title)}</h3><ul class="compact-list">${o.foundations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
      <article class="panel" data-searchable><h3>${escapeHtml(o.gaps_title)}</h3><ul class="compact-list">${o.gaps.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
    </div></section>
    <section class="section">${sectionHead(o.capabilities_title, o.capabilities_label)}<div class="capability-grid">
      ${data.capabilities.map((item) => `<article class="capability-item" data-searchable><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.purpose)}</p><small>${escapeHtml(item.minimum)}</small></article>`).join('')}
    </div></section>
    <section class="section">${sectionHead(data.social_media.title, '')}${socialMediaMarkup(data)}<div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div></section>`;
}

function renderTopics(data, topics) {
  document.title = `${topics.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = 'OEDRO海外用户运营专题：集中查看单项工作的现状、启动条件和后续安排。';
  document.querySelector('#content').innerHTML = `
    ${pageHeading(topics.title, topics.description, '专题')}
    <section class="section"><div class="section-head"><h2>专题列表</h2><div class="filter-row"><label for="topic-filter">状态</label><select id="topic-filter"><option>全部</option><option>筹备</option><option>待确认</option><option>进行中</option><option>受阻</option><option>已完成</option><option>归档</option></select><span class="count-note" id="topic-count"></span></div></div>
      <div class="topic-list" id="topic-list">${topics.items.map(topicLink).join('')}</div>
      <div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div>
    </section>`;
  document.querySelector('#topic-filter')?.addEventListener('change', runSearch);
}

function labelledList(title, items) {
  return `<section class="section topic-section" data-searchable>${sectionHead(title, '')}<ul class="topic-points">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></section>`;
}

async function renderTopic(data) {
  const slug = new URLSearchParams(window.location.search).get('slug') || 'discord-community';
  const response = await fetch(`data/topics/${encodeURIComponent(slug)}.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error('专题加载失败');
  const topic = await response.json();
  document.title = `${topic.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = topic.description;
  document.querySelector('#content').innerHTML = `
    ${pageHeading(topic.title, topic.description, topic.area)}
    <section class="section topic-status-line"><div><span class="topic-area">${escapeHtml(topic.area)}</span>${statusMarkup(topic.status)}</div><a href="topics.html">返回运营专题 →</a></section>
    <section class="section topic-section" data-searchable>${sectionHead('当前情况', '')}${topic.summary.map((item) => `<p>${escapeHtml(item)}</p>`).join('')}</section>
    ${labelledList('这个社区用来做什么', topic.purpose)}
    ${labelledList('启动前要确认', topic.before_launch)}
    <section class="section topic-section" data-searchable>${sectionHead('前30天怎么跑', '')}<div class="topic-timeline">${topic.first_month.map((item, index) => `<div><span>0${index + 1}</span><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.text)}</p></div>`).join('')}</div></section>
    ${labelledList('每周内容安排', topic.weekly)}
    ${labelledList('怎么判断有没有跑起来', topic.measure)}
    ${labelledList('服务、研究和内容授权', topic.boundaries)}
    ${labelledList('当前待确认', topic.pending)}
    <section class="section topic-section" data-searchable>${sectionHead('参考资料', '')}<ul class="topic-sources">${topic.sources.map((item) => `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.label)} ↗</a></li>`).join('')}</ul></section>
    <div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div>`;
}

function renderPlaybook(data) {
  const p = data.playbook;
  document.title = `${p.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = p.meta_description;
  document.querySelector('#content').innerHTML = `
    ${pageHeading(p.title, p.description, '步骤')}
    <section class="section">${sectionHead(p.section_title, p.section_label)}<div class="phase-list">
      ${data.stages.map((stage) => `<article class="phase" id="stage-${stage.id}" data-searchable>
        <div class="phase-head"><span class="phase-index">0${stage.id}</span><div><strong>${escapeHtml(stage.name)}</strong><p>${escapeHtml(stage.summary)}</p></div></div>
        <div class="phase-body">
          <div><h3>开始条件</h3><p>${escapeHtml(stage.prerequisite)}</p></div>
          <div><h3>完成标准</h3><p>${escapeHtml(stage.done_when)}</p></div>
          <div><h3>要做的事</h3><ul>${stage.actions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
          <div><h3>交付内容</h3><ul>${stage.deliverables.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
        </div></article>`).join('')}
    </div></section>
    <section class="section" id="social-media">${sectionHead(data.social_media.title, '')}${socialMediaMarkup(data)}</section>
    <section class="section">${sectionHead(p.results_title, p.results_label)}<div class="result-grid">
      ${p.results.map((item) => `<article class="result" data-searchable><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.description)}</span></article>`).join('')}
    </div><div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div></section>`;
}

function renderWork(data) {
  const w = data.work;
  document.title = `${w.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = w.meta_description;
  document.querySelector('#content').innerHTML = `
    ${pageHeading(w.title, w.description, '工作')}
    <section class="section">${sectionHead(w.status_title, w.status_label)}<div class="status-guide">
      ${w.statuses.map((item) => `<div data-searchable>${statusMarkup(item.name)}<p>${escapeHtml(item.description)}</p></div>`).join('')}
    </div></section>
    <section class="section">${sectionHead(w.focus_title, w.focus_label)}<div class="focus-list">
      ${w.focus.map((item) => `<div class="focus-item" data-searchable><strong>${escapeHtml(item.title)}</strong>${statusMarkup(item.status)}</div>`).join('')}
    </div></section>
    <section class="section"><div class="section-head"><h2>${escapeHtml(w.projects_title)}</h2><div class="filter-row"><label for="status-filter">状态</label><select id="status-filter"><option>全部</option>${w.statuses.map((item) => `<option>${escapeHtml(item.name)}</option>`).join('')}</select><span class="count-note" id="project-count"></span></div></div>
      <div class="data-table-wrap"><table class="data-table project-table"><thead><tr><th>项目</th><th>状态</th><th>当前情况</th><th>下一步</th><th>需要配合</th></tr></thead><tbody id="project-rows">
        ${w.projects.map((item) => `<tr data-searchable data-status="${escapeHtml(item.status)}"><td class="cell-title" data-label="项目">${escapeHtml(item.name)}</td><td data-label="状态">${statusMarkup(item.status)}</td><td data-label="当前情况">${escapeHtml(item.progress)}</td><td data-label="下一步">${escapeHtml(item.next)}</td><td data-label="需要配合">${escapeHtml(item.dependency)}</td></tr>`).join('')}
      </tbody></table></div><div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div>
    </section>
    <section class="section">${sectionHead(w.blocked_title, w.blocked_label)}<div class="panel item-list">
      ${w.blocked.map((item) => `<div class="item-row" data-searchable><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.reason)}</p></div>`).join('')}
    </div></section>
    <section class="section">${sectionHead(w.next_title, w.next_label)}<div class="grid-two">
      <article class="panel" data-searchable><h3>${escapeHtml(w.next_title)}</h3><ul class="compact-list">${w.next_items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
      <article class="panel" data-searchable><h3>${escapeHtml(w.foundations_title)}</h3><ul class="compact-list">${w.foundation_items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>
    </div></section>`;
  document.querySelector('#status-filter')?.addEventListener('change', runSearch);
}

function renderResearch(data) {
  const r = data.research;
  document.title = `${r.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = r.meta_description;
  document.querySelector('#content').innerHTML = `
    ${pageHeading(r.title, r.description, '研究')}
    <section class="section">${sectionHead(r.methods_title, r.methods_label)}<div class="data-table-wrap"><table class="data-table"><thead><tr><th>方法</th><th>适合用来做什么</th><th>开始前要准备</th></tr></thead><tbody>
      ${r.methods.map((item) => `<tr data-searchable><td class="cell-title" data-label="方法">${escapeHtml(item.name)}</td><td data-label="适合用来做什么">${escapeHtml(item.use)}</td><td data-label="开始前要准备">${escapeHtml(item.needs)}</td></tr>`).join('')}
    </tbody></table></div></section>
    <section class="section">${sectionHead(r.programs_title, r.programs_label)}<div class="data-table-wrap"><table class="data-table"><thead><tr><th>类型</th><th>怎么邀请</th><th>用户要做什么</th><th>能得到什么</th><th>需要记录</th></tr></thead><tbody>
      ${r.programs.map((item) => `<tr data-searchable><td class="cell-title" data-label="类型">${escapeHtml(item.name)}</td><td data-label="怎么邀请">${escapeHtml(item.start)}</td><td data-label="用户要做什么">${escapeHtml(item.task)}</td><td data-label="能得到什么">${escapeHtml(item.return)}</td><td data-label="需要记录">${escapeHtml(item.record)}</td></tr>`).join('')}
    </tbody></table></div></section>
    <section class="section">${sectionHead(r.rights_title, r.rights_label)}<div class="rights-grid">
      ${r.rights_groups.map((group) => `<article class="rights-group" data-searchable><h3>${escapeHtml(group.title)}</h3><ul>${group.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>`).join('')}
    </div></section>
    <section class="section">${sectionHead(r.case_title, r.case_label)}<article class="panel light-lab-case" data-searchable><p class="light-lab-intro">${escapeHtml(r.case_text)}</p><div class="light-lab-gallery">
      ${r.case_images.map((item) => `<figure class="light-lab-figure light-lab-${escapeHtml(item.orientation)}"><img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt)}" width="${escapeHtml(item.width)}" height="${escapeHtml(item.height)}" loading="lazy" decoding="async"><figcaption>${escapeHtml(item.caption)}</figcaption></figure>`).join('')}
    </div></article></section>
    <section class="section">${sectionHead(r.entry_title, r.entry_label)}<article class="panel" data-searchable><p>${escapeHtml(r.entry_text)}</p><p class="entry-note"><strong>下一步：</strong>${escapeHtml(r.entry_next)}</p></article><div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div></section>`;
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
  if (count) count.textContent = `${rows.filter((row) => !row.hidden).length} 项`;
  const topicRows = [...document.querySelectorAll('#topic-list [data-status]')];
  const topicCount = document.querySelector('#topic-count');
  if (topicCount) topicCount.textContent = `${topicRows.filter((row) => !row.hidden).length} 个`;
  const empty = document.querySelector('.search-empty');
  if (empty) empty.hidden = matches > 0 || !query;
  searchStatus.textContent = query ? `找到 ${matches} 项` : '按 / 搜索本页';
}

menuButton?.addEventListener('click', () => setSidebar(!sidebar?.classList.contains('open')));
overlay?.addEventListener('click', () => setSidebar(false));
searchInput?.addEventListener('input', runSearch);
window.addEventListener('resize', () => { if (window.innerWidth > 760) setSidebar(false); });
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
    event.preventDefault();
    searchInput?.focus();
  }
  if (event.key === 'Escape' && document.activeElement === searchInput) {
    searchInput.value = '';
    runSearch();
    searchInput.blur();
  }
  if (event.key === 'Escape' && sidebar?.classList.contains('open')) setSidebar(false);
});

async function init() {
  try {
    const [contentResponse, topicsResponse] = await Promise.all([
      fetch('data/content.json', { cache: 'no-store' }),
      fetch('data/topics.json', { cache: 'no-store' })
    ]);
    if (!contentResponse.ok || !topicsResponse.ok) throw new Error('内容加载失败');
    const [data, topics] = await Promise.all([contentResponse.json(), topicsResponse.json()]);
    renderShell(data);
    if (page === 'overview') renderOverview(data, topics);
    if (page === 'playbook') renderPlaybook(data);
    if (page === 'work') renderWork(data);
    if (page === 'research') renderResearch(data);
    if (page === 'topics' && window.location.pathname.endsWith('/topics.html')) renderTopics(data, topics);
    if (page === 'topics' && window.location.pathname.endsWith('/topic.html')) await renderTopic(data);
    runSearch();
  } catch (error) {
    document.querySelector('#content').innerHTML = '<div class="empty-state" role="status">内容加载失败，请刷新页面。</div>';
    console.error(error);
  }
}

init();
