import { initialize } from './src/runtime.js';
import { createHostAdapter } from './src/host.js';

// 随卡入口仅由加载脚本显式调用；导入共享核心不会再启动独立扩展。
export function mountEmbedded({ preset, host = createHostAdapter({ mode: 'embedded' }), documentRef = document } = {}) {
  return initialize({ host, documentRef, preset });
}
