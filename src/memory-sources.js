export const MEMORY_CONFLICT_CODE = 'MEMORY_SOURCE_CONFLICT';

function injectedHistory(nodes) {
  return nodes.filter(node => typeof node?.text === 'string' && node.text.trim()).map(node => {
    const times = [node.timeStart, node.timeEnd].filter(value => typeof value === 'string' && value.trim());
    const label = times.length ? [...new Set(times)].join(' → ') : typeof node.timeLabel === 'string' ? node.timeLabel.trim() : '';
    return `${label ? `【${label}】` : ''}${node.text}`;
  }).join('\n\n');
}

export function createMemorySources({ target, settingsProvider = () => ({}), qqjBridgeProvider = () => globalThis.qqj_v3_public_bridge_v1, baiBaiBookProvider = () => globalThis.STBaiBaiBook }) {
  function select() {
    const bridge = qqjBridgeProvider?.(), status = bridge?.getStatus?.()?.status;
    const qqjActive = status === 'ready' || status === 'not-ready';
    const api = baiBaiBookProvider?.(), settings = settingsProvider();
    const book = settings?.baibai_book;
    // 柏宝书 1.3.2 的公开 API 不含开关；只读其现有设置及共享角色排除名单。
    const excluded = Array.isArray(settings?.baibai_exclude_settings?.excludedChars) ? settings.baibai_exclude_settings.excludedChars : Array.isArray(book?.excludedChars) ? book.excludedChars : [];
    const bbsActive = Boolean(api && book?.enabled === true && (target.groupId || !excluded.includes(target.character?.name)));
    if (qqjActive && bbsActive) {
      const error = new Error('千千结和柏宝书同时开启，请在其中一个插件中关闭总开关，再继续使用手机记忆。');
      error.code = MEMORY_CONFLICT_CODE;
      throw error;
    }
    return qqjActive ? { kind: 'qqj', bridge } : bbsActive ? { kind: 'bbs', api } : { kind: 'none' };
  }
  return {
    select,
    readStoryMemory(source) {
      if (source.kind !== 'bbs') return '';
      if (source.api.apiVersion !== 1 || typeof source.api.getInjectedHistory !== 'function') throw new Error('柏宝书的记忆接口不可用，请更新柏宝书并刷新酒馆后重试。');
      try {
        // 一次任务只读取一次当前注入摘要；不读全档、不触发向量召回或生成。
        const history = source.api.getInjectedHistory();
        if (Array.isArray(history?.nodes)) return injectedHistory(history.nodes);
        if (typeof history?.text === 'string') return history.text;
        throw new Error('摘要格式不可读取');
      } catch { throw new Error('柏宝书记忆读取失败，请检查柏宝书后重试。'); }
    },
  };
}
