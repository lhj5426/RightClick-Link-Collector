// background.js - create context menu for link + page; save items with metadata

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    // Save a right-clicked link
    chrome.contextMenus.create({
      id: "saveLink",
      title: "05.保存链接到收集器",
      contexts: ["link"]
    });

    // Save the current page (right-click page background or when no link)
    chrome.contextMenus.create({
      id: "savePage",
      title: "05.保存页面到收集器",
      contexts: ["page"]
    });

    console.log("右键菜单已创建。");
  });
}

createContextMenus();
chrome.runtime.onInstalled.addListener(createContextMenus);
chrome.runtime.onStartup.addListener(createContextMenus);

// 点击工具栏图标打开管理页面
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
});

// Helper: format date YYYY/MM/DD-HH:MM:SS
function formatDateDDMMYYYY(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${year}/${month}/${day}-${hours}:${minutes}:${seconds}`;
}

// 更新角标
function updateBadge() {
  chrome.storage.local.get({ links: [] }, (res) => {
    const links = Array.isArray(res.links) ? res.links : [];
    const count = links.length;
    if (count > 0) {
      chrome.action.setBadgeText({ text: String(Math.min(999, count)) });
      chrome.action.setBadgeBackgroundColor({ color: '#2196F3' });
      chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  });
}

// 启动时更新角标
chrome.runtime.onStartup.addListener(() => {
  updateBadge();
});

// 安装时更新角标
chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  try {
    let savedUrl = "";
    let title = "";
    if (info.menuItemId === "saveLink") {
      savedUrl = info.linkUrl || "";
      title = info.linkText || tab?.title || savedUrl;
    } else if (info.menuItemId === "savePage") {
      savedUrl = tab?.url || info.pageUrl || "";
      title = tab?.title || savedUrl;
    } else {
      return;
    }

    if (!savedUrl) {
      console.warn("No URL to save:", info);
      return;
    }

    let page = "";
    try { page = tab?.url ? new URL(tab.url).hostname : ""; } catch (e) { page = ""; }

    const item = {
      id: Date.now(),
      title: String(title),
      url: String(savedUrl),
      page,
      date: formatDateDDMMYYYY(new Date()),
      favorite: false
    };

    chrome.storage.local.get({ links: [] }, (res) => {
      const links = Array.isArray(res.links) ? res.links : [];
      links.unshift(item); // newest-first
      chrome.storage.local.set({ links }, () => {
        console.log("Saved item:", item);
        // 更新角标
        updateBadge();
      });
    });
  } catch (err) {
    console.error("contextMenus.onClicked error:", err);
  }
});
