import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderFeedback, renderShell } from '../src/ui/shell.js';
import { INSPECT_LOADING_DURATION_MS } from '../src/ui/inspect-phone.js';
import { renderStorySmsInstall } from '../src/ui/settings.js';

// Exercise the real mount controller with unrelated page/controller boundaries stubbed.
// This small host records rendered markup and delegated clicks; it does not simulate layout.
const source = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');
const names = [...source.matchAll(/^import \{ (.+) \} from .+;$/gm)].flatMap(match => match[1].split(', ').map(name => name.split(' as ').at(-1)));
const factory = new Function(...names, source.replace(/^import .+;\n/gm, '').replace('export function mountPhone', 'function mountPhone') + '\nreturn mountPhone;');
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function fixture({ status = { state: 'outdated', contentMismatch: true }, pending, conflict = false } = {}) {
  let reads = 0, installs = 0, current = true, timerId = 0;
  const timers = new Map(), nodes = [];
  const feedbackPattern = /<div class="feedback[\s\S]*?<\/div>/;
  const controller = new Proxy({}, { get: (_target, key) => key === 'isComposing' || key === 'click' ? () => false : () => {} });
  function node(tag) {
    const n = { tag, dataset: {}, hidden: false, style: { removeProperty(key) { delete this[key]; } }, classList: { toggle() {}, remove() {}, contains() { return false; } }, children: [], markup: '', listeners: {}, scrollTop: 0,
      setAttribute() {}, hasAttribute() { return false; }, matches() { return false; }, focus() {},
      addEventListener(type, fn) { this.listeners[type] = fn; }, removeEventListener() {},
      append(...items) { for (const item of items) { item.parent = this; this.children.push(item); } }, prepend(item) { item.parent = this; this.children.unshift(item); },
      remove() { this.parent?.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; },
      get isConnected() { return this === mount || Boolean(this.parent?.isConnected); },
      attachShadow() { this.shadowRoot = node('shadow'); this.shadowRoot.parent = this; return this.shadowRoot; },
      querySelectorAll() { return []; },
      querySelector(selector) {
        if (this.tag === 'shadow') return surface.querySelector(selector);
        if (selector === '.feedback' && feedbackPattern.test(this.markup)) return { remove: () => { this.markup = this.markup.replace(feedbackPattern, ''); }, set outerHTML(value) { surface.markup = surface.markup.replace(feedbackPattern, value); } };
        if (selector === '.phone-main' || selector === ':scope > .phone-main') return { scrollTop: 0, insertAdjacentHTML: (_where, value) => { this.markup += value; } };
        if (selector === '[data-story-sms-install]' && this.markup.includes('data-story-sms-install')) return { set outerHTML(value) { surface.markup = surface.markup.replace(/<section data-story-sms-install>[\s\S]*?<\/section>/, value); } };
        if (selector === '[data-action="conflict-continue"]') return { focus() {} };
        return null;
      },
      insertAdjacentHTML(_where, value) { this.markup += value; }, get innerHTML() { return this.markup; }, set innerHTML(value) { this.markup = value; },
    }; nodes.push(n); return n;
  }
  const view = { innerWidth: 1000, setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout(id) { timers.delete(id); }, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false }) };
  const doc = { defaultView: view, activeElement: null, createElement: node, head: { append() {} }, addEventListener() {}, removeEventListener() {}, getSelection() { return null; } };
  const mount = node('mount'); mount.ownerDocument = doc;
  let surface;
  const deps = Object.fromEntries(names.map(name => [name, () => controller]));
  for (const name of names.filter(name => name.startsWith('render'))) deps[name] = () => '';
  Object.assign(deps, { renderFeedback, renderShell, renderStorySmsInstall, INSPECT_LOADING_DURATION_MS, phoneUrl: name => name,
    bindOutsideClose: () => () => {}, readPhotoWall: () => ({ schemes: [] }),
    createEditingRenderer: target => { surface = target; return { ...controller, isComposing: () => false, render: markup => { target.markup = markup; }, dispose() {}, hold() {}, release() {} }; },
    renderSettings: (_state, { ui, busy, control }) => `<div data-test-settings="${ui.drawers.content}">${ui.drawers.content ? renderStorySmsInstall(ui, busy, control) : ''}</div>`,
    renderHome: () => '', renderDesktop: () => '',
  });
  const state = { theme: 'day', contacts: [], notifications: { items: [] } };
  const installer = { async readStatus() { reads++; return pending ? await pending : status; }, async install() { installs++; return { bookName: '主书' }; } };
  const phone = factory(...names.map(name => deps[name]))({ mount, store: { read: () => state, fillMissingAvatars: async () => {} }, apiSettings: { readDraft: () => ({}), getSelected: () => null, listSources: () => [] }, appearance: { subscribe: () => () => {}, particlesEnabled: () => false },
    directory: { organize: async () => ({ contacts: [], groups: [] }) }, storySmsInstaller: installer, isCurrentChat: () => current, readTimeline: () => ({ key: 'batch' }), readWeather: () => ({}), control: { isEnabled: () => true, hasConflict: () => conflict } });
  const element = mount.children[0], root = element.shadowRoot, stylesheet = root.children[0];
  const click = (action, data = {}) => {
    const button = { dataset: { action, ...data }, disabled: false, hasAttribute: () => false, matches: () => false,
      closest(selector) { return selector === 'button' || selector === `button[data-action="${action}"]` ? this : null; } };
    root.listeners.click({ target: button, stopPropagation() {}, preventDefault() {} });
  };
  return { phone, stylesheet, click, timers, mediaReady() { root.listeners.load({ target: { matches: () => true } }); }, get markup() { return surface.markup; }, counts: () => [reads, installs], switchChat() { current = false; } };
}

