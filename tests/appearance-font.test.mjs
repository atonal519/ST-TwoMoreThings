import test from 'node:test';
import assert from 'node:assert/strict';
import * as appearanceModule from '../src/appearance.js';
import { createHostAdapter } from '../src/host.js';

const DEFAULT_URL = 'https://fontsapi.zeoseven.com/387/main/result.css';
const DEFAULT_FAMILY = 'Nowar Rounded TW Wc';

function fixture(kind = 'native') {
  const settings = { pocketPhone: { fabShow: false }, twoMoreThingsEmbedded: { qrShow: true } };
  let saves = 0;
  const context = { extensionSettings: settings, saveSettingsDebounced: async () => { saves++; } };
  if (kind === 'luker') context.saveChatMetadata = async () => true;
  const documentRef = new EventTarget();
  const make = mode => appearanceModule.createAppearanceSettings({ host: createHostAdapter({ contextProvider: () => context, mode }), documentRef });
  return { settings, context, make, get saves() { return saves; } };
}

function fontDom(appearance) {
  const makeParent = () => ({ children: [], append(...nodes) { for (const node of nodes) { this.children.push(node); node.parent = this; } } });
  const root = makeParent(), head = makeParent(), properties = new Map();
  const element = { style: { setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key), getPropertyValue: key => properties.get(key) || '' } };
  const documentRef = { head, createElement(tagName) { return { tagName, dataset: {}, setAttribute(name, value) { this[name] = value; }, remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); this.parent = null; } }; } };
  const controller = appearanceModule.createAppearanceFontController({ appearance, root, element, documentRef });
  return { root, head, element, controller, link: () => root.children.find(node => node.tagName === 'link') };
}

const face = (family, src = './font.woff2') => ({ type: 5, cssText: `@font-face { font-family: '${family}'; src: url('${src}') format('woff2'); font-style: normal; font-weight: 400; }`, style: { getPropertyValue: key => key === 'font-family' ? `'${family}'` : '' } });
const sheet = (href, rules) => ({ href, cssRules: rules });
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

for (const kind of ['native', 'luker']) test(`${kind}: font defaults are read-only and explicit empty persists across modes/cards`, async () => {
  const f = fixture(kind), regular = f.make(), embedded = f.make('embedded');
  assert.deepEqual(regular.fontPreference(), { cssUrl: DEFAULT_URL, family: DEFAULT_FAMILY });
  assert.equal(f.saves, 0);
  assert.equal(Object.hasOwn(f.settings.pocketPhone, 'fontCssUrl'), false);
  let events = 0; const unsubscribe = embedded.subscribe(() => { events++; });
  await regular.setFontCssUrl('');
  f.context.chatId = 'another-card';
  assert.deepEqual(embedded.fontPreference(), { cssUrl: '', family: '' });
  assert.deepEqual(f.make().fontPreference(), { cssUrl: '', family: '' });
  await embedded.setFontCssUrl('  https://fonts.example/custom.css  ');
  assert.deepEqual(regular.fontPreference(), { cssUrl: 'https://fonts.example/custom.css', family: '' });
  await regular.cacheFontFamily('https://fonts.example/custom.css', 'Custom Font');
  assert.deepEqual(embedded.fontPreference(), { cssUrl: 'https://fonts.example/custom.css', family: 'Custom Font' });
  assert.equal(events, 3); assert.equal(f.saves, 3);
  assert.equal(f.settings.pocketPhone.fabShow, false);
  assert.deepEqual(f.settings.twoMoreThingsEmbedded, { qrShow: true });
  await regular.cacheFontFamily('https://fonts.example/old.css', 'Old Font');
  assert.equal(f.saves, 3);
  await embedded.setFontCssUrl(DEFAULT_URL);
  assert.deepEqual(regular.fontPreference(), { cssUrl: DEFAULT_URL, family: DEFAULT_FAMILY });
  assert.equal(f.settings.pocketPhone.fabShow, false);
  assert.deepEqual(f.settings.twoMoreThingsEmbedded, { qrShow: true });
  assert.equal(f.saves, 4);
  unsubscribe();
});

