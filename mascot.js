(function () {
  const safe = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function assetFigure(asset, round, eager = false) {
    const view = asset.view || asset.style || round.label;
    return '<figure class="evo-asset" data-searchable>'
      + '<div class="evo-asset-image"><img src="' + safe(asset.src) + '" alt="' + safe(asset.alt)
      + '" width="1254" height="1254" loading="' + (eager ? 'eager' : 'lazy') + '" decoding="async"></div>'
      + '<figcaption class="evo-asset-copy"><strong>' + safe(asset.title) + '</strong><span>'
      + safe(view) + '</span></figcaption></figure>';
  }

  function roundMarkup(round, data, isLatest) {
    const families = [...new Set(round.assets.map((asset) => asset.family))];
    let eagerIndex = 0;
    const groups = families.map((family) => {
      const familyAssets = round.assets.filter((asset) => asset.family === family);
      const note = data.family_notes?.[family];
      const singleClass = familyAssets.length === 1 ? ' evo-family-assets-single' : '';
      return '<section class="evo-family-group" data-searchable>'
        + '<div class="evo-family-head"><h3>' + safe(data.family_labels[family] || family) + '</h3>'
        + (note ? '<p>' + safe(note) + '</p>' : '') + '</div>'
        + '<div class="evo-family-assets' + singleClass + '">'
        + familyAssets.map((asset) => assetFigure(asset, round, isLatest && eagerIndex++ < 2)).join('')
        + '</div></section>';
    }).join('');

    return '<section class="evo-round" id="' + safe(round.id) + '" data-searchable>'
      + '<header class="evo-round-head"><h2>' + safe(round.label) + '</h2><div><time datetime="'
      + safe(round.date) + '">' + safe(round.date) + '</time><p>' + safe(round.goal) + '</p></div></header>'
      + '<div class="evo-round-body">' + groups + '</div></section>';
  }

  window.initMascot = async function initMascot() {
    const response = await fetch('data/mascot.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('吉祥物迭代数据加载失败');
    const data = await response.json();
    const assets = data.rounds.flatMap((round) => round.assets);
    const rounds = [...data.rounds].reverse();
    document.title = data.title + '｜OEDRO海外用户运营';
    document.querySelector('meta[name="description"]').content = data.meta_description;
    document.querySelector('#content').innerHTML = '<header class="page-heading evo-heading">'
      + '<h1>吉祥物迭代</h1><p>所有版本按时间展开，共 ' + assets.length
      + ' 张独立概念图。每张图片保持完整画面。</p></header>'
      + '<div class="evo-round-list">' + rounds.map((round, index) => roundMarkup(round, data, index === 0)).join('')
      + '</div><div class="empty-state search-empty" role="status" hidden>没有找到匹配的方案</div>';
  };
})();
