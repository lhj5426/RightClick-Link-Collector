// background.js - create context menu for link + page; save items with metadata
const extensionApi = globalThis.browser || globalThis.chrome;

if (typeof importScripts === 'function') {
  importScripts('db.js');
}

let lastRightClickCache = null;

// 同一毫秒内连续右键保存时 Date.now() 会撞号；链接改存 IndexedDB 后 id 是主键，
// 撞号会直接覆盖上一条。用单调计数器保证 id 唯一且递增，
// 与旧版 unshift「最新在前」的展示语义也保持一致。
let lastItemId = 0;
function nextItemId() {
  const now = Date.now();
  lastItemId = now > lastItemId ? now : lastItemId + 1;
  return lastItemId;
}

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

// ===== 画廊页 HTML 解析（DOM-free）=====
// 以下函数运行在 MV3 service worker 里：worker 没有 DOM，DOMParser/document 一律
// 不存在。旧版直接 new DOMParser()，每次抓取必抛
// 「ReferenceError: DOMParser is not defined」，页数与标签抓取一直静默失败
// （错误被 fetchGalleryMetadata 的 catch 吞掉只剩一条 warn，之前又被 10 秒
// 保存瓶颈盖住，没人发现）。改为正则轻量解析，语义与旧 DOM 版保持一致。

function decodeGalleryHtmlEntities(value) {
  return String(value || '')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&nbsp;/gi, ' ');
}

