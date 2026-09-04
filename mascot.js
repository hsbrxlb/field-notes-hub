(function () {
  const safe = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function assetFigure(asset, eager = false) {
    return '<figure class="evo-asset">'
      + '<div class="evo-asset-image"><img src="' + safe(asset.src) + '" alt="' + safe(asset.alt)
      + '" width="1254" height="1254" loading="' + (eager ? 'eager' : 'lazy') + '" decoding="async"></div>'
      + '<figcaption>' + safe(asset.caption) + '</figcaption></figure>';
  }

  function characterMarkup(character, isFirst) {
    return '<section class="evo-character" id="' + safe(character.id) + '" data-searchable>'
      + '<header class="evo-character-head"><span class="evo-character-index">' + safe(character.index) + '</span>'
      + '<div><h2>' + safe(character.name_cn) + '<span lang="en">（' + safe(character.name_en) + '）</span></h2>'
      + '<p>' + safe(character.blurb) + '</p></div></header>'
      + '<div class="evo-assets">'
      + character.assets.map((asset, index) => assetFigure(asset, isFirst && index < 4)).join('')
      + '</div></section>';
  }

  function tocMarkup(characters) {
    return '<nav class="evo-toc" aria-label="角色跳转"><strong>角色</strong><div class="evo-toc-list">'
      + characters.map((character) => '<a href="#' + safe(character.id) + '"><span>'
        + safe(character.index) + '</span>' + safe(character.name_cn) + '</a>').join('')
      + '</div></nav>';
  }

  window.initMascot = async function initMascot() {
    const response = await fetch('data/mascot.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('吉祥物档案加载失败');
    const data = await response.json();
    document.title = data.title + '｜OEDRO海外用户运营';
    document.querySelector('meta[name="description"]').content = data.meta_description;
    document.querySelector('#content').innerHTML = '<header class="page-heading evo-heading"><h1>吉祥物迭代</h1></header>'
      + '<div class="evo-layout">' + tocMarkup(data.characters)
      + '<div class="evo-character-list">'
      + data.characters.map((character, index) => characterMarkup(character, index === 0)).join('')
      + '</div></div>';
  };
})();
