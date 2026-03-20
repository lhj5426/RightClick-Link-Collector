/**
 * 数据库工具类 - 用于管理 IndexedDB 存储快照图片
 */
const DB_NAME = 'LinkCollectorDB';
const STORE_NAME = 'snapshots';
const DB_VERSION = 2; // 升级版本以确保旧用户也能创建 snapshots 表

let dbInstance = null;

const DB = {
  // 初始化数据库
  init() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
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

  // 保存快照
  async saveSnapshot(id, dataUrl) {
    try {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
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
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(String(id));
        
        request.onsuccess = (event) => resolve(event.target.result ? event.target.result.data : null);
        request.onerror = (event) => reject(event.target.error);
      });
    } catch (err) {
      console.error('DB getSnapshot error:', err);
      return null;
    }
  },

  // 删除快照
  async deleteSnapshot(id) {
    try {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(String(id));
        
        request.onsuccess = () => resolve(true);
        request.onerror = (event) => reject(event.target.error);
      });
    } catch (err) {
      console.error('DB deleteSnapshot error:', err);
      return false;
    }
  },

  // 清空所有快照
  async clearAllSnapshots() {
    try {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        
        request.onsuccess = () => resolve(true);
        request.onerror = (event) => reject(event.target.error);
      });
    } catch (err) {
      console.error('DB clearAllSnapshots error:', err);
      return false;
    }
  }
};

// 如果在 worker/background 中，导出它
if (typeof module !== 'undefined') {
  module.exports = DB;
}
