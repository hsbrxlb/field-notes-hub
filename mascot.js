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
      + '" width="' + (asset.width || 1254) + '" height="' + (asset.height || 1254) + '" loading="' + (eager ? 'eager' : 'lazy') + '" decoding="async"></a>'
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
      + '<a class="evo-section-link" href="#applications">应用示意</a><a class="evo-section-link" href="#character-voice">角色表达</a><a class="evo-section-link" href="#digital-assets">数字素材</a></div></nav>';
  }

  function sceneApplicationsMarkup(assets) {
    return '<section class="evo-scene-applications" aria-labelledby="evo-scenes-title"><h3 id="evo-scenes-title">社媒与周边</h3>'
      + '<div class="evo-assets">' + assets.map((asset) => assetFigure(asset)).join('') + '</div></section>';
  }

  function applicationMarkup(kit) {
    const avatar = kit.assets.find((asset) => asset.id === 'avatar-128-png');
    const poses = ['pose-welcome-768-webp', 'pose-explain-768-webp'].map((id) => kit.assets.find((asset) => asset.id === id));
    return '<section class="evo-applications" id="applications" aria-labelledby="evo-applications-title"><h2 id="evo-applications-title">应用示意</h2>'
      + '<p>同一位车库搭档，出现在问卷、社群、购物答疑和阅读内容里。</p>'
      + '<div class="kit-poses">' + poses.map((asset, index) => '<figure><a href="' + safe(asset.src) + '"><img src="' + safe(asset.src)
        + '" alt="' + safe(asset.alt) + '" width="' + asset.width + '" height="' + asset.height + '" loading="lazy"></a><figcaption>'
        + (index === 0 ? '挥手欢迎' : '帮你看细节') + '</figcaption></figure>').join('') + '</div>'
      + '<div class="evo-application-list">' + kit.examples.map((example) =>
        '<section class="evo-application"><h3>' + safe(example.channel) + '</h3><div class="evo-application-preview">'
        + '<img src="' + safe(avatar.src) + '" width="64" height="64" alt="公牛角色头像" loading="lazy">'
        + '<div lang="en"><strong>' + safe(example.speaker) + '</strong><p>' + safe(example.copy) + '</p></div></div>'
        + '<p class="kit-purpose">' + safe(example.purpose) + '</p></section>').join('')
      + '</div></section>';
  }

  function voiceMarkup() {
    return '<section class="kit-section" id="character-voice"><h2>角色表达</h2>'
      + '<p>布诺（Bruno）是工作名。这个成年公牛像一位有本事、愿意搭把手的车库伙伴：直接、实用，也有一点轻松的幽默。</p>'
      + '<p>每次给一个有用细节，或问一个容易回答的具体问题。开心时轻快，用户遇到故障或安全问题时认真，不把句句卖萌当作性格。</p>'
      + '<p>AI对话清楚标明AI身份；品牌帖保留真实发件团队。角色不伪装车主，不编造购买、安装或驾驶经历。车型适配、商品性能和安全回答都以准确资料为准。</p></section>';
  }

  function downloadsMarkup(kit) {
    const links = [['avatar-256-png', '256px头像 PNG'], ['pose-welcome-512-png', '欢迎图 透明PNG'], ['pose-explain-512-png', '答疑图 透明PNG'],
      ['pose-welcome-512-webp', '欢迎图 WebP'], ['pose-explain-512-webp', '答疑图 WebP'], ['social-companion-jpeg', '搭档图 JPEG']];
    return '<section class="kit-section" id="digital-assets"><h2>数字素材</h2>'
      + '<p>小组件用头部头像；完整姿势至少128px高，四周留16px。圆形头像会裁去少量角尖，完整角形用方形。</p>'
      + '<div class="kit-downloads">' + links.map(([id, label]) => {
        const asset = kit.assets.find((entry) => entry.id === id);
        return '<a href="' + safe(asset.src) + '" download>' + label + '</a>';
      }).join('') + '<a href="' + safe(kit.download) + '" download>下载头像与网页素材包</a><a href="' + safe(kit.usage) + '">使用要点</a></div>'
      + '<p>制造需要另做准确字标、刀线、色样或模型。数字图像不代表已生产实物，也不证明正式命名、商标注册或排他版权。</p>'
      + '<p><a href="merch-plan.html#bull-merch">看帽章与贴纸应用</a></p></section>';
  }

  window.initMascot = async function initMascot() {
    const [response, kitResponse] = await Promise.all([
      fetch('data/mascot.json', { cache: 'no-store' }), fetch('data/mascot-kit.json', { cache: 'no-store' })
    ]);
    if (!response.ok || !kitResponse.ok) throw new Error('吉祥物档案加载失败');
    const [data, kit] = await Promise.all([response.json(), kitResponse.json()]);
    document.title = data.title + '｜OEDRO海外用户运营';
    document.querySelector('meta[name="description"]').content = data.meta_description;
    document.querySelector('#content').innerHTML = '<header class="page-heading evo-heading"><h1>吉祥物迭代</h1></header>'
      + '<div class="evo-layout">' + tocMarkup(data.characters)
      + '<div class="evo-character-list">'
      + data.characters.map((character, index) =>
        (index === 0 || character.role !== data.characters[index - 1].role
          ? '<p class="evo-group-label">' + (character.role === 'product' ? '产品伙伴' : '品牌伙伴') + '</p>' : '')
        + characterMarkup(character, index === 0)
        + (index === 0 ? sceneApplicationsMarkup(data.applications) : '')).join('')
      + applicationMarkup(kit) + voiceMarkup() + downloadsMarkup(kit)
      + '</div></div>';
    const target = document.getElementById(location.hash.slice(1));
    if (target && document.querySelector('#content').contains(target)) requestAnimationFrame(() => target.scrollIntoView({ behavior: 'instant', block: 'start' }));
  };
})();
