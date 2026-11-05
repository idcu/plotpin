/* 浏览器级测试公共工具：IndexedDB 读写与画布落点 */
export const DB = {
  name: 'offline_drawing_annotation',
  projects: 'projects',
  assets: 'assets'
};

/**
 * 在页面上下文执行一次 IndexedDB 操作。
 * @param {import('@playwright/test').Page} page
 * @param {{store:string, mode?:'readonly'|'readwrite', op:'get'|'put'|'delete'|'keys', key?:string, value?:any}} opt
 */
export function idb(page, opt) {
  return page.evaluate(async ({ dbName, store, mode, op, key, value }) => {
    if (op === 'put' && value && Array.isArray(value.bytes)) value = { ...value, bytes: new Uint8Array(value.bytes) };
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(dbName);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(String(req.error));
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const s = tx.objectStore(store);
        if (op === 'get') {
          const r = s.get(key);
          r.onsuccess = () => resolve(r.result === undefined ? null : r.result);
        } else if (op === 'keys') {
          const r = s.getAllKeys();
          r.onsuccess = () => resolve(Array.from(r.result || []));
        } else if (op === 'put') {
          const r = s.put(value, key);
          r.onsuccess = () => resolve(r.result);
        } else if (op === 'delete') {
          const r = s.delete(key);
          r.onsuccess = () => resolve(true);
        } else {
          reject(new Error('未知 IndexedDB 操作：' + op));
        }
        tx.onerror = () => reject(String(tx.error));
        tx.onabort = () => reject(String(tx.error));
      });
    } finally {
      db.close();
    }
  }, { dbName: DB.name, store: opt.store, mode: opt.mode || 'readonly', op: opt.op, key: opt.key, value: opt.value });
}

/** 点击画布中心（世界坐标落点随当前视口） */
export async function clickCanvasCenter(page) {
  const box = await page.locator('#canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** 当前 v1/v2 工程记录里所有对象数量（含非活动楼层） */
export function savedObjectCount(rec) {
  return (rec.objects || []).length + (rec.floors || []).reduce((n, f) => n + ((f && f.objects) || []).length, 0);
}
