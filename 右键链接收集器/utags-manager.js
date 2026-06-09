const UTAGS_BOOKMARKS_STORAGE_KEY = 'managerUtagsBookmarks';
const UTAGS_FULL_JSON_STORAGE_KEY = 'managerUtagsFullJson';
const UTAGS_IMPORTED_AT_STORAGE_KEY = 'managerUtagsImportedAt';
const UTAGS_DIRTY_STORAGE_KEY = 'managerUtagsDirty';
const DELETED_BOOKMARK_TAGS = new Set(['._DELETED_', '_DELETED_']);

let utagsJson = null;
let importedAt = '';
let selectedTag = '';
let selectedDomain = '';
let sideMode = 'tag';
let dirty = false;
let currentRows = [];
let currentPage = 1;
let duplicateFilterActive = false;
let duplicateFocusKey = '';
const selectedUrls = new Set();
const URL_PAGE_SIZE = 200;

const els = {};

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getData() {
  if (!utagsJson || !utagsJson.data || typeof utagsJson.data !== 'object') {
    return {};
  }
  return utagsJson.data;
}

function getRawTags(entry) {
  return Array.isArray(entry?.tags) ? entry.tags.map(tag => String(tag ?? '').trim()).filter(Boolean) : [];
}

function isDeletedEntry(entry) {
  return !!entry?.deletedMeta || getRawTags(entry).some(tag => DELETED_BOOKMARK_TAGS.has(tag));
}

function getActiveDataEntries() {
  return Object.entries(getData()).filter(([, entry]) => !isDeletedEntry(entry));
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const result = [];
  for (const raw of value) {
    const tag = String(raw ?? '').trim();
    if (tag === '_DELETED_') continue;
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
  }
  return result;
}

function normalizeUtagsUrl(url) {
  return String(url || '').trim();
}

function getUtagsUrlCandidates(url) {
  const raw = normalizeUtagsUrl(url);
  if (!raw) return [];
  const candidates = new Set([raw]);
  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    candidates.add(parsed.href);
    if (parsed.pathname.endsWith('/') && parsed.pathname.length > 1) {
      const clone = new URL(parsed.href);
      clone.pathname = clone.pathname.replace(/\/+$/, '');
      candidates.add(clone.href);
    } else {
      const clone = new URL(parsed.href);
      clone.pathname = `${clone.pathname}/`;
      candidates.add(clone.href);
    }
    if (parsed.hostname === 'e-hentai.org' || parsed.hostname === 'exhentai.org') {
      const clone = new URL(parsed.href);
      clone.hostname = parsed.hostname === 'e-hentai.org' ? 'exhentai.org' : 'e-hentai.org';
      candidates.add(clone.href);
    }
  } catch {
    candidates.add(raw.replace(/#.*$/, ''));
  }
  return Array.from(candidates);
}

function setDirty(value) {
  dirty = !!value;
  chrome.storage.local.set({ [UTAGS_DIRTY_STORAGE_KEY]: dirty });
}

function getTagStats(includeDeleted = false) {
  const stats = new Map();
  const entries = includeDeleted ? Object.entries(getData()) : getActiveDataEntries();
  for (const [url, entry] of entries) {
    const tags = normalizeTags(entry?.tags);
    if (entry && Array.isArray(entry.tags) && tags.length !== entry.tags.length) {
      entry.tags = tags;
    }
    for (const tag of tags) {
      if (!stats.has(tag)) stats.set(tag, { tag, count: 0, urls: [] });
      const item = stats.get(tag);
      item.count++;
      item.urls.push(url);
    }
  }
  return Array.from(stats.values());
}

function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname || 'unknown';
  } catch {
    return 'unknown';
  }
}

function getDuplicateKeyFromUrl(url) {
  return String(url || '').trim();
}

function getDuplicateKeyCounts(rows) {
  const counts = new Map();
  rows.forEach(row => {
    const key = getDuplicateKeyFromUrl(row.url);
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return counts;
}

function filterDuplicateRows(rows) {
  const counts = getDuplicateKeyCounts(rows);
  return rows.filter(row => (counts.get(getDuplicateKeyFromUrl(row.url)) || 0) > 1);
}

function getEntryTime(entry) {
  const value = Number(entry?.meta?.created || entry?.meta?.updated || entry?.meta?.updated3 || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function formatEntryTime(entry) {
  const value = getEntryTime(entry);
  if (!value) return '';
  return new Date(value).toLocaleString();
}

function getDomainStats() {
  const stats = new Map();
  for (const [url] of getActiveDataEntries()) {
    const domain = getDomainFromUrl(url);
    if (!stats.has(domain)) stats.set(domain, { name: domain, count: 0, urls: [] });
    const item = stats.get(domain);
    item.count++;
    item.urls.push(url);
  }
  return Array.from(stats.values());
}

function getFilteredTagStats() {
  const keyword = els.tagSearchInput.value.trim().toLowerCase();
  const sort = els.tagSortSelect.value;
  const includeDeleted = keyword.includes('._deleted_') || keyword.includes('_deleted_');
  let stats = sideMode === 'domain' ? getDomainStats() : getTagStats(includeDeleted).map(item => ({ name: item.tag, tag: item.tag, count: item.count, urls: item.urls }));
  if (keyword) {
    stats = stats.filter(item => item.name.toLowerCase().includes(keyword));
  }
  stats.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name, 'zh-Hans-CN');
    return b.count - a.count || a.name.localeCompare(b.name, 'zh-Hans-CN');
  });
  return stats;
}

function updateSummary() {
  const entries = getActiveDataEntries();
  const tagStats = getTagStats();
  const domainCount = getDomainStats().length;
  const tagTotal = tagStats.reduce((sum, item) => sum + item.count, 0);
  const timeText = importedAt ? ` | 导入时间: ${new Date(importedAt).toLocaleString()}` : '';
  els.summaryText.textContent = `URL: ${entries.length} | 标签种类: ${tagStats.length} | 域名: ${domainCount} | 标签总数: ${tagTotal}${timeText}`;
}

function renderTagList() {
  const stats = getFilteredTagStats();
  if (stats.length === 0) {
    els.tagList.innerHTML = `<div class="empty-state">没有匹配的${sideMode === 'domain' ? '域名' : '标签'}。</div>`;
    return;
  }

  els.tagList.innerHTML = stats.map(item => `
    <div class="tag-item ${(sideMode === 'tag' ? item.name === selectedTag : item.name === selectedDomain) ? 'active' : ''}" data-name="${escapeHtml(item.name)}" role="button" tabindex="0">
      <span class="tag-name">${escapeHtml(item.name)}</span>
      <span class="tag-count">${item.count}</span>
      ${sideMode === 'tag' ? `<button type="button" class="tag-rename-btn" data-tag="${escapeHtml(item.name)}">改名</button>` : ''}
    </div>
  `).join('');

  els.tagList.querySelectorAll('.tag-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.tag-rename-btn')) return;
      if (sideMode === 'tag') {
        selectedTag = item.dataset.name || '';
      } else {
        selectedDomain = item.dataset.name || '';
      }
      els.urlSearchInput.value = '';
      els.globalSearchInput.value = '';
      selectedUrls.clear();
      renderAll();
    });
    item.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      if (sideMode === 'tag') {
        selectedTag = item.dataset.name || '';
      } else {
        selectedDomain = item.dataset.name || '';
      }
      els.urlSearchInput.value = '';
      els.globalSearchInput.value = '';
      selectedUrls.clear();
      renderAll();
    });
  });

  els.tagList.querySelectorAll('.tag-rename-btn').forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      renameTag(button.dataset.tag || '');
    });
  });
}

