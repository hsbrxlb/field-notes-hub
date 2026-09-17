(() => {
  'use strict';
  const view = document.querySelector('#analytics-view');
  const denominator = document.querySelector('#scope-denominator');
  const switches = [...document.querySelectorAll('[data-scope]')];
  const number = new Intl.NumberFormat('en-US');
  const colors = ['#78b7ff', '#68d5bf', '#f3ba89', '#bf9bfa', '#f18e9b', '#bdd57b', '#94a4bd'];
  let dataset;
  let scope = 'snapshot';
  const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const fmt = value => number.format(value);
  const percent = (count, total) => total ? count / total * 100 : 0;
  const pct = (count, total) => count > 0 && percent(count,total) < .1 ? '&lt;0.1%' : `${percent(count,total).toFixed(1)}%`;
  const value = (count,total) => `<span class="chart-value"><strong>${fmt(count)} <small>人</small></strong><span>${pct(count,total)}</span></span>`;
  const swatch = color => `<i class="legend-dot" style="background:${color}" aria-hidden="true"></i>`;
  function rowsFor(data,key) {
    if (Array.isArray(data[key])) return data[key];
    const dimension = (data.dimensions || []).find(item => item.key === key);
    return dimension ? (dimension.buckets || []) : [];
  }
  function validatedRows(data,key) {
    const rows = rowsFor(data,key);
    if (!rows.length || rows.some(row => !Number.isSafeInteger(row.count) || row.count < 0 || !row.label) || rows.reduce((sum,row) => sum + row.count,0) !== data.total) throw new Error('统计分组与总人数不一致');
    return rows;
  }
  const heading = (index,title) => `<div class="section-heading"><h2><span class="section-number">${index}</span>${title}</h2></div>`;
  function ring(rows,total) {
    let offset = 0;
    const segments = rows.map((row,i) => {
      const length = percent(row.count,total);
      const circle = `<circle cx="170" cy="170" r="132" pathLength="100" fill="none" stroke="${colors[i]}" stroke-width="28" data-ring-index="${i}" stroke-dasharray="${length} ${100-length}" stroke-dashoffset="${-offset}" transform="rotate(-90 170 170)"/>`;
      offset += length;
      return circle;
    }).join('');
    return `<div class="ring-composition"><figure class="ring-figure"><svg viewBox="0 0 340 340" role="img" aria-label="购买次数分布"><circle cx="170" cy="170" r="157" fill="none" stroke="var(--border)"/>${segments}</svg><figcaption class="ring-center" aria-live="polite"><span>${scope === 'snapshot' ? '全体客户' : '首批触达'} · 人</span><strong>${fmt(total)}</strong><small>历史购买次数</small></figcaption></figure><div class="ring-legend" role="group" aria-label="高亮购买次数分组">${rows.map((row,i) => `<button type="button" data-ring-select="${i}" aria-pressed="false"><span>${swatch(colors[i])}${esc(row.label)}</span>${value(row.count,total)}</button>`).join('')}</div></div>`;
  }
  function linearGroup(rows,total,title,startIndex) {
    const maximum = Math.max(...rows.map(row => row.count),1);
    const magnitude = 10 ** Math.floor(Math.log10(maximum));
    const ceiling = Math.ceil(maximum / magnitude) * magnitude;
    return `<div class="frequency-group"><h3>${title}</h3><div class="linear-axis chart-axis" aria-hidden="true"><span>0</span><span>${fmt(ceiling/2)}</span><span>${fmt(ceiling)} 人</span></div>${rows.map((row,i) => `<div class="plot-row"><span class="row-label">${swatch(colors[startIndex+i])}${esc(row.label)}</span><span class="linear-track" aria-hidden="true" style="--position:${row.count/ceiling*100}%;--plot-color:${colors[startIndex+i]}"><span class="linear-stem"></span><span class="plot-dot"></span></span>${value(row.count,total)}</div>`).join('')}</div>`;
  }
  function frequencyPlot(rows,total) {
    return `<div class="frequency-groups">${linearGroup(rows.filter(row => ['0','1'].includes(row.key)),total,'未下单与单次下单',0)}${linearGroup(rows.filter(row => !['0','1'].includes(row.key)),total,'多次下单 · 2 单及以上',2)}</div>`;
  }
  function amountPlot(rows,total) {
    const ticks = ['1','10','100','1千','1万','10万','100万'];
    return `<p class="axis-caption">人数 · 对数刻度，1 起每格 ×10</p><div class="log-axis chart-axis" aria-hidden="true"><span class="zero-label">0</span><div>${ticks.map((tick,i) => `<span style="left:${i/6*100}%">${tick}</span>`).join('')}</div></div><div class="amount-plot">${rows.map((row,i) => {
      const position = row.count === 0 ? 0 : 8 + Math.log10(row.count)/6*92;
      return `<div class="plot-row"><span class="row-label">${esc(row.label)}</span><span class="log-track" aria-hidden="true" style="--position:${position}%;--plot-color:${colors[i]}"><span class="zero-tick"></span><span class="log-grid"></span><span class="plot-dot"></span></span>${value(row.count,total)}</div>`;
    }).join('')}</div>`;
  }
  function arcChart(rows,total,label) {
    const arcs = rows.map((row,i) => {
      const r = 116-i*31;
      const fraction = row.count/total;
      const theta = (fraction*300-240)*Math.PI/180;
      const x = 145+r*Math.cos(theta), y = 145+r*Math.sin(theta);
      return `<circle cx="145" cy="145" r="${r}" pathLength="100" fill="none" stroke="var(--chart-track)" stroke-width="13" stroke-dasharray="83.333333 16.666667" transform="rotate(-240 145 145)"/><circle cx="145" cy="145" r="${r}" pathLength="100" fill="none" stroke="${colors[i]}" stroke-width="13" stroke-dasharray="${fraction*100*5/6} ${100-fraction*100*5/6}" transform="rotate(-240 145 145)"/><circle cx="${x}" cy="${y}" r="6" fill="${colors[i]}"/>`;
    }).join('');
    return `<div class="arc-composition"><svg class="arc-figure" viewBox="0 0 290 290" role="img" aria-label="${label}，各轨道从零到当前范围总人数">${arcs}</svg><div class="arc-legend">${rows.map((row,i) => `<div><span class="row-label">${swatch(colors[i])}${esc(row.label)}</span>${value(row.count,total)}</div>`).join('')}</div></div>`;
  }
  function outreachExtra(data) {
    const sources = validatedRows(data,'source_membership');
    if (!Array.isArray(data.subscription_purchase) || data.subscription_purchase.some(row => !Number.isSafeInteger(row.buyers) || !Number.isSafeInteger(row.non_buyers) || row.buyers < 0 || row.non_buyers < 0) || data.subscription_purchase.reduce((sum,row) => sum+row.buyers+row.non_buyers,0) !== data.total) throw new Error('交叉统计未通过核对');
    return `<section class="analytics-section">${heading('04','订阅状态 × 是否下单')}<div class="matrix-head"><span>订阅状态</span><span>有历史订单</span><span>未下单</span></div>${data.subscription_purchase.map((row,i) => `<div class="matrix-row"><span>${swatch(colors[i])}${esc(row.label)}</span><div class="matrix-cell">${value(row.buyers,data.total)}</div><div class="matrix-cell">${value(row.non_buyers,data.total)}</div></div>`).join('')}</section><section class="analytics-section">${heading('05','名单来源与重叠')}${arcChart(sources,data.total,'名单来源')}<a class="analytics-link" href="first-outreach-users.html">查看首批触达名单 ↗</a></section>`;
  }
  function render() {
    switches.forEach(button => button.setAttribute('aria-pressed',String(button.dataset.scope === scope)));
    if (!dataset) return;
    const data = dataset[scope];
    denominator.textContent = '';
    if (scope === 'snapshot' && !['ready','verified_counts'].includes(data.status)) {
      view.innerHTML = '<p class="load-message" role="status">全体客户统计尚未加载，可切换查看首批触达名单。</p><button type="button" class="retry-button" data-retry>重新加载</button>';
      return;
    }
    try {
      if (!Number.isSafeInteger(data.total) || data.total <= 0) throw new Error('总人数无效');
      const frequency = validatedRows(data,'purchase_frequency');
      const amount = validatedRows(data,'historical_amount');
      const subscription = validatedRows(data,'subscription');
      const zero = frequency.find(row => row.key === '0');
      const one = frequency.find(row => row.key === '1');
      const subscribed = subscription.find(row => row.key === 'subscribed');
      if (!zero || !one || !subscribed) throw new Error('缺少必要的客户分组');
      denominator.textContent = `${fmt(data.total)} 人`;
      const buyers = data.total-zero.count;
      const metrics = [['有历史订单',buyers],['多次下单',buyers-one.count],['已订阅',subscribed.count]];
      view.innerHTML = `<section class="analytics-overview" aria-label="客户基础结构">${ring(frequency,data.total)}<dl class="metric-list">${metrics.map(([label,count]) => `<div><dt>${label}</dt><dd>${value(count,data.total)}</dd></div>`).join('')}</dl>${scope === 'outreach' ? '<p class="analytics-note">近期访问与高消费筛选名单，非随机样本。</p>' : ''}</section><section class="analytics-section">${heading('01','购买次数')}${frequencyPlot(frequency,data.total)}</section><section class="analytics-section">${heading('02','历史累计订单金额')}${amountPlot(amount,data.total)}</section><section class="analytics-section">${heading('03','邮件订阅状态')}${arcChart(subscription,data.total,'邮件订阅状态')}</section>${scope === 'outreach' ? outreachExtra(data) : ''}<details class="analytics-footnote"><summary>数据口径</summary><p>所有百分比以当前所选范围的客户总人数为分母。${data.as_of ? '统计日期：'+esc(data.as_of)+'。' : ''}订单与金额为历史累计，未核实退款及取消订单扣除；多次下单指累计 2 单及以上。全体统计来自当天分次筛选，少量新增客户可能造成细微差异。弧线各轨道的完整长度均代表当前范围 100%，端点圆点仅用于标记位置。</p></details>`;
    } catch (error) {
      view.innerHTML = '<p class="load-message" role="alert">数据未通过完整性核对，暂不展示图表。</p><button type="button" class="retry-button" data-retry>重新加载</button>';
    }
  }
  async function load() {
    view.setAttribute('aria-busy','true');
    view.innerHTML = '<p class="load-message" role="status">正在加载数据…</p>';
    try {
      const response = await fetch('data/customer-analytics.json',{cache:'no-cache'});
      if (!response.ok) throw new Error('数据请求失败');
      dataset = await response.json();
      if (!dataset.snapshot || !dataset.outreach) throw new Error('数据范围缺失');
      render();
    } catch (error) {
      dataset = null;
      denominator.textContent = '';
      view.innerHTML = '<p class="load-message" role="alert">加载失败，请检查网络后重试。</p><button type="button" class="retry-button" data-retry>重新加载</button>';
    } finally { view.setAttribute('aria-busy','false'); }
  }
  switches.forEach(button => button.addEventListener('click',() => { scope=button.dataset.scope; render(); }));
  view.addEventListener('click',event => {
    if (event.target.closest('[data-retry]')) { load(); return; }
    const button = event.target.closest('[data-ring-select]');
    if (!button) return;
    const selected = button.getAttribute('aria-pressed') !== 'true';
    const index = button.dataset.ringSelect;
    view.querySelectorAll('[data-ring-select]').forEach(item => item.setAttribute('aria-pressed',String(selected && item === button)));
    view.querySelectorAll('[data-ring-index]').forEach(segment => { segment.style.opacity = !selected || segment.dataset.ringIndex === index ? '1' : '.16'; });
    const data = dataset[scope], row = rowsFor(data,'purchase_frequency')[Number(index)];
    view.querySelector('.ring-center strong').textContent = fmt(selected ? row.count : data.total);
    view.querySelector('.ring-center span').textContent = selected ? row.label+' · 人' : (scope === 'snapshot' ? '全体客户' : '首批触达')+' · 人';
    view.querySelector('.ring-center small').innerHTML = selected ? pct(row.count,data.total) : '历史购买次数';
  });
  load();
})();