test('feedback supports a small optional action while preserving normal dismiss and escaping', () => {
  const normal = renderFeedback({ text: '<保存完成>' });
  assert.match(normal, /&lt;保存完成&gt;/); assert.equal((normal.match(/data-action=/g) || []).length, 1);
  const notice = renderFeedback({ text: '注入词不同', compact: true, action: { name: 'story-sms-update-settings', label: '去更新' } });
  assert.match(notice, /is-compact/); assert.match(notice, /data-action="story-sms-update-settings"/); assert.match(notice, /quiet-button/); assert.match(notice, /去更新/); assert.match(notice, /data-action="dismiss"/);
});

test('first CSS-ready visible mount checks once, persists notice, and dismissal/reopen do not reread', async () => {
  const f = fixture(); assert.deepEqual(f.counts(), [0, 0]); assert.doesNotMatch(f.markup, /与当前版本不同/);
  f.stylesheet.onload(); await settle(); assert.deepEqual(f.counts(), [1, 0]); assert.match(f.markup, /与当前版本不同/);
  assert.equal([...f.timers.values()].filter(row => row.ms === 2500).length, 0, 'update notice does not expire');
  f.click('dismiss'); f.phone.close(); f.phone.open(); await settle();
  assert.deepEqual(f.counts(), [1, 0]); assert.doesNotMatch(f.markup, /与当前版本不同/); f.phone.dispose();
});

test('go update only navigates to expanded content settings; existing update button alone installs', async () => {
  const f = fixture(); f.stylesheet.onload(); await settle(); f.click('story-sms-update-settings'); await settle();
  assert.match(f.markup, /data-test-settings="true"/); assert.match(f.markup, /data-action="install-story-sms"/); assert.match(f.markup, /更新/); assert.deepEqual(f.counts(), [2, 0]);
  f.click('install-story-sms'); await settle(); assert.deepEqual(f.counts(), [2, 1]); assert.match(f.markup, /已注入/); assert.doesNotMatch(f.markup, /与当前版本不同/); f.phone.dispose();
});

test('missing, matching prompt and other outdated settings never claim prompt changes', async () => {
  for (const status of [{ state: 'missing' }, { state: 'installed', contentMismatch: false }, { state: 'outdated', contentMismatch: false }]) {
    const f = fixture({ status }); f.stylesheet.onload(); await settle(); assert.deepEqual(f.counts(), [1, 0]); assert.doesNotMatch(f.markup, /与当前版本不同/); f.phone.dispose();
  }
});