function getSelectedTagUrls() {
  if (sideMode === 'tag' && !selectedTag) return [];
  if (sideMode === 'domain' && !selectedDomain) return [];
  const rows = [];
  const includeDeleted = sideMode === 'tag' && DELETED_BOOKMARK_TAGS.has(selectedTag);
  const entries = includeDeleted ? Object.entries(getData()) : getActiveDataEntries();
  for (const [url, entry] of entries) {
    const tags = normalizeTags(entry?.tags);
    const title = String(entry?.meta?.title || entry?.title || '').trim();
    const timeText = formatEntryTime(entry);
    if (sideMode === 'tag' && !tags.includes(selectedTag)) continue;
    if (sideMode === 'domain' && getDomainFromUrl(url) !== selectedDomain) continue;
    rows.push({ url, title, timeText, tags });
  }
  rows.sort((a, b) => (a.title || a.url).localeCompare(b.title || b.url, 'zh-Hans-CN'));
  return rows;
}

function getRowHaystack(url, title, tags, timeText = '') {
  return `${url}\n${title}\n${tags.join('\n')}\n${getDomainFromUrl(url)}\n${timeText}`;
}

function getSearchFields(url, title, tags, timeText = '') {
  return {
    all: getRowHaystack(url, title, tags, timeText),
    tag: tags.join('\n'),
    tagValues: tags,
    title,
    url,
    domain: getDomainFromUrl(url),
    time: timeText,
  };
}

function normalizeSearchScope(value) {
  const key = String(value || '').trim().toLowerCase();
  if (['标签', 'tag', 'tags'].includes(key)) return 'tag';
  if (['标题', '来源', 'title'].includes(key)) return 'title';
  if (['url', '网址', '链接'].includes(key)) return 'url';
  if (['域名', 'domain'].includes(key)) return 'domain';
  if (['时间', '保存时间', 'date', 'time'].includes(key)) return 'time';
  return '';
}

function isDateMarkerTag(tag) {
  const text = String(tag || '').trim();
  return /^20\d{2}\u5e74\d{1,2}\u6708\d{1,2}\u65e5$/.test(text)
    || /^\d{1,2}\u70b9\d{1,2}\u5206\d{1,2}\u79d2$/.test(text)
    || /^20\d{2}\u5e74\d{1,2}\u6708\d{1,2}\u65e5\d{1,2}\u70b9\d{1,2}\u5206\d{1,2}\u79d2$/.test(text);
}

function normalizeDateShortcut(raw) {
  const text = String(raw || '').trim();
  const tagPrefix = '\u6807\u7b7e';
  if (text === `${tagPrefix}\u65e5\u671f`
    || text === `${tagPrefix}\u5e74\u6708\u65e5`
    || text === `${tagPrefix}\u65f6\u5206\u79d2`) {
    return 'tag-date-marker';
  }
  return '';
}

function shouldSearchIncludeDeleted(keywords) {
  return keywords.some(term => String(term.raw || term.keyword || '').toLowerCase().includes('_deleted_'));
}

