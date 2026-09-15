(() => {
  const body = document.querySelector('#list-body');
  const status = document.querySelector('#list-status');
  const previous = document.querySelector('#list-prev');
  const next = document.querySelector('#list-next');
  const pageLabel = document.querySelector('#list-page');
  const pageSize = 100;
  let users = [];
  let page = 0;
  function render() {
    const start = page * pageSize;
    const fragment = document.createDocumentFragment();
    users.slice(start, start + pageSize).forEach((user, index) => {
      const row = document.createElement('tr');
      let priority = '暂不纳入';
      if (user.email_status === '订阅') {
        priority = '再看一看';
        if (Number(user.historical_orders) > 0) priority = '优先邀请';
      }
      const values = [start + index + 1, user.customer_id, user.masked_email, user.historical_orders,
        Number(user.historical_order_usd).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}),
        user.email_status === '订阅' ? '已订阅' : user.email_status, priority];
      values.forEach(value => { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); });
      fragment.append(row);
    });
    body.replaceChildren(fragment);
    status.textContent = '共 ' + users.length.toLocaleString('en-US') + ' 人 · 当前 ' + (start + 1) + '–' + Math.min(start + pageSize, users.length) + ' 人';
    pageLabel.textContent = (page + 1) + ' / ' + Math.ceil(users.length / pageSize);
    previous.disabled = page === 0;
    next.disabled = start + pageSize >= users.length;
    document.querySelector('.list-scroll').scrollTop = 0;
  }
  previous.addEventListener('click', () => { if (page > 0) { page--; render(); } });
  next.addEventListener('click', () => { if ((page + 1) * pageSize < users.length) { page++; render(); } });
  fetch('data/first-outreach-users.json').then(response => {
    if (!response.ok) throw new Error('load');
    return response.json();
  }).then(data => { if (!Array.isArray(data) || !data.length) throw new Error('empty'); users = data; render(); })
    .catch(() => { status.textContent = '名单暂时加载失败，请刷新页面重试。'; });
})();