function galleryCellText(htmlFragment) {
  return decodeGalleryHtmlEntities(String(htmlFragment || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

// 与旧 DOM 版 stripGalleryTagDecoration 等价：先去掉锚点内的图片/emoji 装饰再取文本
function stripGalleryTagDecorationHtml(innerHtml) {
  return String(innerHtml || '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, '')
    .replace(/<([a-z][\w:-]*)\b[^>]*ehs-emoji[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<[^>]*ehs-emoji[^>]*>/gi, '');
}

function extractGalleryPageCountFromHtml(html) {
  const htmlText = String(html || '');
  // e-hentai 画廊信息表：<td class="gdt1">标签</td><td class="gdt2">值</td>
  const rowRe = /<td\b[^>]*class="[^"]*\bgdt1\b[^"]*"[^>]*>([\s\S]*?)<\/td\s*>\s*<td\b[^>]*class="[^"]*\bgdt2\b[^"]*"[^>]*>([\s\S]*?)<\/td\s*>/gi;
  let match;
  while ((match = rowRe.exec(htmlText)) !== null) {
    const labelText = galleryCellText(match[1]);
    const valueText = galleryCellText(match[2]);
    if (!labelText || !valueText) continue;
    if (isPageCountLabelText(labelText) || looksLikePageCountValue(valueText)) {
      return normalizePageCount(valueText);
    }
  }
  return null;
}

function extractGalleryTagsFromHtml(html) {
  const htmlText = String(html || '');
  const tags = [];
  const seen = new Set();
  // taglist 行：<td class="tc">标签名:</td><td>...<a href=".../tag/...">标签</a>...</td>
  // 不限定必须在 #taglist 容器内：用「行内有 /tag/ 锚点 + 首个 td 带 tc 类」定位，
  // 与旧 DOM 版「#taglist 内 tr」的实际效果一致。
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi;
  let rowMatch;
  while ((rowMatch = rowRe.exec(htmlText)) !== null) {
    const rowHtml = rowMatch[1];
    if (!/\/tag\//i.test(rowHtml)) continue;
    const labelMatch = /<td\b[^>]*class="[^"]*\btc\b[^"]*"[^>]*>([\s\S]*?)<\/td\s*>/i.exec(rowHtml);
    if (!labelMatch) continue;
    const label = normalizeGalleryTagLabel(galleryCellText(labelMatch[1]));
    if (!label) continue;
    const style = getGalleryTagStyle(label);
    const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
    let anchorMatch;
    while ((anchorMatch = anchorRe.exec(rowHtml)) !== null) {
      const attrText = anchorMatch[1];
      const hrefMatch = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrText);
      const rawHref = hrefMatch ? (hrefMatch[1] ?? hrefMatch[2] ?? '') : '';
      if (!rawHref.includes('/tag/')) continue;
      const ehsMatch = /\behs-tag\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrText);
      const ehsTag = ehsMatch ? (ehsMatch[1] ?? ehsMatch[2] ?? '') : '';
      const visibleText = galleryCellText(stripGalleryTagDecorationHtml(anchorMatch[2]))
        || normalizeGalleryTagText(decodeGalleryHtmlEntities(ehsTag));
      const dedupeKey = rawHref || `${label}::${visibleText}`;
      const tagText = formatGalleryTagText(label, visibleText);
      if (!tagText || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      tags.push({
        text: tagText,
        color: style.color,
        textColor: style.textColor
      });
    }
  }
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

// 画廊页元数据抓取超时上限。旧实现没有任何超时，一旦这个网络请求卡住，
// 保存流程会一直等下去（并被 MV3 回收 worker 打断）→ 表现就是「右键保存根本不执行」。
const GALLERY_FETCH_TIMEOUT_MS = 8000;

async function fetchGalleryMetadata(url) {
  if (!isGalleryUrlWithPageCount(url)) return null;
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), GALLERY_FETCH_TIMEOUT_MS) : null;
  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
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
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// 默认没有分组，用户自行创建
const DEFAULT_GROUPS = [];
let menuCreationInProgress = false; // 防止并发创建菜单

// === 右键菜单注册状态管理 ===
// 右键菜单由浏览器进程保存，Service Worker 重启后依然存在，因此 **worker 每次启动都不该重建菜单**。
// 旧实现在 background.js 顶层无条件调用 createContextMenus()，而它内部是
// 「removeAll() → setTimeout 100ms → 再 create()」。也就是说从 worker 启动起有 100ms 以上
// 的窗口里菜单是空的；而用户右键菜单在 pointerdown 之后几毫秒就弹出了，
// 恰好落在这个空窗里 → 菜单里没有「保存链接」项 → 表现为「右键保存根本没反应」。
// 另外 content.js 在右键按下时会唤醒 worker，等于每次都精准命中这个竞态。
// 现在只在三种情况下重建：安装/更新、浏览器启动、分组配置真的变了。
const CTX_MENU_READY_KEY = 'ctxMenusRegisteredSignature';
let ctxMenuRegisteredSignature = null; // storage.session 不可用时的内存兜底
let lastUserRightClickAt = 0; // 最近一次用户右键的时间，用于避开菜单弹出瞬间

function getSessionStorageArea() {
  try {
    return (chrome.storage && chrome.storage.session) || null;
  } catch (error) {
    return null;
  }
}

function normalizeMenuGroups(rawGroups) {
  const seenGroupIds = new Set();
  return (Array.isArray(rawGroups) ? rawGroups : DEFAULT_GROUPS).filter(group => {
    const id = String(group?.id ?? '').trim();
    const valid = !!group && typeof group === 'object' && id && id !== 'undefined' && id !== 'null' && !seenGroupIds.has(id);
    if (valid) seenGroupIds.add(id);
    return valid;
  });
}

function computeMenuSignature(groups) {
  return JSON.stringify(normalizeMenuGroups(groups).map(group => [String(group.id), String(group.name ?? '')]));
}

async function readRegisteredMenuSignature() {
  const area = getSessionStorageArea();
  if (!area) return ctxMenuRegisteredSignature;
  try {
    const res = await area.get(CTX_MENU_READY_KEY);
    return res ? (res[CTX_MENU_READY_KEY] ?? null) : null;
  } catch (error) {
    return ctxMenuRegisteredSignature;
  }
}

function markMenusRegistered(signature) {
  ctxMenuRegisteredSignature = signature;
  const area = getSessionStorageArea();
  if (!area) return;
  try {
    area.set({ [CTX_MENU_READY_KEY]: signature });
  } catch (error) {
    // 忽略：内存标记已生效
  }
}

// 用户刚右键过就先等一会儿再重建，绝不在菜单即将弹出/正在显示时拆掉它。
// 注意用进入 syncContextMenus 那一刻的时间判断：扩展刚重载时菜单本来就是空的，
// 必须立刻重建，不能被这次右键误伤。
async function waitForMenuRebuildWindow(clickAt) {
  const MIN_GAP_MS = 2500;
  const elapsed = Date.now() - (clickAt || 0);
  if (elapsed >= MIN_GAP_MS) return;
  await new Promise(resolve => setTimeout(resolve, MIN_GAP_MS - elapsed));
}

// 统一的菜单同步入口：只在配置真的变化时才真正重建
async function syncContextMenus(reason, force = false) {
  if (menuCreationInProgress) return;
  try {
    const clickAtStart = lastUserRightClickAt; // 先采样，避免被随后到达的消息改写
    const res = await chromeStorageGet(['groups']);
    const signature = computeMenuSignature(res.groups);
    const registered = await readRegisteredMenuSignature();
    if (!force && registered === signature) return; // 已按当前配置注册过，绝不重建
    console.log('同步右键菜单:', reason, force ? '(强制)' : '(配置变化)');
    await waitForMenuRebuildWindow(clickAtStart);
    createContextMenus(() => markMenusRegistered(signature));
  } catch (error) {
    console.warn('同步右键菜单失败:', error);
  }
}

function createContextMenus(done) {
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
        const seenGroupIds = new Set();
        const groups = (Array.isArray(res.groups) ? res.groups : DEFAULT_GROUPS)
          .filter(group => {
            const id = String(group?.id ?? '').trim();
            const valid = !!group && typeof group === 'object' && id && id !== 'undefined' && id !== 'null' && !seenGroupIds.has(id);
            if (valid) seenGroupIds.add(id);
            return valid;
          });
        
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
        if (typeof done === 'function') done();
      });
    }, 100);
  });
}

