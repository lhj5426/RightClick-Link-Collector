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

// 监听存储变化自动更新角标（解决静默不显示的问题）
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.links) {
    updateBadge();
  }
});

// 启动时更新角标
chrome.runtime.onStartup.addListener(updateBadge);

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
      desc: "",
      hasSnapshot: false
    };

    // 获取分组名称和颜色（独立获取，确保不影响保存流程）
    let groupName = "全局（无分组）";
    let groupColor = "#ebf8ff"; // 默认淡蓝色背景
    try {
      const storageData = await chromeStorageGet(['groups', 'lastRightClick']);
      const groups = Array.isArray(storageData.groups) ? storageData.groups : [];
      const group = groups.find(g => g.id === groupId);
      if (group) {
        groupName = group.name;
        groupColor = group.color || "#ebf8ff";
      }
      
      // 预先读取右键位置信息
      const lastClick = storageData.lastRightClick || {};
      const useLastClick = lastClick.time && (Date.now() - lastClick.time < 30000);
      
      // 即使脚本执行失败也保留基础位置信息
      if (useLastClick || info.x !== undefined) {
        item.clickPoint = {
          x: useLastClick ? lastClick.x : (info.x || 0),
          y: useLastClick ? lastClick.y : (info.y || 0),
          viewportW: 0,
          viewportH: 0,
          dpr: 1
        };
      }
    } catch (e) {
      console.warn("读取存储信息失败:", e);
    }

    // === 步骤1：独立截取快照 ===
    let snapshotDataUrl = null;
    if (tab && tab.id) {
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 });
        if (dataUrl) {
          await DB.saveSnapshot(itemId, dataUrl);
          item.hasSnapshot = true;
          snapshotDataUrl = dataUrl;
          console.log("✅ 快照截取成功");
        }
      } catch (e) {
        console.warn("⚠️ 快照截取失败:", e.message);
      }
    }

    // === 步骤2：独立执行脚本获取页面描述和视口信息 ===
    if (tab && tab.id) {
      try {
        const scriptResults = await chrome.scripting.executeScript({
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
        
        if (scriptResults && scriptResults[0] && scriptResults[0].result) {
          const res = scriptResults[0].result;
          item.desc = res.desc || "";
          
          // 用脚本获取的视口信息补全 clickPoint
          if (item.clickPoint) {
            item.clickPoint.viewportW = res.width;
            item.clickPoint.viewportH = res.height;
            item.clickPoint.dpr = res.dpr;
          } else {
            item.clickPoint = {
              x: info.x || 0,
              y: info.y || 0,
              viewportW: res.width,
              viewportH: res.height,
              dpr: res.dpr
            };
          }
          console.log("✅ 页面信息获取成功");
        }
      } catch (e) {
        console.warn("⚠️ 脚本执行失败:", e.message);
      }
    }

    // === 步骤3：保存链接（最关键，必须成功） ===
    await saveLinkItem(item, tab?.id, groupName, snapshotDataUrl, groupColor);
    
  } catch (err) {
    console.error("❌ contextMenus.onClicked 严重错误:", err);
    
    // 最终兜底：即使前面出错，也尝试以最简方式保存
    try {
      const fallbackItem = {
        id: Date.now(),
        title: String(info.linkText || info.selectionText || "未知"),
        url: String(info.linkUrl || info.pageUrl || ""),
        page: "",
        date: formatDateDDMMYYYY(new Date()),
        groupId: null,
        favorite: false,
        desc: "",
        hasSnapshot: false
      };
      if (fallbackItem.url) {
        await saveLinkItem(fallbackItem, tab?.id);
        console.log("✅ 兜底保存成功");
      }
    } catch (fallbackErr) {
      console.error("❌ 兜底保存也失败:", fallbackErr);
    }
  }
});

// Promise 封装 chrome.storage.local.get（避免回调/Promise 不一致问题）
function chromeStorageGet(keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result || {});
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

// 保存链接到存储（Promise 版，确保可被 await）
function saveLinkItem(item, tabId, groupName = "全局（无分组）", snapshotDataUrl = null, groupColor = "#ebf8ff") {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get({ links: [] }, (res) => {
      if (chrome.runtime.lastError) {
        console.error("读取链接列表失败:", chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
        return;
      }
      
      const links = Array.isArray(res.links) ? res.links : [];
      links.unshift(item);
      
      chrome.storage.local.set({ links }, () => {
        if (chrome.runtime.lastError) {
          console.error("保存链接失败:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        
        console.log("✅ 链接已保存:", item.url.substring(0, 60), "快照:", item.hasSnapshot);
        
        // 发送页面通知（显示分组名、时间、截图状态、缩略图）
        if (tabId) {
          // 自动关闭标签页逻辑 - 获取配置并传递给 content script
          chrome.storage.local.get({ autoCloseTab: false }, (data) => {
            chrome.tabs.sendMessage(tabId, {
              action: 'showNotification',
              title: item.title,
              url: item.url,
              groupName: groupName,
              groupColor: groupColor, // 传递分组颜色
              date: item.date,
              hasSnapshot: item.hasSnapshot,
              snapshotDataUrl: snapshotDataUrl,
              autoClose: data.autoCloseTab,
              totalCount: links.length // 传递当前总条数
            }).catch(() => {
              console.log("⚠️ 页面通知发送失败（可能是特殊页面）");
            });
          });
        }


        
        resolve();
      });
    });
  });
}

// 监听来自 content script 的消息（例如通知播放完毕后关闭标签）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'closeTab' && sender.tab) {
    console.log("🚀 收到关闭标签请求:", sender.tab.id);
    chrome.tabs.remove(sender.tab.id);
  }
});
