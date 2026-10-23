export const MEMORY_CONFLICT_CODE = 'MEMORY_SOURCE_CONFLICT';

function boundedHistory(nodes, maxCharacters) {
  const selected = [];
  let remaining = maxCharacters;
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index];
    if (typeof node?.text !== 'string' || !node.text.trim()) continue;
    const times = [node.timeStart, node.timeEnd].filter(value => typeof value === 'string' && value.trim());
    const label = times.length ? [...new Set(times)].join(' → ') : typeof node.timeLabel === 'string' ? node.timeLabel.trim() : '';
    const text = `${label ? `【${label}】` : ''}${node.text.trim()}`;
    const cost = text.length + (selected.length ? 2 : 0);
    if (cost > remaining) {
      // 通常保留完整摘要；单条本身超限时只截这一条，仍遵守原上下文预算。
      if (!selected.length) selected.push(text.slice(0, remaining));
      break;
    }
    selected.unshift(text); remaining -= cost;
  }
  return selected.join('\n\n');
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
    readStoryMemory(source, maxCharacters) {
      if (source.kind !== 'bbs') return '';
      if (source.api.apiVersion !== 1 || typeof source.api.getInjectedHistory !== 'function') throw new Error('柏宝书的记忆接口不可用，请更新柏宝书并刷新酒馆后重试。');
      try {
        // 一次任务只读取一次当前注入摘要；不读全档、不触发向量召回或生成。
        const history = source.api.getInjectedHistory();
        if (Array.isArray(history?.nodes)) return boundedHistory(history.nodes, maxCharacters);
        if (typeof history?.text === 'string') return history.text.slice(0, maxCharacters);
        throw new Error('摘要格式不可读取');
      } catch { throw new Error('柏宝书记忆读取失败，请检查柏宝书后重试。'); }
    },
  };
}
