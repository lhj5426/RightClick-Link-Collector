/**
 * 多链接收集器 - 管理页面脚本
 */

let allLinks = [];
let allGroups = [];
let themeMode = "auto";
let currentView = localStorage.getItem('currentView') || "all";
let currentDisplayMode = localStorage.getItem('currentDisplayMode') || "card";
let groupsCollapsed = localStorage.getItem('groupsCollapsed') === 'true';
let sortOrder = "oldest"; // "oldest" 旧→新（默认），"newest" 新→旧
let pageSortOrder = "off"; // "off" 不按页数排序, "asc" 少→多, "desc" 多→少
let unvisitedMode = "aggregate"; // "aggregate" 聚合模式, "inGroup" 组内模式
let currentSearchKeywords = []; // 当前搜索的多关键字
let selectedLinkIds = new Set();
const STORAGE_KEY = 'tabSaverVisitedLinks';
const DEFAULT_GROUPS = [];

if (currentView === "thumbGrid") {
  currentView = "all";
  currentDisplayMode = "thumb";
  localStorage.setItem('currentView', currentView);
  localStorage.setItem('currentDisplayMode', currentDisplayMode);
}

document.addEventListener("DOMContentLoaded", () => {
  // 元素
  const linksList = document.getElementById("linksList");
  const emptyState = document.getElementById("emptyState");
  const totalCount = document.getElementById("totalCount");
  const searchInput = document.getElementById("searchInput");
  const copyAllBtn = document.getElementById("copyAllBtn");
  const saveHtmlBtn = document.getElementById("saveHtmlBtn");
  const saveTxtBtn = document.getElementById("saveTxtBtn");
  const clearAllBtn = document.getElementById("clearAllBtn");
  const themeBtn = document.getElementById("themeBtn");
  const viewTabs = document.querySelectorAll(".view-tab");
  const thumbModeBtn = document.querySelector('.view-tab[data-view="thumbGrid"]');
  const toggleGroupsBtn = document.getElementById("toggleGroupsBtn");
  const manageGroupsBtn = document.getElementById("manageGroupsBtn");
  const groupModal = document.getElementById("groupModal");
  const closeGroupModal = document.getElementById("closeGroupModal");
  const groupList = document.getElementById("groupList");
  const newGroupName = document.getElementById("newGroupName");
  const newGroupColor = document.getElementById("newGroupColor");
  const newGroupTextColor = document.getElementById("newGroupTextColor");
  const addGroupBtn = document.getElementById("addGroupBtn");
  const autoCloseTabBtn = document.getElementById("autoCloseTabBtn");
  const groupJumpBtn = document.getElementById("groupJumpBtn");
  const groupJumpCount = document.getElementById("groupJumpCount");
  const groupJumpDropdown = document.getElementById("groupJumpDropdown");
  const groupJumpFloating = document.getElementById("groupJumpFloating");
  const headerExportDataBtn = document.getElementById("exportDataBtn");
  const headerImportDataBtn = document.getElementById("importDataBtn");
  const headerImportFileInput = document.getElementById("importFileInput");

  const headerLeft = document.querySelector(".header-left");
  const toolbarActions = document.querySelector(".toolbar-actions");
  const saveHtmlDropdown = saveHtmlBtn ? saveHtmlBtn.closest(".dropdown") : null;

  if (headerLeft && copyAllBtn && clearAllBtn && saveHtmlDropdown && saveTxtBtn && headerExportDataBtn && headerImportDataBtn) {
    let titleGroup = headerLeft.querySelector(".header-title-group");
    if (!titleGroup) {
      titleGroup = document.createElement("div");
      titleGroup.className = "header-title-group";
      const titleEl = headerLeft.querySelector("h1");
      const statsEl = headerLeft.querySelector(".stats");
      if (titleEl) titleGroup.appendChild(titleEl);
      if (statsEl) titleGroup.appendChild(statsEl);
      headerLeft.prepend(titleGroup);
    }

    let buttonGrid = headerLeft.querySelector(".header-button-grid");
    if (!buttonGrid) {
      buttonGrid = document.createElement("div");
      buttonGrid.className = "header-button-grid";
      headerLeft.appendChild(buttonGrid);
    }

    buttonGrid.appendChild(copyAllBtn);
    buttonGrid.appendChild(headerExportDataBtn);
    buttonGrid.appendChild(headerImportDataBtn);
    buttonGrid.appendChild(clearAllBtn);
    buttonGrid.appendChild(saveHtmlDropdown);
    buttonGrid.appendChild(saveTxtBtn);
    if (headerImportFileInput) {
      buttonGrid.appendChild(headerImportFileInput);
    }

    if (toolbarActions) {
      toolbarActions.querySelectorAll('.dropdown, #saveTxtBtn, #exportDataBtn, #importDataBtn, #importFileInput')
        .forEach(el => {
          if (el && el.parentElement === toolbarActions) {
            el.remove();
          }
        });
    }
  }

  if (saveHtmlBtn) {
    saveHtmlBtn.innerHTML = `保存HTML <span class="caret">▼</span>`;
  }

  copyAllBtn?.classList.add("header-top-action");
  clearAllBtn?.classList.add("header-top-action");
  
  // 工具函数
  function escapeHtml(s) {
    if (!s) return "";
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function isThumbnailMode() {
    return currentDisplayMode === "thumb";
  }

  function getDisplayModeLinks(links) {
    return isThumbnailMode()
      ? links.filter(link => link.hasSnapshot)
      : links;
  }

  function renderLinkCollection(container, links, visited) {
    const displayLinks = getDisplayModeLinks(links);
    if (displayLinks.length === 0) return 0;

    if (isThumbnailMode()) {
      container.classList.add("thumb-grid-host");
    } else {
      container.classList.remove("thumb-grid-host");
    }

    displayLinks.forEach((link, index) => {
      const item = isThumbnailMode()
        ? createThumbnailCard(link, index + 1, visited)
        : createLinkCard(link, index + 1, visited);
      container.appendChild(item);
    });

    return displayLinks.length;
  }

  function getRenderedLinkIds(scope = document) {
    return Array.from(scope.querySelectorAll('.link-card[data-link-id], .thumb-card[data-link-id]'))
      .map(el => Number(el.dataset.linkId))
      .filter(id => Number.isInteger(id));
  }

  function isLinkSelected(linkId) {
    return selectedLinkIds.has(Number(linkId));
  }

  function setLinkSelected(linkId, selected) {
    const id = Number(linkId);
    if (!Number.isInteger(id)) return;
    if (selected) {
      selectedLinkIds.add(id);
    } else {
      selectedLinkIds.delete(id);
    }
  }

  function toggleLinkSelected(linkId) {
    setLinkSelected(linkId, !isLinkSelected(linkId));
  }

  function syncSelectionUI() {
    document.querySelectorAll('.link-card[data-link-id]').forEach(card => {
      const linkId = Number(card.dataset.linkId);
      const checkbox = card.querySelector('.link-checkbox');
      if (checkbox) checkbox.checked = isLinkSelected(linkId);
    });

    document.querySelectorAll('.thumb-card[data-link-id]').forEach(card => {
      const linkId = Number(card.dataset.linkId);
      card.classList.toggle('thumb-card-selected', isLinkSelected(linkId));
      const checkbox = card.querySelector('.thumb-select-checkbox');
      if (checkbox) checkbox.checked = isLinkSelected(linkId);
    });

    document.querySelectorAll('.group-content').forEach(content => {
      updateGroupHeaderCheckbox(content);
    });
  }

  function syncViewTabState() {
    viewTabs.forEach(t => t.classList.remove("active"));

    if (currentView === "byDate") {
      byDateBtn?.classList.add("active");
    } else {
      viewTabs.forEach(t => {
        if (t.dataset.view === currentView) {
          t.classList.add("active");
        }
      });
    }

    if (thumbModeBtn) {
      thumbModeBtn.classList.toggle("active", isThumbnailMode());
      thumbModeBtn.textContent = isThumbnailMode() ? "卡片模式" : "缩略图模式";
      thumbModeBtn.title = isThumbnailMode() ? "点击切换为卡片模式" : "点击切换为缩略图模式";
    }
  }

  function normalizeTagUrl(text) {
    const value = String(text || '').trim();
    if (!value || /\s/.test(value)) return null;

    try {
      const parsed = new URL(value);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href;
      }
    } catch {}

    const bareUrlPattern = /^(?:(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}|localhost|(?:\d{1,3}\.){3}\d{1,3})(?::\d{2,5})?(?:[/?#][^\s]*)?$/i;
    if (!bareUrlPattern.test(value)) return null;

    const hostPart = value.split(/[/?#]/, 1)[0].split(':', 1)[0].toLowerCase();
    const hostLabels = hostPart.split('.').filter(Boolean);
    const lastLabel = hostLabels.length ? hostLabels[hostLabels.length - 1] : '';
    const allowedBareUrlTlds = new Set([
      'com', 'net', 'org', 'cn', 'com.cn', 'net.cn', 'org.cn',
      'cc', 'tv', 'me', 'top', 'vip', 'xyz', 'club', 'site',
      'online', 'shop', 'store', 'app', 'dev', 'io', 'ai', 'co',
      'info', 'pro', 'wiki', 'mobi', 'name', 'biz', 'moe'
    ]);

    if (hostPart !== 'localhost' && !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostPart)) {
      if (hostLabels.length < 2) return null;
      const lastTwoLabels = hostLabels.slice(-2).join('.');
      if (!allowedBareUrlTlds.has(lastLabel) && !allowedBareUrlTlds.has(lastTwoLabels)) {
        return null;
      }
    }

    try {
      return new URL(`https://${value}`).href;
    } catch {
      return null;
    }
  }

  function isTagUrl(text) {
    return !!normalizeTagUrl(text);
  }

  function getTagActionTitle(tagText) {
    return isTagUrl(tagText)
      ? '点击直接打开此网址'
      : '点击过滤带有此标签的条目';
  }

  function handleTagAction(tagText) {
    const value = String(tagText || '').trim();
    if (!value) return;
    const normalizedUrl = normalizeTagUrl(value);
    if (normalizedUrl) {
      window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    filterByKeyword(value);
  }

  function bindTagAction(tagEl) {
    if (!tagEl) return;
    const tagText = tagEl.dataset.tagText || tagEl.textContent;
    tagEl.title = getTagActionTitle(tagText);
    tagEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleTagAction(e.currentTarget.dataset.tagText || e.currentTarget.textContent);
    });
  }
  
  // 搜索关键字高亮
  function highlightText(text, keywords) {
    if (!text) return "";
    if (!keywords || keywords.length === 0) return escapeHtml(String(text));
    
    // 过滤掉空关键词并逃逸正则字符
    const escapedKeywords = keywords
      .filter(k => k.trim().length > 0)
      .map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      
    if (escapedKeywords.length === 0) return escapeHtml(String(text));
    
    const regex = new RegExp(`(${escapedKeywords.join('|')})`, 'gi');
    const parts = String(text).split(regex);
    let result = '';
    
    const lowerKeywords = keywords.map(k => k.toLowerCase());
    
    parts.forEach((part, i) => {
      if (i % 2 === 0) { // 非匹配部分
        result += escapeHtml(part);
      } else { // 匹配部分（通过正则的 group 捕获）
        const lowerPart = part.toLowerCase();
        // 找出它匹配的是第几个关键词，用来分配颜色
        const kwIndex = lowerKeywords.findIndex(k => lowerPart === k);
        const colorClass = `hl-${Math.max(0, kwIndex) % 7}`;
        result += `<mark class="search-highlight ${colorClass}">${escapeHtml(part)}</mark>`;
      }
    });
    
    return result;
  }
  
  // 获取域名
  function getBaseDomain(url) {
    try {
      const hostname = new URL(url).hostname.replace('www.', '');
      const parts = hostname.split('.');
      return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
    } catch { return 'unknown'; }
  }
  
  // 辅助函数: 为分组添加全选逻辑
  function setupGroupSelectAll(header, content) {
    const selectAllCheckbox = header.querySelector('.group-select-all');
    if (!selectAllCheckbox) return;
    
    selectAllCheckbox.addEventListener('click', (e) => {
      e.stopPropagation(); // 防止折叠
      const isChecked = e.target.checked;
      getRenderedLinkIds(content).forEach(linkId => {
        setLinkSelected(linkId, isChecked);
      });
      updateBatchToolbar();
    });
  }

  // 辅助函数: 根据组内复选框状态更新页眉全选框状态
  function updateGroupHeaderCheckbox(content) {
    const section = content.closest('.group-section');
    if (!section) return;
    const header = section.querySelector('.group-header');
    if (!header) return;
    const selectAllCheckbox = header.querySelector('.group-select-all');
    if (!selectAllCheckbox) return;
    
    const linkIds = getRenderedLinkIds(content);
    const checkedCount = linkIds.filter(linkId => isLinkSelected(linkId)).length;
    
    selectAllCheckbox.checked = checkedCount === linkIds.length && linkIds.length > 0;
    selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < linkIds.length;
  }
  
  // 获取访问记录
  function getVisitedLinks() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }
  
  // 记录访问
  function recordVisit(url) {
    const visited = getVisitedLinks();
    const data = visited[url] || { count: 0 };
    data.count++;
    data.lastVisited = new Date().toISOString();
    visited[url] = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visited));
    
    // 不管在哪个视图,都只更新访问信息显示,不重新渲染列表
    updateVisitDisplay(url, data);
  }
  
  // 更新单个链接的访问信息显示
  function updateVisitDisplay(url, data) {
    const linkCards = document.querySelectorAll('.link-card');
    linkCards.forEach(card => {
      const linkEl = card.querySelector('.link-url');
      if (linkEl && linkEl.dataset.url === url) {
        const content = card.querySelector('.link-content');
        
        // 移除旧的访问信息
        const oldVisitInfo = content.querySelector('.link-meta:last-of-type');
        if (oldVisitInfo && oldVisitInfo.querySelector('.link-visits')) {
          oldVisitInfo.remove();
        }
        
        // 添加新的访问信息
        const visitCount = data.count;
        const lastVisited = new Date(data.lastVisited).toLocaleString('zh-CN');
        const visitClass = `visited-${((visitCount - 1) % 7) + 1}`;
        
        const visitInfo = document.createElement('div');
        visitInfo.className = 'link-meta';
        visitInfo.innerHTML = `
          <span class="link-visits ${visitClass}">访问 ${visitCount} 次</span>
          <span class="link-date">上次访问: ${lastVisited}</span>
        `;
        
        const actions = content.querySelector('.link-actions');
        content.insertBefore(visitInfo, actions);
      }
    });
  }
  
  // 加载链接和分组
  function loadLinks() {
    chrome.storage.local.get({ links: [], groups: DEFAULT_GROUPS, autoCloseTab: false }, (res) => {
      allLinks = Array.isArray(res.links) ? res.links : [];
      
      // 迁移旧版 note 到 tags
      let needsSave = false;
      allLinks.forEach(link => {
        if (link.note !== undefined && !link.tags) {
          if (link.note.trim()) {
            link.tags = [{ text: link.note.trim(), color: '#FF9800' }];
          } else {
            link.tags = [];
          }
          delete link.note;
          needsSave = true;
        } else if (!link.tags) {
          link.tags = [];
        }
      });
      if (needsSave) {
        chrome.storage.local.set({ links: allLinks });
      }
      
      allGroups = Array.isArray(res.groups) ? res.groups : DEFAULT_GROUPS;
      if (autoCloseTabBtn) {
        autoCloseTabBtn.checked = res.autoCloseTab;
      }
      renderLinks();
      applyCollapsedState();
      updateCount();
      updateGroupCount();
      // 在数据加载完成后，检查是否有由背景脚本传递的分组操作请求
      checkUrlParams();
    });
  }

  // 检查URL参数，处理特定动作（如右键菜单“新建分组”）
  function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('action') === 'newGroup') {
      groupModal.classList.add("show");
      renderGroupList();
      setTimeout(() => {
        newGroupName.focus();
      }, 200); // 稍微延迟以确保DOM完全渲染后的聚焦稳定
      
      // 清理 URL 参数，防止刷新页面时重复触发弹窗
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }
  
  // 应用折叠状态到所有分组
  function applyCollapsedState() {
    if (groupsCollapsed) {
      const allGroupHeaders = document.querySelectorAll(".group-header");
      const allGroupContents = document.querySelectorAll(".group-content");
      allGroupHeaders.forEach(header => header.classList.add("collapsed"));
      allGroupContents.forEach(content => content.classList.add("collapsed"));
    }
    // 更新按钮文字
    toggleGroupsBtn.textContent = groupsCollapsed ? "📂 展开分组" : "📂 折叠分组";
  }
  
  // 更新计数
  function updateCount() {
    totalCount.textContent = allLinks.length;
    updateGroupCount();
  }
  
  // 更新分组数量显示
  function updateGroupCount() {
    const groupCountDisplay = document.getElementById("groupCountDisplay");
    if (groupCountDisplay) {
      groupCountDisplay.textContent = `当前有${allGroups.length}个分组`;
    }
  }

  let groupJumpTargets = [];

  function updateFloatingToolPositions() {
    if (!groupJumpFloating) return;
    if (window.innerWidth <= 768) {
      groupJumpFloating.style.left = "12px";
      groupJumpFloating.style.top = "";
      groupJumpFloating.style.bottom = "20px";
      return;
    }

    groupJumpFloating.style.left = "20px";
    groupJumpFloating.style.top = "";
    groupJumpFloating.style.bottom = "24px";
  }
  
  function refreshGroupJumpOptions() {
    if (!groupJumpBtn || !groupJumpDropdown) return;
    
    const sections = Array.from(document.querySelectorAll("#linksList .group-section"));
    groupJumpTargets = [];
    groupJumpDropdown.innerHTML = "";
    if (groupJumpCount) {
      groupJumpCount.textContent = `(${sections.length})`;
    }
    
    sections.forEach((section, index) => {
      const header = section.querySelector(".group-header");
      if (!header) return;
      
      const labelEl = header.querySelector(".group-header-left span");
      const rawText = labelEl ? labelEl.textContent : header.textContent;
      const cleanText = (rawText || `分组 ${index + 1}`).replace(/\s+/g, " ").trim();
      
      const item = document.createElement("a");
      item.href = "#";
      item.dataset.index = String(index);
      item.textContent = `${index + 1}. ${cleanText}`;
      groupJumpDropdown.appendChild(item);
      
      groupJumpTargets.push(section);
    });
    
    if (groupJumpTargets.length === 0) {
      const emptyItem = document.createElement("a");
      emptyItem.href = "#";
      emptyItem.textContent = "暂无可跳转分组";
      emptyItem.style.pointerEvents = "none";
      emptyItem.style.opacity = "0.6";
      groupJumpDropdown.appendChild(emptyItem);
    }
    
    groupJumpBtn.disabled = groupJumpTargets.length === 0;
    updateFloatingToolPositions();
  }

  function getLinkGroupInfo(link) {
    if (link.groupId) {
      const group = allGroups.find(g => g.id === link.groupId);
      if (group) {
        return {
          id: group.id,
          name: group.name,
          color: group.color,
          textColor: group.textColor || '#FFFFFF'
        };
      }
    }

    return {
      id: null,
      name: '无分组',
      color: '#9E9E9E',
      textColor: '#FFFFFF'
    };
  }

  function getLinkVisitInfo(link, visitedMap = null) {
    const visited = visitedMap || getVisitedLinks();
    const visitData = visited[link.url];
    const visitCount = visitData ? visitData.count : 0;
    return {
      visitCount,
      lastVisited: visitData ? new Date(visitData.lastVisited).toLocaleString('zh-CN') : '',
      visitClass: visitCount > 0 ? `visited-${((visitCount - 1) % 7) + 1}` : ''
    };
  }

  function getPageCountText(link) {
    const pageCount = Number(link?.pageCount);
    return Number.isInteger(pageCount) && pageCount > 0 ? `${pageCount} 页` : '';
  }

  function getPageCountValue(link) {
    const pageCount = Number(link?.pageCount);
    return Number.isInteger(pageCount) && pageCount > 0 ? pageCount : 0;
  }

  function compareLinks(a, b) {
    if (pageSortOrder !== "off") {
      const pageDiff = getPageCountValue(a) - getPageCountValue(b);
      if (pageDiff !== 0) {
        return pageSortOrder === "asc" ? pageDiff : -pageDiff;
      }
    }

    const timeA = new Date(a.date || 0).getTime();
    const timeB = new Date(b.date || 0).getTime();
    return sortOrder === "oldest" ? timeA - timeB : timeB - timeA;
  }

  function createSnapshotMarker(clickPoint) {
    if (!clickPoint) return null;
    const { x, y, viewportW, viewportH } = clickPoint;
    if (!viewportW || !viewportH) return null;

    const marker = document.createElement('div');
    marker.className = 'snapshot-marker';
    marker.style.left = `${(x / viewportW) * 100}%`;
    marker.style.top = `${(y / viewportH) * 100}%`;
    return marker;
  }

  function getPreviewTagsHtml(tags) {
    if (!Array.isArray(tags) || tags.length === 0) {
      return '<span class="preview-empty-text">暂无标签</span>';
    }

    return tags.map(tag =>
      `<span class="link-tag" style="background: ${tag.color}; color: ${tag.textColor || '#ffffff'};" data-tag-text="${escapeHtml(tag.text)}" title="${getTagActionTitle(tag.text)}">${escapeHtml(tag.text)}</span>`
    ).join('');
  }

  function buildPreviewInfoHtml(link, index, visitedMap) {
    const groupInfo = getLinkGroupInfo(link);
    const visitInfo = getLinkVisitInfo(link, visitedMap);
    const source = link.page || '未知';
    const pageCountText = getPageCountText(link);
    const duplicateCount = duplicateUrlMap && duplicateUrlMap[link.url] ? duplicateUrlMap[link.url].length : 1;
    const duplicateText = duplicateCount > 1 ? `重复 ${duplicateCount} 条` : '无重复';
    const descHtml = link.desc
      ? `<div class="preview-desc">${escapeHtml(link.desc)}</div>`
      : '';

    return `
      <div class="preview-info-panel">
        <div class="preview-headline">
          <span class="preview-order">#${index || ''}</span>
          <span class="group-badge" style="background: ${groupInfo.color}; color: ${groupInfo.textColor};">${escapeHtml(groupInfo.name)}</span>
          <span class="preview-meta-pill">${escapeHtml(link.date || '未记录时间')}</span>
          <span class="preview-meta-pill">${duplicateText}</span>
        </div>
        <div class="preview-title">${escapeHtml(title)}</div>
        <a href="${escapeHtml(link.url)}" class="preview-url" target="_blank" rel="noopener noreferrer" data-url="${escapeHtml(link.url)}">${escapeHtml(link.url)}</a>
        <div class="preview-info-grid">
          <div class="preview-info-item">
            <span class="preview-info-label">分组</span>
            <span>${escapeHtml(groupInfo.name)}</span>
          </div>
          <div class="preview-info-item">
            <span class="preview-info-label">来源</span>
            <span>${escapeHtml(source)}</span>
          </div>
          ${pageCountText ? `
          <div class="preview-info-item">
            <span class="preview-info-label">页数</span>
            <span class="preview-page-count">${escapeHtml(pageCountText)}</span>
          </div>` : ''}
          <div class="preview-info-item">
            <span class="preview-info-label">访问次数</span>
            <span class="${visitInfo.visitClass ? `link-visits ${visitInfo.visitClass}` : ''}">${visitInfo.visitCount > 0 ? `已访问 ${visitInfo.visitCount} 次` : '未访问'}</span>
          </div>
          <div class="preview-info-item">
            <span class="preview-info-label">上次访问</span>
            <span>${escapeHtml(visitInfo.lastVisited || '暂无记录')}</span>
          </div>
        </div>
        <div class="preview-tags-row">${getPreviewTagsHtml(link.tags)}</div>
        ${descHtml}
        <div class="preview-actions">
          <a href="${escapeHtml(link.url)}" class="preview-action-btn preview-action-primary" target="_blank" rel="noopener noreferrer" data-url="${escapeHtml(link.url)}">打开网址</a>
          <button type="button" class="preview-action-btn" data-action="copy-url">复制网址</button>
          <button type="button" class="preview-action-btn" data-action="edit-tags">标签</button>
          <button type="button" class="preview-action-btn" data-action="move-group">移动</button>
        </div>
      </div>
    `;
  }

  function buildPreviewCardDetailHtml(link, index, visitedMap) {
    const groupInfo = getLinkGroupInfo(link);
    const visitInfo = getLinkVisitInfo(link, visitedMap);
    const pageCountText = getPageCountText(link);

    const visitHtml = visitInfo.visitCount > 0
      ? `<div class="link-meta">
          <span class="link-visits ${visitInfo.visitClass}">访问 ${visitInfo.visitCount} 次</span>
          <span class="link-date">上次访问: ${escapeHtml(visitInfo.lastVisited)}</span>
        </div>`
      : '';

    const groupBadge = `<span class="group-badge" style="background: ${groupInfo.color}; color: ${groupInfo.textColor}; cursor: pointer;" data-group-name="${escapeHtml(groupInfo.name)}" title="点击过滤此分组">${escapeHtml(groupInfo.name)}</span>`;

    let duplicateBadge = '';
    if (duplicateUrlMap && duplicateUrlMap[link.url] && duplicateUrlMap[link.url].length > 1) {
      const duplicateIds = duplicateUrlMap[link.url];
      const currentPos = duplicateIds.indexOf(link.id);
      const otherIndices = [];
      duplicateIds.forEach((id, pos) => {
        if (pos !== currentPos) {
          const linkIndex = allLinks.findIndex(l => l.id === id);
          otherIndices.push(linkIndex + 1);
        }
      });
      const otherStr = otherIndices.sort((a, b) => a - b).join('、');
      duplicateBadge = `<span class="duplicate-badge" data-duplicate-url="${escapeHtml(link.url)}" title="点击过滤显示所有重复条目">🔗 与${otherStr}重复</span>`;
    }

    const tagsHtml = Array.isArray(link.tags) && link.tags.length > 0
      ? `<div class="link-tags">${link.tags.map(tag =>
          `<span class="link-tag" style="background: ${tag.color}; color: ${tag.textColor || '#ffffff'};" data-tag-text="${escapeHtml(tag.text)}" title="${getTagActionTitle(tag.text)}">${escapeHtml(tag.text)}</span>`
        ).join('')}</div>`
      : '';

    const descHtml = link.desc
      ? `<div class="link-description" title="${escapeHtml(link.desc)}">${escapeHtml(link.desc)}</div>`
      : '';

    return `
      <div class="preview-card-wrap">
        <div class="link-card preview-detail-card" data-link-id="${link.id}">
          <div class="link-index">${index || ''}</div>
          <div class="link-content">
            <a href="${escapeHtml(link.url)}" class="link-url preview-detail-link" target="_blank" rel="noopener noreferrer" data-url="${escapeHtml(link.url)}">${escapeHtml(link.url)}</a>
            <div class="link-source">来源: ${escapeHtml(link.title || link.page || '未知')} ${groupBadge} ${duplicateBadge}</div>
            <div class="link-date">保存时间: ${escapeHtml(link.date || '')}</div>
            ${pageCountText ? `<div class="link-page-count">页数: <span class="page-count-pill">${escapeHtml(pageCountText)}</span></div>` : ''}
            ${descHtml}
            ${tagsHtml}
            ${visitHtml}
            <div class="link-actions">
              <button class="link-btn link-btn-note" data-id="${link.id}" data-action="edit-card-tags">🏷️ 标签</button>
              <button class="link-btn link-btn-move" data-id="${link.id}" data-action="move-card-group">📁 移动</button>
              <button class="link-btn link-btn-copy" data-url="${escapeHtml(link.url)}" data-action="copy-card-url">📋 复制</button>
              <button class="link-btn link-btn-delete" data-id="${link.id}" data-action="delete-card-link">🗑️ 删除</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  // 渲染链接
  function renderLinks() {
    const query = searchInput.value.toLowerCase().trim();
    const visited = getVisitedLinks();
    
    let visible = allLinks;
    const tokens = query.match(/"[^"]+"|\S+/g) || [];
    currentSearchKeywords = tokens.map(k => k.replace(/^"|"$/g, '').trim()).filter(k => k.length > 0);
    
    if (currentSearchKeywords.length > 0) {
      visible = allLinks.filter(link => 
        currentSearchKeywords.some(kw => {
          const groupName = link.groupId ? (allGroups.find(g => g.id === link.groupId)?.name || "") : "无分组";
          return (link.url || "").toLowerCase().includes(kw) ||
          (link.title || "").toLowerCase().includes(kw) ||
          (link.tags ? link.tags.map(t=>t.text).join(' ') : "").toLowerCase().includes(kw) ||
          (link.desc || "").toLowerCase().includes(kw) ||
          getPageCountText(link).toLowerCase().includes(kw) ||
          (link.page || "").toLowerCase().includes(kw) ||
          groupName.toLowerCase().includes(kw);
        })
      );
    }
    
    // 按当前排序规则排序
    visible = visible.sort(compareLinks);
    
    // 构建重复链接映射缓存
    duplicateUrlMap = {};
    allLinks.forEach(link => {
      if (!duplicateUrlMap[link.url]) {
        duplicateUrlMap[link.url] = [];
      }
      duplicateUrlMap[link.url].push(link.id);
    });
    
    // 更新搜索结果计数显示与清空按钮
    const countBadge = document.getElementById('searchResultCount');
    const clearBtn = document.getElementById('clearSearchBtn');
    
    if (clearBtn) {
      clearBtn.style.display = currentSearchKeywords.length > 0 ? 'inline-block' : 'none';
    }
    
    if (countBadge) {
      if (currentSearchKeywords.length > 0) {
        countBadge.textContent = `找到 ${visible.length} 个`;
        countBadge.style.display = 'inline';
      } else {
        countBadge.style.display = 'none';
      }
    }
    
    // 更新多关键字跳转导航栏
    const navToolbar = document.getElementById('searchNavToolbar');
    if (navToolbar) {
      if (currentSearchKeywords.length > 1) { // 甚至只有1个也可以显示，但多数多词时更有用。为了满足需求，> 0 就显示
        navToolbar.innerHTML = '<span class="search-nav-toolbar-label">快速跳转</span>';
        navToolbar.style.display = 'flex';
        
        const lowerKeywords = currentSearchKeywords.map(k => k.toLowerCase());
        lowerKeywords.forEach((kw, kwIndex) => {
          // 找出当前搜索结果中，包含这个子关键字的 linkId
          const matchingIds = visible.filter(link => {
            const groupName = link.groupId ? (allGroups.find(g => g.id === link.groupId)?.name || "") : "无分组";
            return (link.url || "").toLowerCase().includes(kw) ||
            (link.title || "").toLowerCase().includes(kw) ||
            (link.tags ? link.tags.map(t=>t.text).join(' ') : "").toLowerCase().includes(kw) ||
            (link.desc || "").toLowerCase().includes(kw) ||
            getPageCountText(link).toLowerCase().includes(kw) ||
            (link.page || "").toLowerCase().includes(kw) ||
            groupName.toLowerCase().includes(kw);
          }).map(l => l.id);
          
          if (matchingIds.length > 0) {
            const btn = document.createElement('button');
            // 原样显示输入的关键字
            const displayKw = currentSearchKeywords[kwIndex];
            btn.className = `nav-tag hl-${kwIndex % 7}`;
            btn.innerHTML = `${escapeHtml(displayKw)} <span class="nav-count" style="opacity:0.7; font-size:11px;">(0/${matchingIds.length})</span>`;
            
            let currentJumpIndex = -1;
            btn.onclick = () => {
              currentJumpIndex = (currentJumpIndex + 1) % matchingIds.length;
              const targetId = matchingIds[currentJumpIndex];
              
              const countSpan = btn.querySelector('.nav-count');
              if (countSpan) countSpan.textContent = `(${currentJumpIndex + 1}/${matchingIds.length})`;
              
              const card = document.querySelector(`.link-card[data-link-id="${targetId}"]`);
              if (card) {
                card.scrollIntoView({ behavior: "smooth", block: "center" });
                // 添加一个一闪而过的选中特效
                card.style.transition = "transform 0.2s, box-shadow 0.2s";
                card.style.transform = "scale(1.02)";
                card.style.boxShadow = "0 0 0 3px var(--accent)";
                setTimeout(() => {
                  card.style.transform = "";
                  card.style.boxShadow = "";
                }, 400);
              }
            };
            navToolbar.appendChild(btn);
          }
        });
      } else {
        navToolbar.style.display = 'none';
        navToolbar.innerHTML = '';
      }
    }

    
    if (visible.length === 0) {
      linksList.innerHTML = "";
      emptyState.classList.remove("hidden");
      refreshGroupJumpOptions();
      updateFloatingToolPositions();
      return;
    }

    if (isThumbnailMode() && getDisplayModeLinks(visible).length === 0) {
      emptyState.classList.add("hidden");
      linksList.innerHTML = '<div class="empty-state"><p>当前筛选结果里没有可用快照</p></div>';
      refreshGroupJumpOptions();
      updateFloatingToolPositions();
      return;
    }
    
    emptyState.classList.add("hidden");
    linksList.innerHTML = "";
    linksList.classList.remove("thumb-grid-host");
    
    if (currentView === "all") {
      renderAllView(visible, visited);
    } else if (currentView === "byGroup") {
      renderByGroupView(visible, visited);
    } else if (currentView === "byDomain") {
      renderByDomainView(visible, visited);
    } else if (currentView === "byDate") {
      renderByDateView(visible, visited);
    } else if (currentView === "byNote") {
      renderByTagsView(visible, visited);
    } else if (currentView === "unvisited") {
      renderUnvisitedView(visible, visited);
    }
    
    refreshGroupJumpOptions();
    updateFloatingToolPositions();
  }
  
  // 渲染全部视图
  function renderAllView(links, visited) {
    if (isThumbnailMode()) {
      linksList.classList.add("thumb-grid-host");
    } else {
      linksList.classList.remove("thumb-grid-host");
    }
    renderLinkCollection(linksList, links, visited);
  }
  
  // 渲染按域名分组视图
  function renderByDomainView(links, visited) {
    const groups = {};
    links.forEach(link => {
      const domain = getBaseDomain(link.url);
      if (!groups[domain]) groups[domain] = [];
      groups[domain].push(link);
    });
    
    Object.keys(groups).sort().forEach(domain => {
      const sortedLinks = groups[domain].sort(compareLinks);

      const section = document.createElement("div");
      section.className = "group-section";
      
      const displayLinks = getDisplayModeLinks(sortedLinks);
      if (displayLinks.length === 0) return;

      const header = document.createElement("div");
      header.className = "group-header";
      header.innerHTML = `
        <div class="group-header-left">
          <input type="checkbox" class="group-select-all" title="全选/取消全选">
          <span>${domain} (${displayLinks.length})</span>
        </div>
        <span class="group-toggle">▾</span>
      `;
      header.onclick = (e) => {
        // 如果点击的是复选框，不处理折叠
        if (e.target.classList.contains('group-select-all')) return;
        header.classList.toggle("collapsed");
        content.classList.toggle("collapsed");
      };
      
      const content = document.createElement("div");
      content.className = "group-content";
      if (isThumbnailMode()) content.classList.add("thumb-grid-host");
      
      renderLinkCollection(content, sortedLinks, visited);
      
      section.appendChild(header);
      section.appendChild(content);
      linksList.appendChild(section);
      
      // 设置全选逻辑
      setupGroupSelectAll(header, content);
    });
  }
  
  // 渲染按分组视图
  function renderByGroupView(links, visited) {
    // 先显示无分组的链接
    const globalLinks = links.filter(link => !link.groupId);
    
    if (globalLinks.length > 0) {
      const sortedLinks = globalLinks.sort(compareLinks);

      const section = document.createElement("div");
      section.className = "group-section";
      
      const displayLinks = getDisplayModeLinks(sortedLinks);
      if (displayLinks.length > 0) {
        const header = document.createElement("div");
        header.className = "group-header";
        header.innerHTML = `
          <div class="group-header-left">
            <input type="checkbox" class="group-select-all" title="全选/取消全选">
            <span>
              <span class="group-color" style="background: #9E9E9E; display: inline-block; width: 16px; height: 16px; border-radius: 3px; margin-right: 8px; vertical-align: middle;"></span>
              全局（无分组） (${displayLinks.length})
            </span>
          </div>
          <span class="group-toggle">▾</span>
        `;
        header.onclick = (e) => {
          if (e.target.classList.contains('group-select-all')) return;
          header.classList.toggle("collapsed");
          content.classList.toggle("collapsed");
        };
        
        const content = document.createElement("div");
        content.className = "group-content";
        if (isThumbnailMode()) content.classList.add("thumb-grid-host");
        
        renderLinkCollection(content, sortedLinks, visited);
        
        section.appendChild(header);
        section.appendChild(content);
        linksList.appendChild(section);
        
        // 设置全选逻辑
        setupGroupSelectAll(header, content);
      }
    }
    
    // 显示各个分组
    allGroups.forEach(group => {
      const groupLinks = links.filter(link => link.groupId === group.id);
      const sortedLinks = groupLinks.sort(compareLinks);
      
      const section = document.createElement("div");
      section.className = "group-section";
      
      const displayLinks = getDisplayModeLinks(sortedLinks);
      if (displayLinks.length === 0) return;

      const header = document.createElement("div");
      header.className = "group-header";
      header.innerHTML = `
        <div class="group-header-left">
          <input type="checkbox" class="group-select-all" title="全选/取消全选">
          <span>
            <span class="group-color" style="background: ${group.color}; display: inline-block; width: 16px; height: 16px; border-radius: 3px; margin-right: 8px; vertical-align: middle;"></span>
            ${group.name} (${displayLinks.length})
          </span>
        </div>
        <span class="group-toggle">▾</span>
      `;
      header.onclick = (e) => {
        if (e.target.classList.contains('group-select-all')) return;
        header.classList.toggle("collapsed");
        content.classList.toggle("collapsed");
      };
      
      const content = document.createElement("div");
      content.className = "group-content";
      if (isThumbnailMode()) content.classList.add("thumb-grid-host");
      
      renderLinkCollection(content, sortedLinks, visited);
      
      section.appendChild(header);
      section.appendChild(content);
      linksList.appendChild(section);
      
      // 设置全选逻辑
      setupGroupSelectAll(header, content);
    });
  }
  
  // 渲染未访问视图
  function renderUnvisitedView(links, visited) {
    if (unvisitedMode === "aggregate") {
      // 聚合模式：所有未访问的链接归纳到一起
      const unvisited = links.filter(link => !visited[link.url]);
      
      if (unvisited.length === 0) {
        linksList.innerHTML = '<div class="empty-state"><p>所有链接都已访问过</p></div>';
        return;
      }
      
      renderAllView(unvisited, visited);
    } else {
      // 组内模式：根据当前视图类型，在分组内只显示未访问的链接
      renderUnvisitedInGroupView(links, visited);
    }
  }
  
  // 组内未访问视图
  function renderUnvisitedInGroupView(links, visited) {
    const unvisitedLinks = links.filter(link => !visited[link.url]);
    
    if (unvisitedLinks.length === 0) {
      linksList.innerHTML = '<div class="empty-state"><p>所有链接都已访问过</p></div>';
      return;
    }
    
    // 根据之前的视图类型来决定如何分组显示未访问的链接
    const previousView = localStorage.getItem('previousView') || 'byDomain';
    
    if (previousView === 'byDomain') {
      renderByDomainView(unvisitedLinks, visited);
    } else if (previousView === 'byGroup') {
      renderByGroupView(unvisitedLinks, visited);
    } else if (previousView === 'byDate') {
      renderByDateView(unvisitedLinks, visited);
    } else {
      // 默认按域名分组
      renderByDomainView(unvisitedLinks, visited);
    }
  }
  
  // 按日期分组渲染
  function renderByDateView(links, visited) {
    const dateGroups = {};
    
    // 按日期分组
    links.forEach(link => {
      const dateStr = link.date || '';
      // 提取日期部分 YYYY/MM/DD
      const dateMatch = dateStr.match(/(\d{4})\/(\d{2})\/(\d{2})/);
      if (dateMatch) {
        const [, year, month, day] = dateMatch;
        const dateKey = `${year}/${month}/${day}`;
        const dateDisplay = `${month}月${day}日`;
        
        if (!dateGroups[dateKey]) {
          dateGroups[dateKey] = { display: dateDisplay, links: [] };
        }
        dateGroups[dateKey].links.push(link);
      }
    });
    
    // 按日期排序（从新到旧）
    const sortedDates = Object.keys(dateGroups).sort().reverse();
    
    sortedDates.forEach(dateKey => {
      const group = dateGroups[dateKey];
      const sortedLinks = group.links.sort(compareLinks);

      const section = document.createElement("div");
      section.className = "group-section";
      
      const displayLinks = getDisplayModeLinks(sortedLinks);
      if (displayLinks.length === 0) return;

      const header = document.createElement("div");
      header.className = "group-header";
      header.innerHTML = `
        <div class="group-header-left">
          <input type="checkbox" class="group-select-all" title="全选/取消全选">
          <span>📅 ${group.display} (${displayLinks.length})</span>
        </div>
        <span class="group-toggle">▾</span>
      `;
      header.onclick = (e) => {
        if (e.target.classList.contains('group-select-all')) return;
        header.classList.toggle("collapsed");
        content.classList.toggle("collapsed");
      };
      
      const content = document.createElement("div");
      content.className = "group-content";
      if (isThumbnailMode()) content.classList.add("thumb-grid-host");
      
      renderLinkCollection(content, sortedLinks, visited);
      
      section.appendChild(header);
      section.appendChild(content);
      linksList.appendChild(section);
      
      // 设置全选逻辑
      setupGroupSelectAll(header, content);
    });
  }
  
  // 按标签分组渲染
  function renderByTagsView(links, visited) {
    // 收集所有出现过的标签
    const tagMap = new Map();
    const withoutTags = [];
    
    links.forEach(link => {
      if (!link.tags || link.tags.length === 0) {
        withoutTags.push(link);
      } else {
        link.tags.forEach(tag => {
          if (!tagMap.has(tag.text)) {
            tagMap.set(tag.text, { color: tag.color, textColor: tag.textColor || '#ffffff', links: [] });
          }
          tagMap.get(tag.text).links.push(link);
        });
      }
    });

    const sortedTags = Array.from(tagMap.keys()).sort();
    
    if (sortedTags.length > 0) {
      sortedTags.forEach(tagText => {
        const tagInfo = tagMap.get(tagText);
        const groupLinks = tagInfo.links;
        const sortedGroupLinks = groupLinks.sort(compareLinks);
        
        const section = document.createElement("div");
        section.className = "group-section";
        
        const displayLinks = getDisplayModeLinks(sortedGroupLinks);
        if (displayLinks.length === 0) return;

        const header = document.createElement("div");
        header.className = "group-header";
        header.innerHTML = `
          <div class="group-header-left">
            <input type="checkbox" class="group-select-all" title="全选/取消全选">
            <span style="display:inline-flex; align-items:center;">🏷️ <span class="link-tag" style="background:${tagInfo.color}; color:${tagInfo.textColor}; margin-left:8px;">${escapeHtml(tagText)}</span> (${displayLinks.length})</span>
          </div>
          <span class="group-toggle">▾</span>
        `;
        header.onclick = (e) => {
          if (e.target.classList.contains('group-select-all')) return;
          header.classList.toggle("collapsed");
          content.classList.toggle("collapsed");
        };
        
        const content = document.createElement("div");
        content.className = "group-content";
        if (isThumbnailMode()) content.classList.add("thumb-grid-host");
        
        renderLinkCollection(content, sortedGroupLinks, visited);
        
        section.appendChild(header);
        section.appendChild(content);
        linksList.appendChild(section);
        
        setupGroupSelectAll(header, content);
        bindTagAction(header.querySelector('.link-tag'));
      });
    }
    
    if (withoutTags.length > 0) {
      const sortedWithoutLinks = withoutTags.sort(compareLinks);

      const section = document.createElement("div");
      section.className = "group-section";
      
      const displayLinks = getDisplayModeLinks(sortedWithoutLinks);
      if (displayLinks.length > 0) {
        const header = document.createElement("div");
        header.className = "group-header";
        header.innerHTML = `
          <div class="group-header-left">
            <input type="checkbox" class="group-select-all" title="全选/取消全选">
            <span>⚪ 无标签 (${displayLinks.length})</span>
          </div>
          <span class="group-toggle">▾</span>
        `;
        header.onclick = (e) => {
          if (e.target.classList.contains('group-select-all')) return;
          header.classList.toggle("collapsed");
          content.classList.toggle("collapsed");
        };
        
        const content = document.createElement("div");
        content.className = "group-content";
        if (isThumbnailMode()) content.classList.add("thumb-grid-host");
        
        renderLinkCollection(content, sortedWithoutLinks, visited);
        
        section.appendChild(header);
        section.appendChild(content);
        linksList.appendChild(section);
        
        setupGroupSelectAll(header, content);
      }
    }
    
    if (sortedTags.length === 0 && withoutTags.length === 0) {
      linksList.innerHTML = '<div class="empty-state">没有链接</div>';
    }
  }
  
  // 创建链接卡片
  function createThumbnailCard(link, index, visited) {
    const card = document.createElement("article");
    card.className = "thumb-card";
    card.dataset.linkId = link.id;

    const groupInfo = getLinkGroupInfo(link);
    const title = link.title || link.page || link.url || '未命名链接';
    const tagList = Array.isArray(link.tags) ? link.tags : [];
    let duplicateBadge = '';
    if (duplicateUrlMap && duplicateUrlMap[link.url] && duplicateUrlMap[link.url].length > 1) {
      const duplicateIds = duplicateUrlMap[link.url];
      const currentPos = duplicateIds.indexOf(link.id);
      const otherIndices = [];
      duplicateIds.forEach((id, pos) => {
        if (pos !== currentPos) {
          const linkIndex = allLinks.findIndex(l => l.id === id);
          otherIndices.push(linkIndex + 1);
        }
      });
      const duplicateText = otherIndices.length > 0
        ? `重复 ${otherIndices.sort((a, b) => a - b).join('、')}`
        : `重复 ${duplicateIds.length - 1}`;
      duplicateBadge = `<span class="thumb-duplicate-badge" data-duplicate-url="${escapeHtml(link.url)}" title="点击过滤显示所有重复条目">${duplicateText}</span>`;
    }
    const visibleTags = tagList.map(tag =>
      `<span class="thumb-tag" style="background: ${tag.color}; color: ${tag.textColor || '#ffffff'};" data-tag-text="${escapeHtml(tag.text)}" title="${isTagUrl(tag.text) ? '点击直接打开此网址' : '点击过滤带有此标签的条目'}">${escapeHtml(tag.text)}</span>`
    ).join('');
    const mediaBorderColor = groupInfo.color || '#9E9E9E';
    const overlayHtml = `
      <div class="thumb-overlay-top">
        <div class="thumb-top-row">
          <span class="thumb-index-badge">#${index}</span>
          <span class="thumb-group-badge" style="background: ${groupInfo.color}; color: ${groupInfo.textColor};" data-group-name="${escapeHtml(groupInfo.name)}" title="点击过滤此分组">${escapeHtml(groupInfo.name)}</span>
          ${duplicateBadge}
        </div>
        ${tagList.length > 0 ? `<div class="thumb-tags">${visibleTags}</div>` : ''}
      </div>
    `;

    card.innerHTML = `
      <label class="thumb-select-toggle" title="选择此缩略图">
        <input type="checkbox" class="link-checkbox thumb-select-checkbox" data-id="${link.id}" ${isLinkSelected(link.id) ? 'checked' : ''}>
      </label>
      <button type="button" class="thumb-media" id="thumb-${link.id}" style="--thumb-border-color: ${mediaBorderColor};" title="查看大图和详细信息">
        ${overlayHtml}
        <div class="thumb-empty">🖼️</div>
      </button>
    `;

    const media = card.querySelector(`#thumb-${link.id}`);
    const checkbox = card.querySelector('.thumb-select-checkbox');
    const bindThumbnailOverlayInteractions = (container) => {
      container.querySelectorAll('.thumb-tag').forEach(tagEl => {
        bindTagAction(tagEl);
      });

      container.querySelectorAll('.thumb-group-badge[data-group-name]').forEach(badgeEl => {
        badgeEl.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const groupName = e.currentTarget.dataset.groupName;
          if (groupName) {
            filterByKeyword(groupName);
          }
        });
      });

      container.querySelectorAll('.thumb-duplicate-badge[data-duplicate-url]').forEach(badgeEl => {
        badgeEl.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const dupUrl = e.currentTarget.dataset.duplicateUrl;
          if (dupUrl) {
            filterByKeyword(dupUrl);
          }
        });
      });
    };

    bindThumbnailOverlayInteractions(media);

    if (checkbox) {
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      checkbox.addEventListener('change', () => {
        setLinkSelected(link.id, checkbox.checked);
        updateBatchToolbar();
      });
    }

    DB.getSnapshot(link.id).then(dataUrl => {
      if (!dataUrl || !dataUrl.startsWith('data:image')) {
        console.warn('缩略图快照缺失或无效:', link.id, link.url);
        media.innerHTML = `${overlayHtml}<div class="thumb-empty thumb-empty-missing">快照缺失</div>`;
        bindThumbnailOverlayInteractions(media);
        return;
      }

      media.innerHTML = `${overlayHtml}<img src="${dataUrl}" alt="快照缩略图">`;
      bindThumbnailOverlayInteractions(media);
      const marker = createSnapshotMarker(link.clickPoint);
      if (marker) {
        media.appendChild(marker);
      }

      media.addEventListener('click', (e) => {
        e.stopPropagation();
        showPreviewModalV2({
          mode: 'detail',
          dataUrl,
          clickPoint: link.clickPoint,
          link,
          index,
          visited
        });
      });
    }).catch(err => {
      console.error("加载缩略图快照失败:", err);
    });

    return card;
  }

  function createLinkCard(link, index, visited) {
    const card = document.createElement("div");
    card.className = "link-card";
    card.dataset.linkId = link.id;
    
    const visitData = visited[link.url];
    const visitCount = visitData ? visitData.count : 0;
    const lastVisited = visitData ? new Date(visitData.lastVisited).toLocaleString('zh-CN') : '';
    const visitClass = visitCount > 0 ? `visited-${((visitCount - 1) % 7) + 1}` : '';
    
    const visitInfo = visitCount > 0 
      ? `<div class="link-meta">
          <span class="link-visits ${visitClass}">访问 ${visitCount} 次</span>
          <span class="link-date">上次访问: ${lastVisited}</span>
        </div>`
      : '';
    
    // 获取分组信息
    const groupId = link.groupId;
    let groupBadge = '';
    let groupColor = '#9E9E9E'; // 默认无分组颜色
    
    if (groupId) {
      const group = allGroups.find(g => g.id === groupId);
      if (group) {
        groupBadge = `<span class="group-badge" style="background: ${group.color}; color: ${group.textColor || '#FFFFFF'}; cursor: pointer;" data-group-name="${escapeHtml(group.name)}" title="点击过滤此分组">${group.name}</span>`;
        groupColor = group.color;
      }
    } else {
      groupBadge = `<span class="group-badge" style="background: #9E9E9E; cursor: pointer;" data-group-name="无分组" title="点击过滤无分组">无分组</span>`;
    }
    
    // 设置分组颜色边框
    card.style.borderLeftColor = groupColor;
    
    // 检查是否是重复链接 - 优化：使用缓存的重复链接映射
    let duplicateBadge = '';
    if (duplicateUrlMap && duplicateUrlMap[link.url] && duplicateUrlMap[link.url].length > 1) {
      const duplicateIds = duplicateUrlMap[link.url];
      const currentPos = duplicateIds.indexOf(link.id);
      
      // 获取其他重复链接的序号
      const otherIndices = [];
      duplicateIds.forEach((id, pos) => {
        if (pos !== currentPos) {
          const linkIndex = allLinks.findIndex(l => l.id === id);
          otherIndices.push(linkIndex + 1);
        }
      });
      
      const otherStr = otherIndices.sort((a, b) => a - b).join('、');
      duplicateBadge = `<span class="duplicate-badge" data-duplicate-url="${escapeHtml(link.url)}" title="点击过滤显示所有重复条目">🔗 与${otherStr}重复</span>`;
    }
    
    // 标签显示
    let tagsDisplay = '';
    if (link.tags && link.tags.length > 0) {
      const tagsHrml = link.tags.map(tag => 
        `<span class="link-tag" style="background: ${tag.color}; color: ${tag.textColor || '#ffffff'};" data-tag-text="${escapeHtml(tag.text)}" title="点击过滤带有此标签的条目">${highlightText(tag.text, currentSearchKeywords)}</span>`
      ).join('');
      tagsDisplay = `<div class="link-tags">${tagsHrml}</div>`;
    }
      
    // 描述显示
    const descDisplay = link.desc
      ? `<div class="link-description" title="${escapeHtml(link.desc)}">${highlightText(link.desc, currentSearchKeywords)}</div>`
      : '';
    const pageCountText = getPageCountText(link);
    const pageCountDisplay = pageCountText
      ? `<div class="link-page-count">页数: <span class="page-count-pill">${escapeHtml(pageCountText)}</span></div>`
      : '';
    
    card.innerHTML = `
      <input type="checkbox" class="link-checkbox" data-id="${link.id}" style="margin-right: 10px; cursor: pointer;" ${isLinkSelected(link.id) ? 'checked' : ''}>
      <div class="link-index">${index}</div>
      <div class="link-content">
        <a href="${escapeHtml(link.url)}" class="link-url" target="_blank" data-url="${escapeHtml(link.url)}">${highlightText(link.url, currentSearchKeywords)}</a>
        <div class="link-source">来源: ${highlightText(link.title || link.page || '未知', currentSearchKeywords)} ${groupBadge} ${duplicateBadge}</div>
        <div class="link-date">保存时间: ${escapeHtml(link.date || '')}</div>
        ${pageCountDisplay}
        ${descDisplay}
        ${tagsDisplay}
        ${visitInfo}
        <div class="link-actions">
          <button class="link-btn link-btn-note" data-id="${link.id}">🏷️ 标签</button>
          <button class="link-btn link-btn-move" data-id="${link.id}">📁 移动</button>
          <button class="link-btn link-btn-copy" data-url="${escapeHtml(link.url)}">📋 复制</button>
          <button class="link-btn link-btn-delete" data-id="${link.id}">🗑️ 删除</button>
        </div>
      </div>
      <div class="link-snapshot" id="snapshot-${link.id}" title="查看大图预览">
        <div class="no-snapshot">🖼️</div>
      </div>
    `;

    // 异步加载快照
    if (link.hasSnapshot) {
      DB.getSnapshot(link.id).then(dataUrl => {
        if (dataUrl && dataUrl.startsWith('data:image')) {
          const snapshotEl = card.querySelector(`#snapshot-${link.id}`);
          if (snapshotEl) {
            snapshotEl.innerHTML = '';
            const img = document.createElement('img');
            img.src = dataUrl;
            img.alt = '快照预览';
            img.onclick = (e) => {
              e.stopPropagation();
              showPreviewModal(dataUrl, link.clickPoint);
            };
            snapshotEl.appendChild(img);

            // 如果有点击位置信息，添加标记
            const marker = createSnapshotMarker(link.clickPoint);
            if (marker) {
              snapshotEl.appendChild(marker);
            }
          }
        }
      }).catch(err => {
        console.error("加载快照失败:", err);
      });
    }
    
    // 复选框事件
    const checkbox = card.querySelector('.link-checkbox');
    checkbox.addEventListener('change', () => {
      setLinkSelected(link.id, checkbox.checked);
      updateBatchToolbar();
    });
    
    // 重复标签点击事件 - 过滤显示所有重复条目
    const dupBadge = card.querySelector('.duplicate-badge');
    if (dupBadge) {
      dupBadge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dupUrl = dupBadge.dataset.duplicateUrl;
        if (dupUrl) {
          filterByKeyword(dupUrl);
        }
      });
    }
    // 自定义标签胶囊点击事件 - 过滤显示该标签
    card.querySelectorAll('.link-tag').forEach(tagEl => {
      bindTagAction(tagEl);
    });
    
    // 分组胶囊点击事件 - 过滤显示该分组
    card.querySelectorAll('.group-badge[data-group-name]').forEach(badgeEl => {
      badgeEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const groupName = e.currentTarget.dataset.groupName;
        // 如果是"无分组"，也可以作为关键字去搜索，看是否匹配需求（如果搜索框逻辑能匹配到就好）
        if (groupName) {
          filterByKeyword(groupName);
        }
      });
    });
    
    // 点击链接记录访问(左键和中键都记录)
    const linkEl = card.querySelector(".link-url");
    linkEl.addEventListener("mousedown", (e) => {
      // button 0 = 左键, button 1 = 中键
      if (e.button === 0 || e.button === 1) {
        recordVisit(e.currentTarget.dataset.url);
      }
    });
    linkEl.addEventListener("click", (e) => {
      // 左键点击也记录(兼容性)
      if (e.button === 0) {
        recordVisit(e.currentTarget.dataset.url);
      }
    });
    
    // 备注按钮
    card.querySelector(".link-btn-note").addEventListener("click", (e) => {
      const id = parseInt(e.currentTarget.dataset.id);
      showTagDialog(id);
    });
    
    // 移动按钮
    card.querySelector(".link-btn-move").addEventListener("click", (e) => {
      const id = parseInt(e.currentTarget.dataset.id);
      showMoveDialog(id);
    });
    
    // 复制按钮
    card.querySelector(".link-btn-copy").addEventListener("click", (e) => {
      const url = e.currentTarget.dataset.url;
      navigator.clipboard.writeText(url).then(() => {
        e.currentTarget.textContent = "✓ 已复制";
        setTimeout(() => {
          e.currentTarget.textContent = "📋 复制";
        }, 1500);
      });
    });
    
    // 删除按钮
    card.querySelector(".link-btn-delete").addEventListener("click", (e) => {
      const id = parseInt(e.currentTarget.dataset.id);
      deleteLink(id);
    });
    
    return card;
  }
  
  // 显示标签对话框 (原备注对话框)
  function showTagDialog(linkId) {
    const link = allLinks.find(l => l.id === linkId);
    if (!link) return;
    
    // 初始化本地副本以进行编辑
    let currentTags = Array.isArray(link.tags) ? [...link.tags] : [];
    
    const dialog = document.createElement('div');
    dialog.className = 'modal show';
    dialog.style.zIndex = '10000';
    dialog.innerHTML = `
      <div class="modal-content" style="width: min(860px, 92vw); max-width: min(860px, 92vw); max-height: 88vh; z-index: 10001;">
        <div class="modal-header">
          <h2>编辑标签</h2>
          <button class="modal-close" id="tagDialogClose">✕</button>
        </div>
        <div class="modal-body" style="max-height: calc(88vh - 90px); overflow-y: auto;">
          <p style="margin-bottom: 15px; color: var(--text-muted); font-size: 14px; word-break: break-all;">
            ${escapeHtml(link.url)}
          </p>
          
          <div id="tagsContainer" style="min-height: 88px; padding: 10px; border: 2px solid var(--border); border-radius: 6px; background: var(--bg); display: flex; flex-direction: column; gap: 8px;">
            <!-- 标签将会被渲染在这里 -->
          </div>
          
          <div class="tag-input-group" style="align-items: center; gap: 12px; flex-wrap: wrap;">
            <input type="text" id="tagTextInput" placeholder="输入新标签..." maxlength="30" style="flex: 1; min-width: 150px;">
            <div style="display:flex; gap:12px; align-items:center; flex-shrink: 0;">
              <label style="font-size:13px; font-weight:bold; color:var(--text-muted); display:flex; align-items:center; gap:6px; cursor:pointer;" title="自定义胶囊背景色">
                背景<input type="color" id="tagColorInput" value="#0B74FF" style="width:40px;height:40px;padding:2px;cursor:pointer;border:2px solid var(--border);border-radius:6px;">
              </label>
              <label style="font-size:13px; font-weight:bold; color:var(--text-muted); display:flex; align-items:center; gap:6px; cursor:pointer;" title="自定义胶囊内文字的颜色">
                文字<input type="color" id="tagTextColorInput" value="#ffffff" style="width:40px;height:40px;padding:2px;cursor:pointer;border:2px solid var(--border);border-radius:6px;">
              </label>
            </div>
            <button class="btn btn-primary" id="addTagBtn" style="padding: 8px 20px; white-space: nowrap; height: 40px;">添加</button>
          </div>
          
          <div style="margin-top: 15px; border-top: 1px solid var(--border); padding-top: 10px;">
            <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">标签列表 (点击快速添加)：</div>
            <div id="historicalTagsContainer" style="display: flex; flex-direction: column; gap: 8px; max-height: 180px; overflow-y: auto;">
              <!-- 历史标签渲染在此处 -->
            </div>
          </div>
          
          <div style="display: flex; gap: 10px; justify-content: flex-end; margin-top: 25px;">
            <button class="btn btn-secondary" id="tagDialogCancel">取消</button>
            <button class="btn btn-danger" id="clearTags">清空全标签</button>
            <button class="btn btn-success" id="confirmTags">保存</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    const container = dialog.querySelector('#tagsContainer');
    const textInput = dialog.querySelector('#tagTextInput');
    const colorInput = dialog.querySelector('#tagColorInput');
    const textColorInput = dialog.querySelector('#tagTextColorInput');
    const historicalContainer = dialog.querySelector('#historicalTagsContainer');
    textInput.maxLength = 2048;
    
    // 收集所有已存在的标签以供快速选择
    const allExistingTags = [];
    const tagMap = new Map();
    allLinks.forEach(l => {
        if (Array.isArray(l.tags)) {
            l.tags.forEach(t => {
                if (!tagMap.has(t.text)) {
                    tagMap.set(t.text, true);
                    allExistingTags.push(t);
                }
            });
        }
    });

    function createTagCapsule(tag, options = {}) {
      const { editable = false, historical = false, index = -1 } = options;
      const span = document.createElement('span');
      const textC = tag.textColor || '#ffffff';
      const isUrl = isTagUrl(tag.text);

      span.className = `edit-tag-capsule ${isUrl ? 'edit-tag-capsule-url' : 'edit-tag-capsule-text'}`;
      span.style.background = tag.color;
      span.style.color = textC;
      span.style.cursor = 'pointer';
      span.title = editable ? '点击重新编辑标签' : '点击直接添加此标签';

      if (historical) {
        span.style.opacity = '0.7';
        span.onmouseenter = () => span.style.opacity = '1';
        span.onmouseleave = () => span.style.opacity = '0.7';
      }

      span.innerHTML = `
        <span class="edit-tag-main">${escapeHtml(tag.text)}</span>
        ${editable ? `<span class="edit-tag-delete" data-index="${index}">✕</span>` : ''}
      `;

      span.addEventListener('click', (e) => {
        if (editable) {
          if (e.target.classList.contains('edit-tag-delete')) return;
          textInput.value = tag.text;
          colorInput.value = tag.color;
          textColorInput.value = textC;
          textInput.focus();
          return;
        }

        const existingIndex = currentTags.findIndex(t => t.text === tag.text);
        if (existingIndex >= 0) {
          currentTags[existingIndex].color = tag.color;
          currentTags[existingIndex].textColor = textC;
        } else {
          currentTags.push({ text: tag.text, color: tag.color, textColor: textC });
        }
        renderEditTags();
      });

      return span;
    }

    function renderTagSection(containerEl, title, tags, options = {}) {
      if (!tags.length) return;

      const section = document.createElement('div');
      section.className = 'edit-tag-section';

      const titleEl = document.createElement('div');
      titleEl.className = 'edit-tag-section-title';
      titleEl.textContent = `${title} (${tags.length})`;

      const body = document.createElement('div');
      body.className = 'edit-tag-section-body';

      tags.forEach(tag => {
        const capsule = createTagCapsule(tag, {
          ...options,
          index: options.editable ? currentTags.indexOf(tag) : -1
        });
        body.appendChild(capsule);
      });

      section.appendChild(titleEl);
      section.appendChild(body);
      containerEl.appendChild(section);
    }
    
    function renderEditTags() {
      container.innerHTML = '';
      if (currentTags.length === 0) {
        container.innerHTML = '<span style="color:var(--text-muted); font-size:13px; font-style:italic;">暂无标签</span>';
        return;
      }
      const textTags = currentTags.filter(tag => !isTagUrl(tag.text));
      const urlTags = currentTags.filter(tag => isTagUrl(tag.text));

      renderTagSection(container, '文字标签', textTags, { editable: true });
      renderTagSection(container, '网址标签', urlTags, { editable: true });
      
      container.querySelectorAll('.edit-tag-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt(e.currentTarget.dataset.index);
          currentTags.splice(idx, 1);
          renderEditTags();
        });
      });
      return;

      currentTags.forEach((tag, index) => {
        const span = document.createElement('span');
        span.className = 'edit-tag-capsule';
        span.style.background = tag.color;
        const textC = tag.textColor || '#ffffff';
        span.style.color = textC;
        span.style.cursor = 'pointer';
        span.title = '点击重新编辑标签';
        span.innerHTML = `${escapeHtml(tag.text)} <span class="edit-tag-delete" data-index="${index}">✕</span>`;
        
        span.addEventListener('click', (e) => {
          if (e.target.classList.contains('edit-tag-delete')) return;
          textInput.value = tag.text;
          colorInput.value = tag.color;
          textColorInput.value = textC;
          textInput.focus();
        });
        
        container.appendChild(span);
      });
      
      // 绑定删除事件
      container.querySelectorAll('.edit-tag-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt(e.currentTarget.dataset.index);
          currentTags.splice(idx, 1);
          renderEditTags();
        });
      });
    }
    
    renderEditTags();
    
    // 渲染历史标签
    if (allExistingTags.length === 0) {
        historicalContainer.innerHTML = '<span style="font-size: 12px; color: var(--text-muted); font-style: italic;">暂无可用标签</span>';
    } else {
        historicalContainer.innerHTML = '';
        const historicalTextTags = allExistingTags.filter(tag => !isTagUrl(tag.text));
        const historicalUrlTags = allExistingTags.filter(tag => isTagUrl(tag.text));

        renderTagSection(historicalContainer, '文字标签', historicalTextTags, { historical: true });
        renderTagSection(historicalContainer, '网址标签', historicalUrlTags, { historical: true });

        if (false) {
        allExistingTags.forEach(tag => {
            const span = document.createElement('span');
            span.className = 'edit-tag-capsule';
            span.style.background = tag.color;
            const textC = tag.textColor || '#ffffff';
            span.style.color = textC;
            span.style.cursor = 'pointer';
            span.style.opacity = '0.7';
            span.title = '点击直接添加此标签';
            span.textContent = tag.text;
            
            span.onmouseenter = () => span.style.opacity = '1';
            span.onmouseleave = () => span.style.opacity = '0.7';
            
            span.addEventListener('click', () => {
                const existingIndex = currentTags.findIndex(t => t.text === tag.text);
                if (existingIndex >= 0) {
                    currentTags[existingIndex].color = tag.color;
                    currentTags[existingIndex].textColor = textC;
                } else {
                    currentTags.push({ text: tag.text, color: tag.color, textColor: textC });
                }
                renderEditTags();
            });
            historicalContainer.appendChild(span);
        });
        }
    }

    textInput.focus();
    
    function addNewTag() {
      const text = textInput.value.trim();
      const color = colorInput.value;
      const textColor = textColorInput.value;
      if (text) {
        const existingIndex = currentTags.findIndex(t => t.text === text);
        if (existingIndex >= 0) {
          currentTags[existingIndex].color = color;
          currentTags[existingIndex].textColor = textColor;
        } else {
          currentTags.push({ text, color, textColor });
        }
        textInput.value = '';
        renderEditTags();
      }
    }
    
    dialog.querySelector('#addTagBtn').addEventListener('click', addNewTag);
    textInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addNewTag();
      }
    });
    
    dialog.querySelector('#tagDialogClose').addEventListener('click', () => dialog.remove());
    dialog.querySelector('#tagDialogCancel').addEventListener('click', () => dialog.remove());
    
    dialog.querySelector('#clearTags').addEventListener('click', () => {
      currentTags = [];
      renderEditTags();
    });
    
    dialog.querySelector('#confirmTags').addEventListener('click', () => {
      link.tags = currentTags;
      chrome.storage.local.set({ links: allLinks }, () => {
        renderLinks();
        dialog.remove();
      });
    });
    
    // 点击背景关闭
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.remove();
    });
  }
  
  // 显示移动对话框
  function showMoveDialog(linkId) {
    const link = allLinks.find(l => l.id === linkId);
    if (!link) return;
    
    let options = '<option value="">全局（无分组）</option>';
    allGroups.forEach(group => {
      const selected = link.groupId === group.id ? 'selected' : '';
      options += `<option value="${group.id}" ${selected}>${group.name}</option>`;
    });
    
    const dialog = document.createElement('div');
    dialog.className = 'modal show';
    dialog.style.zIndex = '10000';
    dialog.innerHTML = `
      <div class="modal-content" style="max-width: 400px; z-index: 10001;">
        <div class="modal-header">
          <h2>移动链接到分组</h2>
          <button class="modal-close" id="moveDialogClose">✕</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 15px; color: var(--text-muted); font-size: 14px;">
            ${escapeHtml(link.url.substring(0, 60))}${link.url.length > 60 ? '...' : ''}
          </p>
          <select id="moveToGroup" style="width: 100%; padding: 10px; border: 2px solid var(--border); border-radius: 6px; font-size: 14px; margin-bottom: 15px; position: relative; z-index: 10002;">
            ${options}
          </select>
          <div style="display: flex; gap: 10px; justify-content: flex-end; position: relative; z-index: 10002;">
            <button class="btn btn-secondary" id="moveDialogCancel">取消</button>
            <button class="btn btn-primary" id="confirmMove">确定</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    // 关闭按钮
    const closeBtn = dialog.querySelector('#moveDialogClose');
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dialog.remove();
    });
    
    // 取消按钮
    const cancelBtn = dialog.querySelector('#moveDialogCancel');
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dialog.remove();
    });
    
    // 确定按钮
    const confirmBtn = dialog.querySelector('#confirmMove');
    confirmBtn.addEventListener('click', () => {
      const newGroupId = dialog.querySelector('#moveToGroup').value || null;
      moveLinkToGroup(linkId, newGroupId);
      dialog.remove();
    });
    
    // 点击背景关闭
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.remove();
      }
    });
  }
  
  // 移动链接到分组
  function moveLinkToGroup(linkId, newGroupId) {
    const link = allLinks.find(l => l.id === linkId);
    if (link) {
      link.groupId = newGroupId;
      chrome.storage.local.set({ links: allLinks }, () => {
        renderLinks();
      });
    }
  }
  
  // 视图切换
  viewTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      // 管理分组按钮、折叠按钮和按日期分组按钮特殊处理
      if (tab.id === "manageGroupsBtn" || tab.id === "toggleGroupsBtn" || tab.id === "byDateBtn") {
        return; // 不切换视图
      }

      if (tab.dataset.view === "thumbGrid") {
        currentDisplayMode = isThumbnailMode() ? "card" : "thumb";
        localStorage.setItem('currentDisplayMode', currentDisplayMode);
        syncViewTabState();
        renderLinks();
        return;
      }

      // 保存之前的视图（用于组内未访问模式）
      if (currentView !== "unvisited") {
        localStorage.setItem('previousView', currentView);
      }

      currentView = tab.dataset.view;
      localStorage.setItem('currentView', currentView);
      syncViewTabState();
      renderLinks();
    });
  });
  
  // 按日期分组按钮
  const byDateBtn = document.getElementById("byDateBtn");
  if (byDateBtn) {
    byDateBtn.addEventListener("click", () => {
      if (currentView !== "unvisited") {
        localStorage.setItem('previousView', currentView);
      }
      currentView = "byDate";
      localStorage.setItem('currentView', currentView);
      syncViewTabState();
      renderLinks();
    });
  }
  
  if (groupJumpBtn && groupJumpDropdown) {
    groupJumpBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      groupJumpDropdown.classList.toggle("show");
    });

    groupJumpDropdown.addEventListener("click", (e) => {
      const item = e.target.closest("a[data-index]");
      if (!item) return;
      e.preventDefault();
      
      const selectedIndex = Number(item.dataset.index);
      if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= groupJumpTargets.length) {
        return;
      }
      
      const section = groupJumpTargets[selectedIndex];
      const header = section.querySelector(".group-header");
      if (!header) return;
      
      if (header.classList.contains("collapsed")) {
        header.classList.remove("collapsed");
        const content = section.querySelector(".group-content");
        if (content) content.classList.remove("collapsed");
      }
      
      section.scrollIntoView({ block: "start" });
      header.classList.add("jump-highlight");
      setTimeout(() => header.classList.remove("jump-highlight"), 500);
      groupJumpDropdown.classList.remove("show");
    });
  }

  window.addEventListener("resize", updateFloatingToolPositions);
  
  // 折叠/展开所有分组
  toggleGroupsBtn.addEventListener("click", () => {
    groupsCollapsed = !groupsCollapsed;
    localStorage.setItem('groupsCollapsed', groupsCollapsed);
    
    const allGroupHeaders = document.querySelectorAll(".group-header");
    const allGroupContents = document.querySelectorAll(".group-content");
    
    allGroupHeaders.forEach(header => {
      if (groupsCollapsed) {
        header.classList.add("collapsed");
      } else {
        header.classList.remove("collapsed");
      }
    });
    
    allGroupContents.forEach(content => {
      if (groupsCollapsed) {
        content.classList.add("collapsed");
      } else {
        content.classList.remove("collapsed");
      }
    });
    
    // 更新按钮文字
    toggleGroupsBtn.textContent = groupsCollapsed ? "📂 展开分组" : "📂 折叠分组";
  });
  
  // 删除链接
  async function deleteLink(id) {
    if (!confirm("确定要删除这个链接吗？")) return;
    
    chrome.storage.local.get({ links: [] }, (res) => {
      const links = (res.links || []).filter(l => l.id !== id);
      chrome.storage.local.set({ links }, () => {
        allLinks = links;
        selectedLinkIds.delete(id);
        renderLinks();
        updateCount();
        updateBadge();
        DB.deleteSnapshot(id).then(() => {
          if (isThumbnailMode()) renderLinks();
        });
      });
    });
  }
  
  // 清空全部
  clearAllBtn.addEventListener("click", async () => {
    if (!confirm(`确定要删除所有 ${allLinks.length} 个链接吗？`)) return;
    
    // 清空所有快照
    await DB.clearAllSnapshots();
    
    chrome.storage.local.set({ links: [] }, () => {
      allLinks = [];
      selectedLinkIds.clear();
      renderLinks();
      updateCount();
      updateBadge();
    });
  });
  
  // 复制全部
  copyAllBtn.addEventListener("click", () => {
    if (allLinks.length === 0) {
      alert("没有链接可复制！");
      return;
    }
    
    const text = allLinks.map((l, i) => 
      `${i + 1}. ${l.url}\n来源: ${l.title || l.page || '未知'}\n日期: ${l.date || ''}`
    ).join("\n\n");
    
    navigator.clipboard.writeText(text).then(() => {
      copyAllBtn.textContent = "✓ 已复制";
      setTimeout(() => {
        copyAllBtn.textContent = "📋 复制全部";
      }, 1500);
    });
  });
  
  // 保存HTML下拉菜单事件
  const htmlDropdown = saveHtmlDropdown ? saveHtmlDropdown.querySelector(".dropdown-content") : null;
  
  document.getElementById("exportAllHtmlSnap")?.addEventListener("click", (e) => { 
    e.preventDefault(); 
    if (htmlDropdown) htmlDropdown.classList.remove("show");
    exportLinks("html", { snapshots: true, selected: false }); 
  });
  document.getElementById("exportAllHtmlNoSnap")?.addEventListener("click", (e) => { 
    e.preventDefault(); 
    if (htmlDropdown) htmlDropdown.classList.remove("show");
    exportLinks("html", { snapshots: false, selected: false }); 
  });
  document.getElementById("exportSelectedHtmlSnap")?.addEventListener("click", (e) => { 
    e.preventDefault(); 
    if (htmlDropdown) htmlDropdown.classList.remove("show");
    exportLinks("html", { snapshots: true, selected: true }); 
  });
  document.getElementById("exportSelectedHtmlNoSnap")?.addEventListener("click", (e) => { 
    e.preventDefault(); 
    if (htmlDropdown) htmlDropdown.classList.remove("show");
    exportLinks("html", { snapshots: false, selected: true }); 
  });

  // 保存HTML默认按钮 (点击展开)
  saveHtmlBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (groupJumpDropdown) groupJumpDropdown.classList.remove("show");
    if (htmlDropdown) htmlDropdown.classList.toggle("show");
  });

  // 点击页面其他地方关闭下拉菜单
  window.addEventListener("click", (e) => {
    if (htmlDropdown && htmlDropdown.classList.contains("show") && !e.target.closest(".dropdown")) {
      htmlDropdown.classList.remove("show");
    }
    if (groupJumpDropdown && groupJumpDropdown.classList.contains("show") && !e.target.closest(".group-jump-dropdown")) {
      groupJumpDropdown.classList.remove("show");
    }
  });
  
  // 保存TXT按钮
  saveTxtBtn.addEventListener("click", () => {
    exportLinks("txt");
  });
  
  // 批量操作按钮
  const batchMoveBtn = document.getElementById("batchMoveBtn");
  const batchDeleteBtn = document.getElementById("batchDeleteBtn");
  const batchCancelBtn = document.getElementById("batchCancelBtn");
  
  if (batchMoveBtn) batchMoveBtn.addEventListener("click", showBatchMoveDialog);
  if (batchDeleteBtn) batchDeleteBtn.addEventListener("click", batchDeleteLinks);
  if (batchCancelBtn) batchCancelBtn.addEventListener("click", cancelBatchSelection);
  
  // 批量工具栏全选复选框
  const batchSelectAllCheckbox = document.getElementById('batchSelectAllCheckbox');
  if (batchSelectAllCheckbox) {
    batchSelectAllCheckbox.addEventListener('change', () => {
      const isChecked = batchSelectAllCheckbox.checked;
      getRenderedLinkIds().forEach(linkId => {
        setLinkSelected(linkId, isChecked);
      });
      updateBatchToolbar();
    });
  }
  
  // 排序按钮
  const sortBtn = document.getElementById("sortBtn");
  let pageSortBtn = document.getElementById("pageSortBtn");
  if (!pageSortBtn && sortBtn && sortBtn.parentElement) {
    pageSortBtn = document.createElement("button");
    pageSortBtn.id = "pageSortBtn";
    pageSortBtn.className = "btn btn-secondary";
    sortBtn.insertAdjacentElement("afterend", pageSortBtn);
  }

  function updatePageSortButtonText() {
    if (!pageSortBtn) return;
    if (pageSortOrder === "asc") {
      pageSortBtn.textContent = "📄 按页数排序(少→多)";
    } else if (pageSortOrder === "desc") {
      pageSortBtn.textContent = "📄 按页数排序(多→少)";
    } else {
      pageSortBtn.textContent = "📄 按页数排序(关闭)";
    }
  }

  if (sortBtn) {
    // 从 localStorage 读取排序状态
    const savedSortOrder = localStorage.getItem('sortOrder') || 'oldest';
    sortOrder = savedSortOrder;
    pageSortOrder = localStorage.getItem('pageSortOrder') || 'off';
    
    // 初始化按钮文本
    sortBtn.textContent = sortOrder === "oldest" ? "⏱️ 按时间排序(旧→新)" : "⏱️ 按时间排序(新→旧)";
    updatePageSortButtonText();
    
    sortBtn.addEventListener("click", () => {
      sortOrder = sortOrder === "oldest" ? "newest" : "oldest";
      sortBtn.textContent = sortOrder === "oldest" ? "⏱️ 按时间排序(旧→新)" : "⏱️ 按时间排序(新→旧)";
      
      // 保存排序状态到 localStorage
      localStorage.setItem('sortOrder', sortOrder);
      
      renderLinks();
    });
  }

  if (pageSortBtn) {
    pageSortBtn.addEventListener("click", () => {
      if (pageSortOrder === "off") {
        pageSortOrder = "asc";
      } else if (pageSortOrder === "asc") {
        pageSortOrder = "desc";
      } else {
        pageSortOrder = "off";
      }

      localStorage.setItem('pageSortOrder', pageSortOrder);
      updatePageSortButtonText();
      renderLinks();
    });
  }
  
  // 导出链接 (异步支持快照)
  async function exportLinks(format, options = { snapshots: true, selected: false }) {
    try {
    let linksToExport = allLinks;
    
    if (options.selected) {
      const selectedIds = getSelectedLinkIds();
      
      if (selectedIds.length === 0) {
        alert("请先选择要导出的链接。");
        return;
      }
      linksToExport = allLinks.filter(l => selectedIds.includes(l.id));
    }

    if (linksToExport.length === 0) {
      alert("没有链接可导出。");
      return;
    }
    
    // 生成文件名时间戳
    const date = new Date();
    const fileTimestamp = date.getFullYear() + '-' + 
      (date.getMonth() + 1).toString().padStart(2, '0') + '-' + 
      date.getDate().toString().padStart(2, '0') + '-' + 
      date.getHours().toString().padStart(2, '0') + 
      date.getMinutes().toString().padStart(2, '0') + 
      date.getSeconds().toString().padStart(2, '0');
    
    if (format === "txt") {
      const out = linksToExport.map((l, i) => 
        `${i + 1}. ${l.url}\n来源: ${l.title || l.page || '未知'}\n日期: ${l.date || ''}`
      ).join("\n\n");
      const scopeText = options.selected ? "选中" : "全部";
      const filename = `保存了${linksToExport.length}个链接(${scopeText}) - ${fileTimestamp}.txt`;
      downloadBlob(out, filename, "text/plain");
    } else if (format === "csv") {
      const rows = ["序号,网址,来源,日期"];
      linksToExport.forEach((l, i) => {
        const url = `"${String(l.url || "").replace(/"/g, '""')}"`;
        const source = `"${String(l.title || l.page || "").replace(/"/g, '""')}"`;
        const date = `"${l.date || ""}"`;
        rows.push(`${i + 1},${url},${source},${date}`);
      });
      downloadBlob(rows.join("\n"), "links.csv", "text/csv");
    } else if (format === "html") {
      // 预先获取快照 (如果需要)
      const snapshots = {};
      if (options.snapshots) {
        for (const link of linksToExport) {
          if (link.hasSnapshot) {
            try {
              const imgData = await DB.getSnapshot(link.id);
              if (imgData) snapshots[link.id] = imgData;
            } catch (e) {
              console.error("导出HTML时获取快照失败:", e);
            }
          }
        }
      }

      const timestamp = new Date().toLocaleString('zh-CN');
      const htmlContent = generateFullHTML(linksToExport, allGroups, timestamp, snapshots, options.snapshots);
      const scopeText = options.selected ? "选中" : "全部";
      const snapText = options.snapshots ? "带快照" : "无快照";
      const filename = `保存了${linksToExport.length}个链接(${scopeText}-${snapText}) - ${fileTimestamp}.html`;
      downloadBlob(htmlContent, filename, "text/html");
    } else if (format === "doc") {
      const docParts = [
        "<!doctype html><html><head><meta charset='utf-8'></head><body>",
        "<h2>保存的链接</h2>"
      ];
      linksToExport.forEach((l, i) => {
        const safeUrl = escapeHtml(l.url);
        const safeSource = escapeHtml(l.title || l.page || "");
        const safeDate = escapeHtml(l.date || "");
        docParts.push(`<p style="font-family:Calibri,Arial;"><b>${i + 1}. ${safeUrl}</b><br><a href="${safeUrl}" style="color:#0645AD;text-decoration:underline;">${safeUrl}</a><br>来源: ${safeSource}<br>${safeDate}</p>`);
      });
      docParts.push("</body></html>");
      downloadBlob(docParts.join("\n"), "links.doc", "application/msword");
    }
    } catch(e) { alert("导出出错: " + e.stack); }
  }
  
  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  
  // 导出数据为JSON（用于扩展间同步）
  async function exportData() {
    const snapshots = {};
    
    // 异步获取所有快照
    for (const link of allLinks) {
      if (link.hasSnapshot) {
        try {
          const imgData = await DB.getSnapshot(link.id);
          if (imgData) {
            snapshots[link.id] = imgData;
          }
        } catch (e) {
          console.error(`导出快照失败 (ID: ${link.id}):`, e);
        }
      }
    }

    const data = {
      version: '1.1',
      timestamp: new Date().toISOString(),
      links: allLinks,
      groups: allGroups,
      snapshots: snapshots
    };
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    const filename = `链接收集器数据(${allLinks.length}个链接)_${year}-${month}-${day}_${hours}${minutes}${seconds}.json`;
    downloadBlob(JSON.stringify(data, null, 2), filename, 'application/json');
  }
  
  // 导入数据从JSON
  function importData(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        
        // 验证数据格式
        if (!data.links || !Array.isArray(data.links)) {
          alert('无效的数据格式');
          return;
        }
        
        const importLinksCount = (data.links || []).length;
        const importGroupsCount = (data.groups || []).length;
        const hasSnapshots = !!(data.snapshots && Object.keys(data.snapshots).length > 0);
        
        // 询问是否覆盖或合并，并显示要导入的数量
        const choice = confirm(`准备导入 ${importLinksCount} 个链接和 ${importGroupsCount} 个分组${hasSnapshots ? '（包含快照）' : ''}\n\n是否覆盖现有数据？\n点击"确定"覆盖，点击"取消"合并`);
        
        let snapshotsToSave = []; // [{id, data}]

        if (choice) {
          // 覆盖模式
          allLinks = data.links || [];
          allGroups = data.groups || [];
          
          // 准备覆盖快照
          if (hasSnapshots) {
            await DB.clearAllSnapshots();
            for (const id in data.snapshots) {
              snapshotsToSave.push({ id, data: data.snapshots[id] });
            }
          }
        } else {
          // 合并模式 - 避免ID冲突
          const maxLinkId = Math.max(...allLinks.map(l => l.id || 0), 0);
          const maxGroupId = Math.max(...allGroups.map(g => g.id || 0), 0);
          
          const oldToNewLinkIdMap = {};

          // 重新分配ID
          const importedLinks = (data.links || []).map((link, idx) => {
            const oldId = link.id;
            const newId = maxLinkId + idx + 1;
            oldToNewLinkIdMap[oldId] = newId;
            return {
              ...link,
              id: newId
            };
          });
          
          const importedGroups = (data.groups || []).map((group, idx) => ({
            ...group,
            id: maxGroupId + idx + 1
          }));
          
          // 更新导入的链接中的groupId引用
          const oldGroupIdMap = {};
          (data.groups || []).forEach((oldGroup, idx) => {
            oldGroupIdMap[oldGroup.id] = importedGroups[idx].id;
          });
          
          importedLinks.forEach(link => {
            if (link.groupId && oldGroupIdMap[link.groupId]) {
              link.groupId = oldGroupIdMap[link.groupId];
            }
          });
          
          // 准备合并快照
          if (hasSnapshots) {
            for (const oldId in data.snapshots) {
              const newId = oldToNewLinkIdMap[oldId];
              if (newId) {
                snapshotsToSave.push({ id: newId, data: data.snapshots[oldId] });
              }
            }
          }

          allLinks = [...allLinks, ...importedLinks];
          allGroups = [...allGroups, ...importedGroups];
        }
        
        // 保存快照到 IndexedDB
        for (const s of snapshotsToSave) {
          await DB.saveSnapshot(s.id, s.data);
        }

        // 保存到存储
        chrome.storage.local.set({ 
          links: allLinks,
          groups: allGroups
        }, () => {
          renderLinks();
          updateCount();
          updateGroupCount();
          updateBadge();
          updateContextMenus(); // 更新右键菜单
          alert(`成功导入 ${importLinksCount} 个链接和 ${importGroupsCount} 个分组${snapshotsToSave.length > 0 ? `（及 ${snapshotsToSave.length} 张快照）` : ''}`);
        });
      } catch (err) {
        console.error('导入失败详情:', err);
        alert('导入失败：' + err.message);
      }
    };
    reader.readAsText(file);
  }
  
  // 绑定导入导出按钮事件
  const exportDataBtn = document.getElementById('exportDataBtn');
  const importDataBtn = document.getElementById('importDataBtn');
  const importFileInput = document.getElementById('importFileInput');
  
  if (exportDataBtn) {
    exportDataBtn.addEventListener('click', exportData);
  }
  
  if (importDataBtn) {
    importDataBtn.addEventListener('click', () => {
      importFileInput.click();
    });
  }
  
  if (importFileInput) {
    importFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        importData(e.target.files[0]);
        e.target.value = ''; // 重置input
      }
    });
  }
  
  // 生成完整HTML（完全复刻Export Tabs样式）
  function generateFullHTML(links, groups, timestamp, snapshots = {}, includeSnapshots = true) {
    const tabCount = links.length;

    // 辅助函数：获取域名
    function getBaseDomain(url) {
      try {
        const hostname = new URL(url).hostname.replace('www.', '');
        const parts = hostname.split('.');
        return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
      } catch { return 'unknown'; }
    }

    // 辅助函数：按域名分组
    function groupTabsByDomain(tabs) {
      const groups = {};
      tabs.forEach(tab => {
        const domain = getBaseDomain(tab.url);
        if (!groups[domain]) groups[domain] = [];
        groups[domain].push(tab);
      });
      return Object.keys(groups).sort().reduce((acc, domain) => {
        acc[domain] = groups[domain];
        return acc;
      }, {});
    }

    // 生成单个链接条目
    function generateTabEntry(link, index, inlineSnapshot = false) {
      const saveTime = link.date ? `<div class="tab-save-time">保存时间: ${escapeHtml(link.date)}</div>` : '';
      const pageCountText = getPageCountText(link);
      const pageCountDisplay = pageCountText ? `<div class="tab-page-count">页数: ${escapeHtml(pageCountText)}</div>` : '';
      
      let tagsDisplay = '';
      if (link.tags && link.tags.length > 0) {
        const spanHTML = link.tags.map(t => `<span style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:500; color:${t.textColor || '#ffffff'}; text-shadow:0 1px 1px rgba(0,0,0,0.3); background:${t.color}; margin-right:6px;">${escapeHtml(t.text)}</span>`).join('');
        tagsDisplay = `<div class="tab-tags" style="margin-top:6px;">${spanHTML}</div>`;
      }
      
      // 快照显示
      let snapshotHTML = '';
      const snapshotData = snapshots[link.id];
      if (includeSnapshots && snapshotData) {
        let markerHTML = '';
        if (link.clickPoint) {
          const { x, y, viewportW, viewportH } = link.clickPoint;
          if (viewportW && viewportH) {
            const left = (x / viewportW) * 100;
            const top = (y / viewportH) * 100;
            markerHTML = `<div class="snapshot-marker" style="left: ${left}%; top: ${top}%;"></div>`;
          }
        }
        const snapshotClass = inlineSnapshot ? 'tab-snapshot has-image' : 'tab-snapshot';
        const hydratedAttr = inlineSnapshot ? ' data-hydrated="1"' : '';
        const imageHTML = inlineSnapshot ? `<img src="${snapshotData}" alt="快照">` : '';
        snapshotHTML = `
          <div class="${snapshotClass}" data-id="${link.id}"${hydratedAttr} onclick="window.showPreview(this)">
            ${imageHTML}
            ${markerHTML}
          </div>
        `;
      }

      return `
        <div class="tab-entry" data-url="${escapeHtml(link.url)}" data-title="${escapeHtml(link.title || link.page || '')}" data-group-id="${link.groupId || ''}" data-page-count="${getPageCountValue(link)}" data-tags="${escapeHtml(link.tags ? link.tags.map(t=>t.text).join(' ') : '')}">
          <span class="tab-index">${index}</span>
          <input type="checkbox" class="tab-checkbox" onclick="window.updateSelectionState()">
          <div class="tab-content">
            <a href="${escapeHtml(link.url)}" class="tab-title" target="_blank" onmousedown="window.handleLinkClick(event)">${escapeHtml(link.url)}</a>
            <div class="tab-url-container">
              <span class="tab-url-toggle" onclick="window.toggleUrl(this)">▶ 显示来源</span>
              <div class="tab-url collapsed">来源: ${escapeHtml(link.title || link.page || '未知')}</div>
            </div>
            ${saveTime}
            ${pageCountDisplay}
            ${tagsDisplay}
            <div class="visit-info"><span class="visit-time"></span><span class="visit-count"></span></div>
            <div class="tab-markers">
              <label class="marker-checkbox marker-downloaded">
                <input type="checkbox" class="marker-downloaded-cb" onchange="window.saveMarker(this, 'downloaded')">
                <span>✓ 已下载</span>
              </label>
              <label class="marker-checkbox marker-skipped">
                <input type="checkbox" class="marker-skipped-cb" onchange="window.saveMarker(this, 'skipped')">
                <span>✗ 未下载</span>
              </label>
            </div>
          </div>
          ${snapshotHTML}
        </div>`;
    }

    // 按字母排序
    const linksByTitle = [...links].sort((a, b) => (a.title || a.page || a.url || '').localeCompare(b.title || b.page || b.url || ''));
    // 按URL排序
    const linksByUrl = [...links].sort((a, b) => (a.url || '').localeCompare(b.url || ''));
    // 按域名分组
    const groupedLinksByDomain = groupTabsByDomain(links);
    
    // 按自定义分组生成HTML
    let customGroupsHTML = '';
    const globalLinks = links.filter(link => !link.groupId);
    if (globalLinks.length > 0) {
      // 组内按保存时间排序（新→旧）
      const sortedGlobalLinks = globalLinks.sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        return dateB.localeCompare(dateA);
      });
      customGroupsHTML += `
        <div class="tab-group">
          <div class="group-header" onclick="window.toggleGroup(this)">
            <span class="group-header-title">
              <span style="display:inline-block;width:16px;height:16px;background:#9E9E9E;border-radius:3px;margin-right:8px;vertical-align:middle;"></span>
              全局（无分组） 【共有${globalLinks.length}个链接】
            </span>
            <span class="toggle-icon">▾</span>
          </div>
          <div class="group-content">${sortedGlobalLinks.map((link, i) => generateTabEntry(link, i + 1)).join('')}</div>
        </div>`;
    }
    groups.forEach(group => {
      const groupLinks = links.filter(link => link.groupId === group.id);
      if (groupLinks.length > 0) {
        // 组内按保存时间排序（新→旧）
        const sortedGroupLinks = groupLinks.sort((a, b) => {
          const dateA = a.date || '';
          const dateB = b.date || '';
          return dateB.localeCompare(dateA);
        });
        customGroupsHTML += `
          <div class="tab-group">
            <div class="group-header" onclick="window.toggleGroup(this)">
              <span class="group-header-title">
                <span style="display:inline-block;width:16px;height:16px;background:${escapeHtml(group.color)};border-radius:3px;margin-right:8px;vertical-align:middle;"></span>
                ${escapeHtml(group.name)} 【共有${groupLinks.length}个链接】
              </span>
              <span class="toggle-icon">▾</span>
            </div>
            <div class="group-content">${sortedGroupLinks.map((link, i) => generateTabEntry(link, i + 1)).join('')}</div>
          </div>`;
      }
    });
    
    // 按保存时间分组生成HTML
    let bySaveTimeHTML = '';
    const dateGroups = {};
    links.forEach(link => {
      const dateStr = link.date || '';
      const dateMatch = dateStr.match(/(\d{4})\/(\d{2})\/(\d{2})/);
      if (dateMatch) {
        const [, year, month, day] = dateMatch;
        const dateKey = `${year}/${month}/${day}`;
        const dateDisplay = `${month}月${day}日`;
        if (!dateGroups[dateKey]) {
          dateGroups[dateKey] = { display: dateDisplay, links: [] };
        }
        dateGroups[dateKey].links.push(link);
      }
    });
    
    const sortedDates = Object.keys(dateGroups).sort().reverse();
    sortedDates.forEach(dateKey => {
      const group = dateGroups[dateKey];
      // 组内按保存时间排序（新→旧）
      const sortedLinks = group.links.sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        return dateB.localeCompare(dateA);
      });
      bySaveTimeHTML += `
        <div class="tab-group">
          <div class="group-header" onclick="window.toggleGroup(this)">
            <span class="group-header-title">📅 ${group.display} 【共有${group.links.length}个链接】</span>
            <span class="toggle-icon">▾</span>
          </div>
          <div class="group-content">${sortedLinks.map((link, i) => generateTabEntry(link, i + 1)).join('')}</div>
        </div>`;
    });

    const ALL_TABS_JSON = JSON.stringify(links.map(l => ({
      id: l.id,
      url: l.url,
      title: l.title || l.page || '',
      date: l.date,
      pageCount: getPageCountValue(l),
      groupId: l.groupId,
      note: l.note || '',
      tags: Array.isArray(l.tags) ? l.tags.map(t => ({
        text: t.text,
        color: t.color,
        textColor: t.textColor || '#ffffff'
      })) : [],
      clickPoint: l.clickPoint
    })));
    const ALL_SNAPSHOTS_JSON = includeSnapshots ? JSON.stringify(snapshots) : '{}';
    const ALL_GROUPS_JSON = JSON.stringify(groups);
    const EXPORTED_FAVICON_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAfQAAAH0CAYAAADL1t+KAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAFC2lUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSfvu78nIGlkPSdXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQnPz4KPHg6eG1wbWV0YSB4bWxuczp4PSdhZG9iZTpuczptZXRhLyc+CjxyZGY6UkRGIHhtbG5zOnJkZj0naHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyc+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczpBdHRyaWI9J2h0dHA6Ly9ucy5hdHRyaWJ1dGlvbi5jb20vYWRzLzEuMC8nPgogIDxBdHRyaWI6QWRzPgogICA8cmRmOlNlcT4KICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0nUmVzb3VyY2UnPgogICAgIDxBdHRyaWI6Q3JlYXRlZD4yMDI1LTEwLTA3PC9BdHRyaWI6Q3JlYXRlZD4KICAgICA8QXR0cmliOkV4dElkPjk5YWEzMjU5LWNmNTMtNGJiMS05YzI1LTJiMGY4YWI0ZDlhMjwvQXR0cmliOkV4dElkPgogICAgIDxBdHRyaWI6RmJJZD41MjUyNjU5MTQxNzk1ODA8L0F0dHJpYjpGYklkPgogICAgIDxBdHRyaWI6VG91Y2hUeXBlPjI8L0F0dHJpYjpUb3VjaFR5cGU+CiAgICA8L3JkZjpsaT4KICAgPC9yZGY6U2VxPgogIDwvQXR0cmliOkFkcz4KIDwvcmRmOkRlc2NyaXB0aW9uPgoKIDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PScnCiAgeG1sbnM6ZGM9J2h0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvJz4KICA8ZGM6dGl0bGU+CiAgIDxyZGY6QWx0PgogICAgPHJkZjpsaSB4bWw6bGFuZz0neC1kZWZhdWx0Jz5Db3B5IExpbmsgQ2hyb21lIEV4dGVuc2lvbiAtIDE8L3JkZjpsaT4KICAgPC9yZGY6QWx0PgogIDwvZGM6dGl0bGU+CiA8L3JkZjpEZXNjcmlwdGlvbj4KCiA8cmRm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';

    const EXPORTED_FAVICON_SMALL_DATA_URL = 'data:image/png;base64,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';
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>保存的链接 - ${timestamp}</title><link rel="icon" type="image/png" sizes="32x32" href="${EXPORTED_FAVICON_SMALL_DATA_URL}"><link rel="shortcut icon" href="${EXPORTED_FAVICON_SMALL_DATA_URL}">
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px 20px 20px 210px; background: #f5f5f5; }
        .static-header { background: #fff; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .sticky-controls { position: sticky; top: 15px; z-index: 1000; background: rgba(255,255,255,0.95); backdrop-filter: blur(8px); padding: 15px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); display: flex; align-items: center; flex-wrap: wrap; gap: 15px; }
        .button-group { display: flex; flex-wrap: wrap; gap: 10px; }
        .button { padding: 8px 16px; background: #2196F3; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
        .button:hover { background: #1976D2; }
        .search-container { flex-grow: 1; min-width: 200px; }
        .search-input { width: 100%; padding: 8px 12px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
        .view-controls { position: fixed; left: 20px; top: 20px; width: 150px; z-index: 999; background: #fff; padding: 15px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); display: flex; flex-direction: column; gap: 10px; }
        .view-button { padding: 10px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; font-size: 13px; text-align: left; }
        .view-button:hover { background: #f5f5f5; }
        .view-button.active { background: #2196F3; color: white; border-color: #2196F3; }
        .tabs-container { background: #fff; padding: 20px; border-radius: 8px; }
        .tab-entry { padding: 15px; border-bottom: 1px solid #eee; display: flex; align-items: flex-start; gap: 12px; transition: background 0.2s; }
        .tab-entry:hover { background: #f9f9f9; }
        .tab-entry.selected { background: #e3f2fd; }
        .tab-entry.hidden { display: none; }
        .tab-index { min-width: 30px; text-align: right; font-weight: bold; color: #666; font-size: 14px; flex-shrink: 0; }
        .tab-checkbox { margin-top: 4px; cursor: pointer; flex-shrink: 0; }
        .tab-content { flex-grow: 1; min-width: 0; }
        .tab-title { color: #2196F3; text-decoration: none; font-weight: 500; display: block; margin-bottom: 5px; word-break: break-word; background: #E8F5E9; padding: 4px 8px; border-radius: 4px; }
        .tab-title:hover { text-decoration: underline; }
        .tab-url-container { margin-top: 4px; }
        .tab-url { color: #666; font-size: 0.85em; word-break: break-all; max-height: 0; overflow: hidden; transition: max-height 0.3s; background: #FFEBEE; padding: 0 8px; border-radius: 4px; }
        .tab-url.expanded { max-height: 500px; margin-top: 4px; padding: 6px 8px; }
        .tab-url-toggle { color: #2196F3; font-size: 0.85em; cursor: pointer; user-select: none; display: inline-block; }
        .tab-url-toggle:hover { text-decoration: underline; }
        .tab-save-time { color: #999; font-size: 0.8em; margin-top: 4px; }
        .tab-page-count { color: #5b6ee1; font-size: 0.85em; margin-top: 4px; font-weight: 600; }
        .tab-note { color: #333; font-size: 0.85em; background: #FFF3E0; padding: 6px 10px; border-radius: 4px; margin-top: 6px; border-left: 3px solid #FF9800; }
        .visit-info { display: flex; gap: 15px; font-size: 0.8em; margin-top: 6px; font-style: italic; color: #666; }
        .tab-group { margin-bottom: 20px; }
        .group-header { font-size: 1.1em; font-weight: 500; color: #666; padding: 10px; background: #f5f5f5; border-radius: 4px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
        .group-header:hover { background: #eeeeee; }
        .group-header-title { display: flex; align-items: center; gap: 8px; }
        .toggle-icon { transition: transform 0.2s; }
        .collapsed .toggle-icon { transform: rotate(-90deg); }
        .group-content { margin-top: 10px; }
        .group-content.collapsed { max-height: 0; overflow: hidden; margin-top: 0; }
        .views > div { display: none; }
        .views > div.active { display: block; }
        .tab-markers { display: flex; gap: 8px; margin-top: 8px; }
        .marker-checkbox { cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 4px; user-select: none; }
        .marker-checkbox:hover { background-color: #f0f0f0; }
        .marker-checkbox input { cursor: pointer; }
        .marker-downloaded { color: #4CAF50; font-weight: 500; }
        .marker-skipped { color: #F44336; font-weight: 500; }
        .visit-info.visited-count-1 { color: #E53935 !important; } 
        .visit-info.visited-count-2 { color: #FB8C00 !important; }
        .visit-info.visited-count-3 { color: #FDD835 !important; } 
        .visit-info.visited-count-4 { color: #43A047 !important; }
        .visit-info.visited-count-5 { color: #00ACC1 !important; } 
        .visit-info.visited-count-6 { color: #1E88E5 !important; }
        .visit-info.visited-count-7 { color: #5E35B1 !important; }
        .empty-state { text-align: center; padding: 40px; color: #666; }
        
        /* Snapshot styles in Exported HTML */
        .tab-snapshot { width: 120px; height: 75px; border-radius: 4px; overflow: hidden; background: #fff; border: 1px solid #ddd; flex-shrink: 0; cursor: pointer; position: relative; display: flex; align-items: center; justify-content: center; }
        .tab-snapshot img { width: 100%; height: 100%; object-fit: contain; object-position: center; display: block; }
        .tab-snapshot .snapshot-marker { position: absolute; width: 8px; height: 8px; background: #ff4444; border-radius: 50%; transform: translate(-50%, -50%); border: 1px solid white; box-shadow: 0 0 3px rgba(0,0,0,0.5); pointer-events: none; }
        .tab-snapshot::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, #f5f5f5 0%, #ececec 50%, #f5f5f5 100%); background-size: 200% 100%; animation: snapshotLoading 1.2s ease-in-out infinite; }
        .tab-snapshot.has-image::before { display: none; }
        @keyframes snapshotLoading { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        
        .preview-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); display: none; justify-content: center; align-items: center; z-index: 10000; }
        .preview-modal.show { display: flex; }
        .preview-container { position: relative; display: inline-block; line-height: 0; max-width: 95vw; max-height: 95vh; }
        .preview-container img { max-width: 100%; max-height: 100%; display: block; border-radius: 8px; background: white; box-shadow: 0 0 30px rgba(0,0,0,0.5); }
        .preview-container .snapshot-marker { position: absolute; width: 16px; height: 16px; background: #ff4444; border-radius: 50%; transform: translate(-50%, -50%); border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.8); pointer-events: none; }
      </style></head><body>
      <div class="static-header">
        <div class="stats"><strong>总链接数:</strong> ${tabCount} | <strong>保存时间:</strong> ${timestamp}</div>
      </div>
      <div class="sticky-controls">
        <div class="button-group">
          <button class="button" onclick="window.openTabsBySelector('.tab-entry')">打开全部链接</button>
          <button class="button" onclick="window.openTabsBySelector('.views > .active .tab-entry:not(.hidden)')">打开过滤后的链接</button>
          <button class="button" id="openSelectedButton" onclick="window.openTabsBySelector('.tab-checkbox:checked')" disabled>打开选中的链接</button>
          <button class="button" style="background:#FF9800" onclick="window.toggleAllUrls()">一键展开所有来源</button>
          <button class="button" style="background:#673AB7" onclick="window.toggleAllGroups()">折叠/展开分组</button>
          <button class="button" style="background:#00BCD4" id="sortOrderBtn" onclick="window.toggleSortOrder()">排序: 新→旧</button>
          <button class="button" style="background:#3F51B5" id="pageSortOrderBtn" onclick="window.togglePageSortOrder()">页数排序: 关闭</button>
          <button class="button" style="background:#9C27B0" onclick="window.clearMarkers()">清除下载标记</button>
          <button class="button" style="background:#F44336" onclick="window.clearVisitHistory()">清除访问历史</button>
        </div>
        <div class="search-container" style="position: relative; display: flex; align-items: center;">
          <input type="text" class="search-input" placeholder="搜索..." oninput="window.searchTabs(this.value)" style="padding-right: 110px; width: 100%;">
          <div style="position: absolute; right: 15px; display: flex; align-items: center; gap: 10px;">
            <span id="clearSearchBtn" title="清空搜索" onclick="window.searchTabs('')" style="cursor: pointer; color: #666; font-size: 18px; user-select: none; display: none; margin-top: -2px;">✕</span>
            <span id="searchResultCount" style="font-size: 13px; font-weight: bold; color: #2196F3; display: none; white-space: nowrap;"></span>
          </div>
        </div>
      </div>
      <div class="view-controls">
        <button class="view-button active" data-view="recent">最新</button>
        <button class="view-button" data-view="alphabetical">按字母顺序</button>
        <button class="view-button" data-view="url">按网址</button>
        <button class="view-button" data-view="bySaveTime">按保存时间分组</button>
        <button class="view-button" data-view="byCustomGroup">按自定义分组</button>
        <button class="view-button" data-view="byNote">按标签分组</button>
        <button class="view-button" data-view="byTabGroup">按标签组</button>
        <button class="view-button" data-view="byRulesUnvisited">未访问(聚合)</button>
        <button class="view-button" data-view="byRulesUnvisitedInGroup">未访问(组内)</button>
        <button class="view-button" data-view="grouped">按域名分组</button>
        <button class="view-button" data-view="byDownloaded" style="border-left: 4px solid #4CAF50;">✓ 已下载</button>
        <button class="view-button" data-view="byNotDownloaded" style="border-left: 4px solid #F44336;">✗ 未下载</button>
        <button class="view-button" data-view="byUnchecked" style="border-left: 4px solid #9E9E9E;">⚪ 未勾选</button>
      </div>
      <div class="views">
        <div class="tabs-container active" id="recent">${links.map((link, i) => generateTabEntry(link, i + 1, true)).join('')}</div>
        <div class="tabs-container" id="alphabetical">${linksByTitle.map((link, i) => generateTabEntry(link, i + 1)).join('')}</div>
        <div class="tabs-container" id="url">${linksByUrl.map((link, i) => generateTabEntry(link, i + 1)).join('')}</div>
        <div class="tabs-container" id="bySaveTime">${bySaveTimeHTML}</div>
        <div class="tabs-container" id="byCustomGroup">${customGroupsHTML}</div>
        <div class="tabs-container" id="byNote"></div>
        <div class="tabs-container" id="byTabGroup">
          <div class="tab-group">
            <div class="group-header" onclick="window.toggleGroup(this)">
              <span class="group-header-title">所有链接 【共有${links.length}个链接】</span>
              <span class="toggle-icon">▾</span>
            </div>
            <div class="group-content">${links.map((link, i) => generateTabEntry(link, i + 1)).join('')}</div>
          </div>
        </div>
        <div class="tabs-container" id="byRulesUnvisited"></div>
        <div class="tabs-container" id="byRulesUnvisitedInGroup"></div>
        <div class="tabs-container" id="grouped">
          ${Object.entries(groupedLinksByDomain).map(([domain, dLinks]) => {
            // 组内按保存时间排序（新→旧）
            const sortedLinks = dLinks.sort((a, b) => {
              const dateA = a.date || '';
              const dateB = b.date || '';
              return dateB.localeCompare(dateA);
            });
            return `
            <div class="tab-group">
              <div class="group-header" onclick="window.toggleGroup(this)">
                <span class="group-header-title">${domain} 【当前域名共有${dLinks.length}个链接】</span>
                <span class="toggle-icon">▾</span>
              </div>
              <div class="group-content">${sortedLinks.map((link, i) => generateTabEntry(link, i + 1)).join('')}</div>
            </div>`;
          }).join('')}
        </div>
        <div class="tabs-container" id="byDownloaded"></div>
        <div class="tabs-container" id="byNotDownloaded"></div>
        <div class="tabs-container" id="byUnchecked"></div>
      </div>
      
      <!-- Preview Modal for Exported HTML -->
      <div id="previewModal" class="preview-modal" onclick="this.classList.remove('show')">
        <div class="preview-container">
          <img id="previewImage" src="" alt="预览">
        </div>
      </div>

      <script>
        const STORAGE_KEY = 'tabSaverVisitedLinks';
        const MARKERS_STORAGE_KEY = 'tabSaverMarkers';
        const ALL_TABS_DATA = ${ALL_TABS_JSON};
        const ALL_SNAPSHOTS_DATA = ${ALL_SNAPSHOTS_JSON};
        const ALL_GROUPS_DATA = ${ALL_GROUPS_JSON};
        let currentSortOrder = 'desc'; // 'desc' = 新→旧(默认), 'asc' = 旧→新
        let currentPageSortOrder = 'off'; // 'off' = 关闭, 'asc' = 少→多, 'desc' = 多→少

        const getVisitedLinks = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const getMarkers = () => JSON.parse(localStorage.getItem(MARKERS_STORAGE_KEY) || '{}');
        const getPageCountValue = (link) => {
          const value = Number(link && link.pageCount);
          return Number.isInteger(value) && value > 0 ? value : 0;
        };

        window.recordVisit = (el) => {
          const url = el.dataset.url;
          const visited = getVisitedLinks();
          const data = visited[url] || { count: 0 };
          data.count++;
          data.lastVisited = new Date().toISOString();
          visited[url] = data;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(visited));
          updateVisitInfo(el, data);
        };

        const updateVisitInfo = (el, data) => {
          const timeEl = el.querySelector('.visit-time');
          const countEl = el.querySelector('.visit-count');
          const info = el.querySelector('.visit-info');
          if (timeEl) timeEl.textContent = '上次访问: ' + new Date(data.lastVisited).toLocaleString();
          if (countEl) countEl.textContent = '访问 ' + data.count + ' 次';
          if (info) {
            for (let i = 1; i <= 7; i++) info.classList.remove('visited-count-' + i);
            info.classList.add('visited-count-' + (((data.count - 1) % 7) + 1));
          }
        };

        window.handleLinkClick = (e) => { if (e.button <= 1) window.recordVisit(e.currentTarget.closest('.tab-entry')); };

        window.saveMarker = (cb, type) => {
          const tabEntry = cb.closest('.tab-entry');
          const url = tabEntry.dataset.url;
          const markers = getMarkers();
          if (!markers[url]) markers[url] = {};

          if (cb.checked) {
            const otherType = type === 'downloaded' ? 'skipped' : 'downloaded';
            const otherCb = tabEntry.querySelector(type === 'downloaded' ? '.marker-skipped-cb' : '.marker-downloaded-cb');
            if (otherCb) {
              otherCb.checked = false;
              markers[url][otherType] = false;
            }
          }

          markers[url][type] = cb.checked;
          localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(markers));
        };

        window.clearMarkers = () => {
          if (confirm('确定要清除所有下载标记吗？')) {
            localStorage.removeItem(MARKERS_STORAGE_KEY);
            document.querySelectorAll('.marker-downloaded-cb, .marker-skipped-cb').forEach(c => c.checked = false);
          }
        };

        window.clearVisitHistory = () => {
          if (confirm('确定要清除访问历史吗？')) {
            localStorage.removeItem(STORAGE_KEY);
            document.querySelectorAll('.visit-time, .visit-count').forEach(e => e.textContent = '');
            document.querySelectorAll('.visit-info').forEach(info => {
              for (let i = 1; i <= 7; i++) info.classList.remove('visited-count-' + i);
            });
          }
        };

        window.toggleUrl = (el) => {
          const url = el.nextElementSibling;
          const expanding = url.classList.contains('collapsed');
          url.classList.toggle('collapsed', !expanding);
          url.classList.toggle('expanded', expanding);
          el.textContent = expanding ? '▼ 隐藏来源' : '▶ 显示来源';
        };

        window.toggleGroup = (el) => { 
          el.classList.toggle('collapsed'); 
          el.nextElementSibling.classList.toggle('collapsed'); 
        };

        window.updateSelectionState = () => {
          const totalSelected = document.querySelectorAll('.tab-checkbox:checked').length;
          const btn = document.getElementById('openSelectedButton');
          btn.disabled = totalSelected === 0;
          btn.textContent = totalSelected > 0 ? \`打开选中的 (\${totalSelected})\` : '打开选中的链接';
          document.querySelectorAll('.tab-checkbox').forEach(cb => cb.closest('.tab-entry').classList.toggle('selected', cb.checked));
        };

        window.searchTabs = (q) => {
          q = q.toLowerCase();
          const input = document.querySelector('.search-input');
          if (input && input.value !== q) input.value = q;
          
          const clearBtn = document.getElementById('clearSearchBtn');
          const countBadge = document.getElementById('searchResultCount');
          if (clearBtn) clearBtn.style.display = q ? 'inline-block' : 'none';
          
          const active = document.querySelector('.views > .active');
          let visibleCount = 0;
          active.querySelectorAll('.tab-entry').forEach(e => {
            const match = e.dataset.title.toLowerCase().includes(q) || 
                         e.dataset.url.toLowerCase().includes(q) || 
                         (e.dataset.pageCount && e.dataset.pageCount.includes(q)) ||
                         (e.dataset.tags && e.dataset.tags.toLowerCase().includes(q));
            e.classList.toggle('hidden', !match);
            if (match) visibleCount++;
          });
          
          if (countBadge) {
            if (q) {
              countBadge.textContent = '找到 ' + visibleCount + ' 个';
              countBadge.style.display = 'inline';
            } else {
              countBadge.style.display = 'none';
            }
          }
          
          active.querySelectorAll('.tab-group').forEach(g => {
            const hasVisible = g.querySelectorAll('.tab-entry:not(.hidden)').length > 0;
            g.style.display = hasVisible ? '' : 'none';
          });
        };

        window.openTabsBySelector = (sel) => {
          const entries = sel === '.tab-checkbox:checked' ? Array.from(document.querySelectorAll(sel)).map(c => c.closest('.tab-entry')) : document.querySelectorAll(sel);
          entries.forEach(e => {
            if (!e.classList.contains('hidden')) {
              window.open(e.dataset.url, '_blank');
              window.recordVisit(e);
            }
          });
        };

        window.toggleAllUrls = () => {
          const expanding = !window.allUrlsExpanded;
          const active = document.querySelector('.views > .active');
          active.querySelectorAll('.tab-url').forEach(u => u.classList.toggle('expanded', expanding));
          active.querySelectorAll('.tab-url-toggle').forEach(t => t.textContent = expanding ? '▼ 隐藏来源' : '▶ 显示来源');
          window.allUrlsExpanded = expanding;
        };

        window.toggleAllGroups = () => {
          const collapsing = !window.allGroupsCollapsed;
          const active = document.querySelector('.views > .active');
          active.querySelectorAll('.group-header').forEach(h => {
            if (collapsing) {
              h.classList.add('collapsed');
            } else {
              h.classList.remove('collapsed');
            }
          });
          active.querySelectorAll('.group-content').forEach(c => {
            if (collapsing) {
              c.classList.add('collapsed');
            } else {
              c.classList.remove('collapsed');
            }
          });
          window.allGroupsCollapsed = collapsing;
        };

        function hydrateSnapshotNode(el) {
          if (!el || el.dataset.hydrated === '1') return;
          const id = el.dataset.id;
          const dataUrl = ALL_SNAPSHOTS_DATA[id];
          if (!dataUrl) return;
          const img = document.createElement('img');
          img.src = dataUrl;
          img.alt = '快照';
          el.prepend(img);
          el.dataset.hydrated = '1';
          el.classList.add('has-image');
        }

        window.hydrateSnapshots = (base = document) => {
          base.querySelectorAll('.tab-snapshot[data-id]').forEach(hydrateSnapshotNode);
        };

        window.showPreview = (el) => {
          hydrateSnapshotNode(el);
          const id = el.dataset.id;
          const dataUrl = ALL_SNAPSHOTS_DATA[id];
          const tabData = ALL_TABS_DATA.find(t => String(t.id) === String(id));
          const clickPoint = tabData ? tabData.clickPoint : null;
          
          if (!dataUrl) return;

          const modal = document.getElementById('previewModal');
          const img = document.getElementById('previewImage');
          const container = modal.querySelector('.preview-container');
          
          // Clear old markers
          container.querySelectorAll('.snapshot-marker').forEach(m => m.remove());
          
          img.src = dataUrl;
          if (clickPoint) {
            const { x, y, viewportW, viewportH } = clickPoint;
            if (viewportW && viewportH) {
              const marker = document.createElement('div');
              marker.className = 'snapshot-marker';
              marker.style.left = (x / viewportW) * 100 + '%';
              marker.style.top = (y / viewportH) * 100 + '%';
              container.appendChild(marker);
            }
          }
          modal.classList.add('show');
        };

        // Esc key to close modal
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') document.getElementById('previewModal').classList.remove('show');
        });

        function compareExportEntries(a, b) {
          if (currentPageSortOrder !== 'off') {
            const pageA = Number(a.dataset.pageCount || '0');
            const pageB = Number(b.dataset.pageCount || '0');
            if (pageA !== pageB) {
              return currentPageSortOrder === 'asc' ? pageA - pageB : pageB - pageA;
            }
          }

          const dateA = a.querySelector('.tab-save-time')?.textContent.replace('保存时间: ', '') || '';
          const dateB = b.querySelector('.tab-save-time')?.textContent.replace('保存时间: ', '') || '';
          return currentSortOrder === 'desc' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
        }

        function updateExportSortButtons() {
          const timeBtn = document.getElementById('sortOrderBtn');
          const pageBtn = document.getElementById('pageSortOrderBtn');
          if (timeBtn) {
            timeBtn.textContent = currentSortOrder === 'desc' ? '排序: 新→旧' : '排序: 旧→新';
          }
          if (pageBtn) {
            if (currentPageSortOrder === 'asc') {
              pageBtn.textContent = '页数排序: 少→多';
            } else if (currentPageSortOrder === 'desc') {
              pageBtn.textContent = '页数排序: 多→少';
            } else {
              pageBtn.textContent = '页数排序: 关闭';
            }
          }
        }

        function resortActiveView() {
          const active = document.querySelector('.views > .active');
          if (!active) return;

          active.querySelectorAll('.tab-group').forEach(group => {
            const content = group.querySelector('.group-content');
            if (!content) return;
            const entries = Array.from(content.querySelectorAll('.tab-entry'));
            entries.sort(compareExportEntries);
            content.innerHTML = '';
            entries.forEach((entry, index) => {
              const indexEl = entry.querySelector('.tab-index');
              if (indexEl) indexEl.textContent = index + 1;
              content.appendChild(entry);
            });
          });

          if (!active.querySelector('.tab-group')) {
            const entries = Array.from(active.querySelectorAll(':scope > .tab-entry'));
            entries.sort(compareExportEntries);
            active.innerHTML = '';
            entries.forEach((entry, index) => {
              const indexEl = entry.querySelector('.tab-index');
              if (indexEl) indexEl.textContent = index + 1;
              active.appendChild(entry);
            });
          }
        }

        window.toggleSortOrder = () => {
          currentSortOrder = currentSortOrder === 'desc' ? 'asc' : 'desc';
          updateExportSortButtons();
          resortActiveView();
        };

        window.togglePageSortOrder = () => {
          if (currentPageSortOrder === 'off') {
            currentPageSortOrder = 'asc';
          } else if (currentPageSortOrder === 'asc') {
            currentPageSortOrder = 'desc';
          } else {
            currentPageSortOrder = 'off';
          }
          updateExportSortButtons();
          resortActiveView();
        };

        function generateTabEntryInternal(link, i) {
          const escapeText = (value) => String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
          const saveTime = link.date ? '<div class="tab-save-time">保存时间: ' + escapeText(link.date) + '</div>' : '';
          const pageCount = getPageCountValue(link);
          const pageCountDisplay = pageCount > 0 ? '<div class="tab-page-count">页数: ' + pageCount + ' 页</div>' : '';
          
          let tagsDisplay = '';
          if (link.tags && link.tags.length > 0) {
            const spanHTML = link.tags.map(t => '<span onclick="event.stopPropagation(); window.searchTabs(this.textContent.trim())" title="点击搜索该标签" style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:500; color:' + (t.textColor || '#ffffff') + '; text-shadow:0 1px 1px rgba(0,0,0,0.3); background:' + t.color + '; margin-right:6px; cursor:pointer;">' + escapeText(t.text) + '</span>').join('');
            tagsDisplay = '<div class="tab-tags" style="margin-top:6px;">' + spanHTML + '</div>';
          }
          
          let snapshotHTML = '';
          const snapshotData = ALL_SNAPSHOTS_DATA[link.id];
          if (snapshotData) {
            let markerHTML = '';
            if (link.clickPoint) {
              const { x, y, viewportW, viewportH } = link.clickPoint;
              if (viewportW && viewportH) {
                const left = (x / viewportW) * 100;
                const top = (y / viewportH) * 100;
                markerHTML = '<div class="snapshot-marker" style="left: ' + left + '%; top: ' + top + '%;"></div>';
              }
            }
            snapshotHTML = '<div class="tab-snapshot" data-id="' + link.id + '" onclick="window.showPreview(this)"><img src="' + snapshotData + '" alt="快照">' + markerHTML + '</div>';
          }

          return '<div class="tab-entry" data-url="' + escapeText(link.url) + '" data-title="' + escapeText(link.title || link.page || '') + '" data-page-count="' + pageCount + '" data-tags="' + escapeText(link.tags ? link.tags.map(t => t.text).join(' ') : '') + '">' +
            '<span class="tab-index">' + (i + 1) + '</span>' +
            '<input type="checkbox" class="tab-checkbox" onclick="window.updateSelectionState()">' +
            '<div class="tab-content">' +
            '<a href="' + escapeText(link.url) + '" class="tab-title" target="_blank" onmousedown="window.handleLinkClick(event)">' + escapeText(link.url) + '</a>' +
            '<div class="tab-url-container">' +
            '<span class="tab-url-toggle" onclick="window.toggleUrl(this)">▶ 显示来源</span>' +
            '<div class="tab-url collapsed">来源: ' + escapeText(link.title || link.page || '未知') + '</div>' +
            '</div>' +
            saveTime + pageCountDisplay + tagsDisplay +
            '<div class="visit-info"><span class="visit-time"></span><span class="visit-count"></span></div>' +
            '<div class="tab-markers">' +
            '<label class="marker-checkbox marker-downloaded"><input type="checkbox" class="marker-downloaded-cb" onchange="window.saveMarker(this, &quot;downloaded&quot;)"><span>✓ 已下载</span></label>' +
            '<label class="marker-checkbox marker-skipped"><input type="checkbox" class="marker-skipped-cb" onchange="window.saveMarker(this, &quot;skipped&quot;)"><span>✗ 未下载</span></label>' +
            '</div></div>' + snapshotHTML + '</div>';
        }

        function regenerateUnvisitedView() {
          const container = document.getElementById('byRulesUnvisited');
          const visited = getVisitedLinks();
          const unvisitedLinks = ALL_TABS_DATA.filter(t => !visited[t.url]);

          if (unvisitedLinks.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>没有未访问的链接</p></div>';
            return;
          }

          container.innerHTML = \`
            <div class="tab-group">
              <div class="group-header" onclick="window.toggleGroup(this)">
                <span class="group-header-title">未访问的链接 【共有\${unvisitedLinks.length}个链接】</span>
                <span class="toggle-icon">▾</span>
              </div>
              <div class="group-content">\${unvisitedLinks.map((link, i) => generateTabEntryInternal(link, i)).join('')}</div>
            </div>\`;
          applyState(container);
        }

        function regenerateUnvisitedInGroupView() {
          const container = document.getElementById('byRulesUnvisitedInGroup');
          const visited = getVisitedLinks();
          const unvisitedLinks = ALL_TABS_DATA.filter(t => !visited[t.url]);

          if (unvisitedLinks.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>没有未访问的链接</p></div>';
            return;
          }

          // 获取当前激活的视图类型（从localStorage或默认）
          const lastView = localStorage.getItem('lastNonUnvisitedView') || 'grouped';
          let html = '';

          if (lastView === 'grouped') {
            // 按域名分组
            const domainGroups = {};
            unvisitedLinks.forEach(link => {
              try {
                const hostname = new URL(link.url).hostname.replace('www.', '');
                const parts = hostname.split('.');
                const domain = parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
                if (!domainGroups[domain]) domainGroups[domain] = [];
                domainGroups[domain].push(link);
              } catch {
                if (!domainGroups['unknown']) domainGroups['unknown'] = [];
                domainGroups['unknown'].push(link);
              }
            });

            const sortedDomains = Object.keys(domainGroups).sort();
            sortedDomains.forEach(domain => {
              const links = domainGroups[domain];
              html += \`
                <div class="tab-group">
                  <div class="group-header" onclick="window.toggleGroup(this)">
                    <span class="group-header-title">\${domain} 【未访问 \${links.length} 个链接】</span>
                    <span class="toggle-icon">▾</span>
                  </div>
                  <div class="group-content">\${links.map((link, i) => generateTabEntryInternal(link, i)).join('')}</div>
                </div>\`;
            });
          } else if (lastView === 'bySaveTime') {
            // 按保存时间分组
            const dateGroups = {};
            unvisitedLinks.forEach(link => {
              const dateStr = link.date || '';
              const dateMatch = dateStr.match(/(\\d{4})\\/(\\d{2})\\/(\\d{2})/);
              if (dateMatch) {
                const [, year, month, day] = dateMatch;
                const dateKey = \`\${year}/\${month}/\${day}\`;
                const dateDisplay = \`\${month}月\${day}日\`;
                if (!dateGroups[dateKey]) {
                  dateGroups[dateKey] = { display: dateDisplay, links: [] };
                }
                dateGroups[dateKey].links.push(link);
              }
            });

            const sortedDates = Object.keys(dateGroups).sort().reverse();
            sortedDates.forEach(dateKey => {
              const group = dateGroups[dateKey];
              html += \`
                <div class="tab-group">
                  <div class="group-header" onclick="window.toggleGroup(this)">
                    <span class="group-header-title">📅 \${group.display} 【未访问 \${group.links.length} 个链接】</span>
                    <span class="toggle-icon">▾</span>
                  </div>
                  <div class="group-content">\${group.links.map((link, i) => generateTabEntryInternal(link, i)).join('')}</div>
                </div>\`;
            });
          } else if (lastView === 'byCustomGroup') {
            // 按自定义分组
            const globalLinks = unvisitedLinks.filter(link => !link.groupId);
            if (globalLinks.length > 0) {
              html += \`
                <div class="tab-group">
                  <div class="group-header" onclick="window.toggleGroup(this)">
                    <span class="group-header-title">
                      <span style="display:inline-block;width:16px;height:16px;background:#9E9E9E;border-radius:3px;margin-right:8px;vertical-align:middle;"></span>
                      全局（无分组） 【未访问 \${globalLinks.length} 个链接】
                    </span>
                    <span class="toggle-icon">▾</span>
                  </div>
                  <div class="group-content">\${globalLinks.map((link, i) => generateTabEntryInternal(link, i)).join('')}</div>
                </div>\`;
            }
            
            ALL_GROUPS_DATA.forEach(group => {
              const groupLinks = unvisitedLinks.filter(link => link.groupId === group.id);
              if (groupLinks.length > 0) {
                html += \`
                  <div class="tab-group">
                    <div class="group-header" onclick="window.toggleGroup(this)">
                      <span class="group-header-title">
                        <span style="display:inline-block;width:16px;height:16px;background:\${group.color};border-radius:3px;margin-right:8px;vertical-align:middle;"></span>
                        \${group.name} 【未访问 \${groupLinks.length} 个链接】
                      </span>
                      <span class="toggle-icon">▾</span>
                    </div>
                    <div class="group-content">\${groupLinks.map((link, i) => generateTabEntryInternal(link, i)).join('')}</div>
                  </div>\`;
              }
            });
          } else {
            // 默认按域名分组
            const domainGroups = {};
            unvisitedLinks.forEach(link => {
              try {
                const hostname = new URL(link.url).hostname.replace('www.', '');
                const parts = hostname.split('.');
                const domain = parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
                if (!domainGroups[domain]) domainGroups[domain] = [];
                domainGroups[domain].push(link);
              } catch {
                if (!domainGroups['unknown']) domainGroups['unknown'] = [];
                domainGroups['unknown'].push(link);
              }
            });

            const sortedDomains = Object.keys(domainGroups).sort();
            sortedDomains.forEach(domain => {
              const links = domainGroups[domain];
              html += \`
                <div class="tab-group">
                  <div class="group-header" onclick="window.toggleGroup(this)">
                    <span class="group-header-title">\${domain} 【未访问 \${links.length} 个链接】</span>
                    <span class="toggle-icon">▾</span>
                  </div>
                  <div class="group-content">\${links.map((link, i) => generateTabEntryInternal(link, i)).join('')}</div>
                </div>\`;
            });
          }

          container.innerHTML = html;
          applyState(container);
        }

        function regenerateByMarker(type) {
          const container = document.getElementById('by' + type);
          const markers = getMarkers();
          let filteredLinks;
          
          if (type === 'Downloaded') {
            filteredLinks = ALL_TABS_DATA.filter(t => markers[t.url] && markers[t.url].downloaded);
          } else if (type === 'NotDownloaded') {
            filteredLinks = ALL_TABS_DATA.filter(t => markers[t.url] && markers[t.url].skipped);
          } else { // Unchecked
            filteredLinks = ALL_TABS_DATA.filter(t => !markers[t.url] || (!markers[t.url].downloaded && !markers[t.url].skipped));
          }

          if (filteredLinks.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>没有匹配的链接</p></div>';
            return;
          }

          container.innerHTML = \`
            <div class="tab-group">
              <div class="group-header" onclick="window.toggleGroup(this)">
                <span class="group-header-title">链接列表 【共有\${filteredLinks.length}个链接】</span>
                <span class="toggle-icon">▾</span>
              </div>
              <div class="group-content">\${filteredLinks.map((link, i) => generateTabEntryInternal(link, i)).join('')}</div>
            </div>\`;
          applyState(container);
        }

        function regenerateByTagsView() {
          const container = document.getElementById('byNote');
          const tagMap = new Map();
          const withoutTags = [];
          
          ALL_TABS_DATA.forEach(link => {
            if (!link.tags || link.tags.length === 0) {
              withoutTags.push(link);
            } else {
              link.tags.forEach(tag => {
                if (!tagMap.has(tag.text)) {
                  tagMap.set(tag.text, { color: tag.color, textColor: tag.textColor || '#ffffff', links: [] });
                }
                tagMap.get(tag.text).links.push(link);
              });
            }
          });

          let html = '';
          const sortedTags = Array.from(tagMap.keys()).sort();
          
          sortedTags.forEach(tagText => {
            const tagInfo = tagMap.get(tagText);
            const links = tagInfo.links;
            html += '<div class="tab-group">' +
              '<div class="group-header" onclick="window.toggleGroup(this)">' +
              '<span class="group-header-title">标签 <span onclick="event.stopPropagation(); window.searchTabs(this.textContent.trim())" title="点击搜索该标签" style="display:inline-block; padding:2px 6px; border-radius:10px; background:' + tagInfo.color + '; color:' + tagInfo.textColor + '; font-size:12px; cursor:pointer;">' + escapeHtml(tagText) + '</span> 【共有' + links.length + '个链接】</span>' +
              '<span class="toggle-icon">▾</span>' +
              '</div>' +
              '<div class="group-content">' + links.map((link, i) => generateTabEntryInternal(link, i)).join('') + '</div>' +
              '</div>';
          });
          
          if (withoutTags.length > 0) {
            html += '<div class="tab-group">' +
              '<div class="group-header" onclick="window.toggleGroup(this)">' +
              '<span class="group-header-title">未添加标签 【共有' + withoutTags.length + '个链接】</span>' +
              '<span class="toggle-icon">▾</span>' +
              '</div>' +
              '<div class="group-content">' + withoutTags.map((link, i) => generateTabEntryInternal(link, i)).join('') + '</div>' +
              '</div>';
          }

          container.innerHTML = html;
          applyState(container);
        }

        function applyState(base = document) {
          const visited = getVisitedLinks();
          const markers = getMarkers();
          base.querySelectorAll('.tab-entry').forEach(e => {
            const url = e.dataset.url;
            if (visited[url]) updateVisitInfo(e, visited[url]);
            if (markers[url]) {
              if (markers[url].downloaded) e.querySelector('.marker-downloaded-cb').checked = true;
              if (markers[url].skipped) e.querySelector('.marker-skipped-cb').checked = true;
            }
          });
        }

        document.querySelectorAll('.view-button').forEach(btn => {
          btn.addEventListener('click', () => {
            document.querySelectorAll('.view-button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.views > div').forEach(v => v.classList.remove('active'));
            const target = document.getElementById(btn.dataset.view);
            target.classList.add('active');
            
            // 记录非未访问视图，用于组内未访问模式
            if (btn.dataset.view !== 'byRulesUnvisited' && btn.dataset.view !== 'byRulesUnvisitedInGroup') {
              localStorage.setItem('lastNonUnvisitedView', btn.dataset.view);
            }
            
            if (btn.dataset.view === 'byRulesUnvisited') {
              regenerateUnvisitedView();
            } else if (btn.dataset.view === 'byRulesUnvisitedInGroup') {
              regenerateUnvisitedInGroupView();
            } else if (btn.dataset.view === 'byNote') {
              regenerateByTagsView();
            } else if (btn.dataset.view === 'byDownloaded') {
              regenerateByMarker('Downloaded');
            } else if (btn.dataset.view === 'byNotDownloaded') {
              regenerateByMarker('NotDownloaded');
            } else if (btn.dataset.view === 'byUnchecked') {
              regenerateByMarker('Unchecked');
            }
            window.searchTabs('');
            resortActiveView();
          });
        });

        document.addEventListener('DOMContentLoaded', () => {
          applyState();
          window.hydrateSnapshots();
          updateExportSortButtons();
        });
      </script></body></html>`;
  }

  
  // 更新角标
  function updateBadge() {
    const count = allLinks.length;
    if (count > 0) {
      chrome.action.setBadgeText({ text: String(Math.min(999, count)) });
      chrome.action.setBadgeBackgroundColor({ color: '#2196F3' });
      chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  }
  
  // 搜索
  searchInput.addEventListener("input", renderLinks);
  const clearBtn = document.getElementById('clearSearchBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      searchInput.value = '';
      renderLinks();
      searchInput.focus();
    });
  }
  
  // 主题切换
  chrome.storage.local.get(["themeMode"], (res) => {
    themeMode = res.themeMode || "auto";
    applyTheme(themeMode);
  });
  
  themeBtn.addEventListener("click", () => {
    const modes = ["auto", "light", "dark"];
    const idx = modes.indexOf(themeMode);
    themeMode = modes[(idx + 1) % modes.length];
    applyTheme(themeMode);
    chrome.storage.local.set({ themeMode });
  });

  // 保存后自动关闭标签开关
  if (autoCloseTabBtn) {
    autoCloseTabBtn.addEventListener("change", () => {
      chrome.storage.local.set({ autoCloseTab: autoCloseTabBtn.checked }, () => {
        console.log("✅ 保存后自动关闭标签设置已更新:", autoCloseTabBtn.checked);
      });
    });
  }
  
  function applyTheme(mode) {
    if (mode === "auto") {
      const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.body.classList.toggle("dark", prefersDark);
      themeBtn.textContent = "A";
    } else if (mode === "light") {
      document.body.classList.remove("dark");
      themeBtn.textContent = "☀️";
    } else {
      document.body.classList.add("dark");
      themeBtn.textContent = "🌙";
    }
  }
  
  // ========== 分组管理功能 ==========
  
  // 打开分组管理弹窗
  manageGroupsBtn.addEventListener("click", () => {
    groupModal.classList.add("show");
    renderGroupList();
  });
  
  // 关闭分组管理弹窗
  closeGroupModal.addEventListener("click", () => {
    groupModal.classList.remove("show");
  });
  
  // 点击弹窗外部关闭
  groupModal.addEventListener("click", (e) => {
    if (e.target === groupModal) {
      groupModal.classList.remove("show");
    }
  });
  
  // 渲染分组列表
  function renderGroupList() {
    groupList.innerHTML = "";
    
    // 更新弹窗标题的分组数量
    const groupCountBadge = document.getElementById("groupCountBadge");
    if (groupCountBadge) {
      groupCountBadge.textContent = allGroups.length;
    }
    
    allGroups.forEach((group, index) => {
      const linkCount = allLinks.filter(link => link.groupId === group.id).length;
      
      const item = document.createElement("div");
      item.className = "group-item";
      item.innerHTML = `
        <div class="group-sort-buttons">
          <button class="group-sort-btn" data-direction="up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>▲</button>
          <button class="group-sort-btn" data-direction="down" data-index="${index}" ${index === allGroups.length - 1 ? 'disabled' : ''}>▼</button>
        </div>
        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0; margin-right: 10px;">
          <label style="font-size:12px; font-weight:bold; color:var(--text-muted); display:flex; align-items:center; gap:4px; cursor:pointer;" title="修改背景色">
            背景<div class="group-color" style="position:relative; overflow:hidden; background: ${group.color};" data-group-id="${group.id}">
              <input type="color" value="${group.color}" class="group-color-input" style="position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;cursor:pointer;">
            </div>
          </label>
          <label style="font-size:12px; font-weight:bold; color:var(--text-muted); display:flex; align-items:center; gap:4px; cursor:pointer;" title="修改文字色">
            文字<div class="group-text-color" style="position:relative; overflow:hidden; background: ${group.textColor || '#FFFFFF'}; border: 2px solid var(--border); width: 24px; height: 24px; border-radius: 4px; cursor: pointer;" data-group-id="${group.id}">
              <input type="color" value="${group.textColor || '#FFFFFF'}" class="group-text-color-input" style="position:absolute;left:0;top:-2px;width:100%;height:30px;opacity:0;cursor:pointer;">
            </div>
          </label>
        </div>
        <div class="group-name">${escapeHtml(group.name)}</div>
        <div class="group-count">${linkCount} 个链接</div>
        <div class="group-actions">
          <button class="group-btn group-btn-edit" data-group-id="${group.id}">✏️ 编辑</button>
          <button class="group-btn group-btn-delete" data-group-id="${group.id}">🗑️ 删除</button>
        </div>
      `;
      
      // 排序按钮
      const upBtn = item.querySelector('[data-direction="up"]');
      const downBtn = item.querySelector('[data-direction="down"]');
      
      if (upBtn && !upBtn.disabled) {
        upBtn.addEventListener("click", () => {
          moveGroup(index, index - 1);
        });
      }
      
      if (downBtn && !downBtn.disabled) {
        downBtn.addEventListener("click", () => {
          moveGroup(index, index + 1);
        });
      }
      
      // 颜色选择器
      const colorInput = item.querySelector(".group-color-input");
      colorInput.addEventListener("input", (e) => {
        // 实时预览
        item.querySelector(".group-color").style.background = e.target.value;
      });
      colorInput.addEventListener("change", (e) => {
        updateGroupColor(group.id, e.target.value);
      });
      
      // 文字颜色选择器
      const textColorInput = item.querySelector(".group-text-color-input");
      textColorInput.addEventListener("input", (e) => {
        // 实时预览
        item.querySelector(".group-text-color").style.background = e.target.value;
      });
      textColorInput.addEventListener("change", (e) => {
        updateGroupTextColor(group.id, e.target.value);
      });
      
      // 编辑按钮
      const editBtn = item.querySelector(".group-btn-edit");
      editBtn.addEventListener("click", () => {
        const newName = prompt("输入新的分组名称:", group.name);
        if (newName && newName.trim()) {
          updateGroupName(group.id, newName.trim());
        }
      });
      
      // 删除按钮
      const deleteBtn = item.querySelector(".group-btn-delete");
      deleteBtn.addEventListener("click", () => {
        deleteGroup(group.id);
      });
      
      groupList.appendChild(item);
    });
  }
  
  // 移动分组位置
  function moveGroup(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= allGroups.length) return;
    
    const [movedGroup] = allGroups.splice(fromIndex, 1);
    allGroups.splice(toIndex, 0, movedGroup);
    
    chrome.storage.local.set({ groups: allGroups }, () => {
      renderGroupList();
      updateContextMenus();
      renderLinks();
    });
  }
  
  // 添加新分组
  addGroupBtn.addEventListener("click", () => {
    const name = newGroupName.value.trim();
    const color = newGroupColor.value;
    const textColor = newGroupTextColor ? newGroupTextColor.value : '#FFFFFF';
    
    if (!name) {
      alert("请输入分组名称！");
      return;
    }
    
    const newGroup = {
      id: 'group_' + Date.now(),
      name: name,
      color: color,
      textColor: textColor
    };
    
    allGroups.push(newGroup);
    chrome.storage.local.set({ groups: allGroups }, () => {
      newGroupName.value = "";
      newGroupColor.value = "#2196F3";
      if (newGroupTextColor) newGroupTextColor.value = "#FFFFFF";
      renderGroupList();
      updateContextMenus();
      renderLinks();
      updateGroupCount();
    });
  });
  
  // 更新分组名称
  function updateGroupName(groupId, newName) {
    const group = allGroups.find(g => g.id === groupId);
    if (group) {
      group.name = newName;
      chrome.storage.local.set({ groups: allGroups }, () => {
        renderGroupList();
        updateContextMenus();
        renderLinks();
      });
    }
  }
  
  // 更新分组颜色
  function updateGroupColor(groupId, newColor) {
    const group = allGroups.find(g => g.id === groupId);
    if (group) {
      group.color = newColor;
      chrome.storage.local.set({ groups: allGroups }, () => {
        renderGroupList();
        renderLinks();
      });
    }
  }

  // 更新分组文字颜色
  function updateGroupTextColor(groupId, newColor) {
    const group = allGroups.find(g => g.id === groupId);
    if (group) {
      group.textColor = newColor;
      chrome.storage.local.set({ groups: allGroups }, () => {
        renderGroupList();
        renderLinks();
      });
    }
  }
  
  // 删除分组
  async function deleteGroup(groupId) {
    const linkCount = allLinks.filter(link => link.groupId === groupId).length;
    
    if (linkCount > 0) {
      if (!confirm(`该分组中有 ${linkCount} 个链接，删除后这些链接也将被永久删除。确定要删除吗？`)) {
        return;
      }
      
      const linksToDelete = allLinks.filter(link => link.groupId === groupId);
      const snapshotIdsToDelete = linksToDelete.map(link => link.id);
      
      // 直接从 allLinks 中删除该分组的所有链接
      allLinks = allLinks.filter(link => link.groupId !== groupId);
      
      chrome.storage.local.set({ links: allLinks }, () => {
        // 删除分组
        allGroups = allGroups.filter(g => g.id !== groupId);
        chrome.storage.local.set({ groups: allGroups }, () => {
          renderGroupList();
          updateContextMenus();
          renderLinks();
          updateGroupCount();
          updateCount(); // 更新总计数
          updateBadge(); // 更新工具栏图标计数
          DB.deleteSnapshots(snapshotIdsToDelete).then(() => {
            if (isThumbnailMode()) renderLinks();
          });
        });
      });
    } else {
      if (!confirm("确定要删除这个分组吗？")) {
        return;
      }
      
      allGroups = allGroups.filter(g => g.id !== groupId);
      chrome.storage.local.set({ groups: allGroups }, () => {
        renderGroupList();
        updateContextMenus();
        renderLinks();
        updateGroupCount();
      });
    }
  }
  
  // 通知background更新右键菜单
  function updateContextMenus() {
    chrome.runtime.sendMessage({ action: 'updateContextMenus' });
  }
  

  
  // ========== 分组管理功能结束 ==========
  
  // 批量模式标记：只有通过"取消选择"才能关闭工具栏
  let batchModeActive = false;
  
  // 更新批量操作工具栏
  function updateBatchToolbar() {
    syncSelectionUI();
    const renderedIds = getRenderedLinkIds();
    const checkedCount = renderedIds.filter(linkId => isLinkSelected(linkId)).length;
    const batchToolbar = document.getElementById('batchToolbar');
    const batchCount = document.getElementById('batchCount');
    const selectAllCb = document.getElementById('batchSelectAllCheckbox');
    
    if (checkedCount > 0) {
      batchModeActive = true;
      batchToolbar.style.display = 'flex';
      batchCount.textContent = `已选择 ${checkedCount} 个`;
    } else if (batchModeActive) {
      // 批量模式激活后，即使取消全选也保持工具栏显示
      batchToolbar.style.display = 'flex';
      batchCount.textContent = `已选择 0 个`;
    } else {
      batchToolbar.style.display = 'none';
    }
    
    // 更新全选复选框状态
    if (selectAllCb) {
      if (renderedIds.length === 0) {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = false;
      } else if (checkedCount === renderedIds.length) {
        selectAllCb.checked = true;
        selectAllCb.indeterminate = false;
      } else if (checkedCount > 0) {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = true;
      } else {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = false;
      }
    }
  }
  
  // 获取选中的链接ID
  function getSelectedLinkIds() {
    return Array.from(selectedLinkIds);
  }
  
  // 批量移动
  function showBatchMoveDialog() {
    const selectedIds = getSelectedLinkIds();
    if (selectedIds.length === 0) {
      alert('请先选择要移动的链接');
      return;
    }
    
    let options = '<option value="">全局（无分组）</option>';
    allGroups.forEach(group => {
      options += `<option value="${group.id}">${group.name}</option>`;
    });
    
    const dialog = document.createElement('div');
    dialog.className = 'modal show';
    dialog.style.zIndex = '10000';
    dialog.innerHTML = `
      <div class="modal-content" style="max-width: 400px; z-index: 10001;">
        <div class="modal-header">
          <h2>批量移动链接</h2>
          <button class="modal-close" id="batchMoveDialogClose">✕</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 15px; color: var(--text-muted); font-size: 14px;">
            将 ${selectedIds.length} 个链接移动到：
          </p>
          <select id="batchMoveToGroup" style="width: 100%; padding: 10px; border: 2px solid var(--border); border-radius: 6px; font-size: 14px; margin-bottom: 15px; position: relative; z-index: 10002;">
            ${options}
          </select>
          <div style="display: flex; gap: 10px; justify-content: flex-end; position: relative; z-index: 10002;">
            <button class="btn btn-secondary" id="batchMoveDialogCancel">取消</button>
            <button class="btn btn-primary" id="confirmBatchMove" style="cursor: pointer;">确定</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    // 关闭按钮
    const closeBtn = dialog.querySelector('#batchMoveDialogClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dialog.remove();
      });
    }
    
    // 取消按钮
    const cancelBtn = dialog.querySelector('#batchMoveDialogCancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dialog.remove();
      });
    }
    
    // 确定按钮 - 关键修复
    const confirmBtn = dialog.querySelector('#confirmBatchMove');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const selectElement = dialog.querySelector('#batchMoveToGroup');
        const newGroupId = selectElement.value || null;
        
        // 逐个移动链接
        selectedIds.forEach(linkId => {
          const link = allLinks.find(l => l.id === linkId);
          if (link) {
            link.groupId = newGroupId;
          }
        });
        
        // 保存到存储
        chrome.storage.local.set({ links: allLinks }, () => {
          selectedLinkIds.clear();
          renderLinks();
          dialog.remove();
          updateBatchToolbar();
        });
      });
    }
    
    // 点击背景关闭
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.remove();
      }
    });
  }
  
  // 批量删除
  async function batchDeleteLinks() {
    const selectedIds = getSelectedLinkIds();
    if (selectedIds.length === 0) return;
    
    if (confirm(`确定要删除这 ${selectedIds.length} 个链接吗？`)) {
      // 直接删除，不调用deleteLink避免重复确认
      allLinks = allLinks.filter(l => !selectedIds.includes(l.id));
      selectedIds.forEach(id => selectedLinkIds.delete(id));
      chrome.storage.local.set({ links: allLinks }, () => {
        renderLinks();
        updateCount();
        updateBadge();
        updateBatchToolbar();
        DB.deleteSnapshots(selectedIds).then(() => {
          if (isThumbnailMode()) renderLinks();
        });
      });
    }
  }
  
  // 取消选择 - 这是唯一关闭批量工具栏的方式
  function cancelBatchSelection() {
    selectedLinkIds.clear();
    // 同时取消所有分组全选复选框
    document.querySelectorAll('.group-select-all').forEach(cb => {
      cb.checked = false;
      cb.indeterminate = false;
    });
    batchModeActive = false;
    const batchToolbar = document.getElementById('batchToolbar');
    if (batchToolbar) batchToolbar.style.display = 'none';
    const selectAllCb = document.getElementById('batchSelectAllCheckbox');
    if (selectAllCb) {
      selectAllCb.checked = false;
      selectAllCb.indeterminate = false;
    }
  }
  
  // 标记重复链接
  function markDuplicates() {
    const urlMap = {};
    allLinks.forEach(link => {
      if (!urlMap[link.url]) {
        urlMap[link.url] = [];
      }
      urlMap[link.url].push(link.id);
    });
    
    const duplicateIds = [];
    Object.values(urlMap).forEach(ids => {
      if (ids.length > 1) {
        duplicateIds.push(...ids);
      }
    });
    
    if (duplicateIds.length === 0) {
      alert('没有重复的链接');
      return;
    }
    
    // 自动选中所有重复链接
    getRenderedLinkIds().forEach(linkId => {
      if (duplicateIds.includes(linkId)) {
        selectedLinkIds.add(linkId);
      }
    });
    
    updateBatchToolbar();
    alert(`找到 ${duplicateIds.length} 个重复链接，已自动选中`);
  }
  
  // 过滤显示关键字(如：点击重复标签/胶囊标签等)
  function filterByKeyword(keyword) {
    // 如果关键字本身包含空格并且还没有加双引号，则将其包裹在双引号内作为一个整体查询
    if (keyword.includes(' ') && !keyword.startsWith('"') && !keyword.endsWith('"')) {
      keyword = `"${keyword}"`;
    }
    // 将关键字放入搜索框并触发过滤
    searchInput.value = keyword;
    // 切换到"全部"视图以确保能看到所有匹配条目
    currentView = 'all';
    localStorage.setItem('currentView', 'all');
    syncViewTabState();
    renderLinks();
    // 滚动到顶部
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  
  // 过滤重复链接（只显示重复的）
  let showingDuplicatesOnly = false;
  function filterDuplicates() {
    showingDuplicatesOnly = !showingDuplicatesOnly;
    
    if (showingDuplicatesOnly) {
      // 计算重复的URL
      const urlMap = {};
      allLinks.forEach(link => {
        if (!urlMap[link.url]) {
          urlMap[link.url] = 0;
        }
        urlMap[link.url]++;
      });
      
      // 隐藏非重复链接
      document.querySelectorAll('.link-card').forEach(card => {
        const linkId = parseInt(card.dataset.linkId);
        const link = allLinks.find(l => l.id === linkId);
        if (link && urlMap[link.url] <= 1) {
          card.style.display = 'none';
        } else {
          card.style.display = '';
        }
      });
      
      document.getElementById('filterDuplicateBtn').textContent = '🔍 显示全部';
    } else {
      // 显示所有链接
      document.querySelectorAll('.link-card').forEach(card => {
        card.style.display = '';
      });
      document.getElementById('filterDuplicateBtn').textContent = '🔍 过滤重复';
    }
  }
  
  // 绑定按钮事件
  const markDuplicateBtn = document.getElementById('markDuplicateBtn');
  const filterDuplicateBtn = document.getElementById('filterDuplicateBtn');
  
  if (markDuplicateBtn) {
    markDuplicateBtn.addEventListener('click', markDuplicates);
  }
  
  if (filterDuplicateBtn) {
    filterDuplicateBtn.addEventListener('click', filterDuplicates);
  }

  function setPreviewDetailLock(locked) {
    document.documentElement.classList.toggle('preview-detail-lock', locked);
    document.body.classList.toggle('preview-detail-lock', locked);
  }

  function hidePreviewModalV2() {
    const modal = document.getElementById('previewModalV2');
    if (modal) {
      modal.classList.remove('show');
      modal.scrollTop = 0;
    }
    setPreviewDetailLock(false);
  }
  
  // 显示大图预览弹窗
  function showPreviewModalV2(options, legacyClickPoint) {
    const config = typeof options === 'string'
      ? { mode: 'simple', dataUrl: options, clickPoint: legacyClickPoint }
      : (options || {});
    const {
      mode = 'simple',
      dataUrl,
      clickPoint = null,
      link = null,
      index = null,
      visited = null
    } = config;

    if (!dataUrl) return;

    let modal = document.getElementById('previewModalV2');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'previewModalV2';
      modal.className = 'preview-modal preview-modal-detail';
      modal.style.zIndex = '20010';
      document.body.appendChild(modal);
    }

    const detailHtml = mode === 'detail' && link
      ? buildPreviewCardDetailHtml(link, index, visited)
      : '';

    modal.innerHTML = `
      <div class="preview-scroll-layer">
        <div class="preview-shell ${mode === 'detail' ? 'detail' : 'simple'}">
          <div class="preview-media-section">
            <div class="preview-container preview-image-frame">
              <img src="${dataUrl}" alt="快照预览">
            </div>
          </div>
          ${detailHtml ? `<div class="preview-detail-section">${detailHtml}</div>` : ''}
        </div>
      </div>
    `;

    modal.onclick = () => {
      hidePreviewModalV2();
    };

    const scrollLayer = modal.querySelector('.preview-scroll-layer');
    const shell = modal.querySelector('.preview-shell');
    const container = modal.querySelector('.preview-container');
    const previewImage = modal.querySelector('.preview-image-frame img');

    if (scrollLayer) {
      scrollLayer.addEventListener('click', () => hidePreviewModalV2());
    }
    if (shell) {
      shell.addEventListener('click', (e) => e.stopPropagation());
    }
    if (previewImage) {
      previewImage.addEventListener('click', () => hidePreviewModalV2());
    }

    const marker = createSnapshotMarker(clickPoint);
    if (marker && container) {
      marker.style.width = '20px';
      marker.style.height = '20px';
      container.appendChild(marker);
    }

    if (mode === 'detail' && link) {
      const previewUrl = modal.querySelector('.preview-detail-link');
      if (previewUrl) {
        previewUrl.addEventListener('mousedown', (e) => {
          if (e.button === 0 || e.button === 1) {
            recordVisit(link.url);
          }
        });
      }

      modal.querySelectorAll('.preview-detail-card .link-tag').forEach(tagEl => {
        bindTagAction(tagEl);
      });

      modal.querySelectorAll('.preview-detail-card .group-badge[data-group-name]').forEach(badgeEl => {
        badgeEl.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const groupName = e.currentTarget.dataset.groupName;
          if (groupName) {
            hidePreviewModalV2();
            filterByKeyword(groupName);
          }
        });
      });

      const dupBadge = modal.querySelector('.preview-detail-card .duplicate-badge');
      if (dupBadge) {
        dupBadge.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const dupUrl = dupBadge.dataset.duplicateUrl;
          if (dupUrl) {
            hidePreviewModalV2();
            filterByKeyword(dupUrl);
          }
        });
      }

      const detailCopyBtn = modal.querySelector('.preview-detail-card [data-action="copy-card-url"]');
      if (detailCopyBtn) {
        detailCopyBtn.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(link.url);
            const oldText = detailCopyBtn.textContent;
            detailCopyBtn.textContent = '已复制';
            setTimeout(() => {
              detailCopyBtn.textContent = oldText;
            }, 1200);
          } catch (err) {
            console.error('复制链接失败:', err);
          }
        });
      }

      const editCardBtn = modal.querySelector('.preview-detail-card [data-action="edit-card-tags"]');
      if (editCardBtn) {
        editCardBtn.addEventListener('click', () => {
          hidePreviewModalV2();
          showTagDialog(link.id);
        });
      }

      const moveCardBtn = modal.querySelector('.preview-detail-card [data-action="move-card-group"]');
      if (moveCardBtn) {
        moveCardBtn.addEventListener('click', () => {
          hidePreviewModalV2();
          showMoveDialog(link.id);
        });
      }

      const deleteBtn = modal.querySelector('.preview-detail-card [data-action="delete-card-link"]');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          hidePreviewModalV2();
          deleteLink(link.id);
        });
      }
    }

    setPreviewDetailLock(true);
    modal.classList.add('show');
    modal.scrollTop = 0;
    requestAnimationFrame(() => {
      modal.scrollTop = 0;
      if (scrollLayer) {
        scrollLayer.scrollTop = 0;
      }
    });
  }

  function showPreviewModal(dataUrl, clickPoint) {
    const config = typeof dataUrl === 'string'
      ? { mode: 'simple', dataUrl, clickPoint }
      : (dataUrl || {});
    const mode = config.mode || 'simple';
    const finalDataUrl = config.dataUrl;
    const finalClickPoint = config.clickPoint || clickPoint || null;
    const previewLink = config.link || null;
    const previewIndex = config.index || null;
    const previewVisited = config.visited || null;
    if (!finalDataUrl) return;

    let modal = document.getElementById('previewModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'previewModal';
      modal.className = 'preview-modal';
      modal.style.zIndex = '20000';
      document.body.appendChild(modal);
      
      // 监听 Esc 键关闭
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('show')) {
          modal.classList.remove('show');
        }
      });
    }

    // 每次显示都重新构建内部结构，确保容器和点击监听器是最新的
    modal.innerHTML = `
      <div class="preview-container" style="position: relative; display: inline-block; line-height: 0; max-width: 95vw; max-height: 95vh;">
        <img id="previewImage" src="${dataUrl}" alt="预览大图" style="max-width: 100%; max-height: 100%; display: block; border-radius: 8px; box-shadow: 0 0 30px rgba(0,0,0,0.5); background: white;">
      </div>
    `;
    
    modal.onclick = () => {
      modal.classList.remove('show');
    };

    const container = modal.querySelector('.preview-container');
    
    // 添加点击位置标记
    if (clickPoint) {
      const { x, y, viewportW, viewportH } = clickPoint;
      if (viewportW && viewportH) {
        const marker = document.createElement('div');
        marker.className = 'snapshot-marker';
        marker.style.left = `${(x / viewportW) * 100}%`;
        marker.style.top = `${(y / viewportH) * 100}%`;
        // 大图中的标记可以稍微大一点
        marker.style.width = '20px';
        marker.style.height = '20px';
        container.appendChild(marker);
      }
    }
    
    modal.classList.add('show');
  }

  // 快捷键支持：按下 Esc 关闭预览
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('previewModal');
      if (modal && modal.classList.contains('show')) {
        modal.classList.remove('show');
      }
      const modalV2 = document.getElementById('previewModalV2');
      if (modalV2 && modalV2.classList.contains('show')) {
        hidePreviewModalV2();
      }
    }
  });

  // 初始加载：恢复视图tab的激活状态
  (function restoreActiveTab() {
    const validViews = new Set(['all', 'byGroup', 'byDomain', 'byNote', 'unvisited', 'byDate']);
    if (!validViews.has(currentView)) {
      currentView = 'all';
      localStorage.setItem('currentView', currentView);
    }
    if (!['card', 'thumb'].includes(currentDisplayMode)) {
      currentDisplayMode = 'card';
      localStorage.setItem('currentDisplayMode', currentDisplayMode);
    }
    syncViewTabState();
  })();

  loadLinks();
});
