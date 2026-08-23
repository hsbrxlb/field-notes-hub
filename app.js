const page = document.body.dataset.page;
const sidebar = document.querySelector('.sidebar');
const overlay = document.querySelector('.mobile-overlay');
const menuButton = document.querySelector('.menu-button');
const searchInput = document.querySelector('#page-search');
const searchStatus = document.querySelector('#search-status');

document.querySelectorAll('.nav-list a').forEach((link) => {
  link.classList.toggle('active', link.dataset.page === page);
});

function setSidebar(open) {
  sidebar?.classList.toggle('open', open);
  if (overlay) overlay.hidden = !open;
  menuButton?.setAttribute('aria-expanded', String(open));
}

menuButton?.addEventListener('click', () => setSidebar(!sidebar?.classList.contains('open')));
overlay?.addEventListener('click', () => setSidebar(false));
document.querySelectorAll('.nav-list a').forEach((link) => link.addEventListener('click', () => setSidebar(false)));
window.addEventListener('resize', () => {
  if (window.innerWidth > 760) setSidebar(false);
});

function normalize(value) {
  return String(value ?? '').toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ').trim();
}

function runSearch() {
  const query = normalize(searchInput?.value);
  const items = [...document.querySelectorAll('[data-searchable]')];
  const statusFilter = document.querySelector('#status-filter')?.value || '全部';
  let visible = 0;
  items.forEach((item) => {
    const textMatch = !query || normalize(item.textContent).includes(query);
    const statusMatch = !item.matches('#project-rows tr') || statusFilter === '全部' || item.dataset.status === statusFilter;
    const match = textMatch && statusMatch;
    item.hidden = !match;
    if (match) visible += 1;
  });
  const projectRows = [...document.querySelectorAll('#project-rows tr')];
  const projectCount = document.querySelector('#project-count');
  if (projectCount) projectCount.textContent = `${projectRows.filter((row) => !row.hidden).length} 个项目`;
  const empty = document.querySelector('.search-empty');
  if (empty) empty.hidden = visible > 0 || !query;
  if (searchStatus) {
    searchStatus.textContent = query ? `找到 ${visible} 项` : '按 / 快速搜索本页';
  }
}

searchInput?.addEventListener('input', runSearch);
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

async function loadJson(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`无法加载 ${path}`);
  return response.json();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function statusClass(status) {
  return `status status-${String(status).replaceAll(' ', '-')}`;
}

function renderStatus(status) {
  return `<span class="${statusClass(status)}">${escapeHtml(status)}</span>`;
}

function renderIndex(company, capabilities) {
  const timeline = document.querySelector('#company-timeline');
  if (timeline) {
    timeline.innerHTML = company.timeline.map((item) => `
      <article class="timeline-item" data-searchable>
        <time>${escapeHtml(item.period)}</time>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.detail)}</p>
      </article>`).join('');
  }

  const maturity = document.querySelector('#maturity-panel');
  if (maturity) {
    maturity.innerHTML = `
      <div class="maturity-row">
        <span class="maturity-value">阶段 ${company.current_maturity.stage}</span>
        <span class="maturity-label">${escapeHtml(company.current_maturity.label)}</span>
      </div>
      <p class="maturity-note">完成项和缺口均来自2026-08-21前后的本地工作记录。</p>`;
  }

  const completed = document.querySelector('#maturity-completed');
  if (completed) completed.innerHTML = company.current_maturity.completed.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const missing = document.querySelector('#maturity-missing');
  if (missing) missing.innerHTML = company.current_maturity.missing.map((item) => `<li>${escapeHtml(item)}</li>`).join('');

  const stages = document.querySelector('#stage-strip');
  if (stages) {
    stages.innerHTML = capabilities.stages.map((stage) => `
      <a class="stage-link ${stage.id === company.current_maturity.stage ? 'current' : ''}" href="playbook.html#stage-${stage.id}" data-searchable>
        <span class="stage-number">0${stage.id}</span>
        <strong>${escapeHtml(stage.name)}</strong>
        <span>${escapeHtml(stage.goal)}</span>
      </a>`).join('');
  }

  const capabilityRows = document.querySelector('#capability-rows');
  if (capabilityRows) {
    capabilityRows.innerHTML = capabilities.capabilities.map((item) => `
      <tr data-searchable>
        <td class="cell-title">${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.problem)}</td>
        <td>${escapeHtml(item.minimum)}</td>
      </tr>`).join('');
  }
}

