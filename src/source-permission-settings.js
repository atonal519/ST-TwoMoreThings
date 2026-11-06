// Shared worldbook authority copied from QQJ settings.js. Host reads remain live.
export function createSourcePermissionSettings(host) {
  const text = value => typeof value === 'string' ? value : '';
  const get = () => host.readSettings()?.[host.phoneSettingsKey] || {};
  const notify = () => host.saveSettings();
  const sevenDaysSettings = () => {
    const value = host.readSettings()?.['schedule-planner'];
    return value && typeof value === 'object' ? value : null;
  };
  const ensureSevenDaysSettings = () => {
    const current = sevenDaysSettings();
    if (current) return current;
    const created = {};
    host.readSettings()['schedule-planner'] = created;
    return created;
  };
  const normalizeWorldBookNames = value => {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    return value.map(item => text(item).trim()).filter(item => {
      if (!item) return false;
      const key = item.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('zh-Hans-CN');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const sharedWorldInfoExcludedBooks = () => {
    try { return normalizeWorldBookNames(sevenDaysSettings()?.wiExcludeBooks); }
    catch { return []; }
  };
  const setSharedWorldInfoExcluded = (bookName, excluded) => {
    const name = text(bookName).trim();
    if (!name) throw new TypeError('世界书名称无效');
    const canonical = value => value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('zh-Hans-CN');
    const shared = ensureSevenDaysSettings();
    const next = sharedWorldInfoExcludedBooks().filter(item => canonical(item) !== canonical(name));
    if (excluded === true) next.push(name);
    shared.wiExcludeBooks = next;
    notify();
    return [...next];
  };
  const sourcePermissionSnapshot = () => ({
    ...get(),
    sourceWorldInfoExcludedBooks: sharedWorldInfoExcludedBooks(),
  });
  return { get, sharedWorldInfoExcludedBooks, setSharedWorldInfoExcluded, sourcePermissionSnapshot };
}
