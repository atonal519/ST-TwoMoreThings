// 源码src与发布核心dist同处仓根下一层，资产始终从同一仓根读取。
const root = new URL(/* @vite-ignore */ '../', import.meta.url);
export const phoneUrl = path => new URL(path, root).href;
