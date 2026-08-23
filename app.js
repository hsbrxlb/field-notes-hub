const beamDemo = document.querySelector('.beam-demo');
const beamRange = document.querySelector('#beam-range');
const beamButtons = [...document.querySelectorAll('.beam-button')];
const demoLabel = document.querySelector('.demo-label');

function setBeam(mode, value = mode === 'wide' ? 18 : 88) {
  beamDemo.dataset.mode = mode;
  beamRange.value = value;
  demoLabel.textContent = mode === 'wide' ? 'WIDE / TRAIL' : 'DISTANCE';
  beamButtons.forEach((button) => button.classList.toggle('active', button.dataset.beam === mode));
}

beamButtons.forEach((button) => button.addEventListener('click', () => setBeam(button.dataset.beam)));
beamRange.addEventListener('input', (event) => {
  const value = Number(event.target.value);
  setBeam(value < 50 ? 'wide' : 'distance', value);
  beamDemo.style.setProperty('--spread', String(1.12 - value / 420));
});

const choiceResult = document.querySelector('.choice-result');
document.querySelectorAll('[data-choice]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-choice]').forEach((item) => item.classList.remove('selected'));
    button.classList.add('selected');
    choiceResult.classList.add('answer');
    choiceResult.textContent = `原始选择已保留：${button.dataset.choice}。下一步只追问一次“为什么”。`;
  });
});

const phases = {
  30: {
    kicker: 'PHASE 01',
    title: '定义研究问题，补齐数据与授权边界。',
    items: ['锁定产品要做的决定', '建立用户与车型字段', '完成首个Light Lab最小版本', '记录当前社媒、UGC、社群基线'],
    exit: '能说清“问谁、问什么、支持哪个决定”。'
  },
  60: {
    kicker: 'PHASE 02',
    title: '跑出第一轮可比较证据，找到高信息量车主。',
    items: ['分批邀请种子车主', '完成方向性概念测试', '挑选深访对象', '形成证据与未决项清单'],
    exit: '产品团队能据此收窄一个真实选择。'
  },
  90: {
    kicker: 'PHASE 03',
    title: '让参与不止一次，把有效机制复制到下一场景。',
    items: ['建立二次任务与复访节奏', '试跑UGC与授权链路', '选择合适的社群载体', '沉淀下一轮可复用SOP'],
    exit: '用户、研究、内容和产品之间形成可重复闭环。'
  }
};

const phaseKicker = document.querySelector('.phase-kicker');
const phaseTitle = document.querySelector('.roadmap-detail h3');
const phaseList = document.querySelector('.roadmap-detail ul');
const phaseExit = document.querySelector('.phase-exit');

document.querySelectorAll('[data-phase]').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-phase]').forEach((item) => item.setAttribute('aria-selected', 'false'));
    tab.setAttribute('aria-selected', 'true');
    const phase = phases[tab.dataset.phase];
    phaseKicker.textContent = phase.kicker;
    phaseTitle.textContent = phase.title;
    phaseList.innerHTML = phase.items.map((item) => `<li>${item}</li>`).join('');
    phaseExit.innerHTML = `<span>退出条件</span>${phase.exit}`;
  });
});

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!reducedMotion && 'IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));

  const sections = [...document.querySelectorAll('main section[id]')];
  const navLinks = [...document.querySelectorAll('.nav-track a')];
  const navObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((link) => link.classList.toggle('active', link.hash === `#${entry.target.id}`));
    });
  }, { rootMargin: '-25% 0px -65% 0px' });
  sections.forEach((section) => navObserver.observe(section));
} else {
  document.querySelectorAll('.reveal').forEach((element) => element.classList.add('visible'));
}