function parseSearchKeywords(value) {
  const query = String(value || '').trim();
  const tokens = query.match(/"[^"]+"|\S+/g) || [];
  const scopePrefixes = ['保存时间', '标签', '标题', '来源', '网址', '链接', '域名', '时间', 'url', 'tag', 'tags', 'title', 'domain', 'date', 'time'];
  return tokens.map(token => {
    let raw = token.replace(/^"|"$/g, '').trim();
    if (!raw) return null;
    const exclude = raw.startsWith('-') && raw.length > 1;
    if (exclude) raw = raw.slice(1).trim();
    if (!raw) return null;
    const shortcut = normalizeDateShortcut(raw);
    if (shortcut) return { scope: shortcut, keyword: raw.toLowerCase(), raw, exclude, exact: false };
    const globalExactMatch = raw.match(/^\[(.+)\]$/);
    if (globalExactMatch) {
      const keyword = globalExactMatch[1].trim().toLowerCase();
      if (keyword) return { scope: 'all', keyword, raw, exclude, exact: true };
    }
    const exactMatch = raw.match(/^([^\[]+)\[(.+)\]$/);
    if (exactMatch) {
      const scope = normalizeSearchScope(exactMatch[1]);
      const keyword = exactMatch[2].trim().toLowerCase();
      if (scope && keyword) return { scope, keyword, raw, exclude, exact: true };
    }
    const colonMatch = raw.match(/^([^:：]+)[:：](.+)$/);
    if (colonMatch) {
      const scope = normalizeSearchScope(colonMatch[1]);
      const keyword = colonMatch[2].trim().toLowerCase();
      if (scope && keyword) return { scope, keyword, raw, exclude, exact: false };
    }
    for (const prefix of scopePrefixes) {
      if (raw.length > prefix.length && raw.toLowerCase().startsWith(prefix.toLowerCase())) {
        const scope = normalizeSearchScope(prefix);
        const keyword = raw.slice(prefix.length).trim().toLowerCase();
        if (scope && keyword) return { scope, keyword, raw, exclude, exact: false };
      }
    }
    return { scope: 'all', keyword: raw.toLowerCase(), raw, exclude, exact: false };
  }).filter(Boolean);
}

function matchesSearchKeywords(fieldsOrHaystack, keywords) {
  if (keywords.length === 0) return true;
  const fields = typeof fieldsOrHaystack === 'string'
    ? { all: fieldsOrHaystack }
    : fieldsOrHaystack;
  const includeTerms = keywords.filter(term => !term.exclude);
  const excludeTerms = keywords.filter(term => term.exclude);
  const matchTerm = (term) => {
    if (term.scope === 'tag-date-marker') {
      return (fields.tagValues || []).some(isDateMarkerTag);
    }
    if (term.exact && (term.scope === 'tag' || term.scope === 'all')) {
      if (term.scope === 'all') {
        const exactValues = [
          ...(fields.tagValues || []),
          fields.title,
          fields.url,
          fields.domain,
          fields.time,
        ].map(value => String(value || '').toLowerCase()).filter(Boolean);
        if (exactValues.some(value => value === term.keyword)) return true;
      }
      if (term.scope !== 'tag') return false;
      return (fields.tagValues || []).some(tag => String(tag).toLowerCase() === term.keyword);
    }
    const text = String(fields[term.scope] ?? fields.all ?? '').toLowerCase();
    return term.exact ? text === term.keyword : text.includes(term.keyword);
  };
  const hasIncluded = includeTerms.length === 0 || includeTerms.some(matchTerm);
  if (!hasIncluded) return false;
  return !excludeTerms.some(matchTerm);
}

function updateGlobalSearchMeta(count) {
  const keywords = parseSearchKeywords(els.globalSearchInput.value);
  els.globalSearchClear.style.display = keywords.length > 0 ? 'inline-block' : 'none';
  if (keywords.length > 0) {
    els.globalSearchCount.textContent = `找到 ${count} 个`;
    els.globalSearchCount.style.display = 'inline';
  } else {
    els.globalSearchCount.style.display = 'none';
  }
}

function getGlobalSearchRows() {
  const keywords = parseSearchKeywords(els.globalSearchInput.value);
  if (keywords.length === 0) return [];
  return getAllRows(shouldSearchIncludeDeleted(keywords)).filter(row => matchesSearchKeywords(getSearchFields(row.url, row.title, row.tags, row.timeText), keywords))
    .sort((a, b) => (a.title || a.url).localeCompare(b.title || b.url, 'zh-Hans-CN'));
}

function getAllRows(includeDeleted = false) {
  const rows = [];
  const entries = includeDeleted ? Object.entries(getData()) : getActiveDataEntries();
  for (const [url, entry] of entries) {
    const tags = normalizeTags(entry?.tags);
    const title = String(entry?.meta?.title || entry?.title || '').trim();
    const timeText = formatEntryTime(entry);
    rows.push({ url, title, timeText, tags });
  }
  rows.sort((a, b) => (a.title || a.url).localeCompare(b.title || b.url, 'zh-Hans-CN'));
  return rows;
}

function filterRowsInCurrentList(rows) {
  const keywords = parseSearchKeywords(els.urlSearchInput.value);
  let result = keywords.length === 0
    ? rows
    : rows.filter(row => matchesSearchKeywords(getSearchFields(row.url, row.title, row.tags, row.timeText), keywords));
  if (duplicateFocusKey) {
    result = result.filter(row => getDuplicateKeyFromUrl(row.url) === duplicateFocusKey);
  }
  if (duplicateFilterActive) {
    result = filterDuplicateRows(result);
  }
  return result;
}

function renderDuplicateBadge(row, duplicateIndices, currentIndex) {
  const key = getDuplicateKeyFromUrl(row.url);
  const indices = duplicateIndices.get(key) || [];
  const otherIndices = indices.filter(index => index !== currentIndex);
  if (otherIndices.length === 0) return '';
  const otherText = otherIndices.sort((a, b) => a - b).join('、');
  return `<button type="button" class="duplicate-badge" data-duplicate-key="${escapeHtml(key)}" data-duplicate-url="${escapeHtml(row.url)}" title="点击过滤显示这组重复链接">与${otherText}重复</button>`;
}

function renderUrlRows(rows, startIndex = 0) {
  const duplicateIndices = new Map();
  currentRows.forEach((row, index) => {
    const key = getDuplicateKeyFromUrl(row.url);
    if (!key) return;
    if (!duplicateIndices.has(key)) duplicateIndices.set(key, []);
    duplicateIndices.get(key).push(index + 1);
  });
  return rows.map((row, index) => `
    <div class="url-row" data-url="${escapeHtml(row.url)}">
      <div class="url-index">
        <input type="checkbox" class="url-select-checkbox" data-url="${escapeHtml(row.url)}" ${selectedUrls.has(row.url) ? 'checked' : ''}>
        <span>${startIndex + index + 1}</span>
      </div>
      <div class="url-content">
        <a class="url-text" href="${escapeHtml(row.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(row.url)}</a>
        ${renderDuplicateBadge(row, duplicateIndices, startIndex + index + 1)}
        ${row.title ? `<div class="url-title">来源: ${escapeHtml(row.title)}</div>` : '<div class="url-title muted">来源: 无标题</div>'}
        ${row.timeText ? `<div class="url-time">保存时间: ${escapeHtml(row.timeText)}</div>` : ''}
        <div class="url-tags">${row.tags.map(tag => `<span class="url-tag" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`).join('')}</div>
        <div class="url-actions">
          <button type="button" class="url-action-btn" data-action="edit-tags">🏷️ 标签</button>
          <button type="button" class="url-action-btn danger" data-action="clear-tags">🗑️ 删除标签</button>
        </div>
      </div>
    </div>
  `).join('');
}

function setUrlListRows(rows) {
  currentRows = rows;
  currentPage = 1;
  els.urlList.scrollTop = 0;
  renderCurrentPage();
  updateBatchToolbar();
  updateDuplicateButtons();
}

function setEmptyUrlList(message) {
  currentRows = [];
  currentPage = 1;
  els.urlList.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  renderPagination();
  updateBatchToolbar();
  updateDuplicateButtons();
}

function getTotalPages() {
  return Math.max(1, Math.ceil(currentRows.length / URL_PAGE_SIZE));
}

function renderCurrentPage() {
  const totalPages = getTotalPages();
  currentPage = Math.min(Math.max(1, currentPage), totalPages);
  const start = (currentPage - 1) * URL_PAGE_SIZE;
  const pageRows = currentRows.slice(start, start + URL_PAGE_SIZE);
  els.urlList.innerHTML = renderUrlRows(pageRows, start);
  renderPagination();
  updateBatchToolbar();
}

function renderPagination() {
  const bars = [els.paginationBar, els.paginationBarBottom].filter(Boolean);
  if (bars.length === 0) return;
  if (currentRows.length <= URL_PAGE_SIZE) {
    bars.forEach(bar => {
      bar.innerHTML = '';
    });
    return;
  }
  const totalPages = getTotalPages();
  const start = (currentPage - 1) * URL_PAGE_SIZE + 1;
  const end = Math.min(currentPage * URL_PAGE_SIZE, currentRows.length);
  const html = `
    <button type="button" class="page-btn" data-page-action="prev" ${currentPage <= 1 ? 'disabled' : ''}>上一页</button>
    <span class="page-info">第 ${currentPage} / ${totalPages} 页，显示 ${start}-${end} / ${currentRows.length}</span>
    <input class="page-input" type="number" min="1" max="${totalPages}" value="${currentPage}" aria-label="页码">
    <button type="button" class="page-btn" data-page-action="next" ${currentPage >= totalPages ? 'disabled' : ''}>下一页</button>
  `;
  bars.forEach(bar => {
    bar.innerHTML = html;
  });
}

function handleUrlListClick(e) {
  const checkbox = e.target.closest('.url-select-checkbox');
  if (checkbox && els.urlList.contains(checkbox)) {
    if (checkbox.checked) {
      selectedUrls.add(checkbox.dataset.url || '');
    } else {
      selectedUrls.delete(checkbox.dataset.url || '');
    }
    selectedUrls.delete('');
    updateBatchToolbar();
    return;
  }

  const duplicateBadge = e.target.closest('.duplicate-badge[data-duplicate-key]');
  if (duplicateBadge && els.urlList.contains(duplicateBadge)) {
    duplicateFocusKey = duplicateBadge.dataset.duplicateKey || '';
    duplicateFilterActive = false;
    els.urlSearchInput.value = duplicateBadge.dataset.duplicateUrl || '';
    selectedUrls.clear();
    renderDetail();
    return;
  }

  const tagEl = e.target.closest('.url-tag[data-tag]');
  if (tagEl && els.urlList.contains(tagEl)) {
    els.globalSearchInput.value = tagEl.dataset.tag || '';
    els.urlSearchInput.value = '';
    renderDetail();
    return;
  }

  const button = e.target.closest('.url-action-btn');
  if (!button || !els.urlList.contains(button)) return;
  const row = button.closest('.url-row');
  const url = row?.dataset.url || '';
  if (!url) return;
  if (button.dataset.action === 'edit-tags') {
    showUrlTagDialog(url);
  } else if (button.dataset.action === 'clear-tags') {
    clearUrlTags(url);
  }
}

function getCurrentPageRows() {
  const start = (currentPage - 1) * URL_PAGE_SIZE;
  return currentRows.slice(start, start + URL_PAGE_SIZE);
}

function updateBatchToolbar() {
  if (!els.batchToolbar) return;
  pruneSelectedUrls();
  const count = selectedUrls.size;
  els.batchToolbar.classList.toggle('show', count > 0);
  els.batchSelectedCount.textContent = `已选择 ${count} 个`;
  els.batchEditTagsBtn.disabled = count === 0;
  els.batchClearTagsBtn.disabled = count === 0;
  els.batchClearSelectionBtn.disabled = count === 0;
  const pageRows = getCurrentPageRows();
  const selectedOnPage = pageRows.filter(row => selectedUrls.has(row.url)).length;
  els.batchSelectPageCheckbox.checked = pageRows.length > 0 && selectedOnPage === pageRows.length;
  els.batchSelectPageCheckbox.indeterminate = selectedOnPage > 0 && selectedOnPage < pageRows.length;
}

function toggleCurrentPageSelection(checked) {
  getCurrentPageRows().forEach(row => {
    if (checked) {
      selectedUrls.add(row.url);
    } else {
      selectedUrls.delete(row.url);
    }
  });
  renderCurrentPage();
}

function clearSelection() {
  selectedUrls.clear();
  renderCurrentPage();
}

function updateDuplicateButtons() {
  if (els.filterDuplicateBtn) {
    els.filterDuplicateBtn.textContent = duplicateFilterActive ? '显示全部' : '过滤重复';
    const scopeRows = currentRows.length > 0 ? currentRows : getAllRows();
    els.filterDuplicateBtn.disabled = scopeRows.length === 0;
  }
}

function toggleDuplicateFilter() {
  duplicateFilterActive = !duplicateFilterActive;
  selectedUrls.clear();
  renderDetail();
}

function handlePaginationClick(e) {
  const button = e.target.closest('[data-page-action]');
  if (!button) return;
  const action = button.dataset.pageAction;
  if (action === 'prev') currentPage--;
  if (action === 'next') currentPage++;
  renderCurrentPage();
  els.urlList.scrollTop = 0;
}

function handlePaginationInput(e) {
  if (!e.target.classList.contains('page-input')) return;
  const page = Number(e.target.value);
  if (!Number.isInteger(page)) return;
  currentPage = page;
  renderCurrentPage();
  els.urlList.scrollTop = 0;
}

function getEntryByUrl(url) {
  const data = getData();
  if (!data[url]) data[url] = { tags: [] };
  if (!Array.isArray(data[url].tags)) data[url].tags = [];
  return data[url];
}

function getExistingEntryByUrl(url) {
  const entry = getData()[url];
  return entry && typeof entry === 'object' ? entry : null;
}

function pruneSelectedUrls() {
  for (const url of Array.from(selectedUrls)) {
    const entry = getExistingEntryByUrl(url);
    if (!entry || normalizeTags(entry.tags).length === 0) {
      selectedUrls.delete(url);
    }
  }
}

function setEntryTagsByUrl(url, tags) {
  const data = getData();
  const nextTags = normalizeTags(tags);
  if (nextTags.length === 0) {
    delete data[url];
    selectedUrls.delete(url);
    return null;
  }
  if (!data[url]) data[url] = {};
  data[url].tags = nextTags;
  return data[url];
}

function pruneEmptyTagEntries() {
  const data = getData();
  for (const [url, entry] of Object.entries(data)) {
    if (isDeletedEntry(entry)) continue;
    const tags = normalizeTags(entry?.tags);
    if (tags.length === 0) {
      delete data[url];
      selectedUrls.delete(url);
    } else if (entry && Array.isArray(entry.tags)) {
      entry.tags = tags;
    }
  }
}

function getAllExistingTags() {
  const tags = new Set();
  for (const [, entry] of getActiveDataEntries()) {
    normalizeTags(entry?.tags).forEach(tag => tags.add(tag));
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

function getCleanupPredicate(type) {
  if (type === 'date') return tag => /^20\d{2}年\d{1,2}月\d{1,2}日$/.test(tag);
  if (type === 'time') return tag => /^\d{1,2}点\d{1,2}分\d{1,2}秒$/.test(tag);
  if (type === 'divider') return tag => /分割线/.test(tag);
  return () => false;
}

function getCleanupPredicate(type) {
  const datePattern = /^20\d{2}\u5e74\d{1,2}\u6708\d{1,2}\u65e5$/;
  const timePattern = /^\d{1,2}\u70b9\d{1,2}\u5206\d{1,2}\u79d2$/;
  const dateTimePattern = /^20\d{2}\u5e74\d{1,2}\u6708\d{1,2}\u65e5\d{1,2}\u70b9\d{1,2}\u5206\d{1,2}\u79d2$/;
  if (type === 'date') return tag => datePattern.test(tag) || dateTimePattern.test(tag);
  if (type === 'time') return tag => timePattern.test(tag) || dateTimePattern.test(tag);
  if (type === 'divider') return tag => /\u5206\u5272\u7ebf/.test(tag);
  return () => false;
}

function removeCleanupTags(tags, type) {
  const shouldRemove = getCleanupPredicate(type);
  return normalizeTags(tags).filter(tag => !shouldRemove(tag));
}

function getCleanupLabel(type) {
  if (type === 'date') return '年月日';
  if (type === 'time') return '时分秒';
  if (type === 'divider') return '分割线';
  return type;
}

function saveTagEdit() {
  pruneEmptyTagEntries();
  setDirty(true);
  saveEditedJson(() => {});
  renderAll();
}

function clearUrlTags(url) {
  const entry = getEntryByUrl(url);
  const tags = normalizeTags(entry.tags);
  if (tags.length === 0) return;
  if (!confirm(`确定删除此 URL 的全部 ${tags.length} 个 UT 标签吗？`)) return;
  setEntryTagsByUrl(url, []);
  saveTagEdit();
}

function clearSelectedUrlTags() {
  pruneSelectedUrls();
  const urls = Array.from(selectedUrls);
  if (urls.length === 0) {
    updateBatchToolbar();
    return;
  }
  if (!confirm(`确定删除选中 ${urls.length} 个 URL 的全部 UT 标签吗？`)) return;
  urls.forEach(url => setEntryTagsByUrl(url, []));
  saveTagEdit();
}

function showBatchTagDialog() {
  pruneSelectedUrls();
  const urls = Array.from(selectedUrls);
  if (urls.length === 0) {
    updateBatchToolbar();
    return;
  }
  const entryStates = urls.map((url, index) => {
    const entry = getExistingEntryByUrl(url);
    if (!entry) return null;
    const tags = normalizeTags(entry.tags);
    if (tags.length === 0) return null;
    return {
      index: index + 1,
      url,
      title: String(entry?.meta?.title || entry?.title || '').trim(),
      tags,
    };
  }).filter(Boolean);
  if (entryStates.length === 0) {
    selectedUrls.clear();
    updateBatchToolbar();
    return;
  }
  let pendingTags = [];
  let selectedTagSearch = '';

  const modal = document.createElement('div');
  modal.className = 'tag-modal show';
  modal.innerHTML = `
    <div class="tag-modal-content">
      <div class="tag-modal-header">
        <h2>批量编辑标签</h2>
        <button type="button" class="tag-modal-close" data-action="close">×</button>
      </div>
      <div class="tag-modal-body">
        <div class="tag-modal-url">已选中 ${entryStates.length} 个条目，正在批量编辑标签。</div>
        <div class="batch-selected-search">
          <input id="batchSelectedTagSearch" type="search" placeholder="搜索已选条目的标签...">
          <button type="button" class="btn secondary" data-action="clear-selected-search">清空搜索</button>
          <button type="button" class="btn danger" data-action="delete-filtered-tags">删除过滤标签</button>
        </div>
        <div id="batchSelectedTagMeta" class="batch-selected-meta"></div>
        <div class="batch-entry-list" id="batchEntryList"></div>
        <div class="tag-history-title">本次批量添加</div>
        <div class="tag-edit-box" id="modalCurrentTags"></div>
        <div class="tag-add-row">
          <input id="modalTagInput" type="text" placeholder="输入新标签，多个标签用逗号分隔">
          <button type="button" class="btn primary" data-action="add">添加</button>
        </div>
        <div class="tag-cleanup-row">
          <button type="button" class="cleanup-btn" data-action="cleanup-date">删除年月日</button>
          <button type="button" class="cleanup-btn" data-action="cleanup-time">删除时分秒</button>
          <button type="button" class="cleanup-btn" data-action="cleanup-divider">删除分割线</button>
        </div>
        <div class="tag-history">
          <div class="tag-history-title">标签列表（点击快速添加）</div>
          <input id="modalTagSearch" type="search" placeholder="搜索标签：空格分隔，匹配任意一个">
          <div class="tag-history-list" id="modalHistoryTags"></div>
        </div>
      </div>
      <div class="tag-modal-footer">
        <button type="button" class="btn secondary" data-action="close">取消</button>
        <button type="button" class="btn danger" data-action="clear">清空本次标签</button>
        <button type="button" class="btn primary" data-action="save">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const currentBox = modal.querySelector('#modalCurrentTags');
  const entryList = modal.querySelector('#batchEntryList');
  const selectedSearchInput = modal.querySelector('#batchSelectedTagSearch');
  const selectedMeta = modal.querySelector('#batchSelectedTagMeta');
  const tagInput = modal.querySelector('#modalTagInput');
  const tagSearch = modal.querySelector('#modalTagSearch');
  const historyBox = modal.querySelector('#modalHistoryTags');

  function getSelectedKeywords() {
    return selectedTagSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  function tagMatchesSelectedSearch(tag) {
    const keywords = getSelectedKeywords();
    if (keywords.length === 0) return true;
    const text = tag.toLowerCase();
    return keywords.some(keyword => text.includes(keyword));
  }

  function renderEntryList() {
    const keywords = getSelectedKeywords();
    let visibleEntries = 0;
    let visibleTags = 0;
    entryList.innerHTML = entryStates.map(item => {
      const visibleItemTags = item.tags.filter(tagMatchesSelectedSearch);
      if (keywords.length > 0 && visibleItemTags.length === 0) return '';
      visibleEntries++;
      visibleTags += visibleItemTags.length;
      return `
        <div class="batch-entry" data-url="${escapeHtml(item.url)}">
          <div class="batch-entry-title">条目 ${item.index}</div>
          ${item.title ? `<div class="batch-entry-source">${escapeHtml(item.title)}</div>` : ''}
          <div class="batch-entry-url">${escapeHtml(item.url)}</div>
          <div class="batch-entry-tags">
            ${visibleItemTags.length
              ? visibleItemTags.map(tag => `<button type="button" class="modal-tag-pill" data-url="${escapeHtml(item.url)}" data-tag="${escapeHtml(tag)}"><span>${escapeHtml(tag)}</span><span class="modal-tag-remove">×</span></button>`).join('')
              : '<span class="tag-empty">暂无匹配标签</span>'}
          </div>
        </div>
      `;
    }).join('');

    selectedMeta.textContent = keywords.length > 0
      ? `当前显示 ${visibleEntries} 个条目，匹配到 ${visibleTags} 个标签。`
      : `当前显示全部 ${entryStates.length} 个条目。`;

    entryList.querySelectorAll('.modal-tag-pill[data-url][data-tag]').forEach(button => {
      button.addEventListener('click', () => {
        const item = entryStates.find(entry => entry.url === button.dataset.url);
        if (!item) return;
        item.tags = item.tags.filter(tag => tag !== button.dataset.tag);
        renderEntryList();
        renderHistoryTags();
      });
    });
  }

  function renderCurrentTags() {
    if (pendingTags.length === 0) {
      currentBox.innerHTML = '<span class="tag-empty">暂无本次批量添加标签</span>';
      return;
    }
    currentBox.innerHTML = pendingTags.map(tag => `
      <button type="button" class="modal-tag-pill" data-tag="${escapeHtml(tag)}">
        <span>${escapeHtml(tag)}</span><span class="modal-tag-remove">×</span>
      </button>
    `).join('');
    currentBox.querySelectorAll('.modal-tag-pill').forEach(button => {
      button.addEventListener('click', () => {
        pendingTags = pendingTags.filter(tag => tag !== button.dataset.tag);
        renderCurrentTags();
        renderHistoryTags();
      });
    });
  }

  function renderHistoryTags() {
    const keywords = tagSearch.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const existingTags = getAllExistingTags()
      .filter(tag => !pendingTags.includes(tag))
      .filter(tag => keywords.length === 0 || keywords.some(keyword => tag.toLowerCase().includes(keyword)));
    historyBox.innerHTML = existingTags.length
      ? existingTags.map(tag => `<button type="button" class="history-tag-pill" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('')
      : '<span class="tag-empty">暂无可添加标签</span>';
    historyBox.querySelectorAll('.history-tag-pill').forEach(button => {
      button.addEventListener('click', () => {
        pendingTags = normalizeTags([...pendingTags, button.dataset.tag]);
        renderCurrentTags();
        renderHistoryTags();
      });
    });
  }

  function addInputTags() {
    const tags = tagInput.value.split(/[,\n，]/).map(tag => tag.trim()).filter(Boolean);
    if (tags.length === 0) return;
    pendingTags = normalizeTags([...pendingTags, ...tags]);
    tagInput.value = '';
    renderCurrentTags();
    renderHistoryTags();
  }

  modal.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'close') {
      modal.remove();
    } else if (action === 'add') {
      addInputTags();
    } else if (action === 'clear') {
      pendingTags = [];
      renderCurrentTags();
      renderHistoryTags();
    } else if (action.startsWith('cleanup-')) {
      const cleanupType = action.replace('cleanup-', '');
      entryStates.forEach(item => {
        item.tags = removeCleanupTags(item.tags, cleanupType);
      });
      pendingTags = removeCleanupTags(pendingTags, cleanupType);
      renderEntryList();
      renderCurrentTags();
      renderHistoryTags();
    } else if (action === 'clear-selected-search') {
      selectedTagSearch = '';
      selectedSearchInput.value = '';
      renderEntryList();
    } else if (action === 'delete-filtered-tags') {
      const keywords = getSelectedKeywords();
      if (keywords.length === 0) {
        alert('请先输入要过滤的标签内容');
        return;
      }
      let removed = 0;
      entryStates.forEach(item => {
        const before = item.tags.length;
        item.tags = item.tags.filter(tag => !tagMatchesSelectedSearch(tag));
        removed += before - item.tags.length;
      });
      if (removed === 0) {
        alert('没有找到匹配过滤内容的标签');
      }
      renderEntryList();
      renderHistoryTags();
    } else if (action === 'save') {
      entryStates.forEach(item => {
        setEntryTagsByUrl(item.url, [...item.tags, ...pendingTags]);
      });
      modal.remove();
      saveTagEdit();
    }
  });
  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addInputTags();
  });
  selectedSearchInput.addEventListener('input', (e) => {
    selectedTagSearch = e.target.value;
    renderEntryList();
  });
  tagSearch.addEventListener('input', renderHistoryTags);
  renderEntryList();
  renderCurrentTags();
  renderHistoryTags();
  tagInput.focus();
}

