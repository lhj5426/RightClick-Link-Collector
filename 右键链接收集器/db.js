/**
 * 数据库工具类 - 用于管理 IndexedDB 存储快照图片与链接数据
 *
 * v3 起 links 也迁入 IndexedDB：
 * 旧实现把整份 links 数组存在 chrome.storage.local，每次右键保存都要
 * 「全量读 → unshift → 全量写」，数组涨到 1MB+ 后单次写入高达 10 秒。
 * 现在链接按条存入 IndexedDB（keyPath: id），保存链路变为 O(1)；
 * chrome.storage.local 只保留设置项（groups / favorites / 配置等）。
 */
const DB_NAME = 'LinkCollectorDB';
const SNAPSHOT_STORE_NAME = 'snapshots';
const LINKS_STORE_NAME = 'links';
const DB_VERSION = 3; // 升级版本：新增 links 表，并把旧版 storage.local.links 迁移进来

// 旧版 links 数据迁移标记：迁移成功后删除 storage.local 里的 links 键
const LINKS_MIGRATION_FLAG_KEY = 'linksMigratedToIdb';

let dbInstance = null;
let legacyLinksMigrationDone = false; // 本上下文内的迁移去重（跨上下文靠 storage 标记）

// Promise 版 chrome.storage.local 助手（background / manager / popup 共用）
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

