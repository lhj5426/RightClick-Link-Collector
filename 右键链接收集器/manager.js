/**
 * 多链接收集器 - 管理页面脚本
 */

let allLinks = [];
let allGroups = [];
let themeMode = "auto";
let currentView = "all";
let groupsCollapsed = false;
const STORAGE_KEY = 'tabSaverVisitedLinks';
const DEFAULT_GROUPS = [];

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
  const toggleGroupsBtn = document.getElementById("toggleGroupsBtn");
  const manageGroupsBtn = document.getElementById("manageGroupsBtn");
  const groupModal = document.getElementById("groupModal");
  const closeGroupModal = document.getElementById("closeGroupModal");
  const groupList = document.getElementById("groupList");
  const newGroupName = document.getElementById("newGroupName");
  const newGroupColor = document.getElementById("newGroupColor");
  const addGroupBtn = document.getElementById("addGroupBtn");
  
  // 工具函数
  function escapeHtml(s) {
    if (!s) return "";
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
  
  // 获取域名
  function getBaseDomain(url) {
    try {
      const hostname = new URL(url).hostname.replace('www.', '');
      const parts = hostname.split('.');
      return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
    } catch { return 'unknown'; }
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
    chrome.storage.local.get({ links: [], groups: DEFAULT_GROUPS }, (res) => {
      allLinks = Array.isArray(res.links) ? res.links : [];
      allGroups = Array.isArray(res.groups) ? res.groups : DEFAULT_GROUPS;
      renderLinks();
      updateCount();
      updateGroupCount();
    });
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
  
  // 渲染链接
  function renderLinks() {
    const query = searchInput.value.toLowerCase().trim();
    const visited = getVisitedLinks();
    
    let visible = allLinks;
    
    if (query) {
      visible = allLinks.filter(link => 
        (link.url || "").toLowerCase().includes(query) ||
        (link.title || "").toLowerCase().includes(query)
      );
    }
    
    if (visible.length === 0) {
      linksList.innerHTML = "";
      emptyState.classList.remove("hidden");
      return;
    }
    
    emptyState.classList.add("hidden");
    linksList.innerHTML = "";
    
    if (currentView === "all") {
      renderAllView(visible, visited);
    } else if (currentView === "byGroup") {
      renderByGroupView(visible, visited);
    } else if (currentView === "byDomain") {
      renderByDomainView(visible, visited);
    } else if (currentView === "unvisited") {
      renderUnvisitedView(visible, visited);
    }
  }
  
  // 渲染全部视图
  function renderAllView(links, visited) {
    links.forEach((link, index) => {
      const card = createLinkCard(link, index + 1, visited);
      linksList.appendChild(card);
    });
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
      const section = document.createElement("div");
      section.className = "group-section";
      
      const header = document.createElement("div");
      header.className = "group-header";
      header.innerHTML = `
        <span>${domain} (${groups[domain].length})</span>
        <span class="group-toggle">▾</span>
      `;
      header.onclick = () => {
        header.classList.toggle("collapsed");
        content.classList.toggle("collapsed");
      };
      
      const content = document.createElement("div");
      content.className = "group-content";
      
      groups[domain].forEach((link, index) => {
        const card = createLinkCard(link, index + 1, visited);
        content.appendChild(card);
      });
      
      section.appendChild(header);
      section.appendChild(content);
      linksList.appendChild(section);
    });
  }
  
  // 渲染按分组视图
  function renderByGroupView(links, visited) {
    // 先显示无分组的链接
    const globalLinks = links.filter(link => !link.groupId);
    
    if (globalLinks.length > 0) {
      const section = document.createElement("div");
      section.className = "group-section";
      
      const header = document.createElement("div");
      header.className = "group-header";
      header.innerHTML = `
        <span>
          <span class="group-color" style="background: #9E9E9E; display: inline-block; width: 16px; height: 16px; border-radius: 3px; margin-right: 8px; vertical-align: middle;"></span>
          全局（无分组） (${globalLinks.length})
        </span>
        <span class="group-toggle">▾</span>
      `;
      header.onclick = () => {
        header.classList.toggle("collapsed");
        content.classList.toggle("collapsed");
      };
      
      const content = document.createElement("div");
      content.className = "group-content";
      
      globalLinks.forEach((link, index) => {
        const card = createLinkCard(link, index + 1, visited);
        content.appendChild(card);
      });
      
      section.appendChild(header);
      section.appendChild(content);
      linksList.appendChild(section);
    }
    
    // 显示各个分组
    allGroups.forEach(group => {
      const groupLinks = links.filter(link => link.groupId === group.id);
      
      if (groupLinks.length === 0) return;
      
      const section = document.createElement("div");
      section.className = "group-section";
      
      const header = document.createElement("div");
      header.className = "group-header";
      header.innerHTML = `
        <span>
          <span class="group-color" style="background: ${group.color}; display: inline-block; width: 16px; height: 16px; border-radius: 3px; margin-right: 8px; vertical-align: middle;"></span>
          ${group.name} (${groupLinks.length})
        </span>
        <span class="group-toggle">▾</span>
      `;
      header.onclick = () => {
        header.classList.toggle("collapsed");
        content.classList.toggle("collapsed");
      };
      
      const content = document.createElement("div");
      content.className = "group-content";
      
      groupLinks.forEach((link, index) => {
        const card = createLinkCard(link, index + 1, visited);
        content.appendChild(card);
      });
      
      section.appendChild(header);
      section.appendChild(content);
      linksList.appendChild(section);
    });
  }
  
  // 渲染未访问视图
  function renderUnvisitedView(links, visited) {
    const unvisited = links.filter(link => !visited[link.url]);
    
    if (unvisited.length === 0) {
      linksList.innerHTML = '<div class="empty-state"><p>所有链接都已访问过</p></div>';
      return;
    }
    
    unvisited.forEach((link, index) => {
      const card = createLinkCard(link, index + 1, visited);
      linksList.appendChild(card);
    });
  }
  
  // 创建链接卡片
  function createLinkCard(link, index, visited) {
    const card = document.createElement("div");
    card.className = "link-card";
    
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
    
    if (groupId) {
      const group = allGroups.find(g => g.id === groupId);
      if (group) {
        groupBadge = `<span class="group-badge" style="background: ${group.color}">${group.name}</span>`;
      }
    } else {
      groupBadge = `<span class="group-badge" style="background: #9E9E9E">无分组</span>`;
    }
    
    card.innerHTML = `
      <div class="link-index">${index}</div>
      <div class="link-content">
        <a href="${escapeHtml(link.url)}" class="link-url" target="_blank" data-url="${escapeHtml(link.url)}">${escapeHtml(link.url)}</a>
        <div class="link-source">来源: ${escapeHtml(link.title || link.page || '未知')} ${groupBadge}</div>
        <div class="link-date">保存时间: ${escapeHtml(link.date || '')}</div>
        ${visitInfo}
        <div class="link-actions">
          <button class="link-btn link-btn-move" data-id="${link.id}">📁 移动</button>
          <button class="link-btn link-btn-copy" data-url="${escapeHtml(link.url)}">📋 复制</button>
          <button class="link-btn link-btn-delete" data-id="${link.id}">🗑️ 删除</button>
        </div>
      </div>
    `;
    
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
    dialog.innerHTML = `
      <div class="modal-content" style="max-width: 400px;">
        <div class="modal-header">
          <h2>移动链接到分组</h2>
          <button class="modal-close" onclick="this.closest('.modal').remove()">✕</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 15px; color: var(--text-muted); font-size: 14px;">
            ${escapeHtml(link.url.substring(0, 60))}${link.url.length > 60 ? '...' : ''}
          </p>
          <select id="moveToGroup" style="width: 100%; padding: 10px; border: 2px solid var(--border); border-radius: 6px; font-size: 14px; margin-bottom: 15px;">
            ${options}
          </select>
          <div style="display: flex; gap: 10px; justify-content: flex-end;">
            <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">取消</button>
            <button class="btn btn-primary" id="confirmMove">确定</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    dialog.querySelector('#confirmMove').addEventListener('click', () => {
      const newGroupId = dialog.querySelector('#moveToGroup').value || null;
      moveLinkToGroup(linkId, newGroupId);
      dialog.remove();
    });
    
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
      // 管理分组按钮和折叠按钮特殊处理
      if (tab.id === "manageGroupsBtn" || tab.id === "toggleGroupsBtn") {
        return; // 不切换视图
      }
      
      viewTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentView = tab.dataset.view;
      renderLinks();
    });
  });
  
  // 折叠/展开所有分组
  toggleGroupsBtn.addEventListener("click", () => {
    groupsCollapsed = !groupsCollapsed;
    
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
  function deleteLink(id) {
    if (!confirm("确定要删除这个链接吗？")) return;
    
    chrome.storage.local.get({ links: [] }, (res) => {
      const links = (res.links || []).filter(l => l.id !== id);
      chrome.storage.local.set({ links }, () => {
        allLinks = links;
        renderLinks();
        updateCount();
        updateBadge();
      });
    });
  }
  
  // 清空全部
  clearAllBtn.addEventListener("click", () => {
    if (!confirm(`确定要删除所有 ${allLinks.length} 个链接吗？`)) return;
    
    chrome.storage.local.set({ links: [] }, () => {
      allLinks = [];
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
  
  // 保存HTML按钮
  saveHtmlBtn.addEventListener("click", () => {
    exportLinks("html");
  });
  
  // 保存TXT按钮
  saveTxtBtn.addEventListener("click", () => {
    exportLinks("txt");
  });
  
  // 导出链接（复用popup.js的导出逻辑）
  function exportLinks(format) {
    if (allLinks.length === 0) {
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
      const out = allLinks.map((l, i) => 
        `${i + 1}. ${l.url}\n来源: ${l.title || l.page || '未知'}\n日期: ${l.date || ''}`
      ).join("\n\n");
      const filename = `保存了${allLinks.length}个链接 - ${fileTimestamp}.txt`;
      downloadBlob(out, filename, "text/plain");
    } else if (format === "csv") {
      const rows = ["序号,网址,来源,日期"];
      allLinks.forEach((l, i) => {
        const url = `"${String(l.url || "").replace(/"/g, '""')}"`;
        const source = `"${String(l.title || l.page || "").replace(/"/g, '""')}"`;
        const date = `"${l.date || ""}"`;
        rows.push(`${i + 1},${url},${source},${date}`);
      });
      downloadBlob(rows.join("\n"), "links.csv", "text/csv");
    } else if (format === "html") {
      // 使用Export Tabs的样式生成HTML
      const timestamp = new Date().toLocaleString('zh-CN');
      const date = new Date();
      const fileTimestamp = date.getFullYear() + '-' + 
        (date.getMonth() + 1).toString().padStart(2, '0') + '-' + 
        date.getDate().toString().padStart(2, '0') + '-' + 
        date.getHours().toString().padStart(2, '0') + 
        date.getMinutes().toString().padStart(2, '0') + 
        date.getSeconds().toString().padStart(2, '0');
      
      const htmlContent = generateFullHTML(allLinks, allGroups, timestamp);
      const filename = `保存了${allLinks.length}个链接 - ${fileTimestamp}.html`;
      downloadBlob(htmlContent, filename, "text/html");
    } else if (format === "doc") {
      const docParts = [
        "<!doctype html><html><head><meta charset='utf-8'></head><body>",
        "<h2>保存的链接</h2>"
      ];
      allLinks.forEach((l, i) => {
        const safeUrl = escapeHtml(l.url);
        const safeSource = escapeHtml(l.title || l.page || "");
        const safeDate = escapeHtml(l.date || "");
        docParts.push(`<p style="font-family:Calibri,Arial;"><b>${i + 1}. ${safeUrl}</b><br><a href="${safeUrl}" style="color:#0645AD;text-decoration:underline;">${safeUrl}</a><br>来源: ${safeSource}<br>${safeDate}</p>`);
      });
      docParts.push("</body></html>");
      downloadBlob(docParts.join("\n"), "links.doc", "application/msword");
    }
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
  
  // 生成完整HTML（完全复刻Export Tabs样式）
  function generateFullHTML(links, groups, timestamp) {
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
    function generateTabEntry(link, index) {
      const saveTime = link.date ? `<div class="tab-save-time">保存时间: ${escapeHtml(link.date)}</div>` : '';
      return `
        <div class="tab-entry" data-url="${escapeHtml(link.url)}" data-title="${escapeHtml(link.title || link.page || '')}" data-group-id="${link.groupId || ''}">
          <span class="tab-index">${index}</span>
          <input type="checkbox" class="tab-checkbox" onclick="window.updateSelectionState()">
          <div class="tab-content">
            <a href="${escapeHtml(link.url)}" class="tab-title" target="_blank" onmousedown="window.handleLinkClick(event)">${escapeHtml(link.url)}</a>
            <div class="tab-url-container">
              <span class="tab-url-toggle" onclick="window.toggleUrl(this)">▶ 显示来源</span>
              <div class="tab-url collapsed">来源: ${escapeHtml(link.title || link.page || '未知')}</div>
            </div>
            ${saveTime}
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
      customGroupsHTML += `
        <div class="tab-group">
          <div class="group-header" onclick="window.toggleGroup(this)">
            <span class="group-header-title">
              <span style="display:inline-block;width:16px;height:16px;background:#9E9E9E;border-radius:3px;margin-right:8px;vertical-align:middle;"></span>
              全局（无分组） 【共有${globalLinks.length}个链接】
            </span>
            <span class="toggle-icon">▾</span>
          </div>
          <div class="group-content">${globalLinks.map((link, i) => generateTabEntry(link, i + 1)).join('')}</div>
        </div>`;
    }
    groups.forEach(group => {
      const groupLinks = links.filter(link => link.groupId === group.id);
      if (groupLinks.length > 0) {
        customGroupsHTML += `
          <div class="tab-group">
            <div class="group-header" onclick="window.toggleGroup(this)">
              <span class="group-header-title">
                <span style="display:inline-block;width:16px;height:16px;background:${escapeHtml(group.color)};border-radius:3px;margin-right:8px;vertical-align:middle;"></span>
                ${escapeHtml(group.name)} 【共有${groupLinks.length}个链接】
              </span>
              <span class="toggle-icon">▾</span>
            </div>
            <div class="group-content">${groupLinks.map((link, i) => generateTabEntry(link, i + 1)).join('')}</div>
          </div>`;
      }
    });

    const ALL_TABS_JSON = JSON.stringify(links.map(l => ({ url: l.url, title: l.title || l.page || '', date: l.date, groupId: l.groupId })));
    const ALL_GROUPS_JSON = JSON.stringify(groups);

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>保存的链接 - ${timestamp}</title>
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
          <button class="button" style="background:#9C27B0" onclick="window.clearMarkers()">清除下载标记</button>
          <button class="button" style="background:#F44336" onclick="window.clearVisitHistory()">清除访问历史</button>
        </div>
        <div class="search-container">
          <input type="text" class="search-input" placeholder="搜索..." oninput="window.searchTabs(this.value)">
        </div>
      </div>
      <div class="view-controls">
        <button class="view-button active" data-view="recent">最新</button>
        <button class="view-button" data-view="alphabetical">按字母顺序</button>
        <button class="view-button" data-view="url">按网址</button>
        <button class="view-button" data-view="byCustomGroup">按自定义分组</button>
        <button class="view-button" data-view="byTabGroup">按标签组</button>
        <button class="view-button" data-view="byRulesUnvisited">按未访问排序</button>
        <button class="view-button" data-view="grouped">按域名分组</button>
      </div>
      <div class="views">
        <div class="tabs-container active" id="recent">${links.map((link, i) => generateTabEntry(link, i + 1)).join('')}</div>
        <div class="tabs-container" id="alphabetical">${linksByTitle.map((link, i) => generateTabEntry(link, i + 1)).join('')}</div>
        <div class="tabs-container" id="url">${linksByUrl.map((link, i) => generateTabEntry(link, i + 1)).join('')}</div>
        <div class="tabs-container" id="byCustomGroup">${customGroupsHTML}</div>
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
        <div class="tabs-container" id="grouped">
          ${Object.entries(groupedLinksByDomain).map(([domain, dLinks]) => `
            <div class="tab-group">
              <div class="group-header" onclick="window.toggleGroup(this)">
                <span class="group-header-title">${domain} 【当前域名共有${dLinks.length}个链接】</span>
                <span class="toggle-icon">▾</span>
              </div>
              <div class="group-content">${dLinks.map((link, i) => generateTabEntry(link, i + 1)).join('')}</div>
            </div>`).join('')}
        </div>
      </div>
      <script>
        const STORAGE_KEY = 'tabSaverVisitedLinks';
        const MARKERS_STORAGE_KEY = 'tabSaverMarkers';
        const ALL_TABS_DATA = ${ALL_TABS_JSON};
        const ALL_GROUPS_DATA = ${ALL_GROUPS_JSON};

        const getVisitedLinks = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        const getMarkers = () => JSON.parse(localStorage.getItem(MARKERS_STORAGE_KEY) || '{}');

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
            if (document.querySelector('.view-button[data-view="byRulesUnvisited"]').classList.contains('active')) {
              regenerateUnvisitedView();
            }
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
          const active = document.querySelector('.views > .active');
          active.querySelectorAll('.tab-entry').forEach(e => {
            const match = e.dataset.title.toLowerCase().includes(q) || e.dataset.url.toLowerCase().includes(q);
            e.classList.toggle('hidden', !match);
          });
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

        function generateTabEntryInternal(link, i) {
          const saveTime = link.date ? \`<div class="tab-save-time">保存时间: \${link.date}</div>\` : '';
          return \`<div class="tab-entry" data-url="\${link.url}" data-title="\${link.title || ''}">
            <span class="tab-index">\${i+1}</span>
            <input type="checkbox" class="tab-checkbox" onclick="window.updateSelectionState()">
            <div class="tab-content">
              <a href="\${link.url}" class="tab-title" target="_blank" onmousedown="window.handleLinkClick(event)">\${link.url}</a>
              <div class="tab-url-container">
                <span class="tab-url-toggle" onclick="window.toggleUrl(this)">▶ 显示来源</span>
                <div class="tab-url collapsed">来源: \${link.title || '未知'}</div>
              </div>
              \${saveTime}
              <div class="visit-info"><span class="visit-time"></span><span class="visit-count"></span></div>
              <div class="tab-markers">
                <label class="marker-checkbox marker-downloaded"><input type="checkbox" class="marker-downloaded-cb" onchange="window.saveMarker(this, 'downloaded')"><span>✓ 已下载</span></label>
                <label class="marker-checkbox marker-skipped"><input type="checkbox" class="marker-skipped-cb" onchange="window.saveMarker(this, 'skipped')"><span>✗ 未下载</span></label>
              </div>
            </div>
          </div>\`;
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
            if (btn.dataset.view === 'byRulesUnvisited') regenerateUnvisitedView();
            window.searchTabs('');
          });
        });

        document.addEventListener('DOMContentLoaded', () => { applyState(); });
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
        <div class="group-color" style="background: ${group.color}" data-group-id="${group.id}"></div>
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
      const colorDiv = item.querySelector(".group-color");
      colorDiv.addEventListener("click", () => {
        const input = document.createElement("input");
        input.type = "color";
        input.value = group.color;
        input.onchange = () => {
          updateGroupColor(group.id, input.value);
        };
        input.click();
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
    
    if (!name) {
      alert("请输入分组名称！");
      return;
    }
    
    const newGroup = {
      id: 'group_' + Date.now(),
      name: name,
      color: color
    };
    
    allGroups.push(newGroup);
    chrome.storage.local.set({ groups: allGroups }, () => {
      newGroupName.value = "";
      newGroupColor.value = "#2196F3";
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
  
  // 删除分组
  function deleteGroup(groupId) {
    const linkCount = allLinks.filter(link => link.groupId === groupId).length;
    
    if (linkCount > 0) {
      if (!confirm(`该分组中有 ${linkCount} 个链接，删除后这些链接将移动到全局（无分组）。确定要删除吗？`)) {
        return;
      }
      
      // 将该分组的链接移动到全局
      allLinks.forEach(link => {
        if (link.groupId === groupId) {
          link.groupId = null;
        }
      });
      
      chrome.storage.local.set({ links: allLinks }, () => {
        // 删除分组
        allGroups = allGroups.filter(g => g.id !== groupId);
        chrome.storage.local.set({ groups: allGroups }, () => {
          renderGroupList();
          updateContextMenus();
          renderLinks();
          updateGroupCount();
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
  
  // 检查URL参数，如果有newGroup参数则打开分组管理
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('action') === 'newGroup') {
    setTimeout(() => {
      groupModal.classList.add("show");
      renderGroupList();
      newGroupName.focus();
    }, 500);
  }
  
  // ========== 分组管理功能结束 ==========
  
  // 初始加载
  loadLinks();
});
