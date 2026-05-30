// background.js - create context menu for link + page; save items with metadata
const extensionApi = globalThis.browser || globalThis.chrome;

if (typeof importScripts === 'function') {
  importScripts('db.js');
}

let lastRightClickCache = null;

function isGalleryUrlWithPageCount(url) {
  return /^https?:\/\/(?:exhentai|e-hentai)\.org\/g\/[^/]+\/[^/]+\/?$/i.test(String(url || '').trim());
}

function normalizePageCount(value) {
  const text = String(value || '').trim();
  const match = text.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function normalizeGalleryTagText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeGalleryTagLabel(value) {
  return normalizeGalleryTagText(value).replace(/[:：]\s*$/, '');
}

function stripGalleryTagDecoration(node) {
  if (!node) return '';
  const clone = node.cloneNode(true);
  if (typeof clone.querySelectorAll === 'function') {
    clone.querySelectorAll('img, svg, [ehs-emoji], .ehs-emoji').forEach((el) => el.remove());
  }
  return normalizeGalleryTagText(clone.textContent || '');
}

function getGalleryTagStyle(label) {
  const normalizedLabel = normalizeGalleryTagLabel(label);
  const compactLabel = normalizedLabel.replace(/\s+/g, '').toLowerCase();
  const styleMap = {
    language: { color: '#2e7d32', textColor: '#ffffff' },
    语言: { color: '#2e7d32', textColor: '#ffffff' },
    parody: { color: '#6d4c41', textColor: '#ffffff' },
    原作: { color: '#6d4c41', textColor: '#ffffff' },
    artist: { color: '#1565c0', textColor: '#ffffff' },
    艺术家: { color: '#1565c0', textColor: '#ffffff' },
    female: { color: '#c2185b', textColor: '#ffffff' },
    女性: { color: '#c2185b', textColor: '#ffffff' },
    male: { color: '#00838f', textColor: '#ffffff' },
    男性: { color: '#00838f', textColor: '#ffffff' },
    other: { color: '#5d4037', textColor: '#ffffff' },
    其他: { color: '#5d4037', textColor: '#ffffff' },
    group: { color: '#7b1fa2', textColor: '#ffffff' },
    混合: { color: '#7b1fa2', textColor: '#ffffff' },
    character: { color: '#ef6c00', textColor: '#ffffff' },
    角色: { color: '#ef6c00', textColor: '#ffffff' },
    cosplayer: { color: '#6a1b9a', textColor: '#ffffff' },
    同人志作者: { color: '#6a1b9a', textColor: '#ffffff' },
    reclass: { color: '#455a64', textColor: '#ffffff' },
    重新分类: { color: '#455a64', textColor: '#ffffff' }
  };

  return styleMap[compactLabel] || styleMap[normalizedLabel] || { color: '#546e7a', textColor: '#ffffff' };
}

function formatGalleryTagText(label, tagText) {
  const finalLabel = normalizeGalleryTagLabel(label);
  const finalTagText = normalizeGalleryTagText(tagText);
  if (!finalTagText) return '';
  return finalLabel ? `${finalLabel}: ${finalTagText}` : finalTagText;
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

function extractGalleryPageCountFromHtml(html) {
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

function extractGalleryTagsFromHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const tagRoot = doc.querySelector('#taglist') || doc.querySelector('table');
  if (!tagRoot) return [];

  const tags = [];
  const seen = new Set();
  const rows = Array.from(tagRoot.querySelectorAll('tr'));

  rows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) return;

    const label = normalizeGalleryTagLabel(cells[0].innerText || cells[0].textContent || '');
    if (!label) return;

    const style = getGalleryTagStyle(label);
    const anchors = Array.from(cells[1].querySelectorAll('a[href*="/tag/"]'));
    anchors.forEach((anchor) => {
      const rawHref = anchor.getAttribute('href') || '';
      const visibleText = stripGalleryTagDecoration(anchor) || normalizeGalleryTagText(anchor.getAttribute('ehs-tag') || '');
      const dedupeKey = rawHref || `${label}::${visibleText}`;
      const tagText = formatGalleryTagText(label, visibleText);
      if (!tagText || seen.has(dedupeKey)) return;

      seen.add(dedupeKey);
      tags.push({
        text: tagText,
        color: style.color,
        textColor: style.textColor
      });
    });
  });

  return tags;
}