function showUrlTagDialog(url) {
  const entry = getEntryByUrl(url);
  let currentTags = normalizeTags(entry.tags);
  const title = String(entry?.meta?.title || entry?.title || '').trim();

  const modal = document.createElement('div');
  modal.className = 'tag-modal show';
  modal.innerHTML = `
    <div class="tag-modal-content">
      <div class="tag-modal-header">
        <h2>编辑标签</h2>
        <button type="button" class="tag-modal-close" data-action="close">×</button>
      </div>
      <div class="tag-modal-body">
        ${title ? `<div class="tag-modal-title">${escapeHtml(title)}</div>` : ''}
        <div class="tag-modal-url">${escapeHtml(url)}</div>
        <div class="tag-edit-box" id="modalCurrentTags"></div>
        <div class="tag-add-row">
          <input id="modalTagInput" type="text" placeholder="输入新标签，多个标签用逗号分隔">
          <button type="button" class="btn primary" data-action="add">添加</button>
        </div>
        <div class="tag-history">
          <div class="tag-history-title">标签列表（点击快速添加）</div>
          <input id="modalTagSearch" type="search" placeholder="搜索标签：空格分隔，匹配任意一个">
          <div class="tag-history-list" id="modalHistoryTags"></div>
        </div>
      </div>
      <div class="tag-modal-footer">
        <button type="button" class="btn secondary" data-action="close">取消</button>
        <button type="button" class="btn danger" data-action="clear">清空全标签</button>
        <button type="button" class="btn primary" data-action="save">保存</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  const currentBox = modal.querySelector('#modalCurrentTags');
  const tagInput = modal.querySelector('#modalTagInput');
  const tagSearch = modal.querySelector('#modalTagSearch');
  const historyBox = modal.querySelector('#modalHistoryTags');

  function renderCurrentTags() {
    if (currentTags.length === 0) {
      currentBox.innerHTML = '<span class="tag-empty">暂无标签</span>';
      return;
    }
    currentBox.innerHTML = currentTags.map(tag => `
      <button type="button" class="modal-tag-pill" data-tag="${escapeHtml(tag)}">
        <span>${escapeHtml(tag)}</span><span class="modal-tag-remove">×</span>
      </button>
    `).join('');
    currentBox.querySelectorAll('.modal-tag-pill').forEach(button => {
      button.addEventListener('click', () => {
        currentTags = currentTags.filter(tag => tag !== button.dataset.tag);
        renderCurrentTags();
        renderHistoryTags();
      });
    });
  }

  function renderHistoryTags() {
    const keywords = tagSearch.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const existingTags = getAllExistingTags()
      .filter(tag => !currentTags.includes(tag))
      .filter(tag => keywords.length === 0 || keywords.some(keyword => tag.toLowerCase().includes(keyword)));
    if (existingTags.length === 0) {
      historyBox.innerHTML = '<span class="tag-empty">暂无可添加标签</span>';
      return;
    }
    historyBox.innerHTML = existingTags.map(tag => `<button type="button" class="history-tag-pill" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('');
    historyBox.querySelectorAll('.history-tag-pill').forEach(button => {
      button.addEventListener('click', () => {
        currentTags = normalizeTags([...currentTags, button.dataset.tag]);
        renderCurrentTags();
        renderHistoryTags();
      });
    });
  }

  function addInputTags() {
    const tags = tagInput.value.split(/[,\n，]/).map(tag => tag.trim()).filter(Boolean);
    if (tags.length === 0) return;
    currentTags = normalizeTags([...currentTags, ...tags]);
    tagInput.value = '';
    renderCurrentTags();
    renderHistoryTags();
  }

  modal.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'close') {
      modal.remove();
    } else if (action === 'add') {
      addInputTags();
    } else if (action === 'clear') {
      currentTags = [];
      renderCurrentTags();
      renderHistoryTags();
    } else if (action === 'save') {
      setEntryTagsByUrl(url, currentTags);
      modal.remove();
      saveTagEdit();
    }
  });

  tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addInputTags();
  });
  tagSearch.addEventListener('input', renderHistoryTags);

  renderCurrentTags();
  renderHistoryTags();
  tagInput.focus();
}

