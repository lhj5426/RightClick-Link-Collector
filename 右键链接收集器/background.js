// background.js - create context menu for link + page; save items with metadata
importScripts('db.js');

let lastRightClickCache = null;

function isExHentaiGalleryUrl(url) {
  return /^https?:\/\/exhentai\.org\/g\/[^/]+\/[^/]+\/?$/i.test(String(url || '').trim());
}

function normalizePageCount(value) {
  const text = String(value || '').trim();
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function isPageCountLabelText(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  const compact = raw.replace(/\s+/g, '').replace(/[:\uFF1A]/g, '').toLowerCase();
  return compact.includes('\u9875\u6570') || compact.includes('pages') || compact.includes('page') || compact.includes('length');
}

function looksLikePageCountValue(value) {
  const text = String(value || '').trim().toLowerCase();
  return /\d+/.test(text) && (/[\u9875\u9801]/.test(text) || text.includes('pages') || text.includes('page'));
}

function extractExHentaiPageCountFromHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const rows = Array.from(doc.querySelectorAll('tr'));
  for (const row of rows) {
    const labelCell = row.querySelector('td.gdt1');
    const valueCell = row.querySelector('td.gdt2');
    const labelText = labelCell?.textContent || '';
    const valueText = valueCell?.textContent || '';
    if (!labelText || !valueCell) continue;
    if (isPageCountLabelText(labelText) || looksLikePageCountValue(valueText)) {
      return normalizePageCount(valueText);
    }
  }
  return null;
}

async function fetchExHentaiPageCount(url) {
  if (!isExHentaiGalleryUrl(url)) return null;
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    });
    if (!response.ok) return null;
    const html = await response.text();
    return extractExHentaiPageCountFromHtml(html);
  } catch (err) {
    console.warn('璇诲彇 ExHentai 椤垫暟澶辫触:', err);
    return null;
  }
}

// 榛樿娌℃湁鍒嗙粍锛岀敤鎴疯嚜宸卞垱寤?
const DEFAULT_GROUPS = [];
let menuCreationInProgress = false; // 闃叉骞跺彂鍒涘缓鑿滃崟

function createContextMenus() {
  // 濡傛灉宸茬粡鍦ㄥ垱寤鸿彍鍗曪紝灏辫烦杩囪繖娆¤姹?
  if (menuCreationInProgress) {
    console.log("鑿滃崟鍒涘缓宸插湪杩涜涓紝璺宠繃鏈璇锋眰");
    return;
  }
  
  menuCreationInProgress = true;
  
  // 鍏堝垹闄ゆ墍鏈夎彍鍗曪紝绛夊緟瀹屾垚鍚庡啀鍒涘缓
  chrome.contextMenus.removeAll(() => {
    setTimeout(() => {
      chrome.storage.local.get({ groups: DEFAULT_GROUPS }, (res) => {
        const groups = Array.isArray(res.groups) ? res.groups : DEFAULT_GROUPS;
        
        console.log("鍒涘缓鍙抽敭鑿滃崟锛屽綋鍓嶅垎缁勬暟閲?", groups.length);
        
        if (groups.length === 0) {
          // 娌℃湁鍒嗙粍鏃讹紝鐩存帴淇濆瓨鍒板叏灞€
          chrome.contextMenus.create({
            id: "saveLink_global",
            title: "\u0030-\u4fdd\u5b58\u94fe\u63a5\u5230\u6536\u96c6\u5668",
            contexts: ["link"]
          });
          
          chrome.contextMenus.create({
            id: "savePage_global",
            title: "\u0030-\u4fdd\u5b58\u5f53\u524d\u9875\u9762\u5230\u6536\u96c6\u5668",
            contexts: ["page"]
          });
          
          console.log("鍒涘缓浜嗙畝鍗曡彍鍗曪紙鏃犲垎缁勶級");
        } else {
          // 鏈夊垎缁勬椂锛屾樉绀哄瓙鑿滃崟
          chrome.contextMenus.create({
            id: "saveLinkParent",
            title: "\u0030-\u4fdd\u5b58\u94fe\u63a5\u5230\u6536\u96c6\u5668",
            contexts: ["link"]
          });
          
          // 鍏ㄥ眬閫夐」锛堜笉灞炰簬浠讳綍鍒嗙粍锛?
          chrome.contextMenus.create({
            id: "saveLink_global",
            parentId: "saveLinkParent",
            title: "\u5168\u5c40\uff08\u65e0\u5206\u7ec4\uff09",
            contexts: ["link"]
          });
          
          // 涓烘瘡涓垎缁勫垱寤哄瓙鑿滃崟椤?
          groups.forEach((group, index) => {
            console.log(`鍒涘缓鍒嗙粍鑿滃崟 ${index + 1}:`, group.name);
            chrome.contextMenus.create({
              id: `saveLink_${group.id}`,
              parentId: "saveLinkParent",
              title: group.name,
              contexts: ["link"]
            });
          });
          

          // 淇濆瓨椤甸潰鐨勭埗鑿滃崟
          chrome.contextMenus.create({
            id: "savePageParent",
            title: "\u0030-\u4fdd\u5b58\u5f53\u524d\u9875\u9762\u5230\u6536\u96c6\u5668",
            contexts: ["page"]
          });
          
          // 鍏ㄥ眬閫夐」
          chrome.contextMenus.create({
            id: "savePage_global",
            parentId: "savePageParent",
            title: "\u5168\u5c40\uff08\u65e0\u5206\u7ec4\uff09",
            contexts: ["page"]
          });
          
          // 涓烘瘡涓垎缁勫垱寤哄瓙鑿滃崟椤?
          groups.forEach(group => {
            chrome.contextMenus.create({
              id: `savePage_${group.id}`,
              parentId: "savePageParent",
              title: group.name,
              contexts: ["page"]
            });
          });
          

          console.log(`鍒涘缓浜嗗甫鍒嗙粍鐨勮彍鍗曪紙${groups.length} 涓垎缁勶級`);
        }
        
        menuCreationInProgress = false;
      });
    }, 100);
  });
}