test('late reads cannot display after close, chat switch or disposal; undisplayed close can show on reopen without reread', async () => {
  for (const end of ['close', 'switch', 'dispose']) {
    let resolve; const f = fixture({ pending: new Promise(done => { resolve = done; }) });
    f.stylesheet.onload(); await settle(); if (end === 'switch') f.switchChat(); else f.phone[end]();
    resolve({ state: 'outdated', contentMismatch: true }); await settle(); assert.doesNotMatch(f.markup, /与当前版本不同/); assert.deepEqual(f.counts(), [1, 0]);
    if (end === 'close') { f.phone.open(); await settle(); assert.match(f.markup, /与当前版本不同/); assert.deepEqual(f.counts(), [1, 0]); }
    if (end !== 'dispose') f.phone.dispose();
  }
});

test('CSS load while closed defers first read, conflict defers it, and reads shared with settings stay single', async () => {
  const closed = fixture(); closed.phone.close(); closed.stylesheet.onload(); await settle(); assert.deepEqual(closed.counts(), [0, 0]); closed.phone.open(); await settle(); assert.deepEqual(closed.counts(), [1, 0]); closed.phone.dispose();
  const conflict = fixture({ conflict: true }); conflict.stylesheet.onload(); await settle(); assert.deepEqual(conflict.counts(), [0, 0]); conflict.click('conflict-continue'); await settle(); assert.deepEqual(conflict.counts(), [1, 0]); conflict.phone.dispose();
  let resolve; const f = fixture({ pending: new Promise(done => { resolve = done; }) }); f.stylesheet.onload(); await settle();
  f.click('app', { tab: 'settings' }); f.click('drawer', { drawer: 'content' });
  assert.match(f.markup, /data-test-settings="true"/);
  resolve({ state: 'outdated', contentMismatch: true }); await settle(); assert.deepEqual(f.counts(), [1, 0]); f.phone.dispose();
});

test('read errors use visible error feedback only while current and normal feedback still expires', async () => {
  const f = fixture({ pending: Promise.reject(new Error('读取失败')) }); f.stylesheet.onload(); await settle();
  assert.match(f.markup, /role="alert"/); assert.match(f.markup, /读取失败/); assert.doesNotMatch(f.markup, /与当前版本不同/);
  const timer = [...f.timers.values()].find(row => row.ms === 5000); assert.ok(timer); timer.fn(); assert.doesNotMatch(f.markup, /读取失败/); f.phone.dispose();
});


test('ordinary new feedback replaces the persistent notice and keeps its normal timer', async () => {
  const f = fixture(); f.stylesheet.onload(); await settle(); f.click('organize'); await settle();
  assert.match(f.markup, /没有需要新增/); assert.doesNotMatch(f.markup, /与当前版本不同/);
  const timer = [...f.timers.values()].find(row => row.ms === 2500); assert.ok(timer); timer.fn(); assert.doesNotMatch(f.markup, /没有需要新增/);
  f.phone.close(); f.phone.open(); await settle(); assert.deepEqual(f.counts(), [1, 0]); assert.doesNotMatch(f.markup, /与当前版本不同/); f.phone.dispose();
});

test('inspection entry animation stays pure until its existing media timer finishes', async () => {
  const f = fixture(); f.click('app', { tab: 'inspect-phone' }); f.click('inspect-owner', { inspectOwner: 'person' });
  f.stylesheet.onload(); await settle(); assert.deepEqual(f.counts(), [0, 0]); assert.doesNotMatch(f.markup, /feedback/);
  f.mediaReady(); const timer = [...f.timers.values()].find(row => row.ms === INSPECT_LOADING_DURATION_MS);
  assert.ok(timer); timer.fn(); await settle(); assert.deepEqual(f.counts(), [1, 0]); assert.match(f.markup, /与当前版本不同/); f.phone.dispose();
});

test('late read failures stay silent after close or chat switch', async () => {
  for (const end of ['close', 'switch']) {
    let reject; const f = fixture({ pending: new Promise((_resolve, fail) => { reject = fail; }) }); f.stylesheet.onload(); await settle();
    if (end === 'close') f.phone.close(); else f.switchChat(); reject(new Error('晚到错误')); await settle();
    assert.doesNotMatch(f.markup, /晚到错误|与当前版本不同/); assert.deepEqual(f.counts(), [1, 0]); f.phone.dispose();
  }
});