function renderDetail() {
  const globalKeywords = parseSearchKeywords(els.globalSearchInput.value);
  if (globalKeywords.length > 0) {
    const baseRows = getGlobalSearchRows();
    const rows = filterRowsInCurrentList(baseRows);
    updateGlobalSearchMeta(baseRows.length);
    if (rows.length === 0) {
      setEmptyUrlList(duplicateFilterActive || duplicateFocusKey ? '当前搜索结果里没有匹配的重复 URL。' : '全局搜索没有匹配结果。');
      return;
    }
    els.deleteTagBtn.disabled = true;
    els.selectedTagTitle.textContent = `全局搜索: ${globalKeywords.map(term => `${term.exclude ? '-' : ''}${term.raw}`).join(' ')}`;
    els.selectedTagMeta.textContent = `搜索范围: URL、标题、标签、域名 | 命中: ${rows.length}`;
    if (rows.length === 0) {
      els.urlList.innerHTML = '<div class="empty-state">全局搜索没有匹配结果。</div>';
      return;
    }
    setUrlListRows(rows);
    return;
  }
  updateGlobalSearchMeta(0);

  if (!selectedTag && !selectedDomain && (duplicateFilterActive || duplicateFocusKey)) {
    const rows = filterRowsInCurrentList(getAllRows());
    els.deleteTagBtn.disabled = true;
    els.selectedTagTitle.textContent = duplicateFocusKey ? '全局重复: 单组' : '全局重复过滤';
    els.selectedTagMeta.textContent = `范围: 全部 URL | 命中: ${rows.length}`;
    if (rows.length === 0) {
      setEmptyUrlList('全局没有匹配的重复 URL。');
      return;
    }
    setUrlListRows(rows);
    return;
  }

  const selectedStat = sideMode === 'domain'
    ? getDomainStats().find(item => item.name === selectedDomain)
    : getTagStats().find(item => item.tag === selectedTag);
  const hasSelection = !!selectedStat;
  els.deleteTagBtn.disabled = !hasSelection || sideMode === 'domain';
  els.deleteTagBtn.style.display = sideMode === 'domain' ? 'none' : '';

  if (!hasSelection) {
    setEmptyUrlList(`请选择左侧${sideMode === 'domain' ? '域名' : '标签'}。`);
    if (sideMode === 'tag') selectedTag = '';
    if (sideMode === 'domain') selectedDomain = '';
    els.selectedTagTitle.textContent = sideMode === 'domain' ? '选择一个域名' : '选择一个标签';
    els.selectedTagMeta.textContent = sideMode === 'domain' ? '查看此域名下的 URL。' : '可以重命名、删除标签，或查看使用它的 URL。';
    els.urlList.innerHTML = `<div class="empty-state">请选择左侧${sideMode === 'domain' ? '域名' : '标签'}。</div>`;
    return;
  }

  const allRows = getSelectedTagUrls();
  const rows = filterRowsInCurrentList(allRows);
  if (rows.length === 0) {
    setEmptyUrlList(duplicateFilterActive || duplicateFocusKey ? '当前列表里没有匹配的重复 URL。' : '当前搜索没有匹配 URL。');
    return;
  }
  els.selectedTagTitle.textContent = sideMode === 'domain' ? selectedDomain : selectedTag;
  els.selectedTagMeta.textContent = sideMode === 'domain'
    ? `此域名下的 URL: ${rows.length}${rows.length === allRows.length ? '' : ` / ${allRows.length}`}`
    : `使用此标签的 URL: ${rows.length}${rows.length === allRows.length ? '' : ` / ${allRows.length}`}`;

  if (rows.length === 0) {
    els.urlList.innerHTML = '<div class="empty-state">当前搜索没有匹配 URL。</div>';
    return;
  }

  setUrlListRows(rows);
}

