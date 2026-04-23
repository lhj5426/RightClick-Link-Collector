chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'showNotification') {
    showToast(message.title, message.url, message.groupName, message.date, message.hasSnapshot, message.snapshotDataUrl, message.autoClose, message.totalCount, message.groupColor, message.groupTextColor);
  }
});

function showToast(title, url, groupName, date, hasSnapshot, snapshotDataUrl, autoClose, totalCount, groupColor, explicitTextColor) {
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
        min-width: 320px;
        max-width: 520px;
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
        animation: link-collector-progress var(--toast-duration, 3s) linear forwards;
      }
      .link-collector-toast-snapshot {
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 4px;
        font-weight: bold;
        display: inline-block;
        margin-top: 2px;
      }
      .link-collector-toast-snapshot.has-snap {
        background: #c6f6d5;
        color: #22543d;
      }
      .link-collector-toast-snapshot.no-snap {
        background: #fed7d7;
        color: #c53030;
      }
      .link-collector-toast-thumb {
        margin-top: 10px;
        border-radius: 6px;
        overflow: hidden;
        border: 1px solid rgba(0,0,0,0.08);
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f8f9fa;
      }
      .link-collector-toast-thumb img {
        width: 100%;
        height: auto;
        max-height: 160px;
        object-fit: cover;
        object-position: top;
        display: block;
      }
      .link-collector-toast-index {
        color: #2b6cb0;
        font-size: 16px;
        font-weight: 800;
        display: inline-flex;
        align-items: center;
        margin-right: 12px;
      }
      .link-collector-toast-warning {
        margin-top: 10px;
        padding: 8px 12px;
        background: #fff5f5;
        border: 1px solid #feb2b2;
        border-radius: 6px;
        color: #c53030;
        font-size: 11px;
        line-height: 1.4;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .link-collector-toast-warning::before {
        content: "⚠️";
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
  
  // 如果提供了分组颜色，应用到边框和标签
  const finalGroupColor = groupColor || "#2196F3";
  toast.style.borderLeftColor = finalGroupColor;

  // 计算对比色，确保文字清晰
  function getGroupTextColor(bgColor) {
    if (!bgColor || bgColor === '#ebf8ff' || bgColor === 'transparent') return '#1967d2';
    const color = (bgColor.charAt(0) === '#') ? bgColor.substring(1, 7) : bgColor;
    const r = parseInt(color.substring(0, 2), 16);
    const g = parseInt(color.substring(2, 4), 16);
    const b = parseInt(color.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.7 ? '#1967d2' : '#ffffff';
  }
  const groupTextColor = explicitTextColor || getGroupTextColor(finalGroupColor);

  const snapBadge = hasSnapshot 
    ? '<span class="link-collector-toast-snapshot has-snap">已截图</span>'
    : '<span class="link-collector-toast-snapshot no-snap">截图失败</span>';
  
  const thumbnailHtml = snapshotDataUrl 
    ? `<div class="link-collector-toast-thumb"><img src="${snapshotDataUrl}" alt="截图预览"></div>`
    : '';
  
  const warningHtml = autoClose 
    ? `<div class="link-collector-toast-warning">保存后关闭功能已开启，进度条结束后将自动关闭当前标签</div>` 
    : '';

  toast.innerHTML = `
    <div class="link-collector-toast-header">
      <div style="display: flex; align-items: center;">
        <span class="link-collector-toast-index" style="color: ${finalGroupColor};">${totalCount || ''}</span>
        <span class="link-collector-toast-group" style="background-color: ${finalGroupColor}; color: ${groupTextColor};">${groupName || '全局'}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        ${snapBadge}
        <span class="link-collector-toast-date">${date || ''}</span>
      </div>
    </div>
    <div class="link-collector-toast-title">${title || '无标题'}</div>
    <div class="link-collector-toast-url">${url || ''}</div>
    ${thumbnailHtml}
    ${warningHtml}
    <div class="link-collector-toast-progress"></div>
  `;

  container.appendChild(toast);

  // 触发动画
  const dismissTime = snapshotDataUrl ? 4000 : 3000;
  toast.style.setProperty('--toast-duration', (dismissTime / 1000) + 's');
  setTimeout(() => toast.classList.add('show'), 10);

  // 有缩略图时显示更长时间（4秒），无缩略图3秒
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      toast.remove();
      if (container.children.length === 0) {
        container.remove();
      }
      
      // 如果开启了“保存后关闭”，则在弹窗彻底消失后通知后台关闭标签页
      if (autoClose) {
        chrome.runtime.sendMessage({ action: 'closeTab' });
      }
    }, 300);
  }, dismissTime);
}