test('font controller stays idle until opening; default uses one stylesheet and no preference write', async () => {
  const f = fixture(), appearance = f.make(), dom = fontDom(appearance);
  assert.equal(dom.root.children.length, 0); assert.equal(dom.head.children.length, 0); assert.equal(f.saves, 0);
  dom.controller.apply();
  const link = dom.link();
  assert.equal(link.href, DEFAULT_URL); assert.equal(link.crossOrigin, 'anonymous');
  link.sheet = sheet(DEFAULT_URL, [face(DEFAULT_FAMILY, './piece.woff2'), { type: 1, cssText: 'body { color: red; }' }]);
  await link.onload(); await settle();
  assert.match(dom.element.style.getPropertyValue('--pp-custom-font'), /Nowar Rounded TW Wc/);
  assert.equal(dom.head.children.length, 1);
  assert.match(dom.head.children[0].textContent, /https:\/\/fontsapi\.zeoseven\.com\/387\/main\/piece\.woff2/);
  assert.doesNotMatch(dom.head.children[0].textContent, /body/);
  dom.controller.apply(); assert.equal(dom.link(), link); assert.equal(f.saves, 0);
});

test('custom stylesheet resolves imported face URLs, caches family, and never mirrors provider UI rules', async () => {
  const f = fixture(), appearance = f.make();
  await appearance.setFontCssUrl('https://fonts.example/styles/main.css');
  const dom = fontDom(appearance); dom.controller.apply(); const link = dom.link();
  link.sheet = sheet(link.href, [{ type: 3, styleSheet: sheet('https://fonts.example/pieces/sub.css', [face('Custom Font', '../data/custom.woff2')]) }, { type: 1, cssText: ':host, body { font: 30px serif; }' }]);
  await link.onload(); await settle();
  assert.match(dom.head.children[0].textContent, /https:\/\/fonts\.example\/data\/custom\.woff2/);
  assert.doesNotMatch(dom.head.children[0].textContent, /:host|body/);
  assert.deepEqual(appearance.fontPreference(), { cssUrl: link.href, family: 'Custom Font' });
  assert.equal(f.saves, 2);
  dom.controller.apply(); assert.equal(dom.link(), link); assert.equal(f.saves, 2);
});

test('cross-origin imports with unreadable CSSOM load once as an anonymous stylesheet and resolve their own URLs', async () => {
  const f = fixture(), appearance = f.make();
  await appearance.setFontCssUrl('https://fonts.example/main.css');
  const dom = fontDom(appearance); dom.controller.apply(); const main = dom.link();
  const childUrl = 'https://cdn.example/styles/child.css';
  const unreadable = { href: childUrl, get cssRules() { throw new DOMException('Cross-origin stylesheet', 'SecurityError'); } };
  main.sheet = sheet(main.href, [{ type: 3, styleSheet: unreadable }, { type: 3, styleSheet: unreadable }]);
  const loading = main.onload(); await settle();
  const children = dom.root.children.filter(node => node !== main);
  assert.equal(children.length, 1);
  const child = children[0];
  assert.equal(child.href, childUrl); assert.equal(child.crossOrigin, 'anonymous');
  child.sheet = sheet(childUrl, [face('Imported Font', '../fonts/imported.woff2'), { type: 1, cssText: 'body { color: red; }' }]);
  child.onload(); await loading; await settle();
  assert.deepEqual(appearance.fontPreference(), { cssUrl: main.href, family: 'Imported Font' });
  assert.match(dom.head.children[0].textContent, /https:\/\/cdn\.example\/fonts\/imported\.woff2/);
  assert.equal((dom.head.children[0].textContent.match(/@font-face/g) || []).length, 1);
  assert.doesNotMatch(dom.head.children[0].textContent, /body/);
  assert.deepEqual(dom.root.children, [main]);
});