function renderAll() {
  updateSummary();
  renderTagList();
  renderDetail();
}

function getTagUsageCount(tagName) {
  const target = String(tagName || '').trim();
  if (!target) return 0;
  const entries = DELETED_BOOKMARK_TAGS.has(target) ? Object.entries(getData()) : getActiveDataEntries();
  let count = 0;
  for (const [, entry] of entries) {
    if (normalizeTags(entry?.tags).includes(target)) count++;
  }
  return count;
}

function getMergedTagUsageCount(fromTag, toTag) {
  const from = String(fromTag || '').trim();
  const to = String(toTag || '').trim();
  const includeDeleted = DELETED_BOOKMARK_TAGS.has(from) || DELETED_BOOKMARK_TAGS.has(to);
  const entries = includeDeleted ? Object.entries(getData()) : getActiveDataEntries();
  const urls = new Set();
  for (const [url, entry] of entries) {
    const tags = normalizeTags(entry?.tags);
    if (tags.includes(from) || tags.includes(to)) {
      urls.add(url);
    }
  }
  return urls.size;
}

function renameTag(oldTag) {
  const currentTag = String(oldTag || '').trim();
  if (!currentTag) return;
  const newTag = prompt('输入新的标签名', currentTag)?.trim();
  if (!newTag || currentTag === newTag) return;
  const currentCount = getTagUsageCount(currentTag);
  const targetCount = getTagUsageCount(newTag);
  const mergedCount = getMergedTagUsageCount(currentTag, newTag);
  const confirmText = targetCount > 0
    ? `标签「${currentTag}」当前有 ${currentCount} 个 URL。\n标签「${newTag}」已存在，当前有 ${targetCount} 个 URL。\n合并后「${newTag}」将有 ${mergedCount} 个 URL。\n\n确定把「${currentTag}」重命名并合并到已有标签「${newTag}」吗？`
    : `标签「${currentTag}」当前有 ${currentCount} 个 URL。\n标签「${newTag}」当前不存在。\n\n确定把「${currentTag}」重命名为「${newTag}」吗？`;
  if (!confirm(confirmText)) return;

  const renameEntries = (DELETED_BOOKMARK_TAGS.has(currentTag) || DELETED_BOOKMARK_TAGS.has(newTag))
    ? Object.entries(getData())
    : getActiveDataEntries();
  for (const [, entry] of renameEntries) {
    const tags = normalizeTags(entry?.tags);
    if (!tags.includes(currentTag)) continue;
    const nextTags = tags.map(tag => tag === currentTag ? newTag : tag);
    entry.tags = normalizeTags(nextTags);
  }
  if (selectedTag === currentTag) selectedTag = newTag;
  setDirty(true);
  saveEditedJson(() => {});
  renderAll();
}

