const page = document.body.dataset.page;
const sidebar = document.querySelector('.sidebar');
const overlay = document.querySelector('.mobile-overlay');
const menuButton = document.querySelector('.menu-button');
const compactNavigation = window.matchMedia('(max-width: 980px)');
const workspace = document.querySelector('.workspace');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setSidebar(open, restoreFocus = true) {
  open = open && compactNavigation.matches;
  sidebar?.classList.toggle('open', open);
  if (sidebar) sidebar.inert = compactNavigation.matches && !open;
  if (workspace) workspace.inert = open;
  document.body.classList.toggle('nav-open', open);
  if (overlay) overlay.hidden = !open;
  menuButton?.setAttribute('aria-expanded', String(open));
  if (open) sidebar?.querySelector('.nav-close')?.focus();
  else if (restoreFocus && compactNavigation.matches) menuButton?.focus();
}

function pageHeading(title, description = '') {
  return `<header class="page-heading"><h1>${escapeHtml(title)}</h1>${description ? `<p>${escapeHtml(description)}</p>` : ''}</header>`;
}

function sectionHead(title, action = '') {
  return `<div class="section-head"><h2>${escapeHtml(title)}</h2>${action}</div>`;
}

function topicLink(item) {
  return `<a class="topic-row" href="topic.html?slug=${encodeURIComponent(item.slug)}" data-searchable data-status="${escapeHtml(item.status)}">
    <strong>${escapeHtml(item.title)}</strong>
  </a>`;
}

function renderShell(data) {
  const activePage = page === 'topics' && location.pathname.endsWith('topic.html')
    ? new URLSearchParams(location.search).get('slug')
    : page;
  document.querySelector('#site-title').textContent = '海外用户运营';
  document.querySelector('#site-subtitle').textContent = 'OEDRO 工作台';
  document.querySelector('#nav-list').innerHTML = data.nav.map((item) => `
    <a href="${escapeHtml(item.file)}" data-page="${escapeHtml(item.id)}" ${item.external ? 'aria-label="' + escapeHtml(item.label) + '（离开工作台，进入样站）"' : ''} ${item.id === activePage ? 'aria-current="page"' : ''} class="${item.id === activePage ? 'active' : ''}${item.parent ? ' nav-child' : ''}${item.external ? ' nav-external' : ''}">
      <span>${escapeHtml(item.label)}</span>${item.external ? '<span aria-hidden="true">↗</span>' : ''}
    </a>`).join('');
  const current = data.nav.find((item) => item.id === activePage);
  document.querySelector('#breadcrumb-page').textContent = current?.label || (page === 'home' ? '首页' : page === 'topics' ? '资料索引' : '');
}


