const menuButton = document.querySelector('[data-menu-toggle]');
const mobileMenu = document.querySelector('#mobile-menu');
const contents = document.querySelector('.toc');
const readingBreakpoint = window.matchMedia('(min-width:801px)');
if (contents) {
  contents.open = readingBreakpoint.matches;
  readingBreakpoint.addEventListener('change', event => { contents.open = event.matches; });
  const links = [...contents.querySelectorAll('a')];
  const sections = links.map(link => document.getElementById(link.hash.slice(1))).filter(Boolean);
  const observer = new IntersectionObserver(entries => {
    const visible = entries.find(entry => entry.isIntersecting);
    if (!visible) return;
    links.forEach(link => {
      if (link.hash === '#'+visible.target.id) link.setAttribute('aria-current','location');
      else link.removeAttribute('aria-current');
    });
  }, {rootMargin:'-10% 0px -65% 0px'});
  sections.forEach(section => observer.observe(section));
}
menuButton?.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  mobileMenu.hidden = !open;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && mobileMenu && !mobileMenu.hidden) {
    mobileMenu.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.focus();
  }
});

const search = document.querySelector('#guide-search');
const filters = [...document.querySelectorAll('[data-category]')];
const categorySelect = document.querySelector('#category-select');
let category = 'all';
function filterGuides() {
  const query = search.value.trim().toLowerCase();
  let count = 0;
  document.querySelectorAll('[data-guide]').forEach(guide => {
    const match = (category === 'all' || guide.dataset.guide === category) && (guide.textContent+' '+guide.dataset.search).toLowerCase().includes(query);
    guide.hidden = !match;
    count += Number(match);
  });
  document.querySelector('#no-guides').hidden = count !== 0;
  document.querySelector('#guide-count').textContent = `${count} ${count === 1 ? 'guide' : 'guides'}`;
}
search?.addEventListener('input', filterGuides);
filters.forEach(button => button.addEventListener('click', () => {
  category = button.dataset.category;
  filters.forEach(filter => filter.setAttribute('aria-pressed', String(filter === button)));
  filterGuides();
}));
categorySelect?.addEventListener('change', () => {
  category = categorySelect.value;
  filterGuides();
});

document.querySelectorAll('[data-preview-only]').forEach(button => button.addEventListener('click', () => {
  const dialog = document.querySelector('#preview-dialog');
  dialog.querySelector('p').textContent = button.dataset.previewOnly;
  dialog.showModal();
}));
document.querySelector('[data-close-dialog]')?.addEventListener('click', () => document.querySelector('#preview-dialog').close());
