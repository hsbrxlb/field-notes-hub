(() => {
  const body = document.querySelector('#list-body');
  const status = document.querySelector('#list-status');
  const previous = document.querySelector('#list-prev');
  const next = document.querySelector('#list-next');
  const pageLabel = document.querySelector('#list-page');
  const filters = Array.from(document.querySelectorAll('[data-segment]'));
  const pageSize = 100;
  const labels = {all: '全部用户', high: '高消费客户', buyers: '近期买家', prospects: '近期未下单', excluded: '暂不邀请'};
  let users = [];
  let page = 0;
  let segment = new URLSearchParams(location.search).get('group') || 'all';
  if (!Object.hasOwn(labels, segment)) segment = 'all';
  function matches(user, group) {
    if (group === 'high') return user.sources.includes('high');
    if (group === 'buyers') return user.sources.includes('recent') && user.email_status === '订阅' && Number(user.historical_orders) > 0;
    if (group === 'prospects') return user.sources.includes('recent') && user.email_status === '订阅' && Number(user.historical_orders) === 0;
    if (group === 'excluded') return user.email_status !== '订阅';
    return true;
  }
  function render() {
    const selected = users.filter(user => matches(user, segment));
    const start = page * pageSize;
    const fragment = document.createDocumentFragment();
    selected.slice(start, start + pageSize).forEach((user, index) => {
      const row = document.createElement('tr');
      const groups = [];
      if (user.sources.includes('high')) groups.push('高消费客户');
      if (user.sources.includes('recent')) groups.push(Number(user.historical_orders) > 0 ? '近期买家' : '近期未下单');
      let invitation = '暂不邀请';
      if (user.email_status === '订阅') {
        invitation = '再看一看';
        if (Number(user.historical_orders) > 0) invitation = '优先邀请';
      }
      const values = [start + index + 1, user.customer_id, user.masked_email, user.historical_orders,
        Number(user.historical_order_usd).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}),
        user.email_status === '订阅' ? '已订阅' : user.email_status, groups.join(' · '), invitation];
      values.forEach(value => { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); });
      fragment.append(row);
    });
    body.replaceChildren(fragment);
    status.textContent = labels[segment] + ' ' + selected.length.toLocaleString('en-US') + ' 人' + (selected.length ? ' · 当前 ' + (start + 1) + '–' + Math.min(start + pageSize, selected.length) + ' 人' : '');
    pageLabel.textContent = selected.length ? (page + 1) + ' / ' + Math.ceil(selected.length / pageSize) : '0 / 0';
    previous.disabled = page === 0;
    next.disabled = start + pageSize >= selected.length;
    filters.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.segment === segment));
      button.querySelector('span').textContent = users.filter(user => matches(user, button.dataset.segment)).length.toLocaleString('en-US');
    });
    document.querySelector('.list-scroll').scrollTop = 0;
  }
  filters.forEach(button => button.addEventListener('click', () => {
    segment = button.dataset.segment;
    page = 0;
    const url = new URL(location.href);
    url.searchParams.set('group', segment);
    history.replaceState(null, '', url);
    render();
  }));
  previous.addEventListener('click', () => { if (page > 0) { page--; render(); } });
  next.addEventListener('click', () => { if (!next.disabled) { page++; render(); } });
  fetch('data/outreach-users.json').then(response => {
    if (!response.ok) throw new Error('load');
    return response.json();
  }).then(data => { if (!Array.isArray(data) || !data.length) throw new Error('empty'); users = data; filters.forEach(button => { button.disabled = false; }); render(); })
    .catch(() => { status.textContent = '名单暂时加载失败，请刷新页面重试。'; });
})();
