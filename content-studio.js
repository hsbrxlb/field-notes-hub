(() => {
  const STORAGE_KEY = 'oedro-content-studio-jobs-v1';
  let studioConfig;
  let activeModule;
  let currentJob = null;
  let activeStep = 0;
  let activeOutputId = '';
  let draftValues = {};
  let editingExisting = false;

  function safeText(value) {
    return String(value ?? '');
  }

  function reviewStatusClass(status) {
    return { 草稿: 'ready', 待审核: 'pending', 退回修改: 'blocked', 已批准: 'done' }[status] || 'ready';
  }

  function normalizeJob(job) {
    const normalized = { ...job };
    normalized.version = Number(normalized.version || 1);
    normalized.status = normalized.status || '草稿';
    normalized.values = normalized.values || {};
    normalized.blockers = Array.isArray(normalized.blockers) ? normalized.blockers : [];
    normalized.outputs = Array.isArray(normalized.outputs) ? normalized.outputs : [];
    normalized.history = Array.isArray(normalized.history) ? normalized.history : [];
    return normalized;
  }

  function readJobs() {
    try {
      const jobs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(jobs) ? jobs.map(normalizeJob) : [];
    } catch {
      return [];
    }
  }

  function writeJobs(jobs) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  }

  function saveJobRecord(job) {
    const jobs = readJobs();
    const index = jobs.findIndex((item) => item.job_id === job.job_id);
    if (index >= 0) jobs[index] = job;
    else jobs.push(job);
    writeJobs(jobs);
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

  function stages() {
    return [
      { id: 'basics', label: '基本信息', fields: studioConfig.common_fields.slice(0, 4) },
      { id: 'facts', label: '事实与许可', fields: studioConfig.common_fields.slice(4) },
      { id: 'module', label: `${activeModule.label}条件`, fields: activeModule.fields }
    ];
  }

  function createField(field) {
    const wrapper = document.createElement('div');
    wrapper.className = `studio-field studio-field-${field.type}`;
    if (field.type === 'textarea' || field.type === 'checkboxes') wrapper.classList.add('studio-field-wide');
    const label = document.createElement('label');
    label.textContent = field.label;
    label.htmlFor = `studio-${field.id}`;
    wrapper.appendChild(label);

    let input;
    if (field.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 3;
      input.value = draftValues[field.id] || '';
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
      input.value = draftValues[field.id] || '';
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
        checkbox.checked = (draftValues[field.id] || []).includes(option);
        optionLabel.htmlFor = checkbox.id;
        optionLabel.append(checkbox, document.createTextNode(option));
        input.appendChild(optionLabel);
      });
    } else {
      input = document.createElement('input');
      input.type = 'text';
      input.value = draftValues[field.id] || '';
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

  function captureCurrentStep() {
    stages()[activeStep].fields.forEach((field) => {
      if (field.type === 'checkboxes') {
        draftValues[field.id] = [...document.querySelectorAll(`input[name="${field.id}"]:checked`)].map((item) => item.value);
      } else {
        draftValues[field.id] = document.querySelector(`#studio-${field.id}`)?.value || '';
      }
    });
  }

  function validateCurrentStep() {
    const form = document.querySelector('#studio-form');
    if (!form?.reportValidity()) return false;
    const current = stages()[activeStep];
    if (current.id === 'facts' && !document.querySelectorAll('input[name="channels"]:checked').length) {
      const error = document.querySelector('#studio-channels-error');
      if (error) error.hidden = false;
      return false;
    }
    const error = document.querySelector('#studio-channels-error');
    if (error) error.hidden = true;
    return true;
  }

  function requiredValuesComplete() {
    const allFields = [...studioConfig.common_fields, ...activeModule.fields];
    const missing = allFields.find((field) => {
      if (!field.required) return false;
      const value = draftValues[field.id];
      return Array.isArray(value) ? value.length === 0 : !safeText(value).trim();
    });
    if (!missing) return true;
    activeStep = stages().findIndex((stage) => stage.fields.some((field) => field.id === missing.id));
    renderForm();
    document.querySelector(`#studio-${missing.id}`)?.focus();
    document.querySelector('#studio-form')?.reportValidity();
    return false;
  }

  function goToStep(index) {
    if (index > activeStep && !validateCurrentStep()) return;
    captureCurrentStep();
    activeStep = Math.max(0, Math.min(stages().length - 1, index));
    renderForm();
  }

  function renderProgress() {
    const progress = document.querySelector('#studio-progress');
    progress.replaceChildren();
    stages().forEach((stage, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.classList.toggle('active', index === activeStep);
      button.classList.toggle('complete', index < activeStep);
      button.innerHTML = `<span>${String(index + 1).padStart(2, '0')}</span><strong>${safeText(stage.label)}</strong>`;
      button.addEventListener('click', () => goToStep(index));
      progress.appendChild(button);
    });
  }

  function renderForm() {
    renderProgress();
    const stage = stages()[activeStep];
    document.querySelector('#studio-stage-title').textContent = stage.label;
    const fields = document.querySelector('#studio-stage-fields');
    fields.replaceChildren(...stage.fields.map(createField));
    document.querySelector('#studio-back').hidden = activeStep === 0;
    const next = document.querySelector('#studio-next');
    const generate = document.querySelector('#studio-generate');
    next.hidden = activeStep === stages().length - 1;
    generate.hidden = activeStep !== stages().length - 1;
    generate.textContent = editingExisting ? '更新草稿' : '生成草稿';
  }

  function approvalBlockers(values) {
    const blockers = [];
    if (values.permission_status !== '已确认') blockers.push('联系许可还没有确认。');
    if (values.asset_source === '素材权利需要确认') blockers.push('素材权利还没有确认。');
    if (activeModule.id === 'research') {
      if (values.recording_state === '待确认') blockers.push('录制安排还没有确认。');
      if (values.incentive_state === '待确认') blockers.push('参与激励还没有确认。');
    }
    if (activeModule.id === 'community') {
      if (values.cadence === '待确认') blockers.push('内容节奏还没有确认。');
      if (values.ugc_state === '待确认') blockers.push('用户内容的查看或复用范围还没有确认。');
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

  function createOrUpdateJob() {
    if (!validateCurrentStep()) return;
    captureCurrentStep();
    if (!requiredValuesComplete()) return;
    const now = timestamp();
    if (editingExisting && currentJob) {
      currentJob.version += 1;
      currentJob.values = { ...draftValues };
      currentJob.outputs = buildOutputs(draftValues);
      currentJob.status = '草稿';
      currentJob.blockers = approvalBlockers(draftValues);
      currentJob.updated_at = now;
      currentJob.history.push({ version: currentJob.version, status: currentJob.status, updated_at: now, outputs: currentJob.outputs.map((item) => ({ ...item })) });
    } else {
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
        values: { ...draftValues },
        blockers: approvalBlockers(draftValues),
        outputs: buildOutputs(draftValues),
        history: []
      };
      currentJob.history.push({ version: 1, status: '草稿', updated_at: now, outputs: currentJob.outputs.map((item) => ({ ...item })) });
    }
    editingExisting = false;
    activeOutputId = currentJob.outputs[0]?.id || '';
    saveJobRecord(currentJob);
    showReview();
    renderSavedJobs();
  }

  function syncActiveEditor() {
    const editor = document.querySelector('#review-output-editor');
    if (!editor || !currentJob) return;
    const output = currentJob.outputs.find((item) => item.id === activeOutputId);
    if (output) output.content = editor.value;
  }

  function saveCurrentJob(status, incrementVersion) {
    if (!currentJob) return;
    syncActiveEditor();
    const blockers = approvalBlockers(currentJob.values);
    if (status === '已批准' && blockers.length) return;
    if (incrementVersion) currentJob.version += 1;
    currentJob.status = status;
    currentJob.updated_at = timestamp();
    currentJob.blockers = blockers;
    currentJob.history.push({ version: currentJob.version, status, updated_at: currentJob.updated_at, outputs: currentJob.outputs.map((item) => ({ ...item })) });
    saveJobRecord(currentJob);
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

  function renderOutputEditor() {
    const output = currentJob?.outputs.find((item) => item.id === activeOutputId) || currentJob?.outputs[0];
    if (!output) return;
    activeOutputId = output.id;
    document.querySelectorAll('[data-review-output]').forEach((button) => button.classList.toggle('active', button.dataset.reviewOutput === activeOutputId));
    document.querySelector('#review-output-title').textContent = output.label;
    document.querySelector('#review-output-purpose').textContent = output.purpose;
    document.querySelector('#review-output-editor').value = output.content;
  }

  function renderReview() {
    if (!currentJob) return;
    if (!activeOutputId || !currentJob.outputs.some((item) => item.id === activeOutputId)) activeOutputId = currentJob.outputs[0]?.id || '';
    const reviewStatus = document.querySelector('#review-status');
    reviewStatus.textContent = currentJob.status;
    reviewStatus.className = `status status-${reviewStatusClass(currentJob.status)}`;
    document.querySelector('#review-title').textContent = currentJob.values.title;
    document.querySelector('#review-meta').textContent = `${currentJob.module_label} · v${currentJob.version}`;
    document.querySelector('#review-summary').textContent = `${currentJob.values.goal} · ${currentJob.values.target_action}`;

    const outputNav = document.querySelector('#review-output-nav');
    outputNav.replaceChildren();
    currentJob.outputs.forEach((output) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = output.label;
      button.dataset.reviewOutput = output.id;
      button.addEventListener('click', () => {
        syncActiveEditor();
        activeOutputId = output.id;
        renderOutputEditor();
      });
      outputNav.appendChild(button);
    });
    renderOutputEditor();

    const blockerWrap = document.querySelector('#review-blocker-wrap');
    const blockers = document.querySelector('#review-blockers');
    blockers.replaceChildren(...currentJob.blockers.map((text) => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
    blockerWrap.hidden = currentJob.blockers.length === 0;

    const mustDo = document.querySelector('#review-must-do');
    const avoid = document.querySelector('#review-avoid');
    mustDo.replaceChildren(...activeModule.must_do.map((text) => {
      const item = document.createElement('li'); item.textContent = text; return item;
    }));
    avoid.replaceChildren(...activeModule.avoid.map((text) => {
      const item = document.createElement('li'); item.textContent = text; return item;
    }));

    const actions = document.querySelector('#review-actions');
    actions.replaceChildren(
      makeButton('保存版本', 'studio-button', () => saveCurrentJob('草稿', true)),
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
    syncActiveEditor();
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
    const jobs = readJobs().sort((a, b) => safeText(b.updated_at).localeCompare(safeText(a.updated_at)));
    document.querySelector('#saved-job-count').textContent = `${jobs.length} 份`;
    if (!jobs.length) {
      const empty = document.createElement('p');
      empty.className = 'studio-saved-empty';
      empty.textContent = '还没有保存的内容。';
      list.appendChild(empty);
      return;
    }
    jobs.forEach((job) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'studio-saved-row';
      const title = document.createElement('strong');
      title.textContent = job.values.title || '未命名内容';
      const meta = document.createElement('span');
      meta.textContent = `${job.module_label || job.module_id} · v${job.version} · ${job.status}`;
      button.append(title, meta);
      button.addEventListener('click', () => loadJob(job));
      list.appendChild(button);
    });
  }

  function loadJob(job) {
    currentJob = normalizeJob(job);
    activeModule = studioConfig.modules.find((module) => module.id === currentJob.module_id) || studioConfig.modules[0];
    draftValues = { ...currentJob.values };
    activeOutputId = currentJob.outputs[0]?.id || '';
    editingExisting = false;
    history.replaceState({}, '', `content-studio.html?module=${encodeURIComponent(activeModule.id)}`);
    updateModuleButtons();
    showReview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function editCurrentJob() {
    if (!currentJob) return;
    syncActiveEditor();
    draftValues = { ...currentJob.values };
    activeStep = 0;
    editingExisting = true;
    showForm();
  }

  function updateModuleButtons() {
    document.querySelectorAll('[data-studio-module]').forEach((button) => {
      const selected = button.dataset.studioModule === activeModule.id;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function switchModule(moduleId) {
    if (!document.querySelector('#studio-form-view').hidden) captureCurrentStep();
    const commonIds = new Set(studioConfig.common_fields.map((field) => field.id));
    draftValues = Object.fromEntries(Object.entries(draftValues).filter(([key]) => commonIds.has(key)));
    activeModule = studioConfig.modules.find((module) => module.id === moduleId) || studioConfig.modules[0];
    currentJob = null;
    activeStep = 0;
    editingExisting = false;
    history.replaceState({}, '', `content-studio.html?module=${encodeURIComponent(activeModule.id)}`);
    updateModuleButtons();
    showForm();
  }

  function showForm() {
    document.querySelector('#studio-form-view').hidden = false;
    document.querySelector('#studio-review-view').hidden = true;
    renderForm();
  }

  function showReview() {
    document.querySelector('#studio-form-view').hidden = true;
    document.querySelector('#studio-review-view').hidden = false;
    renderReview();
  }

  function clearLocalData() {
    if (!confirm('清空当前浏览器保存的全部内容？')) return;
    localStorage.removeItem(STORAGE_KEY);
    currentJob = null;
    draftValues = {};
    editingExisting = false;
    showForm();
    renderSavedJobs();
  }

  async function importContentTask(file) {
    const status = document.querySelector('#studio-import-status');
    try {
      const packet = JSON.parse(await file.text());
      if (!packet || !['approved', 'routed'].includes(packet.status) || !packet.title || !packet.action_type) {
        throw new Error('请选择由用户声音流程导出的已批准任务包。');
      }
      const moduleMap = {
        research_question: 'research',
        discord_topic: 'community',
        content_idea: 'community'
      };
      activeModule = studioConfig.modules.find((module) => module.id === moduleMap[packet.action_type]) || studioConfig.modules[0];
      const confirmed = [
        packet.insight_title,
        packet.insight_summary,
        packet.evidence_strength ? `证据状态：${packet.evidence_strength}` : ''
      ].filter(Boolean).join('\n');
      draftValues = {
        title: safeText(packet.title),
        goal: safeText(packet.rationale || packet.insight_summary),
        audience: '',
        target_action: '',
        channels: [],
        confirmed_facts: confirmed,
        permission_status: '只做内部草稿',
        asset_source: '暂时不需要素材',
        constraints: safeText(packet.instruction)
      };
      currentJob = null;
      activeStep = 0;
      editingExisting = false;
      history.replaceState({}, '', `content-studio.html?module=${encodeURIComponent(activeModule.id)}`);
      updateModuleButtons();
      showForm();
      status.textContent = '任务包已载入，请补全联系对象、渠道和模块条件。';
      document.querySelector('#studio-title')?.focus();
    } catch (error) {
      status.textContent = error.message || '任务包读取失败。';
    }
  }

  function buildPage() {
    const content = document.querySelector('#content');
    content.innerHTML = `
      <header class="page-heading"><h1>${safeText(studioConfig.title)}</h1></header>
      <div class="studio-toolbar">
        <div class="studio-module-nav" id="studio-module-nav" aria-label="内容类型"></div>
        <div class="studio-toolbar-side"><label class="studio-link-button" for="studio-import-task">导入任务包</label><input id="studio-import-task" type="file" accept="application/json,.json" hidden><span class="studio-privacy">${safeText(studioConfig.privacy_notice)}</span><span class="studio-import-status" id="studio-import-status" role="status" aria-live="polite"></span></div>
      </div>
      <section class="studio-form-shell" id="studio-form-view">
        <nav class="studio-progress" id="studio-progress" aria-label="填写步骤"></nav>
        <form id="studio-form">
          <div class="studio-stage-head"><h2 id="studio-stage-title"></h2></div>
          <div class="studio-fields" id="studio-stage-fields"></div>
          <p class="studio-field-error" id="studio-channels-error" hidden>至少选择一个渠道。</p>
          <div class="studio-stage-actions">
            <button class="studio-button" id="studio-back" type="button">上一步</button>
            <div class="studio-stage-actions-right">
              <button class="studio-button studio-button-primary" id="studio-next" type="button">下一步</button>
              <button class="studio-button studio-button-primary" id="studio-generate" type="button">生成草稿</button>
            </div>
          </div>
        </form>
      </section>
      <section class="studio-review-shell" id="studio-review-view" hidden>
        <header class="review-header">
          <span class="status status-ready" id="review-status"></span>
          <h2 id="review-title"></h2>
          <span class="review-meta" id="review-meta"></span>
          <p id="review-summary"></p>
          <button class="studio-link-button" id="studio-edit-request" type="button">修改需求</button>
        </header>
        <div class="review-layout">
          <nav class="review-output-nav" id="review-output-nav" aria-label="内容草稿"></nav>
          <section class="review-editor"><h3 id="review-output-title"></h3><p id="review-output-purpose"></p><textarea id="review-output-editor" aria-label="内容草稿"></textarea></section>
          <aside class="review-inspector">
            <section class="review-blockers" id="review-blocker-wrap" hidden><h3>批准前确认</h3><ul id="review-blockers"></ul></section>
            <section class="review-checks"><h3>检查</h3><ul id="review-must-do"></ul></section>
            <section class="review-checks"><h3>避免</h3><ul id="review-avoid"></ul></section>
            <div class="review-actions" id="review-actions"></div>
            <section class="review-versions"><h3>版本</h3><ol id="review-versions"></ol></section>
          </aside>
        </div>
      </section>
      <section class="studio-library">
        <div class="studio-library-head"><h2>已保存内容</h2><div class="studio-library-actions"><span class="count-note" id="saved-job-count"></span><button class="studio-link-button" id="studio-clear-local" type="button">清空</button></div></div>
        <div class="studio-saved-jobs" id="studio-saved-jobs"></div>
      </section>`;

    const nav = document.querySelector('#studio-module-nav');
    studioConfig.modules.forEach((module) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'studio-module-button';
      button.dataset.studioModule = module.id;
      button.textContent = module.label;
      button.addEventListener('click', () => switchModule(module.id));
      nav.appendChild(button);
    });
    updateModuleButtons();
    document.querySelector('#studio-back').addEventListener('click', () => goToStep(activeStep - 1));
    document.querySelector('#studio-next').addEventListener('click', () => goToStep(activeStep + 1));
    document.querySelector('#studio-generate').addEventListener('click', createOrUpdateJob);
    document.querySelector('#studio-edit-request').addEventListener('click', editCurrentJob);
    document.querySelector('#studio-clear-local').addEventListener('click', clearLocalData);
    document.querySelector('#studio-import-task').addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (file) importContentTask(file);
      event.target.value = '';
    });
    showForm();
    renderSavedJobs();
  }

  window.initContentStudio = async () => {
    const response = await fetch('data/content-studio.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('内容生产数据加载失败');
    studioConfig = await response.json();
    const requested = new URLSearchParams(window.location.search).get('module');
    activeModule = studioConfig.modules.find((module) => module.id === requested) || studioConfig.modules[0];
    buildPage();
  };
})();
