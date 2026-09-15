(() => {
  const PAGE_SIZE = 24;
  const state = { manifest: null, category: null, products: [], brand: '全部', quality: '全部', page: 1, requestId: 0 };

  const h = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  const money = (value, currency = 'USD') => {
    const number = Number(value);
    return Number.isFinite(number) ? new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(number) : '价格未显示';
  };

  const dateText = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '日期未知' : date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  function categoryButtons() {
    return state.manifest.categories.map((item) => `
      <button class="category-cell${item.id === state.category?.id ? ' active' : ''}" type="button" data-category="${h(item.id)}" aria-pressed="${item.id === state.category?.id}">
        <span>${h(item.name)}</span><strong>${item.count}</strong>
      </button>`).join('');
  }

  function shellMarkup() {
    const m = state.manifest;
    return `
      <header class="catalog-hero">
        <div><span class="eyebrow">OFFICIAL CATALOG SNAPSHOT</span><h1>${h(m.title)}</h1><p>${h(m.description)}</p></div>
        <dl class="catalog-stats">
          <div><dt>商品</dt><dd>${m.productCount.toLocaleString('zh-CN')}</dd></div>
          <div><dt>分类</dt><dd>${m.categories.length}</dd></div>
          <div><dt>品牌</dt><dd>${Object.keys(m.brandCounts).length}</dd></div>
          <div><dt>快照</dt><dd>${h(dateText(m.capturedAt))}</dd></div>
        </dl>
        <p class="catalog-coverage" role="note"><strong>目录缺口</strong><span>${m.uncoveredSitemapUrls.toLocaleString('zh-CN')} 条官网站点地图链接跳转首页，未计入上方商品总数。</span></p>
      </header>
      <section class="catalog-section category-section" aria-labelledby="category-heading">
        <div class="catalog-section-head"><div><span class="index-number">01</span><h2 id="category-heading">按官网分类浏览</h2></div><a href="${h(m.sourceUrl)}" target="_blank" rel="noreferrer">打开 OEDRO 官网 ↗</a></div>
        <div class="category-matrix" id="category-matrix">${categoryButtons()}</div>
      </section>
      <section class="catalog-section product-section" aria-labelledby="products-heading">
        <div class="catalog-section-head"><div><span class="index-number">02</span><h2 id="products-heading">商品</h2></div><span id="catalog-status" role="status" aria-live="polite">正在加载…</span></div>
        <div class="catalog-toolbar" id="catalog-toolbar"></div>
        <div class="product-grid" id="product-grid" aria-busy="true"></div>
        <nav class="catalog-pagination" id="catalog-pagination" aria-label="商品分页"></nav>
      </section>
      <section class="catalog-section policy-section" aria-labelledby="policy-heading">
        <div class="catalog-section-head"><div><span class="index-number">03</span><h2 id="policy-heading">官网政策快照</h2></div></div>
        <div id="policy-list"><button class="load-policies" type="button">查看 6 份官网政策</button></div>
      </section>
      <p class="catalog-footnote">${m.notes.map(h).join(' ')}</p>`;
  }

  function visibleProducts() {
    return state.products.filter((item) => {
      const brandMatch = state.brand === '全部' || item.brand === state.brand;
      const qualityMatch = state.quality === '全部' || (state.quality === '需复核' ? item.warnings.length : !item.warnings.length);
      return brandMatch && qualityMatch;
    });
  }

  function toolbarMarkup() {
    const brands = Object.keys(state.category.brands);
    const brandButtons = ['全部', ...brands].map((brand) => `<button type="button" data-brand="${h(brand)}" aria-pressed="${state.brand === brand}">${h(brand)}${brand === '全部' ? '' : ` · ${state.category.brands[brand]}`}</button>`).join('');
    const qualityButtons = ['全部', '资料完整', '需复核'].map((value) => `<button type="button" data-quality="${h(value)}" aria-pressed="${state.quality === value}">${h(value)}</button>`).join('');
    return `<div class="filter-group"><span>品牌</span><div>${brandButtons}</div></div><div class="filter-group"><span>资料状态</span><div>${qualityButtons}</div></div>`;
  }

  function productCard(item, index) {
    const image = item.media.images[0];
    const review = item.review.score ? `${item.review.score} / 5 · ${Number(item.review.count || 0).toLocaleString('zh-CN')} 条评价` : '暂无评分';
    return `<article class="product-card">
      <a class="product-image" href="${h(item.url)}" target="_blank" rel="noreferrer" aria-label="在官网查看 ${h(item.name)}">
        ${image ? `<img src="${h(image)}" alt="${h(item.name)}" width="640" height="640" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async">` : '<span class="image-missing">官网暂无图片</span>'}
      </a>
      <div class="product-copy">
        <div class="product-meta"><span>${h(item.brand)}</span><span>SKU ${h(item.sku || item.id)}</span></div>
        <h3><a href="${h(item.url)}" target="_blank" rel="noreferrer">${h(item.name)}</a></h3>
        <p class="fitment">${h(item.fitment || '官网未提供独立适配说明')}</p>
        <div class="commercial-line"><strong>${h(money(item.price.sale, item.price.currency))}</strong><span>${h(item.price.discount)}</span></div>
        <p class="stock-line">${h(item.price.stock || '库存状态未显示')} · ${h(review)}</p>
        ${item.warnings.length ? `<ul class="warning-list">${item.warnings.map((warning) => `<li>${h(warning)}</li>`).join('')}</ul>` : ''}
        <details class="product-detail"><summary>查看完整资料</summary><div class="product-detail-body" data-detail-id="${h(item.id)}"></div></details>
      </div>
    </article>`;
  }

  function definitionList(values) {
    const entries = Object.entries(values || {});
    return entries.length ? `<dl class="spec-list">${entries.map(([key, value]) => `<div><dt>${h(key)}</dt><dd>${h(value)}</dd></div>`).join('')}</dl>` : '<p class="detail-empty">官网快照未提供这一项。</p>';
  }

  function detailMarkup(item) {
    const images = item.media.images || [];
    const documents = item.installation.documents || [];
    const warranty = item.policies.productWarranty || [];
    const variants = item.variants.skus || [];
    return `
      ${item.description ? `<section><h4>产品说明</h4><p>${h(item.description)}</p></section>` : ''}
      ${item.highlights.length ? `<section><h4>产品卖点</h4><ul>${item.highlights.map((value) => `<li>${h(value)}</li>`).join('')}</ul></section>` : ''}
      <section><h4>规格</h4>${definitionList(item.specifications)}</section>
      ${item.package.length ? `<section><h4>包装清单</h4><ul>${item.package.map((value) => `<li>${h(value.name)}${value.num ? ` × ${h(value.num)}` : ''}</li>`).join('')}</ul></section>` : ''}
      <section><h4>安装与文档</h4>${item.installation.notes ? `<p>${h(item.installation.notes)}</p>` : ''}${documents.length ? `<ul>${documents.map((doc) => `<li><a href="${h(doc.url)}" target="_blank" rel="noreferrer">${h(doc.name || '安装文件')} ↗</a></li>`).join('')}</ul>` : '<p class="detail-empty">没有可用的官网安装文件。</p>'}</section>
      ${warranty.length ? `<section><h4>商品页质保口径</h4><ul>${warranty.map((value) => `<li>${h(value.label)}：${h(value.value)}</li>`).join('')}</ul></section>` : ''}
      ${variants.length > 1 ? `<section><h4>变体</h4><p>官网快照记录 ${variants.length} 个 SKU 选项。</p></section>` : ''}
      ${images.length ? `<section><h4>官网图片 · ${images.length}</h4><div class="media-strip">${images.map((url, imageIndex) => `<a href="${h(url)}" target="_blank" rel="noreferrer"><img src="${h(url)}" alt="${h(item.name)} · 图片 ${imageIndex + 1}" width="320" height="320" loading="lazy" decoding="async"></a>`).join('')}</div></section>` : ''}
      <p class="snapshot-note">资料快照：${h(dateText(item.capturedAt))}。价格、库存、评价和适配可能变化，请以官网当前页面为准。</p>`;
  }

  function renderProducts() {
    const products = visibleProducts();
    const pages = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
    state.page = Math.min(state.page, pages);
    const start = (state.page - 1) * PAGE_SIZE;
    const current = products.slice(start, start + PAGE_SIZE);
    document.querySelector('#catalog-toolbar').innerHTML = toolbarMarkup();
    document.querySelector('#product-grid').innerHTML = current.map(productCard).join('') || '<p class="catalog-empty">当前筛选没有商品。</p>';
    document.querySelector('#product-grid').setAttribute('aria-busy', 'false');
    document.querySelector('#catalog-status').textContent = `${state.category.name} · ${products.length} 件 · 第 ${state.page}/${pages} 页`;
    document.querySelector('#catalog-pagination').innerHTML = `<button type="button" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>上一页</button><span>第 ${state.page} / ${pages} 页</span><button type="button" data-page="${state.page + 1}" ${state.page === pages ? 'disabled' : ''}>下一页</button>`;

    document.querySelectorAll('[data-brand]').forEach((button) => button.addEventListener('click', () => { state.brand = button.dataset.brand; state.page = 1; renderProducts(); }));
    document.querySelectorAll('[data-quality]').forEach((button) => button.addEventListener('click', () => { state.quality = button.dataset.quality; state.page = 1; renderProducts(); }));
    document.querySelectorAll('#catalog-pagination [data-page]').forEach((button) => button.addEventListener('click', () => { state.page = Number(button.dataset.page); renderProducts(); document.querySelector('#products-heading').scrollIntoView({ behavior: 'smooth' }); }));
    document.querySelectorAll('.product-detail').forEach((details) => details.addEventListener('toggle', () => {
      if (!details.open) return;
      const target = details.querySelector('[data-detail-id]');
      if (target.dataset.rendered) return;
      const item = state.products.find((product) => String(product.id) === target.dataset.detailId);
      target.innerHTML = detailMarkup(item);
      target.dataset.rendered = 'true';
    }));
  }

  async function loadCategory(categoryId) {
    const requestId = ++state.requestId;
    const category = state.manifest.categories.find((item) => item.id === categoryId) || state.manifest.categories[0];
    state.category = category;
    state.brand = '全部'; state.quality = '全部'; state.page = 1;
    document.querySelector('#category-matrix').innerHTML = categoryButtons();
    document.querySelector('#product-grid').setAttribute('aria-busy', 'true');
    document.querySelector('#product-grid').innerHTML = '<p class="catalog-loading" role="status">正在载入商品资料…</p>';
    document.querySelector('#catalog-status').textContent = `${category.name} · 正在加载`;
    document.querySelectorAll('[data-category]').forEach((button) => button.addEventListener('click', () => loadCategory(button.dataset.category)));
    try {
      const response = await fetch(category.file, { cache: 'no-store' });
      if (!response.ok) throw new Error('商品分类数据加载失败');
      const data = await response.json();
      if (requestId !== state.requestId) return;
      state.products = data.products;
      const url = new URL(location.href); url.searchParams.set('category', category.id); history.replaceState(null, '', url);
      renderProducts();
    } catch (error) {
      if (requestId !== state.requestId) return;
      document.querySelector('#product-grid').setAttribute('aria-busy', 'false');
      document.querySelector('#product-grid').innerHTML = '<div class="catalog-load-error" role="alert"><strong>这组商品暂时没有载入</strong><p>检查连接后可重新尝试。</p><button type="button" id="retry-category">重试</button></div>';
      document.querySelector('#catalog-toolbar').innerHTML = '';
      document.querySelector('#catalog-pagination').innerHTML = '';
      document.querySelector('#catalog-status').textContent = `${category.name} · 加载失败`;
      document.querySelector('#retry-category').addEventListener('click', () => loadCategory(category.id));
      console.error(error);
    }
  }

  async function loadPolicies() {
    const target = document.querySelector('#policy-list');
    target.innerHTML = '<p class="catalog-loading">正在载入官网政策…</p>';
    try {
      const response = await fetch(state.manifest.policyFile, { cache: 'no-store' });
      if (!response.ok) throw new Error('官网政策加载失败');
      const data = await response.json();
      target.innerHTML = `<div class="policy-list">${data.policies.map((item) => `<details class="catalog-policy"><summary><span>${h(item.title)}</span><small>${h(dateText(item.capturedAt))}</small></summary><div><p>${h(item.officialText)}</p><a href="${h(item.url)}" target="_blank" rel="noreferrer">打开官网政策 ↗</a></div></details>`).join('')}</div>`;
    } catch (error) {
      target.innerHTML = '<div class="catalog-load-error" role="alert"><strong>官网政策暂时没有载入</strong><p>检查连接后可重新尝试。</p><button type="button" id="retry-policies">重试</button></div>';
      document.querySelector('#retry-policies').addEventListener('click', loadPolicies);
      console.error(error);
    }
  }

  window.initProducts = async () => {
    const response = await fetch('data/products/manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('产品资料库清单加载失败');
    state.manifest = await response.json();
    document.title = `${state.manifest.title}｜OEDRO 海外用户运营`;
    document.querySelector('#content').innerHTML = shellMarkup();
    document.querySelectorAll('[data-category]').forEach((button) => button.addEventListener('click', () => loadCategory(button.dataset.category)));
    document.querySelector('.load-policies').addEventListener('click', loadPolicies);
    const requested = new URLSearchParams(location.search).get('category');
    await loadCategory(requested || '995');
  };
})();
