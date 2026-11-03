// 随卡启动脚本会内联此函数；不能依赖模块局部变量。
export function createUuid() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const context = (globalThis.SillyTavern || globalThis.Luker)?.getContext?.();
  if (typeof context?.uuidv4 === 'function') return context.uuidv4();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.random() * 16 | 0;
    return (character === 'x' ? random : random & 3 | 8).toString(16);
  });
}
