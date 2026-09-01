(function () {
  const safe = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const statusClass = (status) => `evo-status-${String(status).toLowerCase()}`;
  const statusMarkup = (status) => `<span class="evo-status ${statusClass(status)}">${safe(status)}</span>`;

  function assetCard(asset, round, eager = false) {
    return `<button class="evo-asset" type="button"
      data-evo-image="${safe(asset.code)}"
      data-round="${safe(round.id)}"
      data-family="${safe(asset.family)}"
      data-palette="${safe(asset.palette)}"
      data-status="${safe(asset.status)}"
      aria-label="查看${safe(round.label)} ${safe(asset.title)}高清图">
      <span class="evo-asset-image"><img src="${safe(asset.src)}" alt="${safe(asset.alt)}" width="960" height="960" loading="${eager ? 'eager' : 'lazy'}" decoding="async"></span>
      <span class="evo-asset-copy"><span><b>${safe(asset.code)}</b>${statusMarkup(asset.status)}</span><strong>${safe(asset.title)}</strong><small>${safe(asset.style)} · ${safe(asset.score)}</small></span>
    </button>`;
  }

  function recommendedMarkup(data, assets) {
    return data.leader.recommended.map((code) => {
      const item = assets.find((candidate) => candidate.asset.code === code);
      return item ? assetCard(item.asset, item.round, true) : '';
    }).join('');
  }

  function roundMarkup(round) {
    const open = round.id === 'round-4' ? ' open' : '';
    return `<details class="evo-round evo-reveal" data-evo-round="${safe(round.id)}" data-searchable${open}>
      <summary>
        <span class="evo-round-index">${safe(round.label)}</span>
        <span class="evo-round-summary"><b>${safe(round.date)}</b><strong>${safe(round.goal)}</strong></span>
        ${statusMarkup(round.status)}
        <span class="evo-round-toggle" aria-hidden="true"></span>
      </summary>
      <div class="evo-round-body">
        <div class="evo-round-overview">
          <button type="button" data-evo-overview="${safe(round.id)}" data-src="${safe(round.overview)}" data-alt="${safe(round.overview_alt)}" aria-label="放大查看${safe(round.label)}总览">
            <img src="${safe(round.overview)}" alt="${safe(round.overview_alt)}" loading="lazy" decoding="async">
            <span>查看本轮总览</span>
          </button>
        </div>
        <div class="evo-round-story" data-searchable>
          <section><span class="eyebrow">本轮目标</span><p>${safe(round.goal)}</p></section>
          <section><span class="eyebrow">配色</span><div class="evo-palette-list">${round.palette.map((item) => `<span>${safe(item)}</span>`).join('')}</div></section>
          <section><span class="eyebrow">评分</span><p>${safe(round.score)}</p></section>
          <section><span class="eyebrow">主要问题</span><ul>${round.issues.map((item) => `<li>${safe(item)}</li>`).join('')}</ul></section>
          <section class="evo-change"><span class="eyebrow">为什么进入下一轮</span><p>${safe(round.change_reason)}</p></section>
        </div>
        <div class="evo-round-assets" data-round-assets="${safe(round.id)}">${round.assets.map((asset) => assetCard(asset, round)).join('')}</div>
        <p class="evo-round-empty" hidden>这个筛选条件下没有方案。</p>
      </div>
    </details>`;
  }

  function optionMarkup(value, label) {
    return `<option value="${safe(value)}">${safe(label)}</option>`;
  }

  function bindLightbox(data, assets) {
    const dialog = document.querySelector('#evo-lightbox');
    const image = dialog?.querySelector('img');
    const title = dialog?.querySelector('strong');
    const detail = dialog?.querySelector('span');
    const open = (src, alt, heading, meta) => {
      if (!dialog || !image) return;
      image.src = src;
      image.alt = alt;
      title.textContent = heading;
      detail.textContent = meta;
      dialog.showModal();
    };
    document.querySelectorAll('[data-evo-image]').forEach((button) => button.addEventListener('click', () => {
      const item = assets.find((candidate) => candidate.asset.code === button.dataset.evoImage);
      if (item) open(item.asset.src, item.asset.alt, `${item.asset.code} · ${item.asset.title}`, `${item.round.label} · ${item.asset.style} · ${item.asset.status}`);
    }));
    document.querySelectorAll('[data-evo-overview]').forEach((button) => button.addEventListener('click', () => {
      const round = data.rounds.find((item) => item.id === button.dataset.evoOverview);
      if (round) open(button.dataset.src, button.dataset.alt, `${round.label} 总览`, `${round.date} · ${round.status}`);
    }));
    dialog?.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
    dialog?.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  function bindFilters(data) {
    const controls = {
      round: document.querySelector('#evo-round-filter'),
      family: document.querySelector('#evo-family-filter'),
      palette: document.querySelector('#evo-palette-filter'),
      status: document.querySelector('#evo-status-filter')
    };
    const count = document.querySelector('#evo-result-count');
    const run = () => {
      const values = Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, control?.value || 'all']));
      let visible = 0;
      document.querySelectorAll('.evo-round-assets .evo-asset[data-round]').forEach((card) => {
        const show = (values.round === 'all' || card.dataset.round === values.round)
          && (values.family === 'all' || card.dataset.family === values.family)
          && (values.palette === 'all' || card.dataset.palette === values.palette)
          && (values.status === 'all' || card.dataset.status === values.status);
        card.hidden = !show;
        if (show) visible += 1;
      });
      document.querySelectorAll('[data-evo-round]').forEach((round) => {
        const cards = [...round.querySelectorAll('.evo-asset[data-round]')];
        const hasVisible = cards.some((card) => !card.hidden);
        round.hidden = !hasVisible;
        round.querySelector('.evo-round-empty').hidden = hasVisible;
        if (values.round !== 'all' && round.dataset.evoRound === values.round) round.open = true;
      });
      if (count) count.textContent = `显示 ${visible} / 45 张`;
      const globalEmpty = document.querySelector('#evo-global-empty');
      if (globalEmpty) globalEmpty.hidden = visible > 0;
    };
    Object.values(controls).forEach((control) => control?.addEventListener('change', run));
    run();
  }

  function bindReveal() {
    const items = [...document.querySelectorAll('.evo-reveal')];
    if (!('IntersectionObserver' in window)) {
      items.forEach((item) => item.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }), { threshold: 0.08 });
    items.forEach((item) => observer.observe(item));
  }

  window.initMascot = async function initMascot() {
    const response = await fetch('data/mascot.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('吉祥物迭代数据加载失败');
    const data = await response.json();
    const assets = data.rounds.flatMap((round) => round.assets.map((asset) => ({ round, asset })));
    const families = [...new Set(assets.map((item) => item.asset.family))];
    const palettes = [...new Set(assets.map((item) => item.asset.palette))];
    document.title = `${data.title}｜OEDRO海外用户运营`;
    document.querySelector('meta[name="description"]').content = data.meta_description;
    document.querySelector('#content').innerHTML = `
      <header class="page-heading evo-heading">
        <div><span class="eyebrow">OEDRO MASCOT EVOLUTION</span><h1><span>Mascot Evolution</span><i aria-hidden="true"> / </i><span>吉祥物迭代</span></h1><p>${safe(data.leader.conclusion)}</p></div>
        <div class="evo-heading-state">${statusMarkup('Shortlisted')}<span>4 Rounds</span><span>45 Images</span></div>
      </header>
      <section class="section evo-leader" data-searchable>
        <div class="section-head"><div><h2>当前推荐</h2><p class="section-note">供领导快速浏览。没有方案被标记为 Selected。</p></div></div>
        <div class="evo-recommended">${recommendedMarkup(data, assets)}</div>
        <p class="evo-leader-note">${safe(data.leader.note)}</p>
      </section>
      <section class="section evo-solved evo-reveal" data-searchable>
        <div class="section-head"><h2>这一轮解决了什么</h2></div>
        <ol>${data.leader.solved.map((item, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><p>${safe(item)}</p></li>`).join('')}</ol>
      </section>
      <section class="section evo-history">
        <div class="section-head"><div><h2>完整迭代历史</h2><p class="section-note">旧轮次保留当时评分，并按当前状态标记是否仍是候选。点击每轮可查看目标、问题、改动原因和高清图。</p></div></div>
        <div class="evo-filters" aria-label="筛选吉祥物方案">
          <label>Round<select id="evo-round-filter"><option value="all">全部轮次</option>${data.rounds.map((round) => optionMarkup(round.id, round.label)).join('')}</select></label>
          <label>Family<select id="evo-family-filter"><option value="all">全部家族</option>${families.map((id) => optionMarkup(id, data.family_labels[id])).join('')}</select></label>
          <label>Palette<select id="evo-palette-filter"><option value="all">全部配色</option>${palettes.map((id) => optionMarkup(id, data.palette_labels[id])).join('')}</select></label>
          <label>Status<select id="evo-status-filter"><option value="all">全部状态</option>${['Exploring', 'Rejected', 'Shortlisted', 'Selected'].map((status) => optionMarkup(status, status)).join('')}</select></label>
          <span id="evo-result-count" aria-live="polite"></span>
        </div>
        <div class="evo-round-list">${data.rounds.map(roundMarkup).join('')}</div>
        <p class="evo-global-empty" id="evo-global-empty" hidden>当前筛选条件下没有方案。这里没有 Selected 方案。</p>
      </section>
      <div class="empty-state search-empty" role="status" hidden>没有找到匹配的方案</div>
      <dialog class="evo-lightbox" id="evo-lightbox" aria-label="吉祥物高清图">
        <button type="button" data-close aria-label="关闭高清图">×</button>
        <div><img alt="" width="1500" height="1500"></div>
        <p><strong></strong><span></span></p>
      </dialog>`;
    bindLightbox(data, assets);
    bindFilters(data);
    bindReveal();
  };
})();