let lastRightPointerDownTime = 0;
const RIGHT_CLICK_BRIDGE_MESSAGE = '__link_collector_right_click__';

function getRightClickTopViewportMetrics() {
  let viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
  let viewportH = window.innerHeight || document.documentElement.clientHeight || 0;

  try {
    if (window.top && window.top !== window) {
      viewportW = window.top.innerWidth || viewportW;
      viewportH = window.top.innerHeight || viewportH;
    }
  } catch (error) {
    // 跨域 frame 时无法直接读取 top，保留当前 frame 视口作为兜底
  }

  return { viewportW, viewportH };
}

function persistRightClickPosition(coords) {
  chrome.storage.local.set({ lastRightClick: coords });
  try {
    chrome.runtime.sendMessage({ action: 'recordRightClick', coords });
  } catch (error) {
    // 忽略后台暂时不可用的情况，storage 仍可作为兜底
  }
}

function buildRightClickPosition(e, source) {
  const anchor = e.target instanceof Element ? e.target.closest('a[href]') : null;
  return {
    x: e.clientX,
    y: e.clientY,
    time: Date.now(),
    source,
    pageUrl: location.href,
    linkUrl: anchor ? anchor.href : "",
    viewportW: window.innerWidth || document.documentElement.clientWidth || 0,
    viewportH: window.innerHeight || document.documentElement.clientHeight || 0,
    dpr: window.devicePixelRatio || 1
  };
}

function forwardRightClickPositionToTop(coords) {
  if (window === window.top) {
    const { viewportW, viewportH } = getRightClickTopViewportMetrics();
    persistRightClickPosition({
      ...coords,
      pageUrl: location.href,
      viewportW,
      viewportH
    });
    return;
  }

  try {
    window.parent.postMessage({
      type: RIGHT_CLICK_BRIDGE_MESSAGE,
      coords
    }, '*');
  } catch (error) {
    persistRightClickPosition(coords);
  }
}

function storeRightClickPosition(e, source) {
  const coords = buildRightClickPosition(e, source);
  forwardRightClickPositionToTop(coords);
}

// 记录鼠标右键按下的第一落点，这个位置比 contextmenu 菜单弹出点更接近真实点击目标
window.addEventListener('pointerdown', (e) => {
  const isRightButton = e.button === 2;
  const isCtrlLeftClick = e.button === 0 && e.ctrlKey;
  if (!isRightButton && !isCtrlLeftClick) return;

  lastRightPointerDownTime = Date.now();
  storeRightClickPosition(e, 'pointerdown');
}, true);

// 保留 contextmenu 作为兜底，但不覆盖刚刚记录的首次按下位置
window.addEventListener('contextmenu', (e) => {
  if (Date.now() - lastRightPointerDownTime < 1200) return;
  storeRightClickPosition(e, 'contextmenu');
}, true);

window.addEventListener('message', (e) => {
  const data = e.data;
  if (!data || data.type !== RIGHT_CLICK_BRIDGE_MESSAGE || !data.coords) return;
  if (!e.source || e.source === window) return;

  let frameRect = null;
  const frameEls = document.querySelectorAll('iframe, frame');
  for (const frameEl of frameEls) {
    try {
      if (frameEl.contentWindow === e.source) {
        frameRect = frameEl.getBoundingClientRect();
        break;
      }
    } catch (error) {
      // 某些 frame 无法直接比较时继续尝试其他 frame
    }
  }

  if (!frameRect) return;

  const coords = {
    ...data.coords,
    x: (Number(data.coords.x) || 0) + frameRect.left,
    y: (Number(data.coords.y) || 0) + frameRect.top
  };

  if (window === window.top) {
    const { viewportW, viewportH } = getRightClickTopViewportMetrics();
    persistRightClickPosition({
      ...coords,
      pageUrl: location.href,
      viewportW,
      viewportH
    });
    return;
  }

  try {
    window.parent.postMessage({
      type: RIGHT_CLICK_BRIDGE_MESSAGE,
      coords
    }, '*');
  } catch (error) {
    persistRightClickPosition(coords);
  }
}, true);