function buildGalleryTagsFromRecords(records) {
  if (!Array.isArray(records) || records.length === 0) return [];

  return records
    .map((record) => {
      const label = normalizeGalleryTagLabel(record?.label);
      const tagText = formatGalleryTagText(label, record?.text);
      if (!tagText) return null;

      const style = getGalleryTagStyle(label);
      return {
        text: tagText,
        color: style.color,
        textColor: style.textColor
      };
    })
    .filter(Boolean);
}

function mergeTagItems(existingTags, incomingTags) {
  const merged = [];
  const seen = new Set();

  [...(Array.isArray(existingTags) ? existingTags : []), ...(Array.isArray(incomingTags) ? incomingTags : [])].forEach((tag) => {
    const text = normalizeGalleryTagText(tag?.text);
    if (!text || seen.has(text)) return;

    seen.add(text);
    merged.push({
      text,
      color: tag?.color || '#546e7a',
      textColor: tag?.textColor || '#ffffff'
    });
  });

  return merged;
}

async function fetchGalleryMetadata(url) {
  if (!isGalleryUrlWithPageCount(url)) return null;
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    });
    if (!response.ok) return null;
    const html = await response.text();
    return {
      pageCount: extractGalleryPageCountFromHtml(html),
      tags: extractGalleryTagsFromHtml(html)
    };
  } catch (err) {
    console.warn('Failed to read gallery metadata:', err);
    return null;
  }
}

// 默认没有分组，用户自行创建
const DEFAULT_GROUPS = [];
let menuCreationInProgress = false; // 防止并发创建菜单