function deleteSelectedTag() {
  const tag = selectedTag;
  if (!tag) return;
  const count = getTagUsageCount(tag);
  if (!confirm(`标签「${tag}」当前有 ${count} 个 URL。\n\n确定从所有 URL 中删除这个标签吗？`)) return;

  const deleteEntries = DELETED_BOOKMARK_TAGS.has(tag) ? Object.entries(getData()) : getActiveDataEntries();
  for (const [url, entry] of deleteEntries) {
    const tags = normalizeTags(entry?.tags);
    if (tags.includes(tag)) {
      setEntryTagsByUrl(url, tags.filter(item => item !== tag));
    }
  }
  selectedTag = '';
  setDirty(true);
  saveEditedJson(() => {});
  renderAll();
}

function buildBookmarksIndex(data) {
  const result = {};
  const source = data?.data && typeof data.data === 'object' ? data.data : {};
  for (const [url, entry] of Object.entries(source)) {
    if (isDeletedEntry(entry)) continue;
    const tags = normalizeTags(entry?.tags);
    if (tags.length === 0) continue;
    for (const key of getUtagsUrlCandidates(url)) {
      if (key) result[key] = { tags };
    }
  }
  return result;
}

function saveEditedJson(callback) {
  pruneEmptyTagEntries();
  const bookmarks = buildBookmarksIndex(utagsJson);
  chrome.storage.local.set({
    [UTAGS_FULL_JSON_STORAGE_KEY]: utagsJson,
    [UTAGS_BOOKMARKS_STORAGE_KEY]: bookmarks,
  }, callback);
}