function renderPlaybook(capabilities) {
  const list = document.querySelector('#phase-list');
  if (!list) return;
  list.innerHTML = capabilities.stages.map((stage, index) => `
    <details class="phase" id="stage-${stage.id}" ${index === 0 ? 'open' : ''} data-searchable>
      <summary>
        <span class="phase-index">0${stage.id}</span>
        <span class="phase-summary"><strong>${escapeHtml(stage.name)}</strong><span>${escapeHtml(stage.goal)}</span></span>
        <span class="phase-toggle" aria-hidden="true">+</span>
      </summary>
      <div class="phase-body">
        <div><h3>开始前提</h3><p>${escapeHtml(stage.start)}</p></div>
        <div><h3>完成标志</h3><p>${escapeHtml(stage.done_when)}</p></div>
        <div><h3>要做的事</h3><ul>${stage.actions.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
        <div><h3>交付物</h3><ul>${stage.deliverables.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></div>
        <div class="phase-wide pitfall"><h3>常见错误</h3><p>${escapeHtml(stage.pitfall)}</p></div>
      </div>
    </details>`).join('');
}

function renderWorkspace(data) {
  const focus = document.querySelector('#focus-list');
  if (focus) {
    focus.innerHTML = data.focus.map((item) => `
      <div class="item-row" data-searchable>
        <strong>${escapeHtml(item.title)}</strong>
        <div>${renderStatus(item.status)}</div>
      </div>`).join('');
  }

  const rows = document.querySelector('#project-rows');
  if (rows) {
    rows.innerHTML = data.projects.map((item) => `
      <tr data-searchable data-status="${escapeHtml(item.status)}">
        <td><div class="cell-title">${escapeHtml(item.name)}</div><div class="cell-note">证据日期 ${escapeHtml(item.evidence_date)}</div></td>
        <td>${renderStatus(item.status)}</td>
        <td>${escapeHtml(item.progress)}</td>
        <td>${escapeHtml(item.next)}</td>
        <td>${escapeHtml(item.dependency)}</td>
      </tr>`).join('');
  }

  const blocked = document.querySelector('#blocked-list');
  if (blocked) blocked.innerHTML = data.blocked.map((item) => `<div class="item-row" data-searchable><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.reason)}</p></div>`).join('');
  const next = document.querySelector('#next-list');
  if (next) next.innerHTML = data.next_stage.map((item) => `<li data-searchable>${escapeHtml(item)}</li>`).join('');
  const foundations = document.querySelector('#foundation-list');
  if (foundations) foundations.innerHTML = data.foundations.map((item) => `<li data-searchable>${escapeHtml(item)}</li>`).join('');

  const filter = document.querySelector('#status-filter');
  filter?.addEventListener('change', runSearch);
}

function renderResources(data) {
  const terms = document.querySelector('#term-rows');
  if (terms) terms.innerHTML = data.terms.map((item) => `<div class="item-row" data-searchable><strong>${escapeHtml(item.term)}</strong><p>${escapeHtml(item.definition)}</p></div>`).join('');
  const channels = document.querySelector('#channel-list');
  if (channels) channels.innerHTML = data.channels.map((item) => `<span class="token" data-searchable>${escapeHtml(item)}</span>`).join('');
  const fields = document.querySelector('#field-list');
  if (fields) fields.innerHTML = data.fields.map((item) => `<span class="token" data-searchable>${escapeHtml(item)}</span>`).join('');
  const sources = document.querySelector('#source-list');
  if (sources) sources.innerHTML = data.sources.map((item) => `
    <div class="source-row" data-searchable>
      <strong>${escapeHtml(item.label)}</strong>
      <p>${escapeHtml(item.scope)}</p>
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer" aria-label="打开来源：${escapeHtml(item.label)}">打开</a>
    </div>`).join('');
  const boundary = document.querySelector('#boundary-list');
  if (boundary) boundary.innerHTML = data.public_boundary.map((item) => `<li data-searchable>${escapeHtml(item)}</li>`).join('');
  const updates = document.querySelector('#update-list');
  if (updates) updates.innerHTML = data.updates.map((item) => `<div class="item-row" data-searchable><strong>${escapeHtml(item.date)} · ${escapeHtml(item.version)}</strong><p>${escapeHtml(item.detail)}</p></div>`).join('');
  const pageUpdates = document.querySelector('#page-update-rows');
  if (pageUpdates) pageUpdates.innerHTML = data.page_updates.map((item) => `<tr><td>${escapeHtml(item.page)}</td><td>${escapeHtml(item.date)}</td></tr>`).join('');
}

async function init() {
  try {
    if (page === 'overview') {
      const [company, capabilities] = await Promise.all([loadJson('data/company.json'), loadJson('data/capabilities.json')]);
      renderIndex(company, capabilities);
    }
    if (page === 'playbook') renderPlaybook(await loadJson('data/capabilities.json'));
    if (page === 'work') renderWorkspace(await loadJson('data/workspace.json'));
    if (page === 'resources') renderResources(await loadJson('data/resources.json'));
    runSearch();
  } catch (error) {
    const status = document.querySelector('#page-status');
    if (status) {
      status.hidden = false;
      status.textContent = '页面数据暂时无法加载，请稍后刷新。';
    }
    console.error(error);
  }
}

init();