function createContextMenus() {
  // 如果已经在创建菜单，跳过这次请求
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
            title: "\u0030-\u4fdd\u5b58\u94fe\u63a5\u5230\u6536\u96c6\u5668",
            contexts: ["link"]
          });
          
          chrome.contextMenus.create({
            id: "savePage_global",
            title: "\u0030-\u4fdd\u5b58\u5f53\u524d\u9875\u9762\u5230\u6536\u96c6\u5668",
            contexts: ["page"]
          });
          
          console.log("创建了简单菜单（无分组）");
        } else {
          // 有分组时，显示子菜单
          chrome.contextMenus.create({
            id: "saveLinkParent",
            title: "\u0030-\u4fdd\u5b58\u94fe\u63a5\u5230\u6536\u96c6\u5668",
            contexts: ["link"]
          });
          
          // 全局选项（不属于任何分组）
          chrome.contextMenus.create({
            id: "saveLink_global",
            parentId: "saveLinkParent",
            title: "\u5168\u5c40\uff08\u65e0\u5206\u7ec4\uff09",
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

// 监听存储变化，自动更新角标
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
    

    
    // 解析菜单 ID 获取分组 ID
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
    const shouldExtractGalleryPageCount = isGalleryUrlWithPageCount(savedUrl);

    // 获取分组名称和颜色，独立读取以免影响保存流程
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
      
      // 预先读取右键位置信息
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
      
      if (useLastClick) {
        const lastClickPoint = createPartialClickPoint(lastClick);
        if (lastClickPoint) {
          item.clickPoint = lastClickPoint;
        }
      }
    } catch (e) {
      console.warn("读取存储信息失败:", e);
    }

    // === 步骤 1：独立截取快照 ===
    let snapshotDataUrl = null;
    if (tab && tab.id) {
      try {
        const dataUrl = await captureVisibleTabCompat(tab.windowId, { format: 'jpeg', quality: 80 });
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

    // === 步骤 2：独立执行脚本获取页面信息 ===
    if (tab && tab.id) {
      try {
        const scriptResults = await executeScriptCompat({
          target: { tabId: tab.id },
          func: () => {
            const normalizeGalleryTagText = (value) => String(value || '').replace(/\s+/g, ' ').trim();
            const normalizeGalleryTagLabel = (value) => normalizeGalleryTagText(value).replace(/[:：]\s*$/, '');
            const stripGalleryTagDecoration = (node) => {
              if (!node) return '';
              const clone = node.cloneNode(true);
              clone.querySelectorAll('img, svg, [ehs-emoji], .ehs-emoji').forEach((el) => el.remove());
              return normalizeGalleryTagText(clone.textContent || '');
            };
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
            const extractGalleryTagRecords = () => {
              const tagRoot = document.querySelector('#taglist') || document.querySelector('table');
              if (!tagRoot) return [];

              const records = [];
              const seen = new Set();
              const rows = Array.from(tagRoot.querySelectorAll('tr'));

              rows.forEach((row) => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 2) return;

                const label = normalizeGalleryTagLabel(cells[0].innerText || cells[0].textContent || '');
                if (!label) return;

                const anchors = Array.from(cells[1].querySelectorAll('a[href*="/tag/"]'));
                anchors.forEach((anchor) => {
                  const text = stripGalleryTagDecoration(anchor) || normalizeGalleryTagText(anchor.getAttribute('ehs-tag') || '');
                  const href = anchor.getAttribute('href') || '';
                  const key = href || `${label}::${text}`;
                  if (!text || seen.has(key)) return;

                  seen.add(key);
                  records.push({ label, text });
                });
              });

              return records;
            };
            const meta = document.querySelector('meta[name="description"]') || 
                         document.querySelector('meta[property="og:description"]');
            return {
              desc: meta ? meta.getAttribute('content') : "",
              width: window.innerWidth,
              height: window.innerHeight,
              dpr: window.devicePixelRatio,
              galleryTagRecords: extractGalleryTagRecords(),
              pageCount: /^https?:\/\/(?:exhentai|e-hentai)\.org\/g\/[^/]+\/[^/]+\/?$/i.test(location.href)
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
          if (Array.isArray(res.galleryTagRecords) && res.galleryTagRecords.length > 0) {
            item.tags = mergeTagItems(item.tags, buildGalleryTagsFromRecords(res.galleryTagRecords));
          }
          
          if (item.clickPoint) {
            item.clickPoint = finalizeClickPoint(item.clickPoint, res);
          } else {
            item.clickPoint = createClickPointFromMenuInfo(info, res);
          }
          console.log("✅ 页面信息获取成功");
        }
      } catch (e) {
        console.warn("⚠️ 脚本执行失败:", e.message);
      }
    }

    // === 步骤 3：保存链接（最关键，必须成功） ===
    if (shouldExtractGalleryPageCount && (!Number.isInteger(item.pageCount) || !Array.isArray(item.tags) || item.tags.length === 0)) {
      const fetchedMetadata = await fetchGalleryMetadata(savedUrl);
      if (fetchedMetadata) {
        if (Number.isInteger(fetchedMetadata.pageCount) && fetchedMetadata.pageCount > 0 && !Number.isInteger(item.pageCount)) {
          item.pageCount = fetchedMetadata.pageCount;
        }
        if ((!Array.isArray(item.tags) || item.tags.length === 0) && Array.isArray(fetchedMetadata.tags) && fetchedMetadata.tags.length > 0) {
          item.tags = mergeTagItems(item.tags, fetchedMetadata.tags);
        }
      }
    }

    item.clickPoint = finalizeClickPoint(item.clickPoint);

    await saveLinkItem(item, tab?.id, groupName, snapshotDataUrl, groupColor, groupTextColor, tab?.url);
    
  } catch (err) {
    console.error("❌ contextMenus.onClicked 严重错误:", err);
    
    // 最终兜底：即使前面出错，也尝试以最简单方式保存
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

function toFiniteNumber(value) {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function createPartialClickPoint(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;

  const x = toFiniteNumber(candidate.x);
  const y = toFiniteNumber(candidate.y);
  if (x === null || y === null) return null;

  const viewportW = toFiniteNumber(candidate.viewportW);
  const viewportH = toFiniteNumber(candidate.viewportH);
  const dpr = toFiniteNumber(candidate.dpr);

  return {
    x,
    y,
    viewportW: viewportW && viewportW > 0 ? viewportW : 0,
    viewportH: viewportH && viewportH > 0 ? viewportH : 0,
    dpr: dpr && dpr > 0 ? dpr : 1
  };
}

function createClickPointFromMenuInfo(info, viewportInfo) {
  const x = toFiniteNumber(info?.x);
  const y = toFiniteNumber(info?.y);
  const viewportW = toFiniteNumber(viewportInfo?.width ?? viewportInfo?.viewportW);
  const viewportH = toFiniteNumber(viewportInfo?.height ?? viewportInfo?.viewportH);
  const dpr = toFiniteNumber(viewportInfo?.dpr);

  if (x === null || y === null) return null;
  if (viewportW === null || viewportW <= 0 || viewportH === null || viewportH <= 0) return null;

  return {
    x,
    y,
    viewportW,
    viewportH,
    dpr: dpr && dpr > 0 ? dpr : 1
  };
}

function finalizeClickPoint(candidate, viewportInfo) {
  const point = createPartialClickPoint(candidate);
  if (!point) return null;

  const viewportW = toFiniteNumber(viewportInfo?.width ?? viewportInfo?.viewportW ?? point.viewportW);
  const viewportH = toFiniteNumber(viewportInfo?.height ?? viewportInfo?.viewportH ?? point.viewportH);
  const dpr = toFiniteNumber(viewportInfo?.dpr ?? point.dpr);

  if (viewportW === null || viewportW <= 0 || viewportH === null || viewportH <= 0) return null;

  return {
    x: point.x,
    y: point.y,
    viewportW,
    viewportH,
    dpr: dpr && dpr > 0 ? dpr : 1
  };
}

function isInjectablePageUrl(url) {
  return /^(https?|file):/i.test(String(url || '').trim());
}

function captureVisibleTabCompat(windowId, options) {
  return extensionApi.tabs.captureVisibleTab(windowId, options);
}

function executeScriptCompat(options) {
  return extensionApi.scripting.executeScript(options);
}

function sendMessageCompat(tabId, payload) {
  return extensionApi.tabs.sendMessage(tabId, payload);
}

async function sendNotificationToTab(tabId, tabUrl, payload) {
  if (!tabId) return false;

  try {
    await sendMessageCompat(tabId, payload);
    return true;
  } catch (error) {
    const message = String(error?.message || error || '');
    console.warn("页面通知发送失败:", message);

    if (!message.includes('Receiving end does not exist') || !isInjectablePageUrl(tabUrl)) {
      return false;
    }

    try {
      await executeScriptCompat({
        target: { tabId },
        files: ['content.js']
      });
      await sendMessageCompat(tabId, payload);
      console.log("页面通知重试发送成功");
      return true;
    } catch (retryError) {
      console.warn("页面通知重试失败:", retryError?.message || retryError);
      return false;
    }
  }
}

// 保存链接到存储，Promise 版，确保可被 await
function saveLinkItem(item, tabId, groupName = "\u5168\u5c40\uff08\u65e0\u5206\u7ec4\uff09", snapshotDataUrl = null, groupColor = "#ebf8ff", groupTextColor = "#1967d2", tabUrl = "") {
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
        
        console.log("✅ 链接已保存", item.url.substring(0, 60), "快照:", item.hasSnapshot);
        
        // 发送页面通知，显示分组名、时间、截图状态和缩略图
        if (tabId) {
          // 自动关闭标签页逻辑：获取配置并传递给 content script
          chrome.storage.local.get({ autoCloseTab: false, globalAutoCloseTab: false, autoCloseTabMode: 'global', groups: [], toastDurationSeconds: 3 }, async (data) => {
            const autoCloseMode = data.autoCloseTabMode === 'group' ? 'group' : 'global';
            const currentGroup = Array.isArray(data.groups) ? data.groups.find(g => g.id === item.groupId) : null;
            const autoClose = autoCloseMode === 'group'
              ? (item.groupId ? !!currentGroup?.autoCloseTab : !!data.globalAutoCloseTab)
              : !!data.autoCloseTab;
            const notificationPayload = {
              action: 'showNotification',
              title: item.title,
              url: item.url,
              groupName: groupName,
              groupColor: groupColor, // 传递分组颜色
              groupTextColor: groupTextColor, // 传递分组文字颜色
              date: item.date,
              hasSnapshot: item.hasSnapshot,
              snapshotDataUrl: snapshotDataUrl,
              clickPoint: item.clickPoint || null,
              autoClose: autoClose,
              toastDurationSeconds: Math.min(5, Math.max(1, Number(data.toastDurationSeconds) || 3)),
              totalCount: links.length // 传递当前总条数
            };
            await sendNotificationToTab(tabId, tabUrl, notificationPayload);
            resolve();
          });
          return;
        }


        
        resolve();
      });
    });
  });
}

// 监听来自 content script 的消息，例如通知播放完毕后关闭标签
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'closeTab' && sender.tab) {
    console.log("🚀 收到关闭标签请求:", sender.tab.id);
    chrome.tabs.remove(sender.tab.id);
  }
});