function exportJson() {
  if (!utagsJson) {
    alert('没有可导出的 UTags JSON。');
    return;
  }

  saveEditedJson(() => {
    setDirty(false);
    const blob = new Blob([JSON.stringify(utagsJson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.href = url;
    a.download = `utags-edited-${timestamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

function fallbackFromBookmarks(bookmarks) {
  const data = {};
  for (const [url, entry] of Object.entries(bookmarks || {})) {
    const tags = normalizeTags(entry?.tags);
    if (tags.length > 0) data[url] = { tags };
  }
  return { data };
}

function importUtagsJsonFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data || !data.data || typeof data.data !== 'object') {
        throw new Error('这个文件不是有效的 UTags JSON：缺少 data 对象');
      }
      utagsJson = data;
      importedAt = new Date().toISOString();
      selectedTag = '';
      selectedDomain = '';
      selectedUrls.clear();
      currentRows = [];
      currentPage = 1;
      duplicateFilterActive = false;
      duplicateFocusKey = '';
      els.globalSearchInput.value = '';
      els.urlSearchInput.value = '';
      pruneEmptyTagEntries();
      const bookmarks = buildBookmarksIndex(utagsJson);
      chrome.storage.local.set({
        [UTAGS_FULL_JSON_STORAGE_KEY]: utagsJson,
        [UTAGS_BOOKMARKS_STORAGE_KEY]: bookmarks,
        [UTAGS_IMPORTED_AT_STORAGE_KEY]: importedAt,
        [UTAGS_DIRTY_STORAGE_KEY]: false,
      }, () => {
        setDirty(false);
        renderAll();
        alert(`UTags JSON 读取完成：${getActiveDataEntries().length} 个 URL`);
      });
    } catch (err) {
      console.error('UTags JSON 读取失败:', err);
      alert(`UTags JSON 读取失败：${err.message}`);
    }
  };
  reader.readAsText(file);
}

function chooseUtagsJsonFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    if (dirty && !confirm('当前修改尚未导出，读取新的 JSON 会覆盖当前 UT 管理数据。确定继续吗？')) return;
    importUtagsJsonFile(file);
  }, { once: true });
  document.body.appendChild(input);
  input.click();
}

function loadData() {
  chrome.storage.local.get({
    [UTAGS_FULL_JSON_STORAGE_KEY]: null,
    [UTAGS_BOOKMARKS_STORAGE_KEY]: {},
    [UTAGS_IMPORTED_AT_STORAGE_KEY]: '',
    [UTAGS_DIRTY_STORAGE_KEY]: false,
  }, (res) => {
    importedAt = res[UTAGS_IMPORTED_AT_STORAGE_KEY] || '';
    const fullJson = res[UTAGS_FULL_JSON_STORAGE_KEY];
    if (fullJson && fullJson.data && typeof fullJson.data === 'object') {
      utagsJson = fullJson;
    } else {
      utagsJson = fallbackFromBookmarks(res[UTAGS_BOOKMARKS_STORAGE_KEY]);
    }
    selectedTag = '';
    selectedUrls.clear();
    pruneEmptyTagEntries();
    setDirty(!!res[UTAGS_DIRTY_STORAGE_KEY]);
    renderAll();
  });
}

function bindEvents() {
  els.reloadBtn.addEventListener('click', () => {
    chooseUtagsJsonFile();
  });
  els.exportBtn.addEventListener('click', exportJson);
  els.deleteTagBtn.addEventListener('click', deleteSelectedTag);
  els.batchSelectPageCheckbox.addEventListener('change', (e) => {
    toggleCurrentPageSelection(e.target.checked);
  });
  els.batchEditTagsBtn.addEventListener('click', showBatchTagDialog);
  els.batchClearTagsBtn.addEventListener('click', clearSelectedUrlTags);
  els.batchClearSelectionBtn.addEventListener('click', clearSelection);
  els.filterDuplicateBtn.addEventListener('click', toggleDuplicateFilter);
  els.globalSearchInput.addEventListener('input', () => {
    selectedTag = '';
    selectedDomain = '';
    selectedUrls.clear();
    duplicateFocusKey = '';
    els.urlSearchInput.value = '';
    renderAll();
  });
  els.globalSearchClear.addEventListener('click', () => {
    els.globalSearchInput.value = '';
    els.urlSearchInput.value = '';
    duplicateFocusKey = '';
    updateGlobalSearchMeta(0);
    els.globalSearchInput.focus();
    renderAll();
  });
  els.sideModeButtons.forEach(button => {
    button.addEventListener('click', () => {
      sideMode = button.dataset.sideMode === 'domain' ? 'domain' : 'tag';
      els.sideModeButtons.forEach(btn => btn.classList.toggle('active', btn === button));
      els.tagSearchInput.placeholder = sideMode === 'domain' ? '搜索域名' : '搜索标签';
      selectedTag = '';
      selectedDomain = '';
      selectedUrls.clear();
      duplicateFocusKey = '';
      duplicateFilterActive = false;
      els.urlSearchInput.value = '';
      els.globalSearchInput.value = '';
      renderAll();
    });
  });
  els.tagSearchInput.addEventListener('input', renderTagList);
  els.tagSortSelect.addEventListener('change', renderTagList);
  els.urlSearchInput.addEventListener('input', () => {
    selectedUrls.clear();
    duplicateFocusKey = '';
    renderDetail();
  });
  els.urlList.addEventListener('click', handleUrlListClick);
  els.paginationBar.addEventListener('click', handlePaginationClick);
  els.paginationBar.addEventListener('change', handlePaginationInput);
  els.paginationBarBottom.addEventListener('click', handlePaginationClick);
  els.paginationBarBottom.addEventListener('change', handlePaginationInput);
}

document.addEventListener('DOMContentLoaded', () => {
  Object.assign(els, {
    summaryText: $('summaryText'),
    reloadBtn: $('reloadBtn'),
    exportBtn: $('exportBtn'),
    globalSearchInput: $('globalSearchInput'),
    globalSearchClear: $('globalSearchClear'),
    globalSearchCount: $('globalSearchCount'),
    sideModeButtons: Array.from(document.querySelectorAll('[data-side-mode]')),
    tagSearchInput: $('tagSearchInput'),
    tagSortSelect: $('tagSortSelect'),
    tagList: $('tagList'),
    selectedTagTitle: $('selectedTagTitle'),
    selectedTagMeta: $('selectedTagMeta'),
    deleteTagBtn: $('deleteTagBtn'),
    batchToolbar: $('batchToolbar'),
    batchSelectPageCheckbox: $('batchSelectPageCheckbox'),
    batchSelectedCount: $('batchSelectedCount'),
    batchEditTagsBtn: $('batchEditTagsBtn'),
    batchClearTagsBtn: $('batchClearTagsBtn'),
    batchClearSelectionBtn: $('batchClearSelectionBtn'),
    urlSearchInput: $('urlSearchInput'),
    filterDuplicateBtn: $('filterDuplicateBtn'),
    paginationBar: $('paginationBar'),
    paginationBarBottom: $('paginationBarBottom'),
    urlList: $('urlList'),
  });
  bindEvents();
  loadData();
});
