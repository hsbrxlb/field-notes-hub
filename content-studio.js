(() => {
  const STORAGE_KEY = 'oedro-content-studio-jobs-v1';
  const DRAFT_KEY = 'oedro-content-studio-draft-v2';
  const BACKUP_SCHEMA = 'oedro-content-studio-backup-v1';
  let studioConfig;
  let activeModule;
  let currentJob = null;
  let activeStep = 0;
  let activeOutputId = '';
  let draftValues = {};
  let editingExisting = false;
  let storageError = '';
  let draftStorageError = '';
  let editorSaveTimer = null;

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

  function setStorageStatus(message, isError = false) {
    const status = document.querySelector('#studio-storage-status');
    if (!status) return;
    status.textContent = message || storageError;
    status.classList.toggle('is-error', Boolean(isError || storageError));
  }

  function readJobs() {
    try {
      const jobs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(jobs)) throw new Error('saved jobs must be an array');
      storageError = '';
      return jobs.map(normalizeJob);
    } catch (error) {
      storageError = '已保存内容读取失败。请先恢复备份，不要继续覆盖。';
      setStorageStatus(storageError, true);
      return [];
    }
  }

  function writeJobs(jobs) {
    if (storageError) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
      setStorageStatus('已保存在当前浏览器。');
      return true;
    } catch (error) {
      storageError = '浏览器无法保存内容。请导出备份后检查网站存储设置。';
      setStorageStatus(storageError, true);
      return false;
    }
  }

  function saveJobRecord(job) {
    const jobs = readJobs();
    if (storageError) return false;
    const index = jobs.findIndex((item) => item.job_id === job.job_id);
    if (index >= 0) jobs[index] = job;
    else jobs.push(job);
    return writeJobs(jobs);
  }

  function readDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const draft = JSON.parse(raw);
      if (!draft || draft.schema_version !== 2 || !draft.module_id || !draft.values || typeof draft.values !== 'object') {
        draftStorageError = '上次未完成的填写内容格式不正确。请先清除这份损坏的未完成内容。';
        return null;
      }
      draftStorageError = '';
      return draft;
    } catch {
      draftStorageError = '上次未完成的填写内容无法恢复。请先清除这份损坏的未完成内容。';
      return null;
    }
  }

  function writeDraft() {
    if (draftStorageError) {
      setStorageStatus(draftStorageError, true);
      return false;
    }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        schema_version: 2,
        module_id: activeModule.id,
        active_step: activeStep,
        values: draftValues,
        job_id: editingExisting ? currentJob?.job_id || '' : '',
        editing_existing: Boolean(editingExisting && currentJob),
        saved_at: timestamp()
      }));
      return true;
    } catch {
      setStorageStatus('当前填写内容无法自动保存。', true);
      return false;
    }
  }

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
      draftStorageError = '';
      document.querySelector('#studio-discard-draft')?.setAttribute('hidden', '');
    } catch {
      setStorageStatus('未完成草稿无法从浏览器清除。', true);
    }
  }

  function discardBrokenDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
      draftStorageError = '';
      document.querySelector('#studio-discard-draft')?.setAttribute('hidden', '');
      writeDraft();
      setStorageStatus('损坏的未完成内容已清除，当前填写可以继续保存。');
    } catch {
      setStorageStatus('损坏的未完成内容无法清除。', true);
    }
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
    return studioConfig.quick_steps.map((step) => ({
      ...step,
      fields: step.fields.map((id) => fieldById(id)).filter(Boolean)
    }));
  }

  function quickFieldIds() {
    return new Set(studioConfig.quick_steps.flatMap((step) => step.fields));
  }

  function advancedFields() {
    const quickIds = quickFieldIds();
    return [...studioConfig.common_fields, ...activeModule.fields].filter((field) => !quickIds.has(field.id));
  }

  function applyModuleDefaults(values = {}) {
    const defaults = activeModule.quick_defaults || {};
    const merged = { ...defaults, ...values };
    if (!Array.isArray(merged.channels)) merged.channels = [...(defaults.channels || [])];
    return merged;
  }

  function createField(field, requireAnswer = false) {
    const wrapper = document.createElement(field.type === 'checkboxes' ? 'fieldset' : 'div');
    wrapper.className = `studio-field studio-field-${field.type}`;
    if (field.type === 'textarea' || field.type === 'checkboxes') wrapper.classList.add('studio-field-wide');
    const label = document.createElement(field.type === 'checkboxes' ? 'legend' : 'label');
    label.textContent = field.label;
    if (field.type === 'checkboxes') label.id = `studio-${field.id}-label`;
    else label.htmlFor = `studio-${field.id}`;
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
      input.setAttribute('role', 'group');
      input.setAttribute('aria-labelledby', label.id);
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
      input.required = Boolean(requireAnswer && field.required);
    }
    wrapper.appendChild(input);
    if (field.help) {
      const help = document.createElement('small');
      help.textContent = field.help;
      wrapper.appendChild(help);
    }
    return wrapper;
  }

  function captureFields(fields) {
    fields.forEach((field) => {
      if (field.type === 'checkboxes') {
        draftValues[field.id] = [...document.querySelectorAll(`input[name="${field.id}"]:checked`)].map((item) => item.value);
      } else {
        const input = document.querySelector(`#studio-${field.id}`);
        if (input) draftValues[field.id] = input.value || '';
      }
    });
  }

  function captureCurrentStep() {
    captureFields(stages()[activeStep].fields);
  }

  function captureAdvanced() {
    captureFields(advancedFields());
  }

  function validateCurrentStep() {
    const form = document.querySelector('#studio-form');
    return Boolean(form?.reportValidity());
  }

  function requiredValuesComplete() {
    const missing = stages().flatMap((stage) => stage.fields).find((field) => {
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
    captureAdvanced();
    activeStep = Math.max(0, Math.min(stages().length - 1, index));
    writeDraft();
    renderForm();
  }

  function renderProgress() {
    const progress = document.querySelector('#studio-progress');
    progress.replaceChildren();
    stages().forEach((stage, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.disabled = index > activeStep;
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
    document.querySelector('#studio-stage-description').textContent = stage.description || '';
    const fields = document.querySelector('#studio-stage-fields');
    fields.replaceChildren(...stage.fields.map((field) => createField(field, true)));
    const advanced = document.querySelector('#studio-advanced-fields');
    advanced.replaceChildren(...advancedFields().map((field) => createField(field, false)));
    document.querySelector('#studio-back').hidden = activeStep === 0;
    const next = document.querySelector('#studio-next');
    const generate = document.querySelector('#studio-generate');
    next.hidden = activeStep === stages().length - 1;
    generate.hidden = activeStep !== stages().length - 1;
    generate.textContent = editingExisting ? '更新内部草稿' : '生成内部草稿';
  }

  function approvalBlockers(values) {
    const blockers = [];
    const missingDetails = advancedFields()
      .filter((field) => field.required)
      .filter((field) => {
        const value = values[field.id];
        return Array.isArray(value) ? value.length === 0 : !safeText(value).trim();
      })
      .map((field) => field.label);
    if (missingDetails.length) blockers.push(`补充后才能批准：${missingDetails.join('、')}。`);
    if (!Array.isArray(values.channels) || !values.channels.length) blockers.push('还没有选择使用渠道。');
    if (values.permission_status !== '已确认') blockers.push('联系许可还没有确认。');
    if (!values.asset_source || values.asset_source === '素材权利需要确认') blockers.push('素材权利还没有确认。');
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
    if (draftStorageError) {
      setStorageStatus(draftStorageError, true);
      document.querySelector('#studio-discard-draft')?.removeAttribute('hidden');
      return;
    }
    if (!validateCurrentStep()) return;
    captureCurrentStep();
    captureAdvanced();
    if (!requiredValuesComplete()) return;
    draftValues = applyModuleDefaults(draftValues);
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
        schema_version: '1.1',
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
    if (!saveJobRecord(currentJob)) return;
    clearDraft();
    showReview();
    renderSavedJobs();
  }

  function syncActiveEditor() {
    const editor = document.querySelector('#review-output-editor');
    if (!editor || !currentJob) return;
    const output = currentJob.outputs.find((item) => item.id === activeOutputId);
    if (output) output.content = editor.value;
  }

  function persistEditorDraft() {
    if (!currentJob) return;
    syncActiveEditor();
    currentJob.updated_at = timestamp();
    saveJobRecord(currentJob);
  }

  function scheduleEditorSave() {
    clearTimeout(editorSaveTimer);
    editorSaveTimer = setTimeout(persistEditorDraft, 300);
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
    if (!saveJobRecord(currentJob)) return;
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

  function summaryItems() {
    return [
      { id: 'title', label: '具体事情', value: currentJob.values.title },
      { id: 'audience', label: '联系对象', value: currentJob.values.audience },
      { id: 'target_action', label: '希望动作', value: currentJob.values.target_action },
      { id: 'confirmed_facts', label: '已确认事实', value: currentJob.values.confirmed_facts },
      { id: 'channels', label: '渠道', value: currentJob.values.channels },
      { id: 'permission_status', label: '联系许可', value: currentJob.values.permission_status },
      { id: 'asset_source', label: '素材权利', value: currentJob.values.asset_source }
    ];
  }

  function editField(fieldId) {
    const quickIndex = stages().findIndex((stage) => stage.fields.some((field) => field.id === fieldId));
    editCurrentJob(quickIndex >= 0 ? quickIndex : 0, quickIndex < 0, fieldId);
  }

  function renderAnswerSummary() {
    const wrap = document.querySelector('#review-answer-summary');
    wrap.replaceChildren();
    summaryItems().forEach((item) => {
      const row = document.createElement('div');
      const label = document.createElement('strong');
      const value = document.createElement('span');
      const change = document.createElement('button');
      label.textContent = item.label;
      value.textContent = fieldValueLabel(item.id, item.value);
      change.type = 'button';
      change.textContent = '修改';
      change.setAttribute('aria-label', `修改${item.label}`);
      change.addEventListener('click', () => editField(item.id));
      row.append(label, value, change);
      wrap.appendChild(row);
    });
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
    renderAnswerSummary();

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

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportCurrentJob() {
    if (!currentJob) return;
    syncActiveEditor();
    downloadJson(currentJob, `${currentJob.job_id}.json`);
  }

  function exportBackup() {
    if (currentJob) persistEditorDraft();
    const jobs = readJobs();
    if (storageError) return;
    const date = new Date().toISOString().slice(0, 10);
    downloadJson({ schema: BACKUP_SCHEMA, exported_at: timestamp(), jobs }, `oedro-content-studio-backup-${date}.json`);
    setStorageStatus(`已导出 ${jobs.length} 份内容。`);
  }

  function isRestorableJob(job) {
    return Boolean(
      job && typeof job === 'object' && typeof job.job_id === 'string' &&
      studioConfig.modules.some((module) => module.id === job.module_id) &&
      job.values && typeof job.values === 'object' && Array.isArray(job.outputs) &&
      typeof job.updated_at === 'string' && Number.isFinite(Date.parse(job.updated_at))
    );
  }

  async function restoreBackup(file) {
    try {
      const packet = JSON.parse(await file.text());
      const incoming = packet?.schema === BACKUP_SCHEMA && Array.isArray(packet.jobs) ? packet.jobs : [packet];
      if (!incoming.length || incoming.some((job) => !isRestorableJob(job))) {
        throw new Error('请选择由本页导出的单项内容或完整备份。');
      }
      const current = readJobs();
      const replacedUnreadable = Boolean(storageError);
      if (replacedUnreadable) storageError = '';
      const merged = new Map(current.map((job) => [job.job_id, normalizeJob(job)]));
      let restored = 0;
      let kept = 0;
      incoming.map(normalizeJob).forEach((job) => {
        const existing = merged.get(job.job_id);
        const incomingTime = Date.parse(job.updated_at);
        const existingTime = Date.parse(existing?.updated_at || '') || 0;
        if (!existing || incomingTime > existingTime) {
          merged.set(job.job_id, job);
          restored += 1;
        } else {
          kept += 1;
        }
      });
      if (!writeJobs([...merged.values()])) throw new Error(storageError || '备份无法写入。');
      renderSavedJobs();
      const recoveryNote = replacedUnreadable ? ' 原有本机数据无法读取，已用备份恢复。' : '';
      setStorageStatus(`恢复 ${restored} 份；保留 ${kept} 份较新的本机内容。${recoveryNote}`);
    } catch (error) {
      setStorageStatus(error.message || '备份恢复失败。', true);
    }
  }

  function renderSavedJobs() {
    const list = document.querySelector('#studio-saved-jobs');
    list.replaceChildren();
    const jobs = readJobs().sort((a, b) => safeText(b.updated_at).localeCompare(safeText(a.updated_at)));
    if (storageError) {
      document.querySelector('#saved-job-count').textContent = '读取失败';
      const error = document.createElement('p');
      error.className = 'studio-saved-empty is-error';
      error.textContent = storageError;
      list.appendChild(error);
      return;
    }
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
    currentJob.blockers = approvalBlockers(currentJob.values);
    activeOutputId = currentJob.outputs[0]?.id || '';
    editingExisting = false;
    history.replaceState({}, '', `content-studio.html?module=${encodeURIComponent(activeModule.id)}`);
    updateModuleButtons();
    showReview();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function editCurrentJob(stepIndex = 0, openAdvanced = false, focusField = '') {
    if (!currentJob) return;
    syncActiveEditor();
    draftValues = { ...currentJob.values };
    activeStep = stepIndex;
    editingExisting = true;
    showForm();
    const details = document.querySelector('#studio-advanced');
    if (details && openAdvanced) details.open = true;
    document.querySelector(`#studio-${focusField}`)?.focus();
  }

  function updateModuleButtons() {
    document.querySelectorAll('[data-studio-module]').forEach((button) => {
      const selected = button.dataset.studioModule === activeModule.id;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  function switchModule(moduleId) {
    if (!document.querySelector('#studio-form-view').hidden) {
      captureCurrentStep();
      captureAdvanced();
    }
    const commonIds = new Set(studioConfig.common_fields.map((field) => field.id));
    draftValues = Object.fromEntries(Object.entries(draftValues).filter(([key]) => commonIds.has(key)));
    activeModule = studioConfig.modules.find((module) => module.id === moduleId) || studioConfig.modules[0];
    draftValues = applyModuleDefaults(draftValues);
    currentJob = null;
    activeStep = 0;
    editingExisting = false;
    history.replaceState({}, '', `content-studio.html?module=${encodeURIComponent(activeModule.id)}`);
    updateModuleButtons();
    writeDraft();
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
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(DRAFT_KEY);
      storageError = '';
      draftStorageError = '';
    } catch {
      setStorageStatus('浏览器没有完成清空。', true);
      return;
    }
    currentJob = null;
    draftValues = applyModuleDefaults();
    editingExisting = false;
    showForm();
    renderSavedJobs();
  }

  async function importContentTask(file) {
    const status = document.querySelector('#studio-import-status');
    try {
      const packet = JSON.parse(await file.text());
      if (!packet || !['approved', 'routed'].includes(packet.status) || !packet.title || !packet.action_type) {
        throw new Error('请选择由问题与反馈流程导出的已批准任务包。');
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
      draftValues = applyModuleDefaults({
        title: safeText(packet.title),
        goal: safeText(packet.rationale || packet.insight_summary),
        audience: '',
        target_action: '',
        confirmed_facts: confirmed,
        permission_status: '只做内部草稿',
        asset_source: '暂时不需要素材',
        constraints: safeText(packet.instruction)
      });
      currentJob = null;
      activeStep = 0;
      editingExisting = false;
      history.replaceState({}, '', `content-studio.html?module=${encodeURIComponent(activeModule.id)}`);
      updateModuleButtons();
      writeDraft();
      showForm();
      status.textContent = '任务包已载入。请补充联系对象和希望动作。';
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
        <span class="studio-privacy">${safeText(studioConfig.privacy_notice)}</span>
      </div>
      <details class="studio-secondary-tools">
        <summary>更多操作</summary>
        <div><label class="studio-button" for="studio-import-task">导入问题与反馈任务包</label><input id="studio-import-task" type="file" accept="application/json,.json" hidden><span class="studio-import-status" id="studio-import-status" role="status" aria-live="polite"></span></div>
      </details>
      <section class="studio-form-shell" id="studio-form-view">
        <nav class="studio-progress" id="studio-progress" aria-label="填写步骤"></nav>
        <form id="studio-form">
          <div class="studio-stage-head"><h2 id="studio-stage-title"></h2><p id="studio-stage-description"></p></div>
          <div class="studio-fields" id="studio-stage-fields"></div>
          <details class="studio-advanced" id="studio-advanced">
            <summary>更多设置 <span>渠道、许可、素材和模块条件</span></summary>
            <div class="studio-fields studio-advanced-fields" id="studio-advanced-fields"></div>
          </details>
          <div class="studio-stage-actions">
            <button class="studio-button" id="studio-back" type="button">上一步</button>
            <div class="studio-stage-actions-right">
              <button class="studio-button studio-button-primary" id="studio-next" type="button">下一步</button>
              <button class="studio-button studio-button-primary" id="studio-generate" type="button">生成内部草稿</button>
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
        <section class="review-answer-block">
          <div class="section-head"><h3>填写内容</h3></div>
          <div class="review-answer-summary" id="review-answer-summary"></div>
        </section>
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
        <div class="studio-library-head"><h2>已保存内容</h2><div class="studio-library-actions"><span class="count-note" id="saved-job-count"></span><button class="studio-link-button" id="studio-export-backup" type="button">备份全部</button><label class="studio-link-button" for="studio-restore-backup">恢复备份</label><input id="studio-restore-backup" type="file" accept="application/json,.json" hidden><button class="studio-link-button" id="studio-discard-draft" type="button" hidden>清除未完成内容</button><button class="studio-link-button" id="studio-clear-local" type="button">清空</button></div></div>
        <p class="studio-storage-status" id="studio-storage-status" role="status" aria-live="polite"></p>
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
    document.querySelector('#studio-edit-request').addEventListener('click', () => editCurrentJob());
    document.querySelector('#studio-export-backup').addEventListener('click', exportBackup);
    document.querySelector('#studio-discard-draft').addEventListener('click', discardBrokenDraft);
    document.querySelector('#studio-clear-local').addEventListener('click', clearLocalData);
    document.querySelector('#studio-form').addEventListener('input', () => {
      captureCurrentStep();
      captureAdvanced();
      writeDraft();
    });
    document.querySelector('#studio-form').addEventListener('change', () => {
      captureCurrentStep();
      captureAdvanced();
      writeDraft();
    });
    document.querySelector('#review-output-editor').addEventListener('input', scheduleEditorSave);
    document.querySelector('#studio-import-task').addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (file) importContentTask(file);
      event.target.value = '';
    });
    document.querySelector('#studio-restore-backup').addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (file) restoreBackup(file);
      event.target.value = '';
    });
    showForm();
    renderSavedJobs();
  }

  window.addEventListener('beforeunload', () => {
    clearTimeout(editorSaveTimer);
    if (currentJob && !document.querySelector('#studio-review-view')?.hidden) persistEditorDraft();
  });

  window.initContentStudio = async () => {
    const response = await fetch('data/content-studio.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('内容生产数据加载失败');
    studioConfig = await response.json();
    const requested = new URLSearchParams(window.location.search).get('module');
    activeModule = studioConfig.modules.find((module) => module.id === requested) || studioConfig.modules[0];
    const savedDraft = readDraft();
    if (savedDraft && (!requested || savedDraft.module_id === requested)) {
      activeModule = studioConfig.modules.find((module) => module.id === savedDraft.module_id) || activeModule;
      draftValues = applyModuleDefaults(savedDraft.values);
      activeStep = Math.max(0, Math.min(studioConfig.quick_steps.length - 1, Number(savedDraft.active_step) || 0));
      if (savedDraft.editing_existing && savedDraft.job_id) {
        currentJob = readJobs().find((job) => job.job_id === savedDraft.job_id) || null;
        editingExisting = Boolean(currentJob);
      }
    } else {
      draftValues = applyModuleDefaults();
    }
    buildPage();
    if (draftStorageError) {
      document.querySelector('#studio-discard-draft').removeAttribute('hidden');
      setStorageStatus(draftStorageError, true);
    } else if (savedDraft && (!requested || savedDraft.module_id === requested)) {
      setStorageStatus('已恢复上次未完成的填写内容。');
    }
  };
})();
