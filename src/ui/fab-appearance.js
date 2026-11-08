// QQJ auto 外观中 FAB 使用的三色，沿同一解析与不透明面板复合规则。
function text(value) { return typeof value === 'string' ? value.trim() : ''; }

const AUTO_FALLBACK_PALETTES = Object.freeze({
  day: Object.freeze({ panel: '#f6f8f8', ink: '#22282b', knot: '#a8322f' }),
  night: Object.freeze({ panel: '#1c2327', ink: '#e7ecee', knot: '#d9707a' }),
});
const alphaChannel = value => value === undefined ? 1 : Math.min(1, Math.max(0, Number.parseFloat(value) / (value.endsWith('%') ? 100 : 1)));
const opaqueRgb = (values, alpha = 1) => {
  const channels = values.map(value => value.endsWith('%') ? Math.round(Math.min(100, Math.max(0, Number.parseFloat(value))) * 2.55) : Math.round(Math.min(255, Math.max(0, Number.parseFloat(value)))));
  return { value: `rgb(${channels.join(', ')})`, rgb: channels, alpha };
};
const cssColor = (documentRef, raw) => {
  const value = text(raw); if (!value) return null;
  if (value.toLowerCase() === 'transparent') return null;
  const hex = /^#([\da-f]{3,8})$/iu.exec(value);
  if (hex) {
    const body = hex[1], expanded = body.length <= 4 ? [...body].map(ch => ch + ch).join('') : body;
    if (![6, 8].includes(expanded.length)) return null;
    const opaque = expanded.slice(0, 6), number = Number.parseInt(opaque, 16);
    return { value: `#${opaque}`, rgb: [number >> 16, (number >> 8) & 255, number & 255], alpha: expanded.length === 8 ? Number.parseInt(expanded.slice(6), 16) / 255 : 1 };
  }
  const rgb = /^rgba?\(\s*([-+]?(?:\d*\.)?\d+%?)\s*(?:,|\s)\s*([-+]?(?:\d*\.)?\d+%?)\s*(?:,|\s)\s*([-+]?(?:\d*\.)?\d+%?)(?:\s*(?:,|\/)\s*([-+]?(?:\d*\.)?\d+%?))?\s*\)$/iu.exec(value);
  if (rgb) return opaqueRgb(rgb.slice(1, 4), alphaChannel(rgb[4]));
  try {
    const canvas = documentRef?.createElement?.('canvas'), context = canvas?.getContext?.('2d'); if (!context) return null;
    context.fillStyle = '#010203'; context.fillStyle = value; if (context.fillStyle === '#010203' && value.toLowerCase() !== '#010203') return null;
    context.clearRect(0, 0, 1, 1); context.fillRect(0, 0, 1, 1); const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
    return { value: `rgb(${r}, ${g}, ${b})`, rgb: [r, g, b], alpha: alpha / 255 };
  } catch { return null; }
};
const hostSignals = ({ documentRef, windowRef }) => {
  try {
    const computed = windowRef?.getComputedStyle?.(documentRef?.documentElement); if (!computed) return {};
    const read = name => text(computed.getPropertyValue(name));
    return { body: read('--SmartThemeBodyColor'), quote: read('--SmartThemeQuoteColor'), bot: read('--SmartThemeBotMesBlurTintColor') };
  } catch { return {}; }
};
const channel = value => Math.min(255, Math.max(0, Number(value) || 0));
const luminance = parsed => parsed?.rgb ? .2126 * channel(parsed.rgb[0]) + .7152 * channel(parsed.rgb[1]) + .0722 * channel(parsed.rgb[2]) : null;

// 宿主半透明消息底色叠加在对应日夜的不透明 panel 上。
const backgroundColor = (documentRef, raw, fallback) => {
  const foreground = cssColor(documentRef, raw), base = cssColor(documentRef, fallback);
  if (!foreground || !base || foreground.alpha <= 0) return fallback;
  if (foreground.alpha >= 1) return foreground.value;
  return `rgb(${foreground.rgb.map((value, index) => Math.round(value * foreground.alpha + base.rgb[index] * (1 - foreground.alpha))).join(', ')})`;
};

export function resolveFabAppearance({ documentRef = globalThis.document, windowRef = documentRef?.defaultView ?? globalThis } = {}) {
  const signals = hostSignals({ documentRef, windowRef }), bodyColor = cssColor(documentRef, signals.body);
  const hostTheme = bodyColor ? ((luminance(bodyColor) ?? 0) > 127 ? 'night' : 'day') : null;
  const systemTheme = windowRef?.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'day' : 'night';
  const effectiveTheme = hostTheme ?? systemTheme;
  const palette = AUTO_FALLBACK_PALETTES[effectiveTheme];
  const opaque = (raw, fallback) => cssColor(documentRef, raw)?.value ?? fallback;
  return {
    mode: 'auto', effectiveTheme, hasHostSignal: Boolean(hostTheme),
    palette: {
      ink: opaque(signals.body, palette.ink), knot: opaque(signals.quote, palette.knot),
      panel: backgroundColor(documentRef, signals.bot, palette.panel),
    },
  };
}

export function createFabAppearanceController({ documentRef = globalThis.document, windowRef = documentRef?.defaultView ?? globalThis, onChange } = {}) {
  let destroyed = false, current = null;
  const apply = () => { if (destroyed) return current; current = resolveFabAppearance({ documentRef, windowRef }); onChange?.(current); return current; };
  const Observer = windowRef?.MutationObserver ?? globalThis.MutationObserver;
  const observer = typeof Observer === 'function' && documentRef?.documentElement ? new Observer(apply) : null;
  observer?.observe?.(documentRef.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
  const media = windowRef?.matchMedia?.('(prefers-color-scheme: light)');
  const onSystem = () => { if (!resolveFabAppearance({ documentRef, windowRef }).hasHostSignal) apply(); };
  media?.addEventListener?.('change', onSystem);
  apply();
  return { destroy() { destroyed = true; observer?.disconnect?.(); media?.removeEventListener?.('change', onSystem); } };
}
