// Report startup failures too (renderer/module construction runs before initialize).
import('./main.js').catch(error => {
  console.error('Startup failed:', error);
  const label = document.querySelector('#loading-detail');
  if (!label) return;
  label.textContent = /webgl|context/i.test(error.message)
    ? '浏览器无法启动 3D 渲染，请更新浏览器后重试'
    : '页面资源加载失败，请检查网络后重试';
  label.style.cssText = 'color:#efc99a;text-align:center;font:14px sans-serif';
  const retry = document.createElement('button');
  retry.textContent = '重新加载';
  retry.onclick = () => location.reload();
  label.after(retry);
});
