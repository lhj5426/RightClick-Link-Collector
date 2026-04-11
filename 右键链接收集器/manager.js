/**
 * 多链接收集器 - 管理页面脚本
 */

let allLinks = [];
let allGroups = [];
let themeMode = "auto";
let currentView = localStorage.getItem('currentView') || "all";
let groupsCollapsed = localStorage.getItem('groupsCollapsed') === 'true';
let sortOrder = "oldest"; // "oldest" 旧→新（默认），"newest" 新→旧
let unvisitedMode = "aggregate"; // "aggregate" 聚合模式, "inGroup" 组内模式
let currentSearchKeywords = []; // 当前搜索的多关键字
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
  const newGroupTextColor = document.getElementById("newGroupTextColor");
  const addGroupBtn = document.getElementById("addGroupBtn");
  const autoCloseTabBtn = document.getElementById("autoCloseTabBtn");
  
  // 工具函数
  function escapeHtml(s) {
    if (!s) return "";
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
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
      const checkboxes = content.querySelectorAll('.link-checkbox');
      checkboxes.forEach(cb => {
        cb.checked = isChecked;
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
    
    const checkboxes = content.querySelectorAll('.link-checkbox');
    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    
    selectAllCheckbox.checked = checkedCount === checkboxes.length && checkboxes.length > 0;
    selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
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
          (link.page || "").toLowerCase().includes(kw) ||
          groupName.toLowerCase().includes(kw);
        })
      );
    }
    
    // 按时间排序
    visible = visible.sort((a, b) => {
      const timeA = new Date(a.date || 0).getTime();
      const timeB = new Date(b.date || 0).getTime();
      return sortOrder === "oldest" ? timeA - timeB : timeB - timeA;
    });
    
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
    } else if (currentView === "byDate") {
      renderByDateView(visible, visited);
    } else if (currentView === "byNote") {
      renderByTagsView(visible, visited);
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
        <div class="group-header-left">
          <input type="checkbox" class="group-select-all" title="全选/取消全选">
          <span>${domain} (${groups[domain].length})</span>
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
      
      // 组内按时间排序
      const sortedLinks = groups[domain].sort((a, b) => {
        const timeA = new Date(a.date || 0).getTime();
        const timeB = new Date(b.date || 0).getTime();
        return sortOrder === "oldest" ? timeA - timeB : timeB - timeA;
      });
      
      sortedLinks.forEach((link, index) => {
        const card = createLinkCard(link, index + 1, visited);
        content.appendChild(card);
      });
      
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
      const section = document.createElement("div");
      section.className = "group-section";
      
      const header = document.createElement("div");
      header.className = "group-header";
      header.innerHTML = `
        <div class="group-header-left">
          <input type="checkbox" class="group-select-all" title="全选/取消全选">
          <span>
            <span class="group-color" style="background: #9E9E9E; display: inline-block; width: 16px; height: 16px; border-radius: 3px; margin-right: 8px; vertical-align: middle;"></span>
            全局（无分组） (${globalLinks.length})
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
      
      // 组内按时间排序
      const sortedLinks = globalLinks.sort((a, b) => {
        const timeA = new Date(a.date || 0).getTime();
        const timeB = new Date(b.date || 0).getTime();
        return sortOrder === "oldest" ? timeA - timeB : timeB - timeA;
      });
      
      sortedLinks.forEach((link, index) => {
        const card = createLinkCard(link, index + 1, visited);
        content.appendChild(card);
      });
      
      section.appendChild(header);
      section.appendChild(content);
      linksList.appendChild(section);
      
      // 设置全选逻辑
      setupGroupSelectAll(header, content);
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
        <div class="group-header-left">
          <input type="checkbox" class="group-select-all" title="全选/取消全选">
          <span>
            <span class="group-color" style="background: ${group.color}; display: inline-block; width: 16px; height: 16px; border-radius: 3px; margin-right: 8px; vertical-align: middle;"></span>
            ${group.name} (${groupLinks.length})
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
      
      // 组内按时间排序
      const sortedLinks = groupLinks.sort((a, b) => {
        const timeA = new Date(a.date || 0).getTime();
        const timeB = new Date(b.date || 0).getTime();
        return sortOrder === "oldest" ? timeA - timeB : timeB - timeA;
      });
      
      sortedLinks.forEach((link, index) => {
        const card = createLinkCard(link, index + 1, visited);
        content.appendChild(card);
      });
      
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
      
      unvisited.forEach((link, index) => {
        const card = createLinkCard(link, index + 1, visited);
        linksList.appendChild(card);
      });
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
      const section = document.createElement("div");
      section.className = "group-section";
      
      const header = document.createElement("div");
      header.className = "group-header";
      header.innerHTML = `
        <div class="group-header-left">
          <input type="checkbox" class="group-select-all" title="全选/取消全选">
          <span>📅 ${group.display} (${group.links.length})</span>
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
      
      // 组内按时间排序
      const sortedLinks = group.links.sort((a, b) => {
        const timeA = new Date(a.date || 0).getTime();
        const timeB = new Date(b.date || 0).getTime();
        return sortOrder === "oldest" ? timeA - timeB : timeB - timeA;
      });
      
      sortedLinks.forEach((link, index) => {
        const card = createLinkCard(link, index + 1, visited);
        content.appendChild(card);
      });
      
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
        
        const section = document.createElement("div");
        section.className = "group-section";
        
        const header = document.createElement("div");
        header.className = "group-header";
        header.innerHTML = `
          <div class="group-header-left">
            <input type="checkbox" class="group-select-all" title="全选/取消全选">
            <span style="display:inline-flex; align-items:center;">🏷️ <span class="link-tag" style="background:${tagInfo.color}; color:${tagInfo.textColor}; margin-left:8px;">${escapeHtml(tagText)}</span> (${groupLinks.length})</span>
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
        
        // 组内排序
        const sortedGroupLinks = groupLinks.sort((a, b) => {
          const timeA = new Date(a.date || 0).getTime();
          const timeB = new Date(b.date || 0).getTime();
          return sortOrder === "oldest" ? timeA - timeB : timeB - timeA;
        });

        sortedGroupLinks.forEach((link, index) => {
          const card = createLinkCard(link, index + 1, visited);
          content.appendChild(card);
        });
        
        section.appendChild(header);
        section.appendChild(content);
        linksList.appendChild(section);
        
        setupGroupSelectAll(header, content);
      });
    }
    
    if (withoutTags.length > 0) {
      const section = document.createElement("div");
      section.className = "group-section";
      
      const header = document.createElement("div");
      header.className = "group-header";
      header.innerHTML = `
        <div class="group-header-left">
          <input type="checkbox" class="group-select-all" title="全选/取消全选">
          <span>⚪ 无标签 (${withoutTags.length})</span>
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
      
      // 组内排序
      const sortedWithoutLinks = withoutTags.sort((a, b) => {
        const timeA = new Date(a.date || 0).getTime();
        const timeB = new Date(b.date || 0).getTime();
        return sortOrder === "oldest" ? timeA - timeB : timeB - timeA;
      });

      sortedWithoutLinks.forEach((link, index) => {
        const card = createLinkCard(link, index + 1, visited);
        content.appendChild(card);
      });
      
      section.appendChild(header);
      section.appendChild(content);
      linksList.appendChild(section);
      
      setupGroupSelectAll(header, content);
    }
    
    if (sortedTags.length === 0 && withoutTags.length === 0) {
      linksList.innerHTML = '<div class="empty-state">没有链接</div>';
    }
  }
  
  // 创建链接卡片
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
    
    card.innerHTML = `
      <input type="checkbox" class="link-checkbox" data-id="${link.id}" style="margin-right: 10px; cursor: pointer;">
      <div class="link-index">${index}</div>
      <div class="link-content">
        <a href="${escapeHtml(link.url)}" class="link-url" target="_blank" data-url="${escapeHtml(link.url)}">${highlightText(link.url, currentSearchKeywords)}</a>
        <div class="link-source">来源: ${highlightText(link.title || link.page || '未知', currentSearchKeywords)} ${groupBadge} ${duplicateBadge}</div>
        <div class="link-date">保存时间: ${escapeHtml(link.date || '')}</div>
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
            if (link.clickPoint) {
              const { x, y, viewportW, viewportH } = link.clickPoint;
              if (viewportW && viewportH) {
                const marker = document.createElement('div');
                marker.className = 'snapshot-marker';
                marker.style.left = `${(x / viewportW) * 100}%`;
                marker.style.top = `${(y / viewportH) * 100}%`;
                snapshotEl.appendChild(marker);
              }
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
      updateBatchToolbar();
      const content = card.closest('.group-content');
      if (content) {
        updateGroupHeaderCheckbox(content);
      }
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
      tagEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const tagText = e.currentTarget.dataset.tagText;
        if (tagText) {
          filterByKeyword(tagText);
        }
      });
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
      <div class="modal-content" style="max-width: 500px; z-index: 10001;">
        <div class="modal-header">
          <h2>编辑标签</h2>
          <button class="modal-close" id="tagDialogClose">✕</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 15px; color: var(--text-muted); font-size: 14px; word-break: break-all;">
            ${escapeHtml(link.url.substring(0, 80))}${link.url.length > 80 ? '...' : ''}
          </p>
          
          <div id="tagsContainer" style="min-height: 50px; padding: 10px; border: 2px solid var(--border); border-radius: 6px; background: var(--bg); display: flex; flex-wrap: wrap; gap: 4px;">
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
            <div id="historicalTagsContainer" style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 100px; overflow-y: auto;">
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
    
    function renderEditTags() {
      container.innerHTML = '';
      if (currentTags.length === 0) {
        container.innerHTML = '<span style="color:var(--text-muted); font-size:13px; font-style:italic;">暂无标签</span>';
        return;
      }
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
      
      viewTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      
      // 保存之前的视图（用于组内未访问模式）
      if (currentView !== "unvisited") {
        localStorage.setItem('previousView', currentView);
      }
      
      currentView = tab.dataset.view;
      localStorage.setItem('currentView', currentView);
      renderLinks();
    });
  });
  
  // 按日期分组按钮
  const byDateBtn = document.getElementById("byDateBtn");
  if (byDateBtn) {
    byDateBtn.addEventListener("click", () => {
      viewTabs.forEach(t => t.classList.remove("active"));
      byDateBtn.classList.add("active");
      currentView = "byDate";
      localStorage.setItem('currentView', currentView);
      renderLinks();
    });
  }
  
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
  function deleteLink(id) {
    if (!confirm("确定要删除这个链接吗？")) return;
    
    // 删除对应的快照
    DB.deleteSnapshot(id);
    
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
    
    // 清空所有快照
    DB.clearAllSnapshots();
    
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
  
  // 保存HTML下拉菜单事件
  const htmlDropdown = document.querySelector(".dropdown-content");
  
  document.getElementById("exportAllHtmlSnap")?.addEventListener("click", (e) => { 
    e.preventDefault(); 
    htmlDropdown.classList.remove("show");
    exportLinks("html", { snapshots: true, selected: false }); 
  });
  document.getElementById("exportAllHtmlNoSnap")?.addEventListener("click", (e) => { 
    e.preventDefault(); 
    htmlDropdown.classList.remove("show");
    exportLinks("html", { snapshots: false, selected: false }); 
  });
  document.getElementById("exportSelectedHtmlSnap")?.addEventListener("click", (e) => { 
    e.preventDefault(); 
    htmlDropdown.classList.remove("show");
    exportLinks("html", { snapshots: true, selected: true }); 
  });
  document.getElementById("exportSelectedHtmlNoSnap")?.addEventListener("click", (e) => { 
    e.preventDefault(); 
    htmlDropdown.classList.remove("show");
    exportLinks("html", { snapshots: false, selected: true }); 
  });

  // 保存HTML默认按钮 (点击展开)
  saveHtmlBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    htmlDropdown.classList.toggle("show");
  });

  // 点击页面其他地方关闭下拉菜单
  window.addEventListener("click", (e) => {
    if (htmlDropdown.classList.contains("show") && !e.target.closest(".dropdown")) {
      htmlDropdown.classList.remove("show");
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
      document.querySelectorAll('.link-checkbox').forEach(cb => {
        cb.checked = isChecked;
      });
      // 同时更新所有分组的全选复选框状态
      document.querySelectorAll('.group-select-all').forEach(cb => {
        cb.checked = isChecked;
        cb.indeterminate = false;
      });
      updateBatchToolbar();
    });
  }
  
  // 排序按钮
  const sortBtn = document.getElementById("sortBtn");
  if (sortBtn) {
    // 从 localStorage 读取排序状态
    const savedSortOrder = localStorage.getItem('sortOrder') || 'oldest';
    sortOrder = savedSortOrder;
    
    // 初始化按钮文本
    sortBtn.textContent = sortOrder === "oldest" ? "⏱️ 按时间排序(旧→新)" : "⏱️ 按时间排序(新→旧)";
    
    sortBtn.addEventListener("click", () => {
      sortOrder = sortOrder === "oldest" ? "newest" : "oldest";
      sortBtn.textContent = sortOrder === "oldest" ? "⏱️ 按时间排序(旧→新)" : "⏱️ 按时间排序(新→旧)";
      
      // 保存排序状态到 localStorage
      localStorage.setItem('sortOrder', sortOrder);
      
      renderLinks();
    });
  }
  
  // 导出链接 (异步支持快照)
  async function exportLinks(format, options = { snapshots: true, selected: false }) {
    let linksToExport = allLinks;
    
    if (options.selected) {
      const selectedIds = Array.from(document.querySelectorAll('.link-checkbox:checked')).map(cb => {
        return parseInt(cb.dataset.id);
      });
      
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
    function generateTabEntry(link, index) {
      const saveTime = link.date ? `<div class="tab-save-time">保存时间: ${escapeHtml(link.date)}</div>` : '';
      
      let tagsDisplay = '';
      if (link.tags && link.tags.length > 0) {
        const spanHTML = link.tags.map(t => `<span style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:500; color:#fff; text-shadow:0 1px 1px rgba(0,0,0,0.3); background:${t.color}; margin-right:6px;">${escapeHtml(t.text)}</span>`).join('');
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
        snapshotHTML = `
          <div class="tab-snapshot" data-id="${link.id}" onclick="window.showPreview(this)">
            <img src="${snapshotData}" alt="快照">
            ${markerHTML}
          </div>
        `;
      }

      return `
        <div class="tab-entry" data-url="${escapeHtml(link.url)}" data-title="${escapeHtml(link.title || link.page || '')}" data-group-id="${link.groupId || ''}" data-tags="${escapeHtml(link.tags ? link.tags.map(t=>t.text).join(' ') : '')}">
          <span class="tab-index">${index}</span>
          <input type="checkbox" class="tab-checkbox" onclick="window.updateSelectionState()">
          <div class="tab-content">
            <a href="${escapeHtml(link.url)}" class="tab-title" target="_blank" onmousedown="window.handleLinkClick(event)">${escapeHtml(link.url)}</a>
            <div class="tab-url-container">
              <span class="tab-url-toggle" onclick="window.toggleUrl(this)">▶ 显示来源</span>
              <div class="tab-url collapsed">来源: ${escapeHtml(link.title || link.page || '未知')}</div>
            </div>
            ${saveTime}
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
      groupId: l.groupId, 
      note: l.note || '',
      clickPoint: l.clickPoint
    })));
    const ALL_SNAPSHOTS_JSON = includeSnapshots ? JSON.stringify(snapshots) : '{}';
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
        .tab-snapshot { width: 120px; height: 75px; border-radius: 4px; overflow: hidden; background: #eee; border: 1px solid #ddd; flex-shrink: 0; cursor: pointer; position: relative; }
        .tab-snapshot img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .tab-snapshot .snapshot-marker { position: absolute; width: 8px; height: 8px; background: #ff4444; border-radius: 50%; transform: translate(-50%, -50%); border: 1px solid white; box-shadow: 0 0 3px rgba(0,0,0,0.5); pointer-events: none; }
        
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
        <div class="tabs-container active" id="recent">${links.map((link, i) => generateTabEntry(link, i + 1)).join('')}</div>
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

        window.showPreview = (el) => {
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

        window.toggleSortOrder = () => {
          currentSortOrder = currentSortOrder === 'desc' ? 'asc' : 'desc';
          const btn = document.getElementById('sortOrderBtn');
          btn.textContent = currentSortOrder === 'desc' ? '排序: 新→旧' : '排序: 旧→新';
          
          // 重新排序当前视图
          const active = document.querySelector('.views > .active');
          active.querySelectorAll('.tab-group').forEach(group => {
            const content = group.querySelector('.group-content');
            const entries = Array.from(content.querySelectorAll('.tab-entry'));
            
            // 按保存时间排序
            entries.sort((a, b) => {
              const dateA = a.querySelector('.tab-save-time')?.textContent.replace('保存时间: ', '') || '';
              const dateB = b.querySelector('.tab-save-time')?.textContent.replace('保存时间: ', '') || '';
              
              if (currentSortOrder === 'desc') {
                return dateB.localeCompare(dateA); // 新→旧
              } else {
                return dateA.localeCompare(dateB); // 旧→新
              }
            });
            
            // 清空并重新添加
            content.innerHTML = '';
            entries.forEach((entry, index) => {
              // 更新序号
              const indexEl = entry.querySelector('.tab-index');
              if (indexEl) indexEl.textContent = index + 1;
              content.appendChild(entry);
            });
          });
        };

        function generateTabEntryInternal(link, i) {
          const saveTime = link.date ? \`<div class="tab-save-time">保存时间: \${link.date}</div>\` : '';
          
          let tagsDisplay = '';
          if (link.tags && link.tags.length > 0) {
            const spanHTML = link.tags.map(t => \`<span onclick="event.stopPropagation(); window.searchTabs(this.textContent.trim())" title="点击过滤此标签" style="display:inline-block; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:500; color:\${t.textColor || '#ffffff'}; text-shadow:0 1px 1px rgba(0,0,0,0.3); background:\${t.color}; margin-right:6px; cursor:pointer;">\${t.text}</span>\`).join('');
            tagsDisplay = \`<div class="tab-tags" style="margin-top:6px;">\${spanHTML}</div>\`;
          }
          
          // 快照显示
          let snapshotHTML = '';
          const snapshotData = ALL_SNAPSHOTS_DATA[link.id];
          if (${includeSnapshots} && snapshotData) {
            let markerHTML = '';
            if (link.clickPoint) {
              const { x, y, viewportW, viewportH } = link.clickPoint;
              if (viewportW && viewportH) {
                const left = (x / viewportW) * 100;
                const top = (y / viewportH) * 100;
                markerHTML = \`<div class="snapshot-marker" style="left: \${left}%; top: \${top}%;"></div>\`;
              }
            }
            snapshotHTML = \`
              <div class="tab-snapshot" data-id="\${link.id}" onclick="window.showPreview(this)">
                <img src="\${snapshotData}" alt="快照">
                \${markerHTML}
              </div>
            \`;
          }

          return \`<div class="tab-entry" data-url="\${link.url}" data-title="\${link.title || ''}" data-tags="\${link.tags ? link.tags.map(t=>t.text).join(' ') : ''}">
            <span class="tab-index">\${i+1}</span>
            <input type="checkbox" class="tab-checkbox" onclick="window.updateSelectionState()">
            <div class="tab-content">
              <a href="\${link.url}" class="tab-title" target="_blank" onmousedown="window.handleLinkClick(event)">\${link.url}</a>
              <div class="tab-url-container">
                <span class="tab-url-toggle" onclick="window.toggleUrl(this)">▶ 显示来源</span>
                <div class="tab-url collapsed">来源: \${link.title || '未知'}</div>
              </div>
              \${saveTime}
              \${tagsDisplay}
              <div class="visit-info"><span class="visit-time"></span><span class="visit-count"></span></div>
              <div class="tab-markers">
                <label class="marker-checkbox marker-downloaded"><input type="checkbox" class="marker-downloaded-cb" onchange="window.saveMarker(this, 'downloaded')"><span>✓ 已下载</span></label>
                <label class="marker-checkbox marker-skipped"><input type="checkbox" class="marker-skipped-cb" onchange="window.saveMarker(this, 'skipped')"><span>✗ 未下载</span></label>
              </div>
            </div>
            \${snapshotHTML}
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
                        <span style="display:inline-block;width:16px;height:16px;background:${group.color};border-radius:3px;margin-right:8px;vertical-align:middle;"></span>
                        ${group.name} 【未访问 ${groupLinks.length} 个链接】
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
            html += \`
              <div class="tab-group">
                <div class="group-header" onclick="window.toggleGroup(this)">
                  <span class="group-header-title">🏷️ <span onclick="event.stopPropagation(); window.searchTabs(this.textContent.trim())" title="点击搜索此标签" style="display:inline-block; padding:2px 6px; border-radius:10px; background:\${tagInfo.color}; color:\${tagInfo.textColor}; font-size:12px; cursor:pointer;">\${tagText}</span> 【共有\${links.length}个链接】</span>
                  <span class="toggle-icon">▾</span>
                </div>
                <div class="group-content">\${links.map((link, i) => generateTabEntryInternal(link, i)).join('')}</div>
              </div>\`;
          });
          
          if (withoutTags.length > 0) {
            html += \`
              <div class="tab-group">
                <div class="group-header" onclick="window.toggleGroup(this)">
                  <span class="group-header-title">⚪ 无标签 【共有\${withoutTags.length}个链接】</span>
                  <span class="toggle-icon">▾</span>
                </div>
                <div class="group-content">\${withoutTags.map((link, i) => generateTabEntryInternal(link, i)).join('')}</div>
              </div>\`;
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
  function deleteGroup(groupId) {
    const linkCount = allLinks.filter(link => link.groupId === groupId).length;
    
    if (linkCount > 0) {
      if (!confirm(`该分组中有 ${linkCount} 个链接，删除后这些链接也将被永久删除。确定要删除吗？`)) {
        return;
      }
      
      // 删除关联的快照
      const linksToDelete = allLinks.filter(link => link.groupId === groupId);
      linksToDelete.forEach(link => DB.deleteSnapshot(link.id));
      
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
    const checkedBoxes = document.querySelectorAll('.link-checkbox:checked');
    const allBoxes = document.querySelectorAll('.link-checkbox');
    const batchToolbar = document.getElementById('batchToolbar');
    const batchCount = document.getElementById('batchCount');
    const selectAllCb = document.getElementById('batchSelectAllCheckbox');
    
    if (checkedBoxes.length > 0) {
      batchModeActive = true;
      batchToolbar.style.display = 'flex';
      batchCount.textContent = `已选择 ${checkedBoxes.length} 个`;
    } else if (batchModeActive) {
      // 批量模式激活后，即使取消全选也保持工具栏显示
      batchToolbar.style.display = 'flex';
      batchCount.textContent = `已选择 0 个`;
    } else {
      batchToolbar.style.display = 'none';
    }
    
    // 更新全选复选框状态
    if (selectAllCb) {
      if (allBoxes.length === 0) {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = false;
      } else if (checkedBoxes.length === allBoxes.length) {
        selectAllCb.checked = true;
        selectAllCb.indeterminate = false;
      } else if (checkedBoxes.length > 0) {
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
    const checkboxes = document.querySelectorAll('.link-checkbox:checked');
    return Array.from(checkboxes).map(cb => parseInt(cb.dataset.id));
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
          renderLinks();
          dialog.remove();
          // 清空选择
          document.querySelectorAll('.link-checkbox').forEach(cb => cb.checked = false);
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
  function batchDeleteLinks() {
    const selectedIds = getSelectedLinkIds();
    if (selectedIds.length === 0) return;
    
    if (confirm(`确定要删除这 ${selectedIds.length} 个链接吗？`)) {
      // 删除关联的快照
      selectedIds.forEach(id => DB.deleteSnapshot(id));
      
      // 直接删除，不调用deleteLink避免重复确认
      allLinks = allLinks.filter(l => !selectedIds.includes(l.id));
      chrome.storage.local.set({ links: allLinks }, () => {
        renderLinks();
        updateCount();
        updateBadge();
        document.querySelectorAll('.link-checkbox').forEach(cb => cb.checked = false);
        updateBatchToolbar();
      });
    }
  }
  
  // 取消选择 - 这是唯一关闭批量工具栏的方式
  function cancelBatchSelection() {
    document.querySelectorAll('.link-checkbox').forEach(cb => cb.checked = false);
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
    document.querySelectorAll('.link-checkbox').forEach(cb => {
      if (duplicateIds.includes(parseInt(cb.dataset.id))) {
        cb.checked = true;
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
    // 更新视图标签激活状态
    document.querySelectorAll('.view-tab[data-view]').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === 'all');
    });
    localStorage.setItem('currentView', 'all');
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
  
  // 显示大图预览弹窗
  function showPreviewModal(dataUrl, clickPoint) {
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
    }
  });

  // 初始加载：恢复视图tab的激活状态
  (function restoreActiveTab() {
    // 先移除所有tab的active
    viewTabs.forEach(t => t.classList.remove('active'));
    
    if (currentView === 'byDate') {
      // byDate 按钮不在 viewTabs 的 data-view 中，需要特殊处理
      const byDateBtn = document.getElementById('byDateBtn');
      if (byDateBtn) byDateBtn.classList.add('active');
    } else {
      // 查找匹配 data-view 的 tab
      let found = false;
      viewTabs.forEach(t => {
        if (t.dataset.view === currentView) {
          t.classList.add('active');
          found = true;
        }
      });
      // 如果没找到匹配的，回退到 "all"
      if (!found) {
        currentView = 'all';
        viewTabs.forEach(t => {
          if (t.dataset.view === 'all') t.classList.add('active');
        });
      }
    }
  })();

  loadLinks();
});