test('switching URL while an imported stylesheet loads removes it and blocks late registration or fallback', async () => {
  const f = fixture(), appearance = f.make();
  await appearance.setFontCssUrl('https://fonts.example/old.css');
  const dom = fontDom(appearance); dom.controller.apply(); const old = dom.link();
  const unreadable = { href: 'https://cdn.example/old-child.css', get cssRules() { throw new DOMException('Cross-origin stylesheet', 'SecurityError'); } };
  old.sheet = sheet(old.href, [{ type: 3, styleSheet: unreadable }]);
  const loading = old.onload(); await settle();
  const child = dom.root.children.find(node => node !== old);
  assert.ok(child);
  const lateLoad = child.onload;
  child.sheet = sheet(child.href, [face('Old Imported Font')]);
  await appearance.setFontCssUrl('https://fonts.example/new.css'); dom.controller.apply(); const current = dom.link();
  assert.equal(child.parent, null);
  current.sheet = sheet(current.href, [face('New Font')]);
  await current.onload(); lateLoad(); await loading; await settle();
  assert.deepEqual(appearance.fontPreference(), { cssUrl: current.href, family: 'New Font' });
  assert.match(dom.element.style.getPropertyValue('--pp-custom-font'), /New Font/);
  assert.equal(dom.head.children.length, 1);
  assert.doesNotMatch(dom.head.children[0].textContent, /Old Imported Font/);
  dom.controller.dispose();
  assert.equal(dom.root.children.length, 0); assert.equal(dom.head.children.length, 0);
});

test('a late stylesheet cannot restore an older URL or font after switching or clearing', async () => {
  const f = fixture(), appearance = f.make();
  await appearance.setFontCssUrl('https://fonts.example/old.css');
  const dom = fontDom(appearance); dom.controller.apply(); const old = dom.link(), oldLoad = old.onload;
  old.sheet = sheet(old.href, [face('Old Font')]);
  await appearance.setFontCssUrl('https://fonts.example/new.css'); dom.controller.apply(); const current = dom.link();
  current.sheet = sheet(current.href, [face('New Font')]);
  await current.onload(); await oldLoad(); await settle();
  assert.equal(appearance.fontPreference().family, 'New Font');
  assert.match(dom.element.style.getPropertyValue('--pp-custom-font'), /New Font/);
  assert.doesNotMatch(dom.head.children[0].textContent, /Old Font/);
  await appearance.setFontCssUrl(''); dom.controller.apply(); await oldLoad();
  assert.equal(dom.root.children.length, 0); assert.equal(dom.head.children.length, 0);
  assert.equal(dom.element.style.getPropertyValue('--pp-custom-font'), '');
  assert.deepEqual(appearance.fontPreference(), { cssUrl: '', family: '' });
});

test('stylesheet errors use the system stack without changing the saved choice or retrying', async () => {
  const f = fixture(), appearance = f.make();
  await appearance.setFontCssUrl('https://fonts.example/offline.css');
  await appearance.cacheFontFamily('https://fonts.example/offline.css', 'Cached Font');
  const dom = fontDom(appearance); dom.controller.apply(); const link = dom.link();
  assert.match(dom.element.style.getPropertyValue('--pp-custom-font'), /Cached Font/);
  link.onerror(); dom.controller.apply();
  assert.equal(dom.element.style.getPropertyValue('--pp-custom-font'), '');
  assert.equal(dom.link(), link); assert.equal(f.saves, 2);
  assert.equal(appearance.fontPreference().family, 'Cached Font');
  dom.controller.dispose(); assert.equal(dom.root.children.length, 0); assert.equal(dom.head.children.length, 0);
});

test('font save failure restores global settings and preserves unrelated appearance values', async () => {
  const previous = { particlesEnabled: false, fontCssUrl: '', fontFamily: '' };
  const settings = { pocketPhone: previous };
  const appearance = appearanceModule.createAppearanceSettings({ host: { readSettings: () => settings, saveSettings: async () => { throw Error('offline'); } } });
  await assert.rejects(appearance.setFontCssUrl(DEFAULT_URL), /外观设置保存失败/);
  assert.equal(settings.pocketPhone, previous);
  assert.deepEqual(appearance.fontPreference(), { cssUrl: '', family: '' });
});
