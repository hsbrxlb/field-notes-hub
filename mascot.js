(function () {
  const safe = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function assetCard(asset, round, eager = false) {
    const view = asset.view || asset.style || round.label;
    return `<button class="evo-asset" type="button"
      data-evo-image="${safe(asset.code)}"
      data-round="${safe(round.id)}"
      data-family="${safe(asset.family)}"
      data-palette="${safe(asset.palette)}"
      aria-label="查看${safe(round.label)} ${safe(asset.title)} ${safe(view)}高清图">
      <span class="evo-asset-image"><img src="${safe(asset.src)}" alt="${safe(asset.alt)}" width="1254" height="1254" loading="${eager ? 'eager' : 'lazy'}" decoding="async"></span>
      <span class="evo-asset-copy"><strong>${safe(asset.title)}</strong><small>${safe(view)}</small></span>
    </button>`;
  }

  function roundMarkup(round, data, isLatest) {
    const families = [...new Set(round.assets.map((asset) => asset.family))];
    let eagerIndex = 0;
    const groups = families.map((family) => {
      const familyAssets = round.assets.filter((asset) => asset.family === family);
      const note = data.family_notes?.[family];
      return `<section class="evo-family-group" data-family-group="${safe(family)}" data-searchable>
        <div class="evo-family-head">
          <h3>${safe(data.family_labels[family] || family)}</h3>
          ${note ? `<p>${safe(note)}</p>` : ''}
        </div>
        <div class="evo-family-assets">${familyAssets.map((asset) => assetCard(asset, round, isLatest && eagerIndex++ < 2)).join('')}</div>
      </section>`;
    }).join('');

    return `<details class="evo-round" data-evo-round="${safe(round.id)}" data-searchable ${isLatest ? 'open' : ''}>
      <summary>
        <span class="evo-round-index">${safe(round.label)}</span>
        <span class="evo-round-summary"><b>${safe(round.date)}</b><strong>${safe(round.goal)}</strong></span>
        <span class="evo-round-toggle" aria-hidden="true"></span>
      </summary>
      <div class="evo-round-body">${groups}</div>
    </details>`;
  }

  function optionMarkup(value, label) {
    return `<option value="${safe(value)}">${safe(label)}</option>`;
  }

  function bindLightbox(assets) {
    const dialog = document.querySelector('#evo-lightbox');
    const image = dialog?.querySelector('img');
    const title = dialog?.querySelector('strong');
    const detail = dialog?.querySelector('span');
    const open = (item) => {
      if (!dialog || !image) return;
      image.src = item.asset.src;
      image.alt = item.asset.alt;
      title.textContent = item.asset.title;
      detail.textContent = `${item.round.label} · ${item.asset.view || item.asset.style || ''}`;
      dialog.showModal();
    };
    document.querySelectorAll('[data-evo-image]').forEach((button) => button.addEventListener('click', () => {
      const item = assets.find((candidate) => candidate.asset.code === button.dataset.evoImage);
      if (item) open(item);
    }));
    dialog?.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
    dialog?.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  function bindFilters(total) {
    const controls = {
      round: document.querySelector('#evo-round-filter'),
      family: document.querySelector('#evo-family-filter'),
      palette: document.querySelector('#evo-palette-filter')
    };
    const count = document.querySelector('#evo-result-count');
    const run = () => {
      const values = Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, control?.value || 'all']));
      let visible = 0;
      document.querySelectorAll('.evo-asset[data-round]').forEach((card) => {
        const show = (values.round === 'all' || card.dataset.round === values.round)
          && (values.family === 'all' || card.dataset.family === values.family)
          && (values.palette === 'all' || card.dataset.palette === values.palette);
        card.hidden = !show;
        if (show) visible += 1;
      });
      document.querySelectorAll('[data-family-group]').forEach((group) => {
        group.hidden = ![...group.querySelectorAll('.evo-asset')].some((card) => !card.hidden);
      });
      document.querySelectorAll('[data-evo-round]').forEach((round) => {
        const hasVisible = [...round.querySelectorAll('.evo-asset')].some((card) => !card.hidden);
        round.hidden = !hasVisible;
        if (values.round !== 'all' && round.dataset.evoRound === values.round) round.open = true;
      });
      if (count) count.textContent = `显示 ${visible} / ${total} 张`;
      const globalEmpty = document.querySelector('#evo-global-empty');
      if (globalEmpty) globalEmpty.hidden = visible > 0;
    };
    Object.values(controls).forEach((control) => control?.addEventListener('change', run));
    run();
  }

  window.initMascot = async function initMascot() {
    const response = await fetch('data/mascot.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('吉祥物迭代数据加载失败');
    const data = await response.json();
    const assets = data.rounds.flatMap((round) => round.assets.map((asset) => ({ round, asset })));
    const families = [...new Set(assets.map((item) => item.asset.family))];
    const palettes = [...new Set(assets.map((item) => item.asset.palette))];
    const rounds = [...data.rounds].reverse();
    document.title = `${data.title}｜OEDRO海外用户运营`;
    document.querySelector('meta[name="description"]').content = data.meta_description;
    document.querySelector('#content').innerHTML = `
      <header class="page-heading evo-heading">
        <h1>吉祥物迭代</h1>
        <p>每张图独立展示。最新一轮按身份、结构、工作和动态查看同一角色。</p>
      </header>
      <section class="section evo-history">
        <div class="evo-filters" aria-label="筛选吉祥物方案">
          <label>轮次<select id="evo-round-filter"><option value="all">全部轮次</option>${rounds.map((round) => optionMarkup(round.id, round.label)).join('')}</select></label>
          <label>角色<select id="evo-family-filter"><option value="all">全部角色</option>${families.map((id) => optionMarkup(id, data.family_labels[id])).join('')}</select></label>
          <label>配色<select id="evo-palette-filter"><option value="all">全部配色</option>${palettes.map((id) => optionMarkup(id, data.palette_labels[id])).join('')}</select></label>
          <span id="evo-result-count" aria-live="polite"></span>
        </div>
        <div class="evo-round-list">${rounds.map((round, index) => roundMarkup(round, data, index === 0)).join('')}</div>
        <p class="evo-global-empty" id="evo-global-empty" hidden>当前筛选条件下没有方案。</p>
      </section>
      <div class="empty-state search-empty" role="status" hidden>没有找到匹配的方案</div>
      <dialog class="evo-lightbox" id="evo-lightbox" aria-label="吉祥物高清图">
        <button type="button" data-close aria-label="关闭高清图">×</button>
        <div><img alt="" width="1500" height="1500"></div>
        <p><strong></strong><span></span></p>
      </dialog>`;
    bindLightbox(assets);
    bindFilters(assets.length);
  };
})();
