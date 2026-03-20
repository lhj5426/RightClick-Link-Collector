// 监听右键点击事件，记录位置以供快照标记使用
window.addEventListener('contextmenu', (e) => {
  const coords = {
    x: e.clientX,
    y: e.clientY,
    time: Date.now()
  };
  chrome.storage.local.set({ lastRightClick: coords });
}, true);
