/* popup.js - updated: Save current page, download .doc/.csv/.txt with clickable links, fix menu visuals */

document.addEventListener("DOMContentLoaded", () => {
  // Elements
  const linksContainer = document.getElementById("linksContainer");
  const searchInput = document.getElementById("searchInput");
  const copyAllBtn = document.getElementById("copyAllBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const downloadMenu = document.getElementById("downloadMenu");
  const downloadOptions = document.querySelectorAll(".download-option");
  const clearAllBtn = document.getElementById("clearAllBtn");
  const countLine = document.getElementById("countLine");
  const themeBtn = document.getElementById("themeBtn");
  const themeLabel = document.getElementById("themeLabel");
  const openManagerBtn = document.getElementById("openManagerBtn");

  let allLinks = [];
  let themeMode = "auto";

  // Utility
  function escapeHtml(s) {
    if (!s) return "";
    return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  }
  function setCount(){ countLine.textContent = `已保存: ${allLinks.length} 个链接`; }

  // Theme code (same as before)
  function applyTheme(mode){
    themeMode = mode;
    if(mode === "auto"){
      themeLabel.textContent = "自动";
      const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.body.classList.toggle("dark", prefersDark);
      themeBtn.textContent = "A";
    } else if(mode === "light"){
      themeLabel.textContent = "亮色";
      document.body.classList.remove("dark");
      themeBtn.textContent = "☀️";
    } else {
      themeLabel.textContent = "暗色";
      document.body.classList.add("dark");
      themeBtn.textContent = "🌙";
    }
    chrome.storage.local.set({ themeMode: mode });
  }
  chrome.storage.local.get(["themeMode"], (res)=> applyTheme(res.themeMode || "auto"));
  themeBtn.addEventListener("click", ()=> {
    const order = ["auto","light","dark"]; const idx = order.indexOf(themeMode); applyTheme(order[(idx+1)%order.length]);
  });
  if(window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", ()=> { if(themeMode==="auto") applyTheme("auto"); });

  // Load links
  function loadLinksFromStorage(){
    chrome.storage.local.get({ links: [] }, (res) => {
      allLinks = Array.isArray(res.links) ? res.links : [];
      setCount();
      render();
    });
  }

  function render(){
    linksContainer.innerHTML = "";
    const q = (searchInput.value || "").trim().toLowerCase();
    let visible = allLinks.slice();
    if(q) visible = visible.filter(l => (l.title||"").toLowerCase().includes(q) || (l.url||"").toLowerCase().includes(q));

    if(visible.length === 0){
      linksContainer.innerHTML = `<div style="color:var(--muted);padding:12px;text-align:center">未找到链接。</div>`;
      return;
    }

    visible.forEach((link, idx) => {
      const item = document.createElement("div"); item.className = "link-item";
      const left = document.createElement("div"); left.className = "link-left";
      
      // URL链接（蓝色可点击）
      const a = document.createElement("a"); 
      a.className = "link-title"; 
      a.href = link.url; 
      a.target = "_blank"; 
      a.rel = "noopener noreferrer";
      a.textContent = link.url;
      
      // 来源信息
      const source = document.createElement("div"); 
      source.className = "link-source"; 
      source.textContent = `来源: ${link.title || link.page || '未知'}`;
      
      // 时间信息
      const meta = document.createElement("div"); 
      meta.className = "link-meta"; 
      meta.textContent = link.date || "";
      
      left.appendChild(a); 
      left.appendChild(source);
      left.appendChild(meta);

      const actions = document.createElement("div"); actions.className = "link-actions";

      const copyBtn = document.createElement("button"); copyBtn.className = "small-btn copy-small"; copyBtn.textContent = "复制";
      copyBtn.addEventListener("click", () => copySingle(link, item));

      const delBtn = document.createElement("button"); delBtn.className = "small-btn delete"; delBtn.textContent = "删除";
      delBtn.addEventListener("click", () => deleteById(link.id));

      actions.appendChild(copyBtn); actions.appendChild(delBtn);
      item.appendChild(left); item.appendChild(actions);
      linksContainer.appendChild(item);
    });
  }

  // Copy single (glow + floating msg)
  function copySingle(link, itemElem){
    navigator.clipboard.writeText(link.url).then(()=>{
      itemElem.classList.add("glow");
      const msg = document.createElement("div"); msg.className = "copy-msg"; msg.textContent = "已复制!";
      itemElem.appendChild(msg);
      setTimeout(()=>{ msg.remove(); itemElem.classList.remove("glow"); }, 1400);
    }).catch(err=>{ console.error("复制失败",err); alert("复制失败。"); });
  }

  // Copy all
  copyAllBtn.addEventListener("click", ()=> {
    if(!allLinks.length) return alert("没有链接可复制！");
    const text = allLinks.map((l,i) => `${i+1}. ${l.title}\n${l.url}\n日期: ${l.date}\n收藏: ${l.favorite ? "是": "否"}`).join("\n\n");
    navigator.clipboard.writeText(text).then(()=>{ copyAllBtn.textContent="已复制!"; setTimeout(()=> copyAllBtn.textContent="📋 复制全部",900);});
  });

  // Download dropdown open/close
  downloadBtn.addEventListener("click", ()=> { downloadMenu.style.display = downloadMenu.style.display === "block" ? "none" : "block"; });
  document.addEventListener("click", (e)=> { if(!downloadBtn.contains(e.target) && !downloadMenu.contains(e.target)) downloadMenu.style.display = "none"; });

  // Download options
  downloadOptions.forEach(opt => opt.addEventListener("click", (e)=>{
    const fmt = e.currentTarget.dataset.format;
    exportLinks(fmt);
    downloadMenu.style.display = "none";
  }));

  function exportLinks(format){
    if(!allLinks.length) return alert("没有链接可导出。");
    if(format === "txt"){
      const out = allLinks.map((l,i)=>`${i+1}. ${l.title}\n${l.url}\n日期: ${l.date}\n收藏: ${l.favorite ? "是":"否"}`).join("\n\n");
      downloadBlob(out, "links.txt", "text/plain");
    } else if(format === "csv"){
      const rows = ["序号,标题,网址,日期,收藏"];
      allLinks.forEach((l,i)=> {
        const title = `"${String(l.title||"").replace(/"/g,'""')}"`;
        const url = `"${String(l.url||"").replace(/"/g,'""')}"`;
        const date = `"${l.date||""}"`;
        const fav = l.favorite ? "是":"否";
        rows.push(`${i+1},${title},${url},${date},${fav}`);
      });
      downloadBlob(rows.join("\n"), "links.csv", "text/csv");
    } else if(format === "html"){
      // Generate beautiful HTML export
      const timestamp = new Date().toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      
      const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>保存的链接 - ${timestamp}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', 'Roboto', 'Helvetica', 'Arial', sans-serif;
      background: #f7f9fb;
      padding: 20px;
      line-height: 1.6;
    }
    
    .container {
      max-width: 1000px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }
    
    .header {
      background: linear-gradient(135deg, #0b74ff 0%, #0645AD 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }
    
    .header h1 {
      font-size: 32px;
      margin-bottom: 10px;
    }
    
    .header .subtitle {
      font-size: 16px;
      opacity: 0.9;
    }
    
    .stats {
      background: #f8f9fa;
      padding: 20px 40px;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    
    .stat-item {
      font-size: 14px;
      color: #666;
    }
    
    .stat-value {
      font-weight: 600;
      color: #0b74ff;
      margin-left: 8px;
    }
    
    .links-list {
      padding: 40px;
    }
    
    .link-item {
      display: flex;
      gap: 20px;
      padding: 24px;
      margin-bottom: 20px;
      background: #f8f9fa;
      border-radius: 8px;
      border-left: 4px solid #0b74ff;
      transition: all 0.2s;
    }
    
    .link-item:hover {
      background: #e9ecef;
      transform: translateX(4px);
    }
    
    .link-item.favorite {
      border-left-color: #ffd700;
      background: #fffbf0;
    }
    
    .link-item.favorite:hover {
      background: #fff4d6;
    }
    
    .link-number {
      font-size: 20px;
      font-weight: 600;
      color: #0b74ff;
      min-width: 40px;
    }
    
    .link-content {
      flex: 1;
    }
    
    .link-title {
      font-size: 18px;
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .link-title a {
      color: #2d3748;
      text-decoration: none;
      transition: color 0.2s;
    }
    
    .link-title a:hover {
      color: #0b74ff;
      text-decoration: underline;
    }
    
    .favorite-star {
      color: #ffd700;
      font-size: 16px;
    }
    
    .link-url {
      font-size: 13px;
      color: #0b74ff;
      word-break: break-all;
      margin-bottom: 8px;
    }
    
    .link-meta {
      font-size: 12px;
      color: #a0aec0;
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
    }
    
    .meta-item {
      display: inline-block;
    }
    
    .footer {
      background: #f8f9fa;
      padding: 20px 40px;
      text-align: center;
      font-size: 13px;
      color: #a0aec0;
      border-top: 1px solid #e0e0e0;
    }
    
    @media print {
      body {
        background: white;
        padding: 0;
      }
      
      .container {
        box-shadow: none;
      }
      
      .link-item {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔗 保存的链接集合</h1>
      <div class="subtitle">导出时间: ${timestamp}</div>
    </div>
    
    <div class="stats">
      <div class="stat-item">
        总链接数: <span class="stat-value">${allLinks.length}</span>
      </div>
      <div class="stat-item">
        收藏数: <span class="stat-value">${allLinks.filter(l => l.favorite).length}</span>
      </div>
      <div class="stat-item">
        导出工具: <span class="stat-value">多链接收集器</span>
      </div>
    </div>
    
    <div class="links-list">
${allLinks.map((link, index) => {
  const safeTitle = escapeHtml(link.title || link.url);
  const safeUrl = escapeHtml(link.url);
  const safePage = escapeHtml(link.page || '');
  const safeDate = escapeHtml(link.date || '');
  const favoriteClass = link.favorite ? ' favorite' : '';
  const favoriteStar = link.favorite ? '<span class="favorite-star">★</span>' : '';
  
  return `      <div class="link-item${favoriteClass}">
        <div class="link-number">${index + 1}</div>
        <div class="link-content">
          <div class="link-title">
            <a href="${safeUrl}" target="_blank">${safeTitle}</a>
            ${favoriteStar}
          </div>
          <div class="link-url">${safeUrl}</div>
          <div class="link-meta">
            ${safePage ? `<span class="meta-item">来源: ${safePage}</span>` : ''}
            ${safeDate ? `<span class="meta-item">保存时间: ${safeDate}</span>` : ''}
            ${link.favorite ? '<span class="meta-item">⭐ 收藏</span>' : ''}
          </div>
        </div>
      </div>`;
}).join('\n')}
    </div>
    
    <div class="footer">
      由多链接收集器扩展生成 | ${timestamp}
    </div>
  </div>
</body>
</html>`;
      
      // 生成文件名：保存了X个标签 - 2026-03-09-011647.html
      const date = new Date();
      const fileTimestamp = date.getFullYear() + '-' + 
        (date.getMonth() + 1).toString().padStart(2, '0') + '-' + 
        date.getDate().toString().padStart(2, '0') + '-' + 
        date.getHours().toString().padStart(2, '0') + 
        date.getMinutes().toString().padStart(2, '0') + 
        date.getSeconds().toString().padStart(2, '0');
      const filename = `保存了${allLinks.length}个链接 - ${fileTimestamp}.html`;
      
      downloadBlob(htmlContent, filename, "text/html");
    } else if(format === "doc"){
      // Create an HTML doc with clickable blue links (works in Word)
      const docParts = [
        "<!doctype html><html><head><meta charset='utf-8'></head><body>",
        "<h2>保存的链接</h2>"
      ];
      allLinks.forEach((l,i)=>{
        const safeTitle = escapeHtml(l.title || l.url);
        const safeUrl = escapeHtml(l.url);
        const safeDate = escapeHtml(l.date || "");
        const favText = l.favorite ? "是" : "否";
        docParts.push(`<p style="font-family:Calibri,Arial;"><b>${i+1}. ${safeTitle}</b><br><a href="${safeUrl}" style="color:#0645AD;text-decoration:underline;">${safeUrl}</a><br>${safeDate}<br>收藏: ${favText}</p>`);
      });
      docParts.push("</body></html>");
      const html = docParts.join("\n");
      // Download as .doc (Word will open it; links are clickable)
      downloadBlob(html, "links.doc", "application/msword");
    }
  }

  function downloadBlob(content, filename, mime){
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    chrome.downloads.download({ url, filename }, ()=> { setTimeout(()=> URL.revokeObjectURL(url), 1500); });
  }

  // Delete by id
  function deleteById(id){
    if(!confirm("确定要删除这个链接吗？")) return;
    chrome.storage.local.get({ links: [] }, (res)=>{
      const links = (res.links || []).filter(l => l.id !== id);
      chrome.storage.local.set({ links }, ()=> { 
        allLinks = links; 
        render(); 
        setCount();
        // 更新角标
        updateBadge();
      });
    });
  }

  // Clear all
  clearAllBtn.addEventListener("click", ()=> {
    if(!confirm("确定要删除所有保存的链接吗？")) return;
    chrome.storage.local.set({ links: [] }, ()=> { 
      allLinks = []; 
      render(); 
      setCount();
      // 更新角标
      updateBadge();
    });
  });

  // 更新角标函数
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

  // Search
  searchInput.addEventListener("input", ()=> render());

  // Open manager page
  openManagerBtn.addEventListener("click", ()=> {
    chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
  });

  // Initial load
  function initialLoad(){ 
    chrome.storage.local.get({ links: [] }, (res) => { 
      allLinks = Array.isArray(res.links) ? res.links : []; 
      setCount(); 
      render();
      // 更新角标
      updateBadge();
    }); 
  }
  initialLoad();
});
