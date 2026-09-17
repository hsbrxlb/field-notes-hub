(() => {
  'use strict';
  const view = document.querySelector('#analytics-view');
  const date = document.querySelector('#analytics-date');
  const denominator = document.querySelector('#scope-denominator');
  const switches = [...document.querySelectorAll('[data-scope]')];
  const number = new Intl.NumberFormat('en-US');
  const colors = ['#e3ba67', '#c49a54', '#a77f46', '#826b47', '#646857'];
  let dataset;
  let scope = 'snapshot';
  const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fmt = value => number.format(value);
  const percent = (count, total) => total ? count / total * 100 : 0;
  const pct = (count, total) => count > 0 && percent(count,total) < .1 ? '<0.1%' : `${percent(count, total).toFixed(1)}%`;
  function rowsFor(data, key) {
    if (Array.isArray(data[key])) return data[key];
    const dimension = (data.dimensions || []).find(item => item.key === key);
    return dimension ? (dimension.buckets || []) : [];
  }
  function validatedRows(data, key) {
    const rows = rowsFor(data, key);
    if (!rows.length || rows.some(row => !Number.isSafeInteger(row.count) || row.count < 0 || !row.label) || rows.reduce((sum, row) => sum + row.count, 0) !== data.total) throw new Error('统计分组与总人数不一致');
    return rows;
  }
  function heading(index, title, total) {
    return `<div class="section-heading"><h2><span class="section-number">${index}</span>${title}</h2></div>`;
  }
  function distribution(rows, total, id, extra = '') {
    return `<div class="chart-axis ${extra ? 'amount-axis' : ''}" aria-hidden="true"><span>0</span><span>25</span><span>50</span><span>75</span><span>100%</span></div><div class="distribution ${extra}" style="--bucket-count:${rows.length}">${rows.map((row, i) => `<button type="button" class="distribution-row" aria-pressed="false" data-detail="${id}" data-index="${i}" data-count="${row.count}" data-label="${esc(row.label)}" data-message="${esc(row.label)}：${fmt(row.count)} 人，占当前范围 ${pct(row.count,total)}。"><span class="row-label">${id === 'frequency-detail' ? `<i class="legend-dot" style="background:${colors[i % colors.length]}" aria-hidden="true"></i>` : ''}${esc(row.label)}</span><span class="bar-track" aria-hidden="true"><span class="bar-fill" style="--bar-height:${percent(row.count,total)}%;width:${percent(row.count,total)}%;opacity:${1-i*.085}"></span></span><span class="row-value">${fmt(row.count)} 人<span>${pct(row.count,total)}</span></span></button>`).join('')}</div><p class="selection-detail" id="${id}" role="status" hidden></p>`;
  }
  function segmentLegend(rows, total, id) {
    return `<div class="segment-legend">${rows.map((row,i) => `<button type="button" aria-pressed="false" class="segment-item" data-detail="${id}" data-message="${esc(row.label)}：${fmt(row.count)} 人，占当前范围 ${pct(row.count,total)}。"><span><i class="legend-dot" style="background:${colors[i]}" aria-hidden="true"></i>${esc(row.label)}</span><strong>${fmt(row.count)} <small>人</small></strong><span>${pct(row.count,total)}</span></button>`).join('')}</div><p class="selection-detail" id="${id}" role="status" hidden></p>`;
  }
  function segmentChart(rows, total, id) {
    return `<div class="segment-band source-band" aria-hidden="true">${rows.map((row,i) => `<span style="width:${percent(row.count,total)}%;background:${colors[i]}"></span>`).join('')}</div>${segmentLegend(rows,total,id)}`;
  }
  function ring(rows, total) {
    let offset = 0;
    const segments = rows.map((row, i) => {
      const length = percent(row.count,total);
      const circle = `<circle cx="170" cy="170" r="133" pathLength="100" fill="none" stroke="${colors[i % colors.length]}" stroke-width="26" data-ring-index="${i}" stroke-dasharray="${length} ${100-length}" stroke-dashoffset="${-offset}" transform="rotate(-90 170 170)"/>`;
      offset += length;
      return circle;
    }).join('');
    return `<figure class="ring-figure"><svg viewBox="0 0 340 340" role="img" aria-label="购买次数分布：${rows.map(row => `${esc(row.label)} ${fmt(row.count)} 人`).join('，')}"><circle cx="170" cy="170" r="158" fill="none" stroke="var(--border)" stroke-width="1"/><circle cx="170" cy="170" r="111" fill="none" stroke="var(--border)" stroke-width="1"/>${segments}</svg><figcaption class="ring-center"><span>${scope === 'snapshot' ? '全体客户' : '首批触达'} · 人</span><strong>${fmt(total)}</strong><small>按历史购买次数分组</small></figcaption></figure>`;
  }
  function render() {
    switches.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.scope === scope)));
    if (!dataset) return;
    const data = dataset[scope];
    date.textContent = scope === 'snapshot' ? `商城客户快照${data.as_of ? ' · ' + data.as_of : ''}，订单与金额为历史累计。` : '首批触达名单 · 近期访问与高消费客户合并去重，非随机抽样。';
    denominator.textContent = '';
    if (scope === 'snapshot' && !['ready', 'verified_counts'].includes(data.status)) {
      view.innerHTML = '<p class="load-message" role="status">全体客户统计尚未加载，可切换查看首批触达名单。</p><button type="button" class="retry-button" data-retry>重新加载</button>';
      return;
    }
    try {
      if (!Number.isSafeInteger(data.total) || data.total <= 0) throw new Error('总人数无效');
      const frequency = validatedRows(data, 'purchase_frequency');
      const amount = validatedRows(data, 'historical_amount');
      const subscription = validatedRows(data, 'subscription');
      const zero = frequency.find(row => row.key === '0');
      const one = frequency.find(row => row.key === '1');
      const subscribed = subscription.find(row => row.key === 'subscribed');
      if (!zero || !one || !subscribed) throw new Error('缺少必要的客户分组');
      const buyers = data.total - zero.count;
      const repeat = buyers - one.count;
      denominator.textContent = `${fmt(data.total)} 人`;
      const metrics = [['有历史订单',buyers],['多次下单',repeat],['已订阅',subscribed.count]];
      view.innerHTML = `<section class="analytics-overview" aria-label="客户基础结构">${ring(frequency,data.total)}<div><dl class="metric-list">${metrics.map(([label,count]) => `<div><dt>${label}</dt><dd><strong>${pct(count,data.total)}</strong><span>${fmt(count)} 人</span></dd></div>`).join('')}</dl><p class="analytics-note">${scope === 'outreach' ? '此名单经过近期访问与高消费筛选，结构不能代表全体客户。' : '每位客户计入一个购买次数分组；多次下单指历史累计 2 单及以上。'}</p></div></section>
      <section class="analytics-section">${heading('01','购买次数',data.total)}${distribution(frequency,data.total,'frequency-detail')}</section>
      <section class="analytics-section">${heading('02','历史累计订单金额',data.total)}${distribution(amount,data.total,'amount-detail','amount-chart')}</section>
      <section class="analytics-section subscription-chart">${heading('03','邮件订阅状态',data.total)}<div class="segment-band" aria-hidden="true">${subscription.map((row,i) => `<span style="width:${percent(row.count,data.total)}%;background:${colors[i]}"></span>`).join('')}</div>${segmentLegend(subscription,data.total,'subscription-detail')}<p class="analytics-note">订阅状态不等于当前可发送，发送前仍需核对退订与抑制名单。</p></section>
      ${scope === 'outreach' ? outreachExtra(data) : ''}
      <footer class="analytics-footnote">订单与金额为历史累计，未核实退款及取消订单扣除。全体统计来自当天分次筛选，少量新增客户可能造成细微差异。</footer>`;
    } catch (error) {
      view.innerHTML = '<p class="load-message" role="alert">数据未通过完整性核对，暂不展示图表。</p><button type="button" class="retry-button" data-retry>重新加载</button>';
    }
  }
  function outreachExtra(data) {
    const sources = validatedRows(data, 'source_membership');
    if (!Array.isArray(data.subscription_purchase) || data.subscription_purchase.some(row => !Number.isSafeInteger(row.buyers) || !Number.isSafeInteger(row.non_buyers) || row.buyers < 0 || row.non_buyers < 0) || data.subscription_purchase.reduce((sum,row) => sum + row.buyers + row.non_buyers,0) !== data.total) throw new Error('交叉统计未通过核对');
    return `<section class="analytics-section">${heading('04','订阅状态 × 是否下单',data.total)}<div class="matrix-head"><span>订阅状态</span><span>有历史订单</span><span>未下单</span></div>${data.subscription_purchase.map(row => `<div class="matrix-row"><span>${esc(row.label)}</span>${[['buyers','有历史订单'],['non_buyers','未下单']].map(([key,label]) => `<button type="button" class="matrix-cell" aria-pressed="false" data-detail="matrix-detail" data-message="${esc(row.label)}、${label}：${fmt(row[key])} 人，占当前范围 ${pct(row[key],data.total)}。"><strong>${fmt(row[key])}</strong><small>${pct(row[key],data.total)}</small></button>`).join('')}</div>`).join('')}<p id="matrix-detail" class="selection-detail" role="status" hidden></p></section><section class="analytics-section">${heading('05','名单来源与重叠',data.total)}${segmentChart(sources,data.total,'source-detail')}<a class="analytics-link" href="first-outreach-users.html">查看首批触达名单 ↗</a></section>`;
  }
  async function load() {
    view.setAttribute('aria-busy','true');
    view.innerHTML = '<p class="load-message" role="status">正在加载数据…</p>';
    try {
      const response = await fetch('data/customer-analytics.json', {cache:'no-cache'});
      if (!response.ok) throw new Error('数据请求失败');
      dataset = await response.json();
      if (!dataset.snapshot || !dataset.outreach) throw new Error('数据范围缺失');
      render();
    } catch (error) {
      dataset = null;
      date.textContent = '客户统计暂时无法读取。';
      denominator.textContent = '';
      view.innerHTML = '<p class="load-message" role="alert">加载失败，请检查网络后重试。</p><button type="button" class="retry-button" data-retry>重新加载</button>';
    } finally { view.setAttribute('aria-busy','false'); }
  }
  switches.forEach(button => button.addEventListener('click', () => { scope = button.dataset.scope; render(); }));
  view.addEventListener('click', event => {
    if (event.target.closest('[data-retry]')) { load(); return; }
    const button = event.target.closest('[data-detail]');
    if (!button) return;
    const id = button.dataset.detail;
    view.querySelectorAll(`[data-detail="${id}"]`).forEach(item => item.setAttribute('aria-pressed',String(item === button)));
    const detail = document.getElementById(id);
    detail.hidden = false;
    detail.textContent = button.dataset.message;
    if (id === 'frequency-detail') {
      view.querySelectorAll('[data-ring-index]').forEach(segment => { segment.style.opacity = segment.dataset.ringIndex === button.dataset.index ? '1' : '.18'; });
      view.querySelector('.ring-center strong').textContent = fmt(Number(button.dataset.count));
      view.querySelector('.ring-center span').textContent = button.dataset.label + ' · 人';
      view.querySelector('.ring-center small').textContent = '占当前范围 ' + pct(Number(button.dataset.count), dataset[scope].total);
    }
  });
  load();
})();