createContextMenus();
chrome.runtime.onInstalled.addListener(createContextMenus);
chrome.runtime.onStartup.addListener(createContextMenus);

// 鐩戝惉鏉ヨ嚜绠＄悊椤甸潰鐨勬秷鎭紝鏇存柊鑿滃崟
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateContextMenus') {
    createContextMenus();
    sendResponse({ success: true });
  } else if (message.action === 'recordRightClick') {
    lastRightClickCache = {
      ...(message.coords || {}),
      tabId: sender.tab?.id || null,
      frameId: sender.frameId ?? 0
    };
    chrome.storage.local.set({ lastRightClick: lastRightClickCache });
    sendResponse({ success: true });
  }
  return true;
});

// 鐐瑰嚮宸ュ叿鏍忓浘鏍囨墦寮€绠＄悊椤甸潰
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

// 鏇存柊瑙掓爣
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

// 鐩戝惉瀛樺偍鍙樺寲鑷姩鏇存柊瑙掓爣锛堣В鍐抽潤榛樹笉鏄剧ず鐨勯棶棰橈級
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.links) {
    updateBadge();
  }
});

// 鍚姩鏃舵洿鏂拌鏍?
chrome.runtime.onStartup.addListener(updateBadge);

// 瀹夎鏃舵洿鏂拌鏍?
chrome.runtime.onInstalled.addListener(() => {
  updateBadge();
  // 鍒濆鍖栫┖鍒嗙粍鍒楄〃
  chrome.storage.local.get({ groups: null }, (res) => {
    if (!res.groups) {
      chrome.storage.local.set({ groups: DEFAULT_GROUPS });
    }
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    const menuId = info.menuItemId;
    

    
    // 瑙ｆ瀽鑿滃崟ID鑾峰彇鍒嗙粍ID
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
    const shouldExtractExHentaiPageCount = isExHentaiGalleryUrl(savedUrl);

    // 鑾峰彇鍒嗙粍鍚嶇О鍜岄鑹诧紙鐙珛鑾峰彇锛岀‘淇濅笉褰卞搷淇濆瓨娴佺▼锛?
    let groupName = "\u5168\u5c40\uff08\u65e0\u5206\u7ec4\uff09";
    let groupColor = "#ebf8ff"; // 榛樿娣¤摑鑹茶儗鏅?
    let groupTextColor = "#1967d2"; // 榛樿鏂囧瓧棰滆壊
    try {
      const storageData = await chromeStorageGet(['groups', 'lastRightClick']);
      const groups = Array.isArray(storageData.groups) ? storageData.groups : [];
      const group = groups.find(g => g.id === groupId);
      if (group) {
        groupName = group.name;
        groupColor = group.color || "#ebf8ff";
        groupTextColor = group.textColor || "#FFFFFF";
      }
      
      // 棰勫厛璇诲彇鍙抽敭浣嶇疆淇℃伅
      const lastClick = lastRightClickCache || storageData.lastRightClick || {};
      const normalizeComparableUrl = (value) => String(value || '').replace(/#.*$/, '');
      const targetLinkUrl = normalizeComparableUrl(info.linkUrl || savedUrl);
      const clickLinkUrl = normalizeComparableUrl(lastClick.linkUrl);
      const tabUrlForCompare = normalizeComparableUrl(tab?.url);
      const clickUrlForCompare = normalizeComparableUrl(lastClick.pageUrl);
      const useLastClick = !!(
        lastClick.time &&
        (Date.now() - lastClick.time < 30000) &&
        (
          (targetLinkUrl && clickLinkUrl && targetLinkUrl === clickLinkUrl) ||
          (
            (!targetLinkUrl || !clickLinkUrl) &&
            (!tabUrlForCompare || !clickUrlForCompare || tabUrlForCompare === clickUrlForCompare)
          )
        )
      );
      
      // 鍗充娇鑴氭湰鎵ц澶辫触涔熶繚鐣欏熀纭€浣嶇疆淇℃伅
      if (useLastClick || info.x !== undefined) {
        item.clickPoint = {
          x: useLastClick ? lastClick.x : (info.x || 0),
          y: useLastClick ? lastClick.y : (info.y || 0),
          viewportW: useLastClick ? (lastClick.viewportW || 0) : 0,
          viewportH: useLastClick ? (lastClick.viewportH || 0) : 0,
          dpr: useLastClick ? (lastClick.dpr || 1) : 1
        };
      }
    } catch (e) {
      console.warn("璇诲彇瀛樺偍淇℃伅澶辫触:", e);
    }

    // === 姝ラ1锛氱嫭绔嬫埅鍙栧揩鐓?===
    let snapshotDataUrl = null;
    if (tab && tab.id) {
      try {
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 });
        if (dataUrl) {
          await DB.saveSnapshot(itemId, dataUrl);
          item.hasSnapshot = true;
          snapshotDataUrl = dataUrl;
          console.log("鉁?蹇収鎴彇鎴愬姛");
        }
      } catch (e) {
        console.warn("鈿狅笍 蹇収鎴彇澶辫触:", e.message);
      }
    }

    // === 姝ラ2锛氱嫭绔嬫墽琛岃剼鏈幏鍙栭〉闈㈡弿杩板拰瑙嗗彛淇℃伅 ===
    if (tab && tab.id) {
      try {
        const scriptResults = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const normalizePageCount = (value) => {
              const text = String(value || '').trim();
              const match = text.match(/(\d+)/);
              return match ? Number(match[1]) : null;
            };
            const isPageCountLabelText = (value) => {
              const raw = String(value || '').trim();
              if (!raw) return false;
              const compact = raw.replace(/\s+/g, '').replace(/[:：]/g, '').toLowerCase();
              return compact.includes('页数') || compact.includes('pages') || compact.includes('page') || compact.includes('length');
            };
            const looksLikePageCountValue = (value) => {
              const text = String(value || '').trim().toLowerCase();
              return /\d+/.test(text) && (text.includes('页') || text.includes('pages') || text.includes('page'));
            };
            const extractPageCountFromDocument = () => {
              const rows = Array.from(document.querySelectorAll('tr'));
              for (const row of rows) {
                const labelCell = row.querySelector('td.gdt1');
                const valueCell = row.querySelector('td.gdt2');
                const labelText = labelCell?.textContent || '';
                const valueText = valueCell?.textContent || '';
                if (!labelText || !valueCell) continue;
                if (isPageCountLabelText(labelText) || looksLikePageCountValue(valueText)) {
                  return normalizePageCount(valueText);
                }
              }
              return null;
            };
            const meta = document.querySelector('meta[name="description"]') || 
                         document.querySelector('meta[property="og:description"]');
            return {
              desc: meta ? meta.getAttribute('content') : "",
              width: window.innerWidth,
              height: window.innerHeight,
              dpr: window.devicePixelRatio,
              pageCount: /^https?:\/\/exhentai\.org\/g\/[^/]+\/[^/]+\/?$/i.test(location.href)
                ? extractPageCountFromDocument()
                : null
            };
          }
        });
        
        if (scriptResults && scriptResults[0] && scriptResults[0].result) {
          const res = scriptResults[0].result;
          item.desc = res.desc || "";
          if (Number.isInteger(res.pageCount) && res.pageCount > 0) {
            item.pageCount = res.pageCount;
          }
          
          // 鐢ㄨ剼鏈幏鍙栫殑瑙嗗彛淇℃伅琛ュ叏 clickPoint
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
          console.log("鉁?椤甸潰淇℃伅鑾峰彇鎴愬姛");
        }
      } catch (e) {
        console.warn("鈿狅笍 鑴氭湰鎵ц澶辫触:", e.message);
      }
    }

    // === 姝ラ3锛氫繚瀛橀摼鎺ワ紙鏈€鍏抽敭锛屽繀椤绘垚鍔燂級 ===
    if (shouldExtractExHentaiPageCount && !Number.isInteger(item.pageCount)) {
      const fetchedPageCount = await fetchExHentaiPageCount(savedUrl);
      if (Number.isInteger(fetchedPageCount) && fetchedPageCount > 0) {
        item.pageCount = fetchedPageCount;
      }
    }

    await saveLinkItem(item, tab?.id, groupName, snapshotDataUrl, groupColor, groupTextColor);
    
  } catch (err) {
    console.error("鉂?contextMenus.onClicked 涓ラ噸閿欒:", err);
    
    // 鏈€缁堝厹搴曪細鍗充娇鍓嶉潰鍑洪敊锛屼篃灏濊瘯浠ユ渶绠€鏂瑰紡淇濆瓨
    try {
      const fallbackItem = {
        id: Date.now(),
        title: String(info.linkText || info.selectionText || "鏈煡"),
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
        console.log("鉁?鍏滃簳淇濆瓨鎴愬姛");
      }
    } catch (fallbackErr) {
      console.error("鉂?鍏滃簳淇濆瓨涔熷け璐?", fallbackErr);
    }
  }
});

