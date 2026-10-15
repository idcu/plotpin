/* content-assets.js —— 零依赖内容寻址二进制资产库（IndexedDB）
 * 借鉴 qforge/js/utils/assets.js：FNV-1a(字节)+长度 作为 id，相同内容自动去重；
 * 业务代码只依赖异步接口，与具体应用无关，可整文件拷到其他项目复用。
 */
(function (global) {
  'use strict';

  /** FNV-1a 32 位（字节）→ hex，拼长度抗碰撞 */
  function idFor(bytes, prefix) {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193) >>> 0; }
    return (prefix || 'as') + h.toString(16).padStart(8, '0') + '-' + bytes.length;
  }

  function dataUrlToBytes(s) {
    const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(s || '');
    if (!m) throw new Error('不是 data URL');
    const bin = atob(m[3] || ''), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { mime: m[1] || 'application/octet-stream', bytes: bytes };
  }

  function bytesToDataUrl(bytes, mime) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error || new Error('dataURL 转换失败'));
      fr.readAsDataURL(new Blob([bytes], { type: mime || 'application/octet-stream' }));
    });
  }

  /**
   * 打开（或复用）一个内容寻址资产库
   * @param {{dbName:string, storeName:string, version?:number, alsoCreate?:string[]}} opts
   */
  function open(opts) {
    const dbName = opts.dbName, storeName = opts.storeName, version = opts.version || 1;
    const also = opts.alsoCreate || [];
    let dbPromise = null;
    function db() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') return reject(new Error('当前环境不支持 IndexedDB'));
        const req = indexedDB.open(dbName, version);
        req.onupgradeneeded = () => {
          const d = req.result;
          [storeName].concat(also).forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n); });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
        req.onblocked = () => reject(new Error('IndexedDB 被其他标签页占用'));
      });
      dbPromise.catch(() => { dbPromise = null; });
      return dbPromise;
    }
    function tx(mode, fn) {
      return db().then(d => new Promise((resolve, reject) => {
        const t = d.transaction(storeName, mode), s = t.objectStore(storeName);
        let result;
        try { result = fn(s); } catch (e) { return reject(e); }
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error || new Error('IndexedDB 事务失败'));
        t.onabort = () => reject(t.error || new Error('IndexedDB 事务中止'));
      }));
    }
    return {
      putId(id, rec) { return tx('readwrite', s => new Promise((res, rej) => { const r = s.put(rec, id); r.onsuccess = () => res(); r.onerror = () => rej(r.error); })); },
      getId(id) { return tx('readonly', s => new Promise((res, rej) => { const r = s.get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error); })); },
      removeId(id) { return tx('readwrite', s => s.delete(id)).catch(() => {}); },
      allKeys() { return tx('readonly', s => new Promise((res, rej) => { const r = s.getAllKeys(); r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error); })); },
      /** 删除未被 keepIds 引用的条目；返回被删除的 id 列表 */
      async prune(keepIds) {
        const keep = new Set(keepIds || []);
        const all = await this.allKeys();
        const dead = all.filter(id => !keep.has(id));
        for (const id of dead) await this.removeId(id);
        return dead;
      },
      /** 内容寻址写入：返回 id（同内容自动去重） */
      async put(bytes, mime) {
        const id = idFor(bytes, 'as');
        await this.putId(id, { bytes: bytes, mime: String(mime || 'application/octet-stream') });
        return id;
      }
    };
  }

  global.ContentAssets = { idFor, dataUrlToBytes, bytesToDataUrl, open };
})(typeof window !== 'undefined' ? window : globalThis);
