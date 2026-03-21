// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showNotification') {
    showToast(message.title, message.url, message.groupName, message.date);
  }
});

function showToast(title, url, groupName, date) {
  // 防止重复创建样式
  if (!document.getElementById('link-collector-toast-style')) {
    const style = document.createElement('style');
    style.id = 'link-collector-toast-style';
    style.textContent = `
      #link-collector-toast-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      }
      .link-collector-toast {
        background: rgba(255, 255, 255, 0.95);
        border-left: 5px solid #2196F3;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        padding: 12px 20px;
        border-radius: 8px;
        margin-bottom: 10px;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 250px;
        max-width: 380px;
        transform: translateX(120%);
        transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        backdrop-filter: blur(5px);
        pointer-events: auto;
        position: relative;
        overflow: hidden;
      }
      .link-collector-toast.show {
        transform: translateX(0);
      }
      .link-collector-toast-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        color: #1a73e8;
        font-weight: bold;
        font-size: 14px;
      }
      .link-collector-toast-group {
        font-size: 14px;
        background: #e8f0fe;
        color: #1967d2;
        padding: 1px 8px;
        border-radius: 4px;
        margin-left: 8px;
        font-weight: bold;
      }
      .link-collector-toast-date {
        font-size: 10px;
        background: #c6f6d5;
        color: #000;
        padding: 2px 8px;
        border-radius: 4px;
        font-weight: bold;
        margin-left: 10px;
        white-space: nowrap;
      }
      .link-collector-toast-title {
        color: #3c4043;
        font-size: 13px;
        display: block;
        margin-top: 4px;
        font-weight: 500;
        line-height: 1.4;
        word-break: break-all;
        overflow-wrap: break-word;
      }
      .link-collector-toast-url {
        color: #70757a;
        font-size: 11px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-bottom: 4px;
      }
      .link-collector-toast-progress {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: #2196F3;
        width: 100%;
        transform-origin: left;
      }
      .link-collector-toast.show .link-collector-toast-progress {
        animation: link-collector-progress 3s linear forwards;
      }
      @keyframes link-collector-progress {
        from { transform: scaleX(1); }
        to { transform: scaleX(0); }
      }
    `;
    document.head.appendChild(style);
  }

  let container = document.getElementById('link-collector-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'link-collector-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'link-collector-toast';
  toast.innerHTML = `
    <div class="link-collector-toast-header">
      <div style="display: flex; align-items: center;">
        <span>📥 已收藏到</span>
        <span class="link-collector-toast-group">${groupName || '全局'}</span>
      </div>
      <span class="link-collector-toast-date">${date || ''}</span>
    </div>
    <div class="link-collector-toast-title">${title || '无标题'}</div>
    <div class="link-collector-toast-url">${url || ''}</div>
    <div class="link-collector-toast-progress"></div>
  `;

  container.appendChild(toast);

  // 触发动画
  setTimeout(() => toast.classList.add('show'), 10);

  // 3秒后消失并移除
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
      if (container.children.length === 0) {
        container.remove();
      }
    }, 300);
  }, 3000);
}

// 监听右键点击事件，记录位置以供快照标记使用
window.addEventListener('contextmenu', (e) => {
  const coords = {
    x: e.clientX,
    y: e.clientY,
    time: Date.now()
  };
  chrome.storage.local.set({ lastRightClick: coords });
}, true);