// Promise 灏佽 chrome.storage.local.get锛堥伩鍏嶅洖璋?Promise 涓嶄竴鑷撮棶棰橈級
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

// 淇濆瓨閾炬帴鍒板瓨鍌紙Promise 鐗堬紝纭繚鍙 await锛?
function saveLinkItem(item, tabId, groupName = "\u5168\u5c40\uff08\u65e0\u5206\u7ec4\uff09", snapshotDataUrl = null, groupColor = "#ebf8ff", groupTextColor = "#1967d2") {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get({ links: [] }, (res) => {
      if (chrome.runtime.lastError) {
        console.error("璇诲彇閾炬帴鍒楄〃澶辫触:", chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
        return;
      }
      
      const links = Array.isArray(res.links) ? res.links : [];
      links.unshift(item);
      
      chrome.storage.local.set({ links }, () => {
        if (chrome.runtime.lastError) {
          console.error("淇濆瓨閾炬帴澶辫触:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        
        console.log("鉁?閾炬帴宸蹭繚瀛?", item.url.substring(0, 60), "蹇収:", item.hasSnapshot);
        
        // 鍙戦€侀〉闈㈤€氱煡锛堟樉绀哄垎缁勫悕銆佹椂闂淬€佹埅鍥剧姸鎬併€佺缉鐣ュ浘锛?
        if (tabId) {
          // 鑷姩鍏抽棴鏍囩椤甸€昏緫 - 鑾峰彇閰嶇疆骞朵紶閫掔粰 content script
          chrome.storage.local.get({ autoCloseTab: false }, (data) => {
            chrome.tabs.sendMessage(tabId, {
              action: 'showNotification',
              title: item.title,
              url: item.url,
              groupName: groupName,
              groupColor: groupColor, // 浼犻€掑垎缁勯鑹?
              groupTextColor: groupTextColor, // 浼犻€掑垎缁勬枃瀛楅鑹?
              date: item.date,
              hasSnapshot: item.hasSnapshot,
              snapshotDataUrl: snapshotDataUrl,
              clickPoint: item.clickPoint || null,
              autoClose: data.autoCloseTab,
              totalCount: links.length // 浼犻€掑綋鍓嶆€绘潯鏁?
            }).catch(() => {
              console.log("鈿狅笍 椤甸潰閫氱煡鍙戦€佸け璐ワ紙鍙兘鏄壒娈婇〉闈級");
            });
          });
        }


        
        resolve();
      });
    });
  });
}

// 鐩戝惉鏉ヨ嚜 content script 鐨勬秷鎭紙渚嬪閫氱煡鎾斁瀹屾瘯鍚庡叧闂爣绛撅級
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'closeTab' && sender.tab) {
    console.log("馃殌 鏀跺埌鍏抽棴鏍囩璇锋眰:", sender.tab.id);
    chrome.tabs.remove(sender.tab.id);
  }
});