function chromeStorageSet(items) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set(items, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

function chromeStorageRemove(keys) {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.remove(keys, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

const DB = {
  // 初始化数据库
  init() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) {
          db.createObjectStore(SNAPSHOT_STORE_NAME, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(LINKS_STORE_NAME)) {
          db.createObjectStore(LINKS_STORE_NAME, { keyPath: 'id' });
        }
      };
      
      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        resolve(dbInstance);
      };
      
      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  },

  // ============ 快照（原有能力，保持不变） ============

  // 保存快照
  async saveSnapshot(id, dataUrl) {
    try {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([SNAPSHOT_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(SNAPSHOT_STORE_NAME);
        const request = store.put({ id: String(id), data: dataUrl, timestamp: Date.now() });
        
        request.onsuccess = () => resolve(true);
        request.onerror = (event) => reject(event.target.error);
      });
    } catch (err) {
      console.error('DB saveSnapshot error:', err);
      return false;
    }
  },

  // 获取快照
  async getSnapshot(id) {
    try {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([SNAPSHOT_STORE_NAME], 'readonly');
        const store = transaction.objectStore(SNAPSHOT_STORE_NAME);
        const request = store.get(String(id));
        
        request.onsuccess = (event) => resolve(event.target.result ? event.target.result.data : null);
        request.onerror = (event) => reject(event.target.error);
      });
    } catch (err) {
      console.error('DB getSnapshot error:', err);
      return null;
    }
  },

  // 批量读取快照，共享一个 IndexedDB 事务
  async getSnapshots(ids, onProgress) {
    try {
      const normalizedIds = Array.from(new Set((ids || []).map(id => String(id))));
      if (normalizedIds.length === 0) return {};

      const db = await this.init();
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction([SNAPSHOT_STORE_NAME], 'readonly');
        const store = transaction.objectStore(SNAPSHOT_STORE_NAME);
        const snapshots = {};
        let completed = 0;
        let settled = false;

        const fail = (error) => {
          if (settled) return;
          settled = true;
          reject(error);
        };
        transaction.onerror = (event) => fail(event.target.error);
        transaction.onabort = (event) => fail(event.target.error || new Error('getSnapshots aborted'));

        normalizedIds.forEach(id => {
          const request = store.get(id);
          request.onsuccess = (event) => {
            const record = event.target.result;
            if (record && record.data) snapshots[id] = record.data;
            completed++;
            if (typeof onProgress === 'function') {
              onProgress(completed, normalizedIds.length);
            }
            if (completed === normalizedIds.length && !settled) {
              settled = true;
              resolve(snapshots);
            }
          };
          request.onerror = (event) => fail(event.target.error);
        });
      });
    } catch (err) {
      console.error('DB getSnapshots error:', err);
      return {};
    }
  },

  // 删除快照
  async deleteSnapshot(id) {
    try {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([SNAPSHOT_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(SNAPSHOT_STORE_NAME);
        const request = store.delete(String(id));
        
        request.onsuccess = () => resolve(true);
        request.onerror = (event) => reject(event.target.error);
      });
    } catch (err) {
      console.error('DB deleteSnapshot error:', err);
      return false;
    }
  },

  // 批量删除快照，使用单个事务减少大批量删除时的卡顿
  async deleteSnapshots(ids) {
    try {
      const normalizedIds = Array.from(new Set((ids || []).map(id => String(id))));
      if (normalizedIds.length === 0) return true;

      const db = await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([SNAPSHOT_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(SNAPSHOT_STORE_NAME);

        transaction.oncomplete = () => resolve(true);
        transaction.onerror = (event) => reject(event.target.error);
        transaction.onabort = (event) => reject(event.target.error || new Error('deleteSnapshots aborted'));

        normalizedIds.forEach(id => {
          store.delete(id);
        });
      });
    } catch (err) {
      console.error('DB deleteSnapshots error:', err);
      return false;
    }
  },

  // 清空所有快照
  async clearAllSnapshots() {
    try {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([SNAPSHOT_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(SNAPSHOT_STORE_NAME);
        const request = store.clear();
        
        request.onsuccess = () => resolve(true);
        request.onerror = (event) => reject(event.target.error);
      });
    } catch (err) {
      console.error('DB clearAllSnapshots error:', err);
      return false;
    }
  },

  // ============ 链接（v3 新增，替代旧的 storage.local.links 全量数组） ============

  // 保存单条链接（右键保存的关键路径，O(1)）
  async saveLink(item) {
    try {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([LINKS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(LINKS_STORE_NAME);
        const request = store.put(item);

        request.onsuccess = () => resolve(true);
        request.onerror = (event) => reject(event.target.error);
      });
    } catch (err) {
      console.error('DB saveLink error:', err);
      throw err;
    }
  },

  // 批量保存链接（管理页编辑 / 导入用），分块事务避免单次过大
  async saveLinks(items) {
    const list = (Array.isArray(items) ? items : []).filter(Boolean);
    if (list.length === 0) return true;

    const db = await this.init();
    const CHUNK = 500;
    for (let i = 0; i < list.length; i += CHUNK) {
      const chunk = list.slice(i, i + CHUNK);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve, reject) => {
        const transaction = db.transaction([LINKS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(LINKS_STORE_NAME);
        chunk.forEach(item => store.put(item));
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject(event.target.error);
        transaction.onabort = () => reject(event.target.error || new Error('saveLinks aborted'));
      });
    }
    return true;
  },

  // 全量读取链接，按 id 倒序（最新在前，与旧版 unshift 语义一致）
  async getAllLinks() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([LINKS_STORE_NAME], 'readonly');
      const store = transaction.objectStore(LINKS_STORE_NAME);
      const items = [];
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      transaction.onerror = (event) => fail(event.target.error);
      transaction.onabort = (event) => fail(event.target.error || new Error('getAllLinks aborted'));

      const request = store.openCursor(null, 'prev'); // 主键 id 降序
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          items.push(cursor.value);
          cursor.continue();
        }
      };
      transaction.oncomplete = () => {
        if (!settled) {
          settled = true;
          resolve(items);
        }
      };
    });
  },

  // 链接条数（角标用，O(1)）
  async getLinksCount() {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([LINKS_STORE_NAME], 'readonly');
      const store = transaction.objectStore(LINKS_STORE_NAME);
      const request = store.count();
      request.onsuccess = (event) => resolve(event.target.result || 0);
      request.onerror = (event) => reject(event.target.error);
    });
  },

  // 删除单条链接
  async deleteLink(id) {
    try {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([LINKS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(LINKS_STORE_NAME);
        const request = store.delete(id);

        request.onsuccess = () => resolve(true);
        request.onerror = (event) => reject(event.target.error);
      });
    } catch (err) {
      console.error('DB deleteLink error:', err);
      return false;
    }
  },

  // 批量删除链接，单事务
  async deleteLinks(ids) {
    try {
      const normalizedIds = Array.from(new Set(ids || []));
      if (normalizedIds.length === 0) return true;

      const db = await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([LINKS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(LINKS_STORE_NAME);

        transaction.oncomplete = () => resolve(true);
        transaction.onerror = (event) => reject(event.target.error);
        transaction.onabort = (event) => reject(event.target.error || new Error('deleteLinks aborted'));

        normalizedIds.forEach(id => {
          store.delete(id);
        });
      });
    } catch (err) {
      console.error('DB deleteLinks error:', err);
      return false;
    }
  },

  // 清空所有链接
  async clearLinks() {
    try {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([LINKS_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(LINKS_STORE_NAME);
        const request = store.clear();

        request.onsuccess = () => resolve(true);
        request.onerror = (event) => reject(event.target.error);
      });
    } catch (err) {
      console.error('DB clearLinks error:', err);
      return false;
    }
  },

  // ============ 旧版 storage.local.links 一次性迁移 ============

  // 把旧版存放在 chrome.storage.local 里的 links 数组搬进 IndexedDB。
  // 幂等：成功后写标记并删除旧键；多上下文（background/manager/popup）并发调用也安全，
  // 因为 put 以 id 为主键，重复写入同一条数据结果一致。
  async migrateLegacyLinks() {
    if (legacyLinksMigrationDone) return true;
    try {
      const res = await chromeStorageGet(['links', LINKS_MIGRATION_FLAG_KEY]);
      if (res[LINKS_MIGRATION_FLAG_KEY]) {
        legacyLinksMigrationDone = true;
        return true;
      }
      const legacy = Array.isArray(res.links) ? res.links : [];
      if (legacy.length > 0) {
        await this.saveLinks(legacy);
        console.log(`🔁 已将 ${legacy.length} 条旧版链接迁移到 IndexedDB`);
      }
      await chromeStorageSet({ [LINKS_MIGRATION_FLAG_KEY]: true });
      await chromeStorageRemove(['links']);
      legacyLinksMigrationDone = true;
      return true;
    } catch (err) {
      console.warn('旧版链接迁移失败（下次重试）:', err);
      return false;
    }
  },

  // 读取链接：先确保迁移完成，再全量读 IDB；IDB 为空且旧数据还在时兜底读旧键
  // （覆盖「扩展刚重载、迁移尚未完成」的窗口）。
  async getAllLinksWithLegacyFallback() {
    await this.migrateLegacyLinks();
    let links = [];
    try {
      links = await this.getAllLinks();
    } catch (err) {
      console.warn('DB getAllLinks error:', err);
    }
    if (links.length === 0) {
      try {
        const res = await chromeStorageGet([LINKS_MIGRATION_FLAG_KEY, 'links']);
        if (!res[LINKS_MIGRATION_FLAG_KEY] && Array.isArray(res.links) && res.links.length > 0) {
          return res.links;
        }
      } catch (err) {
        // 忽略：返回空列表
      }
    }
    return links;
  }
};

// 如果在 worker/background 中，导出它
if (typeof module !== 'undefined') {
  module.exports = DB;
}
