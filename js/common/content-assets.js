/* content-assets.js —— 内容寻址二进制资产库（适配 @idcu/core-assets）
 * 保留原有 ContentAssets API（open/idFor/dataUrlToBytes/bytesToDataUrl）；
 * IndexedDB 与内容寻址逻辑由公共模块提供，既有 bg…/as… 资产 id 仍可原样读取。
 */
(function (global) {
  'use strict';
  const Core = global.__idcuAssets;
  if (!Core) throw new Error('content-assets: @idcu/core-assets 未加载');

  /** 保留 idFor(bytes, prefix) 旧签名；prefix 缺省时与模块默认一致 */
  function idFor(bytes, prefix) {
    return Core.idFor(bytes, { prefix: prefix || '' });
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
   * 打开（或复用）内容寻址资产库
   * @param {{dbName:string, storeName:string, version?:number, alsoCreate?:string[]}} opts
   */
  function open(opts) {
    const dbName = opts.dbName, storeName = opts.storeName, version = opts.version || 1;
    const also = opts.alsoCreate || [];
    let assetsPromise = null;

    /** 懒创建：与旧实现一致，只有真正访问时才要求 IndexedDB 可用 */
    function assets() {
      if (!assetsPromise) {
        assetsPromise = Promise.resolve().then(() => Core.createAssets({
          driver: Core.idbDriver({ dbName: dbName, storeName: storeName, version: version, alsoCreate: also }),
          idPrefix: 'as'
        }));
      }
      return assetsPromise;
    }

    return {
      putId(id, rec) { return assets().then(a => a.putWithId(id, rec.bytes, { mime: rec.mime })); },
      getId(id) {
        return assets().then(a => a.get(id)).then(r => (
          r ? { bytes: r.bytes, mime: (r.meta && r.meta.mime) || 'application/octet-stream' } : null
        ));
      },
      removeId(id) { return assets().then(a => a.remove(id)); },
      allKeys() { return assets().then(a => a.ids()); },
      /** 删除未被 keepIds 引用的条目；返回被删除的 id 列表（保持旧返回值） */
      async prune(keepIds) {
        const a = await assets();
        const keep = new Set(keepIds || []);
        const all = await a.ids();
        const dead = all.filter(id => !keep.has(id));
        for (const id of dead) await a.remove(id);
        return dead;
      },
      /** 内容寻址写入：返回 id（同内容自动去重） */
      put(bytes, mime) { return assets().then(a => a.put(bytes, { mime: String(mime || 'application/octet-stream') })); }
    };
  }

  global.ContentAssets = { idFor, dataUrlToBytes, bytesToDataUrl, open };
})(typeof window !== 'undefined' ? window : globalThis);
