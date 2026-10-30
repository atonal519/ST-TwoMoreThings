const CHANGE_EVENT = 'tmt-appearance-changed';
export const DEFAULT_FONT_CSS_URL = 'https://fontsapi.zeoseven.com/387/main/result.css';
const DEFAULT_FONT_FAMILY = 'Nowar Rounded TW Wc';

const fontFamily = value => String(value || '').trim().replace(/^(['"])(.*)\1$/, '$2').replace(/["\\\r\n]/g, ' ').replace(/\s+/g, ' ').trim();

// 个人外观偏好共用扩展全局设置，不随聊天或作者包保存。
export function createAppearanceSettings({ host, documentRef = globalThis.document }) {
  const read = () => host.readSettings().pocketPhone || {};
  const fontPreference = () => {
    const value = read();
    const cssUrl = typeof value.fontCssUrl === 'string' ? value.fontCssUrl.trim() : DEFAULT_FONT_CSS_URL;
    return { cssUrl, family: cssUrl === DEFAULT_FONT_CSS_URL ? DEFAULT_FONT_FAMILY : cssUrl ? fontFamily(value.fontFamily) : '' };
  };
  async function save(patch) {
    const settings = host.readSettings(), previous = settings.pocketPhone;
    const next = settings.pocketPhone = { ...previous, ...patch };
    try { await host.saveSettings(); }
    catch {
      if (settings.pocketPhone === next) settings.pocketPhone = previous;
      throw new Error('外观设置保存失败，请重试。');
    }
    const EventClass = documentRef?.defaultView?.Event || globalThis.Event;
    documentRef?.dispatchEvent(new EventClass(CHANGE_EVENT));
  }
  return {
    particlesEnabled: () => read().particlesEnabled !== false,
    setParticlesEnabled: enabled => save({ particlesEnabled: enabled === true }),
    fontPreference,
    async setFontCssUrl(value) {
      const cssUrl = String(value || '').trim();
      if (cssUrl === fontPreference().cssUrl) return;
      await save({ fontCssUrl: cssUrl, fontFamily: cssUrl === DEFAULT_FONT_CSS_URL ? DEFAULT_FONT_FAMILY : '' });
    },
    async cacheFontFamily(cssUrl, family) {
      const current = fontPreference(), parsed = fontFamily(family);
      if (current.cssUrl !== cssUrl || !parsed || current.family === parsed) return;
      await save({ fontFamily: parsed });
    },
    subscribe(callback) {
      documentRef?.addEventListener(CHANGE_EVENT, callback);
      return () => documentRef?.removeEventListener(CHANGE_EVENT, callback);
    },
  };
}

async function readFontFaces(sheet, loadImported, seen = new Set(), imported = false) {
  if (seen.has(sheet.href)) return { css: '', family: '' };
  seen.add(sheet.href);
  let rules;
  try { rules = sheet.cssRules; }
  catch (error) {
    if (!imported) throw error;
    // 跨域 @import 的子表即使允许 CORS，也需要独立的匿名链接才能读取 CSSOM。
    const readable = await loadImported(sheet.href);
    if (!readable) throw error;
    sheet = readable;
    rules = sheet.cssRules;
  }
  const faces = [];
  let family = '';
  for (const rule of rules) {
    if (rule.type === 3 && rule.styleSheet) {
      const child = await readFontFaces(rule.styleSheet, loadImported, seen, true);
      if (child.css) faces.push(child.css);
      family ||= child.family;
    } else if (rule.type === 5) {
      family ||= fontFamily(rule.style.getPropertyValue('font-family'));
      faces.push(rule.cssText.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/gi, (_, double, single, bare) => `url(${JSON.stringify(new URL(double ?? single ?? bare, sheet.href).href)})`));
    }
  }
  return { css: faces.join('\n'), family };
}

export function createAppearanceFontController({ appearance, root, element, documentRef = globalThis.document }) {
  let currentUrl, link, registered, disposed = false;
  const importedLinks = new Set();
  const setFamily = family => {
    if (family) element.style.setProperty('--pp-custom-font', `${JSON.stringify(family)}, var(--pp-system-font)`);
    else element.style.removeProperty('--pp-custom-font');
  };
  const clear = () => {
    for (const release of importedLinks) release();
    link?.remove(); registered?.remove(); link = registered = null; setFamily('');
  };
  return {
    apply() {
      if (disposed) return;
      const { cssUrl, family } = appearance.fontPreference();
      if (cssUrl === currentUrl) return;
      currentUrl = cssUrl;
      clear();
      if (!cssUrl) return;
      setFamily(family);
      const stylesheet = link = documentRef.createElement('link');
      stylesheet.rel = 'stylesheet'; stylesheet.crossOrigin = 'anonymous'; stylesheet.href = cssUrl;
      stylesheet.dataset.pocketPhoneCustomFont = '';
      const isCurrent = () => !disposed && link === stylesheet && appearance.fontPreference().cssUrl === cssUrl;
      stylesheet.onload = async () => {
        if (!isCurrent()) return;
        const reading = new Set();
        const loadImported = href => new Promise(resolve => {
          if (!isCurrent()) { resolve(null); return; }
          const child = documentRef.createElement('link');
          child.rel = 'stylesheet'; child.crossOrigin = 'anonymous'; child.href = href;
          child.dataset.pocketPhoneImportedFont = '';
          const release = () => { child.remove(); importedLinks.delete(release); resolve(null); };
          reading.add(release); importedLinks.add(release);
          child.onload = () => resolve(child.sheet);
          child.onerror = () => resolve(null);
          root.append(child);
        });
        try {
          const faces = await readFontFaces(stylesheet.sheet, loadImported);
          if (!isCurrent()) return;
          if (!faces.css || !faces.family) { setFamily(''); return; }
          // Chromium 不使用 Shadow 内的 @font-face；只注册字体声明，提供者的其它规则不进入宿主。
          registered = documentRef.createElement('style');
          registered.dataset.pocketPhoneCustomFont = '';
          registered.textContent = faces.css;
          documentRef.head.append(registered);
          const selected = family || faces.family;
          setFamily(selected);
          if (!family) void appearance.cacheFontFamily(cssUrl, selected).catch(() => {});
        } catch { if (isCurrent()) setFamily(''); }
        finally { for (const release of reading) release(); }
      };
      stylesheet.onerror = () => { if (isCurrent()) { registered?.remove(); registered = null; setFamily(''); } };
      root.append(stylesheet);
    },
    dispose() { disposed = true; clear(); },
  };
}
