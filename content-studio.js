(() => {
  const destinations = {
    'brand-voice-system': 'topic.html?slug=brand-voice-system',
    'discord-audit': 'topic.html?slug=discord-community',
    'user-voice-summary': 'user-voice.html',
    'ai-smart-survey': 'research.html',
    'seo-geo-lab': 'topic.html?slug=seo-geo',
    'hub-structure': 'index.html'
  };
  const defaults = {
    'research-library': 'research.html',
    'sites-systems': 'topic.html?slug=seo-geo',
    playbook: 'mascot-workflow.html'
  };
  const page = document.body.dataset.page;
  const destination = destinations[location.hash.slice(1)] || defaults[page];
  if (destination) {
    location.replace(destination);
    return;
  }
  window.initContentStudio = () => window.initContentPipelineTests({ inline: true });
})();
