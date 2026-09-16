(() => {
  function jsonBlock(value) {
    const json = JSON.stringify(value, null, 2);
    const longest = Math.max(2, ...(json.match(/`+/g) || []).map((run) => run.length));
    const fence = '`'.repeat(longest + 1);
    return `${fence}json\n${json}\n${fence}`;
  }

  function exportMarkdown(selection, exportedAt = new Date().toISOString()) {
    const { manifest, category, categoryData, products, brand, quality } = selection;
    const { products: sourceProducts, ...categoryMetadata } = categoryData;
    const lines = [
      '# OEDRO 产品知识库', '',
      `下载范围：${category.name} / 品牌：${brand} / 资料状态：${quality}。共 ${products.length} 条，包含全部分页。`, '',
      `来源：${manifest.sourceUrl}`, `来源快照时间：${manifest.capturedAt}`, `文件生成时间：${exportedAt}`, '',
      '价格、库存、评分与适配为来源快照；引用或购买前请在官网复核。', '',
      '每条商品保留完整字段，包括 SKU、适配、规格、描述、变体、安装文档、图片链接、价格库存及来源时间。清单统计对应全库，商品记录对应上述下载范围。', '',
      '## 数据清单', '', jsonBlock(manifest), '',
      '## 分类与筛选', '', jsonBlock({ category, categoryMetadata, filters: { brand, quality }, exportedCount: products.length, sourceCount: sourceProducts.length }), ''
    ];
    products.forEach((product, index) => {
      lines.push(`## 商品 ${index + 1}`, '', jsonBlock(product), '');
    });
    return lines.join('\n');
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { exportMarkdown };
    return;
  }

  let selection = null;
  document.addEventListener('catalog:loading', () => {
    selection = null;
    const button = document.querySelector('#download-products');
    if (button) button.disabled = true;
    const scope = document.querySelector('#download-scope');
    if (scope) scope.textContent = '正在加载分类，下载将在资料载入后可用。';
  });
  document.addEventListener('catalog:ready', (event) => {
    selection = event.detail;
    let controls = document.querySelector('.catalog-export');
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'catalog-export';
      controls.innerHTML = '<button type="button" id="download-products" aria-describedby="download-scope">下载 Markdown</button><p id="download-scope" role="status"></p>';
      document.querySelector('#catalog-toolbar').after(controls);
      controls.querySelector('button').addEventListener('click', () => {
        if (!selection || !selection.products.length) return;
        const blob = new Blob([exportMarkdown(selection)], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `oedro-${selection.category.id}-${selection.brand}-${selection.quality}-${selection.products.length}.md`;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
    }
    document.querySelector('#download-products').disabled = selection.products.length === 0;
    document.querySelector('#download-scope').textContent = `${selection.category.name} · 品牌：${selection.brand} · 资料状态：${selection.quality} · 共 ${selection.products.length} 条（含所有分页），供 AI 读取`;
  });

  async function initialize() {
    try {
      await window.initProducts();
      document.title = '产品知识库｜OEDRO';
    } catch (error) {
      const content = document.querySelector('#content');
      content.innerHTML = '<div class="catalog-load-error" role="alert"><strong>产品知识库暂时没有载入</strong><p>检查连接后可重新尝试。</p><button type="button">重试</button></div>';
      content.querySelector('button').addEventListener('click', initialize);
      console.error(error);
    }
  }
  initialize();
})();
