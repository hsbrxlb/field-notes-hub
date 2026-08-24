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
  return `<div class="section-head"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(label)}</p></div>`;
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

function renderOverview(data) {
  const o = data.overview;
  document.title = `${o.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = o.meta_description;
  const content = document.querySelector('#content');
  content.innerHTML = `
    ${pageHeading(o.title, o.description, '总览')}
    <section class="section" data-searchable>${sectionHead(o.why_title, o.why_label)}
      <div class="grid-two">
        <article class="panel"><span class="panel-label">${escapeHtml(o.why_label)}</span>${o.why_paragraphs.map((item) => `<p>${escapeHtml(item)}</p>`).join('')}</article>
        <article class="panel"><span class="panel-label">${escapeHtml(o.maturity_label)}</span><h3 class="maturity-title">${escapeHtml(o.maturity_title)}</h3><p>${escapeHtml(o.maturity_description)}</p></article>
      </div>
    </section>
    <section class="section">${sectionHead(o.stages_title, o.stages_label)}<div class="stage-strip">
      ${data.stages.map((stage) => `<a class="stage-link" href="playbook.html#stage-${stage.id}" data-searchable><span class="stage-number">0${stage.id}</span><strong>${escapeHtml(stage.name)}</strong><span>${escapeHtml(stage.summary)}</span></a>`).join('')}
    </div></section>
    <section class="section">${sectionHead(o.entry_title, o.entry_label)}<div class="page-links">
      ${data.nav.filter((item) => item.id !== 'overview').map((item) => `<a class="page-link" href="${escapeHtml(item.file)}" data-searchable><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.id === 'playbook' ? data.playbook.description : item.id === 'work' ? data.work.description : data.research.description)}</span></a>`).join('')}
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
    </div><div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div></section>`;
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
        ${w.projects.map((item) => `<tr data-searchable data-status="${escapeHtml(item.status)}"><td class="cell-title">${escapeHtml(item.name)}</td><td>${statusMarkup(item.status)}</td><td>${escapeHtml(item.progress)}</td><td>${escapeHtml(item.next)}</td><td>${escapeHtml(item.dependency)}</td></tr>`).join('')}
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
    <section class="section">${sectionHead(r.methods_title, r.methods_label)}<div class="data-table-wrap"><table class="data-table"><thead><tr><th>方法</th><th>适合回答</th><th>还需配合</th></tr></thead><tbody>
      ${r.methods.map((item) => `<tr data-searchable><td class="cell-title">${escapeHtml(item.name)}</td><td>${escapeHtml(item.use)}</td><td>${escapeHtml(item.needs)}</td></tr>`).join('')}
    </tbody></table></div></section>
    <section class="section">${sectionHead(r.programs_title, r.programs_label)}<div class="data-table-wrap"><table class="data-table"><thead><tr><th>类型</th><th>启动条件</th><th>用户任务</th><th>公司提供</th><th>需要记录</th></tr></thead><tbody>
      ${r.programs.map((item) => `<tr data-searchable><td class="cell-title">${escapeHtml(item.name)}</td><td>${escapeHtml(item.start)}</td><td>${escapeHtml(item.task)}</td><td>${escapeHtml(item.return)}</td><td>${escapeHtml(item.record)}</td></tr>`).join('')}
    </tbody></table></div></section>
    <section class="section">${sectionHead(r.rights_title, r.rights_label)}<div class="rights-grid">
      ${r.rights_groups.map((group) => `<article class="rights-group" data-searchable><h3>${escapeHtml(group.title)}</h3><ul>${group.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></article>`).join('')}
    </div></section>
    <section class="section">${sectionHead(r.case_title, r.case_label)}<article class="panel" data-searchable><p>${escapeHtml(r.case_text)}</p></article></section>
    <section class="section">${sectionHead(r.entry_title, r.entry_label)}<article class="panel" data-searchable><p>${escapeHtml(r.entry_text)}</p><p class="entry-note"><strong>下一步：</strong>${escapeHtml(r.entry_next)}</p></article><div class="empty-state search-empty" role="status" hidden>${escapeHtml(data.site.no_match)}</div></section>`;
}

function runSearch() {
  const query = normalize(searchInput?.value);
  const statusFilter = document.querySelector('#status-filter')?.value || '全部';
  const items = [...document.querySelectorAll('[data-searchable]')];
  let matches = 0;
  items.forEach((item) => {
    const textMatch = !query || normalize(item.textContent).includes(query);
    const statusMatch = !item.matches('#project-rows tr') || statusFilter === '全部' || item.dataset.status === statusFilter;
    item.hidden = !(textMatch && statusMatch);
    if (!item.hidden) matches += 1;
  });
  const rows = [...document.querySelectorAll('#project-rows tr')];
  const count = document.querySelector('#project-count');
  if (count) count.textContent = `${rows.filter((row) => !row.hidden).length} 项`;
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
    const response = await fetch('../shared/content.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('内容加载失败');
    const data = await response.json();
    renderShell(data);
    if (page === 'overview') renderOverview(data);
    if (page === 'playbook') renderPlaybook(data);
    if (page === 'work') renderWork(data);
    if (page === 'research') renderResearch(data);
    runSearch();
  } catch (error) {
    document.querySelector('#content').innerHTML = '<div class="empty-state" role="status">内容加载失败，请刷新页面。</div>';
    console.error(error);
  }
}

init();