function renderResearch(data) {
  const r = data.research;
  document.title = `${r.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = r.meta_description;
  document.querySelector('#content').innerHTML = `
    ${pageHeading(r.title)}
    <section class="section research-entry">
      <a class="research-preview" href="https://oedro-light-research.onrender.com/" target="_blank" rel="noopener" aria-label="预览并打开 AI 调研问卷">
        <img src="assets/light-research/hawthorne-preview.jpg?v=20260914-r2" alt="OEDRO AI 调研问卷演示界面" width="1440" height="900">
      </a>
      <div class="research-launch-copy">
        <p>工作灯调研演示：AI 根据回答继续追问。</p>
        <a class="research-open" href="https://oedro-light-research.onrender.com/" target="_blank" rel="noopener">开始AI调研问卷 ↗</a>
      </div>
    </section>`;
}

function renderFlipbooks(data) {
  const flipbooks = data.flipbooks;
  document.title = `${flipbooks.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = 'OEDRO互动翻页书演示。';
  document.querySelector('#content').innerHTML = `
    ${pageHeading(flipbooks.title)}
    <section class="section flipbook-demo-grid" aria-label="两本翻页书">
      ${flipbooks.entries.map((entry) => `<article class="flipbook-demo-item" data-searchable>
        <h2>${escapeHtml(entry.title)}</h2>
        <a href="${escapeHtml(entry.href)}" aria-label="打开${escapeHtml(entry.title)}">
          <img src="${escapeHtml(entry.image)}" alt="${escapeHtml(entry.image_alt)}" width="${escapeHtml(entry.image_width)}" height="${escapeHtml(entry.image_height)}" loading="eager" decoding="async">
        </a>
      </article>`).join('')}
    </section>`;
}

function voiceThreadContext(item) {
  const url = new URL(item.source_link);
  const reddit = url.pathname.match(/^\/r\/([^/]+)\/comments\/[^/]+\/([^/]+)/);
  const forum = url.pathname.match(/\/threads\/([^/.]+)/);
  const slug = reddit?.[2] || forum?.[1] || '';
  // These headings translate only the public URL slugs, never unverified comment bodies.
  const headings = {
    tonneau_covers: 'Nissan Frontier 货箱盖讨论',
    oedro_running_boards: 'OEDRO 脚踏板讨论',
    please_help_me_pick_some_side_railsstepsrunning: '侧护栏、踏步、脚踏板怎么选？',
    oedro_low_profile_hard_quad_fold_tonneau_cover: 'OEDRO 低平四折硬质货箱盖讨论',
    recommendations_for_a_truck_bed_cover: '想选一款货箱盖，有什么推荐？',
    hard_tonneau_worth_it: '硬质货箱盖值得买吗？',
    'oedro-low-profile-tri-fold-tonneau-cover': 'OEDRO 低平三折货箱盖讨论',
    '4-fold-low-prifile-tonneau-cover-409-79': '低平四折货箱盖讨论'
  };
  const topicLabels = {
    tonneau_cover: '货箱盖', running_boards: '脚踏板', floor_mats: '脚垫', bumper: '保险杠',
    complaint: '产品讨论', recommendation: '选购建议', fitment: '车型适配', installation: '安装',
    warranty: '保修', product_quality: '产品质量', shipping_returns: '配送与退换', support: '售后支持', general: '产品讨论'
  };
  return {
    heading: headings[slug] || topicLabels[item.topic] || '产品讨论',
    community: reddit ? `r/${reddit[1]}` : url.hostname.replace(/^www\./, ''),
    category: topicLabels[item.topic] || '产品讨论'
  };
}

function renderUserVoice(data, voice, radar) {
  const copy = data.user_voice || {};
  const insights = Array.isArray(voice?.actions)
    ? voice.actions.filter((item) => item && ['approved', 'routed', 'closed'].includes(item.status))
    : [];
  const actionLabels = {
    faq: '常见问题', research_question: '研究问题', discord_topic: '社群话题',
    product_feedback: '产品反馈', support_feedback: '支持反馈', content_idea: '内容方向',
    official_site_article_candidate: '官网内容'
  };
  const topicLabels = {
    tonneau_cover: '货箱盖', running_boards: '脚踏板', floor_mats: '脚垫', bumper: '保险杠',
    complaint: '产品问题', recommendation: '选购建议', fitment: '车型适配', installation: '安装', warranty: '保修', product_quality: '产品质量',
    shipping_returns: '配送与退换', support: '售后支持', community: '社区', general: '通用问题'
  };
  const sourceLabels = { reddit: 'Reddit', forum: '车型论坛', youtube: 'YouTube', bluesky: 'Bluesky' };
  const radarItems = Array.isArray(radar?.items) ? radar.items : [];
  const mentions = radar?.mentions?.schema_version === 1 ? radar.mentions : null;
  const mentionKey = (item) => `${item.platform}:${item.object_id}`;
  const forumDomains = ['f150forum.com', 'mavericktruckclub.com', 'tacomaworld.com', 'tundras.com',
    'ramforum.com', 'silveradosierra.com', 'jeepforum.com', 'jlwranglerforums.com', 'jeepgladiatorforum.com', 'coloradofans.com'];

  const awareIsoPattern = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/;
  const blockedPathPattern = /\/(?:user|users|profile|profiles|member|members|account|accounts)(?:\/|$)/i;
  function calendarDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
    return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  function awareNanoseconds(value) {
    if (typeof value !== 'string' || !awareIsoPattern.test(value) || !calendarDate(value.slice(0, 10))
      || /[+-]14:(?!00)/.test(value)) return null;
    const wholeSecond = Date.parse(value.replace(/\.\d+(?=Z|[+-]\d{2}:\d{2}$)/, ''));
    if (!Number.isFinite(wholeSecond)) return null;
    const fraction = /\.(\d+)(?=Z|[+-]\d{2}:\d{2}$)/.exec(value)?.[1] || '';
    return BigInt(wholeSecond) * 1000000n + BigInt(fraction.padEnd(9, '0'));
  }

  function awareTimestamp(value) { return awareNanoseconds(value) !== null; }

  function safeMentionLink(value, platform, objectId) {
    if (typeof value !== 'string' || value.length > 2048 || /[\s\\]/.test(value)) return false;
    let url;
    try { url = new URL(value); } catch { return false; }
    if (url.protocol !== 'https:' || !/^https:\/\/[a-z0-9.-]+\//i.test(value) || url.port || url.hash) return false;
    const host = url.hostname.toLowerCase();
    const onDomain = (domain) => host === domain || host === `www.${domain}`;
    const query = [...url.searchParams.keys()];
    const matchesId = (id) => objectId === undefined || objectId === id;
    if (platform === 'YouTube') {
      const videoPath = /^\/(?:shorts\/|live\/)?([A-Za-z0-9_-]{11})\/?$/.exec(url.pathname);
      if (onDomain('youtu.be') || onDomain('youtube.com') && /^\/(?:shorts|live)\//.test(url.pathname)) {
        return !query.length && !!videoPath && matchesId(videoPath[1]);
      }
      const videoId = url.searchParams.get('v');
      const commentId = url.searchParams.get('lc');
      return onDomain('youtube.com') && url.pathname === '/watch'
        && query.every((key) => ['v', 'lc'].includes(key)) && query.length <= 2
        && /^[A-Za-z0-9_-]{11}$/.test(videoId || '')
        && (!url.searchParams.has('lc') || /^[A-Za-z0-9_.-]{1,200}$/.test(commentId))
        && matchesId(commentId ? `${videoId}:${commentId}` : videoId);
    }
    if (query.length) return false;
    if (platform === 'Reddit') {
      const post = /^\/(?:r\/[^/]+\/)?comments\/([a-z0-9]+)(?:\/([^/]+))?(?:\/([a-z0-9]+))?\/?$/i.exec(url.pathname);
      return (onDomain('reddit.com') || host === 'old.reddit.com') && !!post
        && matchesId(post[3] ? `t1_${post[3]}` : `t3_${post[1]}`);
    }
    if (platform === 'Bluesky') {
      const post = /^\/profile\/([^/]+)\/post\/([A-Za-z0-9]+)\/?$/.exec(url.pathname);
      return host === 'bsky.app' && !!post && matchesId(`${post[1]}/${post[2]}`);
    }
    if (platform === 'X') {
      const post = /^\/(?:[^/]+|i\/web)\/status\/(\d+)\/?$/.exec(url.pathname);
      return (onDomain('x.com') || onDomain('twitter.com')) && !!post && matchesId(post[1]);
    }
    if (platform === 'Trustpilot') {
      const review = /^\/reviews\/([a-f0-9]+)\/?$/i.exec(url.pathname);
      return onDomain('trustpilot.com') && !!review && matchesId(review[1]);
    }
    const forumId = /^\/(?:threads|posts)\/(?:[^/]*[.-])?(\d+)\/?$/i.exec(url.pathname)?.[1]
      || /^\/f\d+\/[^/]+-(\d+)\/?$/i.exec(url.pathname)?.[1];
    return platform === '汽车论坛' && forumDomains.some((domain) => host === domain || host.endsWith(`.${domain}`))
      && !!forumId && !blockedPathPattern.test(url.pathname) && matchesId(`${host.replace(/^www\./, '')}:${forumId}`);
  }

  function publicationBounds(publication) {
    if (publication.precision === 'datetime') {
      const instant = awareNanoseconds(publication.published_at);
      return [instant, instant];
    }
    if (publication.precision !== 'date') return null;
    const [year, month, day] = publication.date.split('-').map(Number);
    const midnight = Date.UTC(year, month - 1, day);
    const zone = publication.source_timezone;
    const offset = typeof zone === 'string' && /^(?:UTC)?([+-])(\d{2}):(\d{2})$/.exec(zone);
    let minutes = null;
    if (zone === 'UTC' || zone === 'Z') minutes = 0;
    else if (offset && Number(offset[2]) <= 14 && Number(offset[3]) < 60
      && (Number(offset[2]) < 14 || Number(offset[3]) === 0)) {
      minutes = (Number(offset[2]) * 60 + Number(offset[3])) * (offset[1] === '+' ? 1 : -1);
    }
    // A source date without a usable offset spans all civil time zones (UTC-12 through UTC+14).
    const bounds = minutes === null ? [midnight - 14 * 3600000, midnight + 36 * 3600000]
      : [midnight - minutes * 60000, midnight + 86400000 - minutes * 60000];
    return [BigInt(bounds[0]) * 1000000n, BigInt(bounds[1]) * 1000000n - 1n];
  }

  function orderMentionIntervals(items) {
    const known = [], unknown = [];
    items.forEach((item, index) => {
      const bounds = publicationBounds(item.publication);
      if (bounds) known.push({ item, index, start: bounds[0], end: bounds[1] });
      else unknown.push(item);
    });
    const ordered = [];
    while (known.length) {
      const latestStart = known.reduce((latest, record) => record.start > latest ? record.start : latest, known[0].start);
      // Only incomparable intervals retain input order; definite chronology always wins.
      const nextIndex = known.findIndex((record) => record.end >= latestStart);
      ordered.push(known.splice(nextIndex, 1)[0].item);
    }
    return ordered.concat(unknown);
  }
  const visibleMentions = (items) => (Array.isArray(items) ? items : []).filter((item) => {
    if (!item || typeof item.summary !== 'string' || !item.summary.trim() || [...item.summary].length > 300
      || typeof item.object_id !== 'string' || !/^[A-Za-z0-9_.:/-]{1,200}$/.test(item.object_id)
      || !safeMentionLink(item.source_link, item.platform, item.object_id) || !item.publication) return false;
    const publication = item.publication;
    return publication.precision === 'datetime' && awareTimestamp(publication.published_at)
        && publication.date === publication.published_at.slice(0, 10)
      || publication.precision === 'date' && calendarDate(publication.date) && publication.published_at === null
      || publication.precision === 'unknown' && publication.date === null && publication.published_at === null;
  });
  const uniqueMentions = (items) => [...new Map(items.map((item) => [mentionKey(item), item])).values()];
  const windowStart = awareNanoseconds(mentions?.batch?.window_start);
  const windowEnd = awareNanoseconds(mentions?.batch?.window_end);
  const currentMentions = orderMentionIntervals(uniqueMentions(visibleMentions(mentions?.batch?.items)).filter((item) => {
    if (windowStart === null || windowEnd === null || windowEnd - windowStart !== 72n * 3600000000000n) return false;
    const bounds = publicationBounds(item.publication);
    return bounds !== null && bounds[0] >= windowStart && bounds[1] < windowEnd;
  }));
  const currentKeys = new Set(currentMentions.map(mentionKey));
  const historyMentions = orderMentionIntervals(uniqueMentions(visibleMentions(mentions?.history)).filter((item) => !currentKeys.has(mentionKey(item))));
  const knownMentions = [...currentMentions, ...historyMentions];
  const legacyItems = radarItems.filter((item) => !knownMentions.some((known) =>
    safeMentionLink(item.source_link, known.platform, known.object_id)));
  const currentEmptyText = !mentions || radar?.method === 'verified_mention_history_migration'
    ? '三天批次尚待首次定时采集。'
    : '最近3天暂无日期和原文均已核实的OEDRO提及。';
  const renderMentions = (items) => `<div class="voice-card-grid">${items.map((item) => `<article class="voice-thread voice-mention" data-searchable>
    <div class="voice-thread-top"><span class="voice-thread-category">${escapeHtml(item.platform)}</span>${item.publication.date ? `<time datetime="${escapeHtml(item.publication.published_at || item.publication.date)}">${escapeHtml(item.publication.date)}</time>` : '<span>日期不明</span>'}</div>
    <p>${escapeHtml(item.summary)}</p>
    <div class="voice-thread-bottom"><a href="${escapeHtml(item.source_link)}" target="_blank" rel="noopener noreferrer">查看原帖 <span aria-hidden="true">↗</span></a></div>
  </article>`).join('')}</div>`;
  document.title = `${copy.title || '问题与反馈'}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = 'OEDRO 货箱盖、脚踏板与车型相关的公开讨论和原帖。';
  document.querySelector('#content').innerHTML = `
    ${pageHeading(copy.title || '问题与反馈')}
    <section class="section voice-discussions" aria-labelledby="recent-mentions-heading">
      <div class="section-head"><h2 id="recent-mentions-heading">最近3天的OEDRO提及</h2></div>
      ${currentMentions.length ? renderMentions(currentMentions) : `<p class="empty-state">${currentEmptyText}</p>`}
    </section>
    <section class="section voice-discussions" aria-labelledby="history-mentions-heading">
      <div class="section-head"><h2 id="history-mentions-heading">历史提及</h2></div>
      ${historyMentions.length ? renderMentions(historyMentions) : '<p class="empty-state">暂无历史提及</p>'}
    </section>
    <section class="voice-discussions" aria-label="公开讨论">
      <div class="section-head"><h2>待核实的历史线索</h2></div>
      <div class="voice-card-grid">
        ${legacyItems.map((item, index) => {
          const thread = voiceThreadContext(item);
          return `<article class="voice-thread" data-searchable>
            <div class="voice-thread-top"><span class="voice-thread-category">${escapeHtml(thread.category)}</span><span class="voice-thread-number" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span></div>
            <h2>${escapeHtml(thread.heading)}</h2>
            <p class="voice-thread-community">${escapeHtml(thread.community)}</p>
            <div class="voice-thread-bottom"><span>${escapeHtml(sourceLabels[item.source_family] || item.source_family)}</span><a href="${escapeHtml(item.source_link)}" target="_blank" rel="noopener noreferrer" aria-label="查看原帖：${escapeHtml(thread.heading)}">查看原帖 <span aria-hidden="true">↗</span></a></div>
          </article>`;
        }).join('')}
      </div>
      ${legacyItems.length ? '' : '<p class="empty-state">暂无公开问题记录</p>'}
    </section>
    ${insights.length ? `<section class="section user-voice-surface">
      <div class="section-head"><h2>已确认的洞察与行动</h2></div>
      <div class="voice-insights">
        ${insights.map((item) => `<article class="voice-insight" data-searchable>
          <h3>${escapeHtml(topicLabels[item.public_topic] || item.public_topic)} · ${escapeHtml(actionLabels[item.action_type] || item.action_type)}</h3>
          <p class="voice-evidence">${Number(item.source_count) || 0} 个公开来源 · ${Number(item.independent_voice_count) || 0} 个独立声音</p>
        </article>`).join('')}
      </div>
    </section>` : ''}`;
}

function renderTopics(data, topics) {
  document.title = `${topics.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = 'OEDRO海外用户运营专题与当前状态。';
  document.querySelector('#content').innerHTML = `
    ${pageHeading(topics.title)}
    <section class="section topic-index-surface">
      <div class="table-toolbar"><span class="count-note" id="topic-count"></span></div>
      <div class="topic-list" id="topic-list">${topics.items.map(topicLink).join('')}</div>
    </section>`;
  document.querySelector('#topic-filter')?.addEventListener('change', runFilters);
  runFilters();
}

const topicTitleMap = {
  当前判断: '品牌表达', 'OEDRO怎么说': '表达原则', 不同渠道怎么变: '各渠道的语气',
  明确不采用: '禁用表达', 当前验证状态: '验证状态'
};

function cleanTopicTitle(title) {
  return topicTitleMap[title] || title;
}

function topicSectionMarkup(section, index) {
  const title = cleanTopicTitle(section.title);
  const paragraphs = (section.paragraphs || []).map((item) => `<p>${escapeHtml(item)}</p>`).join('');
  const items = section.items?.length ? `<ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '';
  const rows = section.rows?.length ? `<div class="topic-steps">${section.rows.map((item) => `<div><strong>${escapeHtml(item.label)}</strong><p>${escapeHtml(item.text)}</p></div>`).join('')}</div>` : '';
  return `<section class="topic-content-section" id="topic-section-${index}" data-searchable><h2>${escapeHtml(title)}</h2>${paragraphs}${items}${rows}</section>`;
}

function renderDiscord(topic, data) {
  document.title = `${topic.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = topic.description;
  document.querySelector('#content').innerHTML = `
    ${pageHeading(topic.title)}
    <nav class="discord-server-nav" aria-label="服务器">
      ${topic.servers.map(server => `<a href="#${escapeHtml(server.id)}">${escapeHtml(server.name)}</a>`).join('')}
    </nav>
    ${topic.servers.map(server => `
      <section class="discord-server section" id="${escapeHtml(server.id)}">
        <header class="discord-server-heading"><h2>${escapeHtml(server.name)}</h2>${server.members ? `<span>${escapeHtml(server.members)}</span>` : ''}</header>
        <div class="discord-layout">
          <section class="discord-channel-map" aria-label="${escapeHtml(server.name)} 频道结构">
            <h3>频道结构</h3>
            <div class="discord-groups">${server.groups.map(group => `
              <section class="discord-group"><h4>${escapeHtml(group.name)}</h4>
                <ul>${group.channels.map(channel => `<li><span aria-hidden="true">#</span> ${escapeHtml(channel)}</li>`).join('')}</ul>
              </section>`).join('')}</div>
          </section>
          ${server.bots.length || server.settings.length ? `<section class="discord-configuration"><h3>设置与机器人</h3>
            <dl>${server.bots.map(bot => `<div><dt>${escapeHtml(bot.name)}</dt><dd>${escapeHtml(bot.purpose)}</dd></div>`).join('')}${server.settings.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>
          </section>` : ''}
        </div>
      </section>`).join('')}`;
}

function visibleTopicSections(topic) {
  if (!topic.sections?.length) return [];
  const ids = {
    'brand-voice-system': ['current', 'brand-name', 'everyday-example', 'discord-example', 'fitment-example', 'support-example', 'research-example', 'ugc-example', 'principles', 'channels', 'donts'],
    'seo-geo': ['current', 'milestones', 'baseline', 'next']
  }[topic.slug];
  return ids ? topic.sections.filter((section) => ids.includes(section.id)) : topic.sections;
}

function renderRelatedPages(pages = []) {
  if (!pages.length) return '';
  return `<section class="topic-content-section topic-related" id="topic-related" data-searchable>
    <h2>相关页面</h2>
    <div class="related-page-list">${pages.map((item) => `<a href="${escapeHtml(item.href)}"><strong>${escapeHtml(item.label)}</strong><span aria-hidden="true">→</span></a>`).join('')}</div>
  </section>`;
}

async function renderTopic(data) {
  const slug = new URLSearchParams(window.location.search).get('slug') || 'discord-community';
  const response = await fetch(`data/topics/${encodeURIComponent(slug)}.json`, { cache: 'no-store' });
  if (!response.ok) throw new Error('专题加载失败');
  const topic = await response.json();
  document.querySelector('#content').dataset.topic = slug;
  if (slug === 'discord-community') return renderDiscord(topic, data);
  const sections = visibleTopicSections(topic);
  document.title = `${topic.title}｜${data.site.title}`;
  document.querySelector('meta[name="description"]').content = topic.description;
  document.querySelector('#content').innerHTML = `
    ${pageHeading(topic.title)}
    <div class="topic-layout">
      <article class="topic-body">${sections.map(topicSectionMarkup).join('')}
        ${renderRelatedPages(topic.related_pages)}
      </article>
    </div>`;
}

function runFilters() {
  const statusFilter = document.querySelector('#status-filter')?.value || '全部';
  const topicFilter = document.querySelector('#topic-filter')?.value || '全部';
  const items = [...document.querySelectorAll('[data-searchable]')];
  items.forEach((item) => {
    const projectStatusMatch = !item.matches('#project-rows tr') || statusFilter === '全部' || item.dataset.status === statusFilter;
    const topicStatusMatch = !item.matches('#topic-list [data-status]') || topicFilter === '全部' || item.dataset.status === topicFilter;
    item.hidden = !(projectStatusMatch && topicStatusMatch);
  });
  const rows = [...document.querySelectorAll('#project-rows tr')];
  const count = document.querySelector('#project-count');
  if (count) count.textContent = `共 ${rows.filter((row) => !row.hidden).length} 个项目`;
  const empty = document.querySelector('#project-empty');
  if (empty) empty.hidden = rows.some((row) => !row.hidden);
  const topicRows = [...document.querySelectorAll('#topic-list [data-status]')];
  const topicCount = document.querySelector('#topic-count');
  if (topicCount) topicCount.textContent = `共 ${topicRows.filter((row) => !row.hidden).length} 个专题`;
}

if (sidebar) {
  sidebar.id = 'workspace-navigation';
  sidebar.insertAdjacentHTML('afterbegin', '<button class="nav-close" type="button" aria-label="关闭导航">×</button>');
  sidebar.querySelector('.nav-close').addEventListener('click', () => setSidebar(false));
}
menuButton?.setAttribute('aria-controls', 'workspace-navigation');
setSidebar(false, false);
compactNavigation.addEventListener('change', () => setSidebar(false, false));
menuButton?.addEventListener('click', () => setSidebar(!sidebar?.classList.contains('open')));
overlay?.addEventListener('click', () => setSidebar(false));
document.addEventListener('keydown', (event) => {
  if (!sidebar?.classList.contains('open')) return;
  if (event.key === 'Escape') { event.preventDefault(); setSidebar(false); }
  if (event.key === 'Tab') {
    const items = [...sidebar.querySelectorAll('a[href],button')];
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

// Keep the mascot page independent from unrelated page data.
window.fetchHubJSON = async function fetchHubJSON(url, { retry = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: retry ? 'reload' : 'default' });
    if (!response.ok) throw new Error('页面数据加载失败');
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
};

async function initMascotNavigation(retry = false) {
  const navigation = document.querySelector('#nav-list');
  navigation.setAttribute('aria-busy', 'true');
  navigation.innerHTML = '<p role="status">正在加载导航…</p><a href="index.html">返回首页</a>';
  try {
    renderShell(await window.fetchHubJSON('data/content.json', { retry }));
  } catch (error) {
    navigation.innerHTML = '<p role="alert">导航加载超时或连接失败</p><a href="mascot.html" id="retry-navigation">重试导航</a><a href="index.html">返回首页</a>';
    navigation.querySelector('#retry-navigation').addEventListener('click', (event) => {
      event.preventDefault();
      initMascotNavigation(true);
    });
    console.error(error);
  } finally {
    navigation.setAttribute('aria-busy', 'false');
  }
}

async function init() {
  if (location.pathname.endsWith('topic.html') && new URLSearchParams(location.search).get('slug') === 'external-signals-to-relationships') {
    location.replace('user-voice.html#feedback-method');
    return;
  }
  const [dataResponse, topicsResponse, voiceResponse, radarResponse] = await Promise.all([
    fetch('data/content.json', { cache: 'no-store' }),
    fetch('data/topics.json', { cache: 'no-store' }),
    page === 'voice' ? fetch('data/user-voice.json', { cache: 'no-store' }) : Promise.resolve(null),
    page === 'voice' ? fetch('data/demand-radar.json', { cache: 'no-store' }) : Promise.resolve(null)
  ]);
  if (!dataResponse.ok || !topicsResponse.ok || (page === 'voice' && (!voiceResponse?.ok || !radarResponse?.ok))) throw new Error('页面数据加载失败');
  const [data, topics, voice, radar] = await Promise.all([
    dataResponse.json(),
    topicsResponse.json(),
    voiceResponse ? voiceResponse.json() : Promise.resolve(null),
    radarResponse ? radarResponse.json() : Promise.resolve(null)
  ]);
  renderShell(data);
  if (page === 'research') renderResearch(data);
  if (page === 'flipbooks') renderFlipbooks(data);
  if (page === 'voice') {
    renderUserVoice(data, voice, radar);
    if (location.hash === '#feedback-method') document.querySelector('.voice-discussions')?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  if (page === 'topics' && location.pathname.endsWith('topics.html')) renderTopics(data, topics);
  if (page === 'topics' && location.pathname.endsWith('topic.html')) await renderTopic(data);
  if (page === 'studio' && location.pathname.endsWith('content-pipeline-test.html')) await window.initContentPipelineTests?.();
  if (page === 'studio' && !location.pathname.endsWith('content-pipeline-test.html')) await window.initContentStudio?.();
  if (page === 'email-templates') await window.initEmailTemplates?.();
  if (page === 'newsletter') await window.initNewsletter?.();
  if (page === 'products') await window.initProducts?.();
}

const mainContent = document.querySelector('#content');
const staticContentPage = ['home', 'customer-analytics', 'mascot-workflow', 'social-brand', 'merch-plan', 'first-outreach', 'discord-invite-plan', 'ugc-activity', 'sema-plan'].includes(page);
if (page === 'mascot') {
  if (!document.querySelector('#nav-list').querySelector('a')) initMascotNavigation();
} else {
  mainContent.setAttribute('tabindex', '-1');
  mainContent.setAttribute('aria-busy', 'true');
  if (!staticContentPage) mainContent.innerHTML = '<p class="loading-state" role="status">正在加载…</p>';
  init().catch((error) => {
    if (staticContentPage) {
      const navigation = document.querySelector('#nav-list');
      if (navigation && !navigation.querySelector('a')) {
        navigation.innerHTML = '<p role="alert">导航暂时无法加载</p><a href="">重新加载</a><a href="index.html">返回首页</a>';
      }
      console.error(error);
      return;
    }
    mainContent.innerHTML = '<div class="load-error" role="alert"><h1>页面暂时无法加载</h1><p>检查连接后重试，或返回首页。</p><button type="button" id="reload-page">重试</button><a href="index.html">返回首页</a></div>';
    document.querySelector('#reload-page').addEventListener('click', () => location.reload());
    console.error(error);
  }).finally(() => mainContent.setAttribute('aria-busy', 'false'));

}