// 浏览器启动 / 扩展安装或更新时才需要真正重建菜单（菜单不跨浏览器会话保留）
chrome.runtime.onInstalled.addListener(() => syncContextMenus('installed', true));
chrome.runtime.onStartup.addListener(() => syncContextMenus('startup', true));
// worker 启动仅做一次廉价的签名比对：分组配置没变化就完全不碰菜单
syncContextMenus('worker-start');

// worker 启动即尝试一次旧版链接迁移（幂等；保存与读取链路里还会各自确保一次）
DB.migrateLegacyLinks();

// 监听来自管理页面的消息，更新菜单
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateContextMenus') {
    // 管理页更新分组后主动要求重建，这里保持强制语义
    syncContextMenus('message', true);
    sendResponse({ success: true });
  } else if (message.action === 'recordRightClick') {
    lastUserRightClickAt = Date.now();
    lastRightClickCache = {
      ...(message.coords || {}),
      tabId: sender.tab?.id || null,
      frameId: sender.frameId ?? 0
    };
    // content.js 已经把 lastRightClick 写进 storage 了，这里不再重复写一次，
    // 省掉每次右键一次多余的存储写入往返。内存缓存优先命中，storage 仅作兜底。
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
function applyBadgeCount(count) {
  const total = Number(count) || 0;
  if (total > 0) {
    chrome.action.setBadgeText({ text: total > 9999 ? '999+' : String(total) });
    chrome.action.setBadgeBackgroundColor({ color: '#2196F3' });
    chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// 角标计数改为读取 IndexedDB 条数（O(1)）。
// 关键顺序：必须先 await 迁移再计数。升级/重启瞬间 links 表可能还是空的，
// 先计数会把角标误设成空文本，而迁移随后才写入、且 storage.links 监听已移除，
// 没有人再补设，角标就永远空着（v3 首发时的 BUG）。
// migrateLegacyLinks 幂等：命中 storage 标记后瞬间返回，正常路径零开销。
function refreshBadgeCount() {
  DB.migrateLegacyLinks()
    .then(() => DB.getLinksCount())
    .then(applyBadgeCount)
    .catch((err) => console.warn('角标计数读取失败:', err));
}

// 启动时更新角标
chrome.runtime.onStartup.addListener(refreshBadgeCount);

// 安装时更新角标
chrome.runtime.onInstalled.addListener(() => {
  refreshBadgeCount();
  // 旧版 links 数据一次性迁移到 IndexedDB（幂等）
  DB.migrateLegacyLinks();
  // 初始化空分组列表
  chrome.storage.local.get({ groups: null }, (res) => {
    if (!res.groups) {
      chrome.storage.local.set({ groups: DEFAULT_GROUPS });
    }
  });
});

// 每次右键保存的耗时拆解，用于定位瓶颈（不需要时把 SAVE_TRACE_ENABLED 置为 false）
const SAVE_TRACE_ENABLED = true;
function createSaveTrace() {
  const startedAt = Date.now();
  let lastAt = startedAt;
  const marks = [];
  return {
    mark(label) {
      const now = Date.now();
      marks.push(`${label} ${now - lastAt}ms`);
      lastAt = now;
    },
    dump(extra) {
      if (!SAVE_TRACE_ENABLED) return;
      console.log(`⏱ 右键保存总耗时 ${Date.now() - startedAt}ms ｜ ${marks.join(' | ')}${extra ? ' ｜ ' + extra : ''}`);
    }
  };
}

// 给可能因渲染进程繁忙而长时间不返回的扩展 API 加超时兜底。
// 多标签场景下 captureVisibleTab / executeScript 可能阻塞数秒甚至数分钟，
// 没有兜底时整个保存链路（以及 worker）都被拖死，表现为右键后毫无反应。
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const err = new Error(label + ' 超时(' + ms + 'ms)');
      err.isTimeout = true;
      reject(err);
    }, ms);
    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

// 保存因超时中止时给用户一个系统级提示（控制台没打开也能看到）
function notifySaveAborted(failedWhat, timeoutMs) {
  try {
    if (chrome.notifications && chrome.notifications.create) {
      chrome.notifications.create('save-aborted-' + Date.now(), {
        type: 'basic',
        iconUrl: 'icon.png',
        title: '右键保存超时，已中止',
        message: failedWhat + '超过 ' + Math.round(timeoutMs / 1000) + ' 秒未响应，本次链接未保存。请重试；反复超时时可先关闭部分标签页减轻系统负载。'
      });
    }
  } catch (e) {
    console.warn('发送超时提示通知失败:', e.message);
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let trace = null;
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

    trace = createSaveTrace();
    console.log('🗡️ 右键保存开始:', isSaveLink ? '链接' : '页面', String(savedUrl).slice(0, 80));

    let page = "";
    try { page = tab?.url ? new URL(tab.url).hostname : ""; } catch (e) { page = ""; }

    const itemId = nextItemId();
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
    // 画廊页元数据抓取是一次完整的网络请求，与截图/页面脚本互不依赖，
    // 因此提前并发发起，把它的耗时隐藏在截图与脚本执行期间。
    const galleryMetadataPromise = shouldExtractGalleryPageCount
      ? fetchGalleryMetadata(savedUrl).catch(() => null)
      : null;

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

    trace.mark('读取分组+右键位置');

    // === 步骤 1+2 并发执行：截图与页面信息互不依赖 ===
    // 多标签场景下 captureVisibleTab / executeScript 可能因渲染进程繁忙而阻塞数秒
    // 甚至数分钟——表现为「右键后控制台毫无输出、页面也没反应，过一会才突然保存」。
    // 两项并发执行直接把关键路径砍掉一半；超时则明确报错并中止本次保存——
    // 截图是扩展主打功能，没图没详情的链接存下来毫无意义，
    // 宁可明确失败让用户重试，也绝不写废数据。
    // 超时预算放宽到 10 秒：正常保存只有几百毫秒，10 秒足以覆盖多标签繁忙时的
    // 缓慢，同时仍能兜住数分钟的异常挂起。
    const SAVE_STEP_TIMEOUT_MS = 10000;
    let snapshotDataUrl = null;
    let snapshotTimedOut = false;
    let pageInfoTimedOut = false;

    const captureStep = (async () => {
      if (!tab || !tab.id) return;
      try {
        const capturePromise = captureVisibleTabCompat(tab.windowId, { format: 'jpeg', quality: 80 });
        const dataUrl = await withTimeout(capturePromise, SAVE_STEP_TIMEOUT_MS, '截图');
        if (dataUrl) {
          await DB.saveSnapshot(itemId, dataUrl);
          item.hasSnapshot = true;
          snapshotDataUrl = dataUrl;
          console.log("✅ 快照截取成功");
        }
      } catch (e) {
        if (e && e.isTimeout) {
          // 超时（渲染进程繁忙挂起）：提示用户并中止保存，不产生没图的废数据
          snapshotTimedOut = true;
          console.error("⛔ 截图超时（" + SAVE_STEP_TIMEOUT_MS + "ms），本次保存将中止");
        } else {
          // 硬错误（如 chrome:// 页面无权截图）：保持原有行为，警告后继续
          console.warn("⚠️ 快照截取失败:", e.message);
        }
      }
    })();

    const pageInfoStep = (async () => {
      if (!tab || !tab.id) return;
      try {
        const scriptPromise = executeScriptCompat({
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
        const scriptResults = await withTimeout(scriptPromise, SAVE_STEP_TIMEOUT_MS, '页面脚本');

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
        if (e && e.isTimeout) {
          // 超时（渲染进程繁忙挂起）：提示用户并中止保存，不产生没详情的废数据
          pageInfoTimedOut = true;
          console.error("⛔ 页面信息获取超时（" + SAVE_STEP_TIMEOUT_MS + "ms），本次保存将中止");
        } else {
          // 硬错误（如页面已关闭、无权注入）：保持原有行为，警告后继续
          console.warn("⚠️ 脚本执行失败:", e.message);
        }
      }
    })();

    await Promise.all([captureStep, pageInfoStep]);
    trace.mark('截图+页面脚本');

    // 超时即中止：截图是主打功能，没图没详情的链接存下来毫无意义，
    // 宁可明确失败让用户重试，也不写废数据。
    // 页面信息超时但截图已成功的场景，快照已写入 IDB，这里一并清掉，不留孤儿数据。
    if (snapshotTimedOut || pageInfoTimedOut) {
      const failedWhat = (snapshotTimedOut && pageInfoTimedOut)
        ? '截图和页面信息'
        : (snapshotTimedOut ? '截图' : '页面信息');
      if (snapshotDataUrl) {
        try {
          await DB.deleteSnapshot(itemId);
        } catch (cleanupErr) {
          console.warn('清理超时残留快照失败:', cleanupErr.message);
        }
      }
      console.error("⛔ " + failedWhat + "超时，本次保存已中止（未保存任何数据），请重试；若反复超时，先关闭部分标签页减轻系统负载再试");
      notifySaveAborted(failedWhat, SAVE_STEP_TIMEOUT_MS);
      trace.dump('中止：' + failedWhat + '超时');
      return;
    }

    // === 步骤 3：保存链接（最关键，必须成功） ===
    if (shouldExtractGalleryPageCount && (!Number.isInteger(item.pageCount) || !Array.isArray(item.tags) || item.tags.length === 0)) {
      // 复用上面提前并发发起的请求；超时或失败都返回 null，不会卡住整个保存
      const fetchedMetadata = galleryMetadataPromise ? await galleryMetadataPromise : null;
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

    trace.mark('画廊元数据');
    await saveLinkItem(item, tab?.id, groupName, snapshotDataUrl, groupColor, groupTextColor, tab?.url);
    trace.mark('写入IDB');
    trace.dump(`链接=${item.url.slice(0, 60)} 快照=${item.hasSnapshot}`);
    
  } catch (err) {
    console.error("❌ contextMenus.onClicked 严重错误:", err);
    if (trace) trace.dump('失败');
    
    // 最终兜底：即使前面出错，也尝试以最简单方式保存
    try {
      const fallbackItem = {
        id: nextItemId(),
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

function sendMessageCompat(tabId, payload, options) {
  return options
    ? extensionApi.tabs.sendMessage(tabId, payload, options)
    : extensionApi.tabs.sendMessage(tabId, payload);
}

// 通知只投递给顶层 frame。
// payload 里带着 300KB 级别的截图 dataURL，而 manifest 的 content_scripts 是 all_frames: true，
// 广播式 sendMessage 会让页面里每一个 iframe 都克隆一份这个字符串，既慢又会出现多个重复弹窗。
const NOTIFICATION_TARGET_OPTIONS = { frameId: 0 };

async function sendNotificationToTab(tabId, tabUrl, payload) {
  if (!tabId) return false;

  try {
    await sendMessageCompat(tabId, payload, NOTIFICATION_TARGET_OPTIONS);
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
      await sendMessageCompat(tabId, payload, NOTIFICATION_TARGET_OPTIONS);
      console.log("页面通知重试发送成功");
      return true;
    } catch (retryError) {
      console.warn("页面通知重试失败:", retryError?.message || retryError);
      return false;
    }
  }
}

// 保存链接到 IndexedDB（单条 put，O(1)），Promise 版，确保可被 await
// v3 起链接本体不再存入 chrome.storage.local：旧实现每次保存都对整份 links
// 数组做「全量读 → unshift → 全量写」，数组涨到 1MB+ 后单次写入超过 10 秒。
async function saveLinkItem(item, tabId, groupName = "\u5168\u5c40\uff08\u65e0\u5206\u7ec4\uff09", snapshotDataUrl = null, groupColor = "#ebf8ff", groupTextColor = "#1967d2", tabUrl = "") {
  const writeStartedAt = Date.now();
  // 确保旧版 storage.links 已完成迁移（幂等，通常瞬间返回）
  await DB.migrateLegacyLinks();
  await DB.saveLink(item);
  console.log(
    "✅ 链接已保存",
    item.url.substring(0, 60),
    "快照:", item.hasSnapshot,
    `｜写入IDB ${Date.now() - writeStartedAt}ms`
  );

  // 角标更新（基于 IDB 计数，O(1)）
  refreshBadgeCount();

  // 发送页面通知，显示分组名、时间、截图状态和缩略图。
  // 链接写入已完成，保存主流程到此结束；页面弹窗属于纯展示，不再阻塞保存结果，
  // 同时降低 MV3 下 worker 在长链路中被回收导致保存丢失的风险。
  if (tabId) {
    // 自动关闭标签页逻辑：获取配置并传递给 content script
    chrome.storage.local.get({ autoCloseTab: false, globalAutoCloseTab: false, autoCloseTabMode: 'global', groups: [], toastDurationSeconds: 3 }, async (data) => {
      const autoCloseMode = data.autoCloseTabMode === 'group' ? 'group' : 'global';
      const currentGroup = Array.isArray(data.groups) ? data.groups.find(g => g.id === item.groupId) : null;
      const autoClose = autoCloseMode === 'group'
        ? (item.groupId ? !!currentGroup?.autoCloseTab : !!data.globalAutoCloseTab)
        : !!data.autoCloseTab;
      let totalCount = 0;
      try {
        totalCount = await DB.getLinksCount();
      } catch (err) {
        // 计数失败不阻塞通知
      }
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
        totalCount // 传递当前总条数
      };
      const notifyStartedAt = Date.now();
      sendNotificationToTab(tabId, tabUrl, notificationPayload)
        .then((sent) => console.log(`📨 页面通知耗时 ${Date.now() - notifyStartedAt}ms 发送成功=${sent}`))
        .catch((err) => console.warn('页面通知异常:', err));
    });
  }
}

// 监听来自 content script 的消息，例如通知播放完毕后关闭标签
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'closeTab' && sender.tab) {
    console.log("🚀 收到关闭标签请求:", sender.tab.id);
    chrome.tabs.remove(sender.tab.id);
  }
});

