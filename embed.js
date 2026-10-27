import { initialize } from './dist/runtime.js';

// 随卡入口仅由加载脚本显式调用；导入共享核心不会再启动独立扩展。
export function mountEmbedded({ preset, host, documentRef = document, release, updateError } = {}) {
  const options = { mode: 'embedded', preset, documentRef, ...(host ? { host } : {}) };
  async function replaceCore(coreUrl, nextRelease) {
    let next;
    try { next = await import(new URL('./dist/runtime.js', coreUrl).href); }
    catch { throw new Error('手机新版本加载失败，当前手机仍可使用，请稍后再更新。'); }
    if (typeof next.initialize !== 'function') throw new Error('手机新版本加载不完整，当前手机仍可使用，请稍后再更新。');
    app.dispose({ preserveQuickReply: true });
    try {
      app = next.initialize({ ...options, coreUrl, release: nextRelease, replaceCore });
      app.open();
    } catch { throw new Error('手机新版本启动失败，请重新加载随卡脚本。已有手机内容保留。'); }
  }
  let app = initialize({ ...options, coreUrl: import.meta.url, release, updateError, replaceCore });
  return { open: () => app.open(), dispose: () => app.dispose() };
}
