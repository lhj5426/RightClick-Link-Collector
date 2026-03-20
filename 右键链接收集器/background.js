// background.js - create context menu for link + page; save items with metadata
importScripts('db.js');

// 默认没有分组，用户自己创建
const DEFAULT_GROUPS = [];
let menuCreationInProgress = false; // 防止并发创建菜单

function createContextMenus() {
  // 如果已经在创建菜单，就跳过这次请求
  if (menuCreationInProgress) {
    console.log("菜单创建已在进行中，跳过本次请求");
    return;
  }
  
  menuCreationInProgress = true;
  
  // 先删除所有菜单，等待完成后再创建
  chrome.contextMenus.removeAll(() => {
    setTimeout(() => {
      chrome.storage.local.get({ groups: DEFAULT_GROUPS }, (res) => {
        const groups = Array.isArray(res.groups) ? res.groups : DEFAULT_GROUPS;
        
        console.log("创建右键菜单，当前分组数量:", groups.length);
        
        if (groups.length === 0) {
          // 没有分组时，直接保存到全局
          chrome.contextMenus.create({
            id: "saveLink_global",
            title: "05.保存链接到收集器",
            contexts: ["link"]
          });
          
          chrome.contextMenus.create({
            id: "savePage_global",
            title: "05.保存页面到收集器",
            contexts: ["page"]
          });
          
          console.log("创建了简单菜单（无分组）");
        } else {
          // 有分组时，显示子菜单
          chrome.contextMenus.create({
            id: "saveLinkParent",
            title: "05.保存链接到收集器",
            contexts: ["link"]
          });
          
          // 全局选项（不属于任何分组）
          chrome.contextMenus.create({
            id: "saveLink_global",
            parentId: "saveLinkParent",
            title: "全局（无分组）",
            contexts: ["link"]
          });
          
          // 为每个分组创建子菜单项
          groups.forEach((group, index) => {
            console.log(`创建分组菜单 ${index + 1}:`, group.name);
            chrome.contextMenus.create({
              id: `saveLink_${group.id}`,
              parentId: "saveLinkParent",
              title: group.name,
              contexts: ["link"]
            });
          });
          
          // 新建分组选项
          chrome.contextMenus.create({
            id: "saveLink_newGroup",
            parentId: "saveLinkParent",
            title: "+ 新建分组...",
            contexts: ["link"]
          });
          
          // 保存页面的父菜单
          chrome.contextMenus.create({
            id: "savePageParent",
            title: "05.保存页面到收集器",
            contexts: ["page"]
          });
          
          // 全局选项
          chrome.contextMenus.create({
            id: "savePage_global",
            parentId: "savePageParent",
            title: "全局（无分组）",
            contexts: ["page"]
          });
          
          // 为每个分组创建子菜单项
          groups.forEach(group => {
            chrome.contextMenus.create({
              id: `savePage_${group.id}`,
              parentId: "savePageParent",
              title: group.name,
              contexts: ["page"]
            });
          });
          
          // 新建分组选项
          chrome.contextMenus.create({
            id: "savePage_newGroup",
            parentId: "savePageParent",
            title: "+ 新建分组...",
            contexts: ["page"]
          });
          
          console.log(`创建了带分组的菜单（${groups.length} 个分组）`);
        }
        
        menuCreationInProgress = false;
      });
    }, 100);
  });
}

createContextMenus();
chrome.runtime.onInstalled.addListener(createContextMenus);
chrome.runtime.onStartup.addListener(createContextMenus);

// 监听来自管理页面的消息，更新菜单
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateContextMenus') {
    createContextMenus();
    sendResponse({ success: true });
  }
  return true;
});

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
  // 初始化空分组列表
  chrome.storage.local.get({ groups: null }, (res) => {
    if (!res.groups) {
      chrome.storage.local.set({ groups: DEFAULT_GROUPS });
    }
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    const menuId = info.menuItemId;
    
    // 处理新建分组
    if (menuId === "saveLink_newGroup" || menuId === "savePage_newGroup") {
      chrome.tabs.create({ 
        url: chrome.runtime.getURL('manager.html') + '?action=newGroup'
      });
      return;
    }
    
    // 解析菜单ID获取分组ID
    let groupId = null;
    let isSaveLink = false;
    
    if (menuId === 'saveLink_global') {
      groupId = null;
      isSaveLink = true;
    } else if (menuId === 'savePage_global') {
      groupId = null;
      isSaveLink = false;
    } else if (menuId.startsWith('saveLink_')) {
      groupId = menuId.replace('saveLink_', '');
      isSaveLink = true;
    } else if (menuId.startsWith('savePage_')) {
      groupId = menuId.replace('savePage_', '');
      isSaveLink = false;
    } else {
      return;
    }
    
    let savedUrl = "";
    let title = "";
    
    if (isSaveLink) {
      savedUrl = info.linkUrl || "";
      title = info.linkText || tab?.title || savedUrl;
    } else {
      savedUrl = tab?.url || info.pageUrl || "";
      title = tab?.title || savedUrl;
    }

    if (!savedUrl) return;

    let page = "";
    try { page = tab?.url ? new URL(tab.url).hostname : ""; } catch (e) { page = ""; }

    const itemId = Date.now();
    const item = {
      id: itemId,
      title: String(title),
      url: String(savedUrl),
      page,
      date: formatDateDDMMYYYY(new Date()),
      groupId: groupId,
      favorite: false,
      desc: "" // 初始化描述
    };

    // 尝试抓取快照和描述
    if (tab && tab.id) {
      try {
        // 抓取快照 (DataURL)
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 });
        if (dataUrl) {
          await DB.saveSnapshot(itemId, dataUrl);
          item.hasSnapshot = true;
        }

        // 获取窗口信息和描述
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const meta = document.querySelector('meta[name="description"]') || 
                         document.querySelector('meta[property="og:description"]');
            return {
              desc: meta ? meta.getAttribute('content') : "",
              width: window.innerWidth,
              height: window.innerHeight,
              dpr: window.devicePixelRatio
            };
          }
        });

        if (results && results[0] && results[0].result) {
          const res = results[0].result;
          item.desc = res.desc;

          // 获取最后一次右键位置
          chrome.storage.local.get(['lastRightClick'], (data) => {
            const lastClick = data.lastRightClick || {};
            // 如果时间太久（超过10秒），可能不是同一次右键，则回退到 info.x/y
            const useLastClick = lastClick.time && (Date.now() - lastClick.time < 10000);
            
            item.clickPoint = {
              x: useLastClick ? lastClick.x : info.x,
              y: useLastClick ? lastClick.y : info.y,
              viewportW: res.width,
              viewportH: res.height,
              dpr: res.dpr
            };
            
            saveLinkItem(item);
          });
          return;
        }
      } catch (e) {
        console.warn("抓取快照或描述失败:", e);
      }
    }
    saveLinkItem(item);
  } catch (err) {
    console.error("contextMenus.onClicked error:", err);
  }
});

function saveLinkItem(item) {
  chrome.storage.local.get({ links: [] }, (res) => {
    const links = Array.isArray(res.links) ? res.links : [];
    links.unshift(item);
    
    // 更新角标
    const count = links.length;
    if (count > 0) {
      chrome.action.setBadgeText({ text: String(Math.min(999, count)) });
      chrome.action.setBadgeBackgroundColor({ color: '#2196F3' });
    }
    
    chrome.storage.local.set({ links }, () => {
      console.log("已保存项目并包含快照:", item.hasSnapshot);
    });
  });
}
