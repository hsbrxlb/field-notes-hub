document.documentElement.classList.add('js');

const menu = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.primary-navigation');
if (menu && navigation) {
  const closeMenu = () => { menu.setAttribute('aria-expanded', 'false'); navigation.classList.remove('is-open'); };
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    menu.setAttribute('aria-expanded', String(open));
    navigation.classList.toggle('is-open', open);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { closeMenu(); menu.focus(); }
  });
  document.addEventListener('click', event => { if (!event.target.closest('.site-header')) closeMenu(); });
  matchMedia('(min-width: 761px)').addEventListener('change', closeMenu);
}

const filterRoot = document.querySelector('[data-filter-root]');
if (filterRoot) {
  const input = filterRoot.querySelector('[data-search-input]');
  const select = filterRoot.querySelector('[data-topic-select]');
  const buttons = [...filterRoot.querySelectorAll('[data-filter]')];
  const items = [...filterRoot.querySelectorAll('[data-filter-item]')];
  const status = filterRoot.querySelector('[data-filter-status]');
  const empty = filterRoot.querySelector('[data-empty-state]');
  const params = new URLSearchParams(location.search);
  const allowed = [...select.options].map(option => option.value);
  let category = allowed.includes(params.get('topic')) ? params.get('topic') : 'all';
  input.value = params.get('q') || '';
  const apply = (updateURL = true) => {
    const query = input.value.trim().toLowerCase();
    const terms = query.split(/\s+/).filter(Boolean);
    let visible = 0;
    items.forEach(item => {
      const match = (category === 'all' || item.dataset.category === category) && terms.every(term => item.dataset.search.includes(term));
      item.hidden = !match;
      if (match) visible += 1;
    });
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === category)));
    select.value = category;
    empty.hidden = visible > 0;
    document.querySelectorAll('[data-editorial-feature]').forEach(feature => { feature.hidden = Boolean(query) || category !== 'all'; });
    status.textContent = visible ? `Matching ${filterRoot.dataset.filterKind} are displayed.` : `No matching ${filterRoot.dataset.filterKind}.`;
    if (updateURL) {
      const url = new URL(location.href);
      category === 'all' ? url.searchParams.delete('topic') : url.searchParams.set('topic', category);
      query ? url.searchParams.set('q', input.value.trim()) : url.searchParams.delete('q');
      url.hash = '';
      history.replaceState(null, '', url);
    }
  };
  input.addEventListener('input', () => apply());
  select.addEventListener('change', () => { category = select.value; apply(); });
  buttons.forEach(button => button.addEventListener('click', () => { category = button.dataset.filter; apply(); }));
  filterRoot.querySelector('[data-reset-filters]').addEventListener('click', () => { category = 'all'; input.value = ''; apply(); input.focus(); });
  apply(false);
  const openHashQuestion = () => {
    let id;
    try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
    const question = document.getElementById(id);
    if (question?.matches('.faq-item')) {
      category = 'all'; input.value = ''; apply(false); question.open = true;
      requestAnimationFrame(() => question.scrollIntoView({ block: 'start' }));
    }
  };
  openHashQuestion();
  window.addEventListener('hashchange', openHashQuestion);
}

const tocLinks = [...document.querySelectorAll('.article-toc a[href^="#"]')].filter(link => link.hash !== '#main');
const headings = tocLinks.map(link => document.getElementById(decodeURIComponent(link.hash.slice(1)))).filter(Boolean);
if (headings.length && 'IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible.length) tocLinks.forEach(link => {
      const active = decodeURIComponent(link.hash.slice(1)) === visible[0].target.id;
      active ? link.setAttribute('aria-current', 'location') : link.removeAttribute('aria-current');
    });
  }, { rootMargin:'-15% 0px -65% 0px' });
  headings.forEach(heading => observer.observe(heading));
}
