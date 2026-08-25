(() => {
  const STORAGE_KEY = 'oedro-content-studio-jobs-v1';
  let studioConfig;
  let activeModule;
  let currentJob;

  function safeText(value) {
    return String(value ?? '');
  }

  function readJobs() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  function writeJobs(jobs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  }

  function fieldById(id) {
    return [...studioConfig.common_fields, ...activeModule.fields].find((field) => field.id === id);
  }

  function fieldValueLabel(id, value) {
    if (Array.isArray(value)) return value.join('、') || `[待填写：${fieldById(id)?.label || id}]`;
    return safeText(value).trim() || `[待填写：${fieldById(id)?.label || id}]`;
  }

  function applyTemplate(template, values) {
    return template.replace(/\{\{([a-z_]+)\}\}/g, (_, id) => fieldValueLabel(id, values[id]));
  }

  function createField(field) {
    const wrapper = document.createElement('div');
    wrapper.className = `studio-field studio-field-${field.type}`;
    const label = document.createElement('label');
    label.textContent = field.label;
    label.htmlFor = `studio-${field.id}`;
    wrapper.appendChild(label);

    let input;
    if (field.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
    } else if (field.type === 'select') {
      input = document.createElement('select');
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '请选择';
      input.appendChild(placeholder);
      field.options.forEach((option) => {
        const item = document.createElement('option');
        item.value = option;
        item.textContent = option;
        input.appendChild(item);
      });
    } else if (field.type === 'checkboxes') {
      input = document.createElement('div');
      input.className = 'studio-check-options';
      input.id = `studio-${field.id}`;
      field.options.forEach((option, index) => {
        const optionLabel = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = field.id;
        checkbox.value = option;
        checkbox.id = `studio-${field.id}-${index}`;
        optionLabel.htmlFor = checkbox.id;
        optionLabel.append(checkbox, document.createTextNode(option));
        input.appendChild(optionLabel);
      });
    } else {
      input = document.createElement('input');
      input.type = 'text';
    }

    if (field.type !== 'checkboxes') {
      input.id = `studio-${field.id}`;
      input.name = field.id;
      input.placeholder = field.placeholder || '';
      input.required = Boolean(field.required);
    }
    wrapper.appendChild(input);
    if (field.help) {
      const help = document.createElement('small');
      help.textContent = field.help;
      wrapper.appendChild(help);
    }
    return wrapper;
  }

  function renderForm() {
    document.querySelector('#studio-form-title').textContent = `${activeModule.label}需求`;
    document.querySelector('#studio-form-description').textContent = activeModule.description;
    const common = document.querySelector('#studio-common-fields');
    const specific = document.querySelector('#studio-module-fields');
    common.replaceChildren(...studioConfig.common_fields.map(createField));
    specific.replaceChildren(...activeModule.fields.map(createField));
  }

  function getFormValues() {
    const values = {};
    [...studioConfig.common_fields, ...activeModule.fields].forEach((field) => {
      if (field.type === 'checkboxes') {
        values[field.id] = [...document.querySelectorAll(`input[name="${field.id}"]:checked`)].map((item) => item.value);
      } else {
        values[field.id] = document.querySelector(`#studio-${field.id}`)?.value || '';
      }
    });
    return values;
  }

  function fillForm(values) {
    [...studioConfig.common_fields, ...activeModule.fields].forEach((field) => {
      if (field.type === 'checkboxes') {
        document.querySelectorAll(`input[name="${field.id}"]`).forEach((item) => {
          item.checked = (values[field.id] || []).includes(item.value);
        });
      } else {
        const input = document.querySelector(`#studio-${field.id}`);
        if (input) input.value = values[field.id] || '';
      }
    });
  }

  function approvalBlockers(values) {
    const blockers = [];
    if (values.permission_status !== '已确认') blockers.push('联系或参与许可还没有确认。');
    if (values.asset_source === '素材权利需要确认') blockers.push('素材权利还没有确认。');
    if (activeModule.id === 'research') {
      if (values.recording_state === '待确认') blockers.push('录音或录像安排还没有确认。');
      if (values.incentive_state === '待确认') blockers.push('参与激励还没有确认。');
    }
    if (activeModule.id === 'community') {
      if (values.cadence === '待确认') blockers.push('社区内容节奏还没有确认。');
      if (values.ugc_state === '待确认') blockers.push('UGC查看或复用范围还没有确认。');
    }
    return blockers;
  }

  function buildOutputs(values) {
    return activeModule.outputs.map((output) => ({
      id: output.id,
      label: output.label,
      purpose: output.purpose,
      content: applyTemplate(output.template, values)
    }));
  }

  function timestamp() {
    return new Date().toISOString();
  }

  function saveCurrentJob(status, incrementVersion) {
    if (!currentJob) return;
    const latestValues = getFormValues();
    const latestBlockers = approvalBlockers(latestValues);
    if (status === '已批准' && latestBlockers.length) {
      alert(`还不能批准：\n${latestBlockers.join('\n')}`);
      return;
    }
    document.querySelectorAll('[data-output-editor]').forEach((editor) => {
      const output = currentJob.outputs.find((item) => item.id === editor.dataset.outputEditor);
      if (output) output.content = editor.value;
    });
    if (incrementVersion) currentJob.version += 1;
    currentJob.values = latestValues;
    currentJob.status = status;
    currentJob.updated_at = timestamp();
    currentJob.blockers = latestBlockers;
    currentJob.history.push({
      version: currentJob.version,
      status,
      updated_at: currentJob.updated_at,
      outputs: currentJob.outputs.map((item) => ({ ...item }))
    });
    const jobs = readJobs();
    const existingIndex = jobs.findIndex((job) => job.job_id === currentJob.job_id);
    if (existingIndex >= 0) jobs[existingIndex] = currentJob;
    else jobs.push(currentJob);
    writeJobs(jobs);
    renderReview();
    renderSavedJobs();
  }

  function makeButton(label, className, handler, disabled = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.className = className;
    button.disabled = disabled;
    button.addEventListener('click', handler);
    return button;
  }

  function renderReview() {
    const empty = document.querySelector('#studio-review-empty');
    const packet = document.querySelector('#studio-review-packet');
    if (!currentJob) {
      empty.hidden = false;
      packet.hidden = true;
      return;
    }
    empty.hidden = true;
    packet.hidden = false;

    document.querySelector('#review-title').textContent = currentJob.values.title;
    document.querySelector('#review-meta').textContent = `${activeModule.label} · v${currentJob.version} · ${currentJob.status}`;
    document.querySelector('#review-summary').textContent = `${currentJob.values.goal} 目标动作：${currentJob.values.target_action}`;
    document.querySelector('#review-status').textContent = currentJob.status;

    const blockers = document.querySelector('#review-blockers');
    blockers.replaceChildren();
    if (currentJob.blockers.length) {
      currentJob.blockers.forEach((blocker) => {
        const item = document.createElement('li');
        item.textContent = blocker;
        blockers.appendChild(item);
      });
      document.querySelector('#review-blocker-wrap').hidden = false;
    } else {
      document.querySelector('#review-blocker-wrap').hidden = true;
    }

    const outputs = document.querySelector('#review-outputs');
    outputs.replaceChildren();
    currentJob.outputs.forEach((output, index) => {
      const section = document.createElement('section');
      section.className = 'review-output';
      section.dataset.searchable = '';
      const number = document.createElement('span');
      number.className = 'review-output-index';
      number.textContent = String(index + 1).padStart(2, '0');
      const heading = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = output.label;
      const purpose = document.createElement('p');
      purpose.textContent = output.purpose;
      heading.append(title, purpose);
      const editor = document.createElement('textarea');
      editor.rows = Math.min(14, Math.max(5, output.content.split('\n').length + 1));
      editor.value = output.content;
      editor.dataset.outputEditor = output.id;
      section.append(number, heading, editor);
      outputs.appendChild(section);
    });

    const mustDo = document.querySelector('#review-must-do');
    const avoid = document.querySelector('#review-avoid');
    mustDo.replaceChildren(...activeModule.must_do.map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
    avoid.replaceChildren(...activeModule.avoid.map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));

    const actions = document.querySelector('#review-actions');
    actions.replaceChildren(
      makeButton('保存新版本', 'studio-button', () => saveCurrentJob('草稿', true)),
      makeButton('提交审核', 'studio-button', () => saveCurrentJob('待审核', true)),
      makeButton('退回修改', 'studio-button', () => saveCurrentJob('退回修改', true)),
      makeButton('批准本版', 'studio-button studio-button-primary', () => saveCurrentJob('已批准', true), currentJob.blockers.length > 0),
      makeButton('导出JSON', 'studio-button', exportCurrentJob)
    );

    const versions = document.querySelector('#review-versions');
    versions.replaceChildren();
    [...currentJob.history].reverse().forEach((history) => {
      const row = document.createElement('li');
      const version = document.createElement('strong');
      version.textContent = `v${history.version} · ${history.status}`;
      const date = document.createElement('time');
      date.dateTime = history.updated_at;
      date.textContent = new Date(history.updated_at).toLocaleString('zh-CN', { hour12: false });
      row.append(version, date);
      versions.appendChild(row);
    });
  }

  function exportCurrentJob() {
    if (!currentJob) return;
    document.querySelectorAll('[data-output-editor]').forEach((editor) => {
      const output = currentJob.outputs.find((item) => item.id === editor.dataset.outputEditor);
      if (output) output.content = editor.value;
    });
    const blob = new Blob([JSON.stringify(currentJob, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentJob.job_id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function renderSavedJobs() {
    const list = document.querySelector('#studio-saved-jobs');
    list.replaceChildren();
    const jobs = readJobs().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    document.querySelector('#saved-job-count').textContent = `${jobs.length}份`;
    if (!jobs.length) {
      const empty = document.createElement('p');
      empty.className = 'studio-saved-empty';
      empty.textContent = '当前浏览器还没有保存内容包。';
      list.appendChild(empty);
      return;
    }
    jobs.forEach((job) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'studio-saved-row';
      const title = document.createElement('strong');
      title.textContent = job.values.title;
      const meta = document.createElement('span');
      meta.textContent = `${job.module_label} · v${job.version} · ${job.status}`;
      button.append(title, meta);
      button.addEventListener('click', () => loadJob(job));
      list.appendChild(button);
    });
  }

  function loadJob(job) {
    activeModule = studioConfig.modules.find((module) => module.id === job.module_id) || studioConfig.modules[0];
    currentJob = job;
    updateModuleButtons();
    renderForm();
    fillForm(job.values);
    history.replaceState({}, '', `content-studio.html?module=${encodeURIComponent(activeModule.id)}`);
    renderReview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function generatePacket(event) {
    event.preventDefault();
    const form = document.querySelector('#studio-form');
    if (!form.reportValidity()) return;
    const values = getFormValues();
    if (!values.channels.length) {
      document.querySelector('#studio-channels-error').hidden = false;
      return;
    }
    document.querySelector('#studio-channels-error').hidden = true;
    const now = timestamp();
    currentJob = {
      schema_version: '1.0',
      job_id: `content-${Date.now()}`,
      module_id: activeModule.id,
      module_label: activeModule.label,
      version: 1,
      status: '草稿',
      created_at: now,
      updated_at: now,
      storage: 'browser-local-only',
      values,
      blockers: approvalBlockers(values),
      outputs: buildOutputs(values),
      history: []
    };
    currentJob.history.push({
      version: 1,
      status: '草稿',
      updated_at: now,
      outputs: currentJob.outputs.map((item) => ({ ...item }))
    });
    const jobs = readJobs();
    jobs.push(currentJob);
    writeJobs(jobs);
    renderReview();
    renderSavedJobs();
    document.querySelector('#studio-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updateModuleButtons() {
    document.querySelectorAll('[data-studio-module]').forEach((button) => {
      const selected = button.dataset.studioModule === activeModule.id;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function switchModule(moduleId) {
    activeModule = studioConfig.modules.find((module) => module.id === moduleId) || studioConfig.modules[0];
    currentJob = null;
    history.replaceState({}, '', `content-studio.html?module=${encodeURIComponent(activeModule.id)}`);
    updateModuleButtons();
    renderForm();
    renderReview();
  }

  function clearLocalData() {
    if (!confirm('确定清空当前浏览器保存的全部内容包吗？此操作不会影响线上网站。')) return;
    localStorage.removeItem(STORAGE_KEY);
    currentJob = null;
    renderReview();
    renderSavedJobs();
  }

  function renderSources() {
    const list = document.querySelector('#studio-sources');
    list.replaceChildren();
    studioConfig.sources.forEach((source) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noreferrer';
      link.textContent = `${source.label} ↗`;
      const note = document.createElement('p');
      note.textContent = source.supports;
      item.append(link, note);
      list.appendChild(item);
    });
  }

  function buildPage() {
    const content = document.querySelector('#content');
    content.innerHTML = `
      <div class="page-heading"><div><h1>${safeText(studioConfig.title)}</h1><p>${safeText(studioConfig.description)}</p></div><span class="page-tag">${safeText(studioConfig.status)}</span></div>
      <section class="section studio-notices" data-searchable>
        <p><strong>数据边界：</strong>${safeText(studioConfig.privacy_notice)}</p>
        <p><strong>生成边界：</strong>${safeText(studioConfig.generation_notice)}</p>
      </section>
      <section class="section" data-searchable>
        <div class="section-head"><h2>选择内容模块</h2><p>三个入口，共用一套版本和审核逻辑</p></div>
        <div class="studio-module-nav" id="studio-module-nav"></div>
      </section>
      <section class="section studio-workspace" id="studio-workspace">
        <form class="studio-form" id="studio-form">
          <div class="studio-pane-head"><div><span class="studio-step">01</span><h2 id="studio-form-title"></h2></div><p id="studio-form-description"></p></div>
          <div class="studio-fields" id="studio-common-fields"></div>
          <div class="studio-subsection"><h3>这个模块还需要</h3><div class="studio-fields" id="studio-module-fields"></div></div>
          <p class="studio-field-error" id="studio-channels-error" hidden>至少选择一个渠道版本。</p>
          <button class="studio-button studio-button-primary studio-generate" type="submit">生成审核包</button>
        </form>
        <div class="studio-review" id="studio-review">
          <div class="studio-pane-head"><div><span class="studio-step">02</span><h2>审核内容包</h2></div><p>先看目的和风险，再逐项看内容</p></div>
          <div class="studio-review-empty" id="studio-review-empty"><strong>还没有审核包</strong><p>填完左侧需求后，页面会生成结构草稿、检查项和版本记录。</p></div>
          <div id="studio-review-packet" hidden>
            <div class="review-header"><div><span class="review-status" id="review-status"></span><h2 id="review-title"></h2><p id="review-meta"></p></div><p id="review-summary"></p></div>
            <div class="review-blockers" id="review-blocker-wrap" hidden><strong>批准前还要确认</strong><ul id="review-blockers"></ul></div>
            <div class="review-output-list" id="review-outputs"></div>
            <div class="review-guidance">
              <section><h3>要做到</h3><ul id="review-must-do"></ul></section>
              <section><h3>要避免</h3><ul id="review-avoid"></ul></section>
            </div>
            <div class="review-actions" id="review-actions"></div>
            <section class="review-version-section"><h3>版本记录</h3><ol id="review-versions"></ol></section>
          </div>
        </div>
      </section>
      <section class="section" data-searchable>
        <div class="section-head"><h2>当前浏览器保存的内容包</h2><div class="filter-row"><span class="count-note" id="saved-job-count"></span><button class="studio-link-button" id="studio-clear-local" type="button">清空本地记录</button></div></div>
        <div class="studio-saved-jobs" id="studio-saved-jobs"></div>
      </section>
      <section class="section topic-section" data-searchable><div class="section-head"><h2>参考实现</h2><p>复用交互和工作流思路，不直接安装整套系统</p></div><ul class="topic-sources" id="studio-sources"></ul></section>`;

    const nav = document.querySelector('#studio-module-nav');
    studioConfig.modules.forEach((module, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'studio-module-button';
      button.dataset.studioModule = module.id;
      button.innerHTML = `<span>0${index + 1}</span><strong>${safeText(module.label)}</strong><small>${safeText(module.short)}</small>`;
      button.addEventListener('click', () => switchModule(module.id));
      nav.appendChild(button);
    });
    updateModuleButtons();
    renderForm();
    renderReview();
    renderSavedJobs();
    renderSources();
    document.querySelector('#studio-form').addEventListener('submit', generatePacket);
    document.querySelector('#studio-clear-local').addEventListener('click', clearLocalData);
  }

  window.initContentStudio = async () => {
    const response = await fetch('data/content-studio.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('内容生产模块加载失败');
    studioConfig = await response.json();
    const requested = new URLSearchParams(window.location.search).get('module');
    activeModule = studioConfig.modules.find((module) => module.id === requested) || studioConfig.modules[0];
    buildPage();
  };
})();
