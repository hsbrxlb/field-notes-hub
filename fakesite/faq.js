const faqSearch = document.querySelector('#faq-search');
const topicButtons = [...document.querySelectorAll('[data-faq-topic]')];
const questions = [...document.querySelectorAll('.faq-question')];
let faqTopic = 'all';
function filterQuestions() {
  const query = faqSearch.value.toLowerCase().trim();
  let visible = 0;
  questions.forEach(question => {
    const match = (faqTopic==='all'||question.dataset.faqCategory===faqTopic) && question.textContent.toLowerCase().includes(query);
    question.hidden = !match;
    if(match)visible++;
  });
  document.querySelector('#faq-empty').hidden = visible>0;
  document.querySelector('#faq-status').textContent = `${visible} matching questions`;
}
faqSearch.addEventListener('input',filterQuestions);
topicButtons.forEach(button=>button.addEventListener('click',()=>{
  faqTopic=button.dataset.faqTopic;
  topicButtons.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  filterQuestions();
}));
function revealLinkedQuestion() {
  let id;
  try { id=decodeURIComponent(location.hash.slice(1)); } catch { return; }
  const question=questions.find(item=>item.id===id);
  if(!question)return;
  faqTopic='all';
  faqSearch.value='';
  topicButtons.forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.faqTopic==='all')));
  filterQuestions();
  question.open=true;
  question.scrollIntoView({block:'start'});
}
addEventListener('hashchange',revealLinkedQuestion);
revealLinkedQuestion();
