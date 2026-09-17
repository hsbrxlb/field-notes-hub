(function () {
  const safe = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  function assetFigure(asset, eager = false) {
    return '<figure class="evo-asset">'
      + '<a class="evo-asset-image" href="' + safe(asset.src) + '" aria-label="查看原图：' + safe(asset.caption) + '"><img src="' + safe(asset.src) + '" alt="' + safe(asset.alt)
      + '" width="1254" height="1254" loading="' + (eager ? 'eager' : 'lazy') + '" decoding="async"></a>'
      + '<figcaption>' + safe(asset.caption) + '</figcaption></figure>';
  }

  function sizePreviewMarkup(preview) {
    if (!preview) return '';
    return '<div class="evo-size-preview"><p>' + safe(preview.label) + '</p><div class="evo-size-pair">'
      + [64, 32].map((size) => '<figure><img src="' + safe(preview['src' + size])
        + '" width="' + size + '" height="' + size + '" alt="' + safe(preview.label) + '，' + size
        + '像素"><figcaption>' + size + 'px</figcaption></figure>').join('')
      + '</div></div>';
  }

  function characterImages(character, isFirst) {
    if (character.versions) {
      return '<div class="evo-versions">' + character.versions.map((version) =>
        '<div class="evo-version"><h3>' + safe(version.name) + '</h3><p class="evo-version-note">'
        + safe(version.description) + '</p><div class="evo-version-images">'
        + version.codes.map((code) => assetFigure(character.assets.find((asset) => asset.code === code))).join('')
        + '</div>' + sizePreviewMarkup(version.sizePreview) + '</div>'
      ).join('') + '</div>';
    }
    return '<div class="evo-assets">'
      + character.assets.map((asset, index) => assetFigure(asset, isFirst && index < 4)).join('')
      + '</div>' + sizePreviewMarkup(character.sizePreview);
  }

  function characterMarkup(character, isFirst) {
    return '<section class="evo-character" id="' + safe(character.id) + '" data-searchable>'
      + '<header class="evo-character-head"><span class="evo-character-index">' + safe(character.index) + '</span>'
      + '<div><h2>' + safe(character.name_cn) + '<span lang="en">（' + safe(character.name_en) + '）</span></h2>'
      + '<p>' + safe(character.blurb) + '</p></div></header>'
      + characterImages(character, isFirst) + '</section>';
  }

  function tocMarkup(characters) {
    return '<nav class="evo-toc" aria-label="角色跳转"><strong>角色</strong><div class="evo-toc-list">'
      + characters.map((character) => '<a href="#' + safe(character.id) + '"><span>'
        + safe(character.index) + '</span>' + safe(character.name_cn) + '</a>').join('')
      + '</div></nav>';
  }

  function applicationMarkup(characters) {
    const examples = [
      { family: 'o-partner', name: '车主调研', title: 'OEDRO Driver Research', copy: 'What does a typical drive look like for you?' },
      { family: 'bison', name: '网站答疑', title: 'OEDRO Support', copy: 'What vehicle do you drive? Tell us the year, make and model.' },
      { family: 'dog', name: '邮件结尾', title: 'Your OEDRO team', copy: 'Thanks for sharing your experience. We’re glad to hear from you.' }
    ];
    if (!examples.every((example) => characters.some((character) => character.family === example.family))) return '';
    return '<section class="evo-applications" aria-labelledby="evo-applications-title"><h2 id="evo-applications-title">应用效果</h2>'
      + '<p>对话与邮件示意</p><div class="evo-application-list">'
      + examples.map((example) => {
        const character = characters.find((entry) => entry.family === example.family);
        return '<section class="evo-application"><h3>' + safe(example.name) + '</h3>'
          + '<div class="evo-application-preview"><img src="' + safe(character.assets[0].src)
          + '" width="96" height="96" alt="' + safe(character.name_cn) + '头像" loading="lazy">'
          + '<div lang="en"><strong>' + safe(example.title) + '</strong><p>' + safe(example.copy) + '</p></div></div></section>';
      }).join('') + '</div></section>';
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
      + data.characters.map((character, index) =>
        (index === 0 || character.role !== data.characters[index - 1].role
          ? '<p class="evo-group-label">' + (character.role === 'product' ? '产品伙伴' : '品牌伙伴') + '</p>' : '')
        + characterMarkup(character, index === 0)).join('')
      + applicationMarkup(data.characters)
      + '</div></div>';
  };
})();
