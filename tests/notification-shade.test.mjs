import test from 'node:test';
import assert from 'node:assert/strict';
import { renderStatusBar } from '../src/ui/status.js';
import { renderPhoneNotice } from '../src/ui/notifications.js';
import { createNotificationShade } from '../src/ui/notification-shade.js';

function shadeHarness(locked = false) {
  let root;
  const node = () => ({ setAttribute() {}, addEventListener() {}, removeEventListener() {}, focus() { root.activeElement = this; }, contains: () => false, querySelectorAll: () => [], getClientRects: () => [{}], dataset: {}, style: { values: {}, setProperty(key, value) { this.values[key] = value; } }, scrollTop: 0 });
  const trigger = node(), elements = new Map(), layer = node(), main = node(), footer = node(), footerButton = node();
  footer.classList = { contains: value => locked && value === 'home-footer' }; footer.getBoundingClientRect = () => ({ top: 548 });
  main.contains = child => locked && child === footer;
  layer.querySelector = selector => { if (!elements.has(selector)) elements.set(selector, node()); return elements.get(selector); };
  layer.querySelectorAll = () => [layer.querySelector('[data-action="toggle-notification-theme"]'), layer.querySelector('[data-action="clear-notifications"]')];
  const win = { matchMedia: () => ({ matches: true }), addEventListener() {}, removeEventListener() {}, clearTimeout() {}, getComputedStyle: () => ({ borderBottomWidth: '4' }) };
  const surface = { ...node(), ownerDocument: { defaultView: win, createElement: () => layer }, querySelector: selector => selector === '.phone-main' ? main : selector === '.phone-footer' ? footer : null, querySelectorAll: selector => locked && selector.includes(':not(.home-footer)') ? [] : [footerButton], append(child) { child.parentNode = this; }, getBoundingClientRect: () => ({ bottom: 600 }) };
  root = { activeElement: null, querySelector: selector => selector === '[data-action="toggle-notification-shade"]' ? trigger : null };
  const state = { theme: 'day', notifications: { initialized: true, items: [] } };
  const shade = createNotificationShade({ root, surface, readState: () => state, initialize: async () => {}, onClose() {} });
  return { state, shade, elements, layer, main, root, footerButton };
}

test('the status bar offers the centered notification control and respects disabled phone state', () => {
  const enabled = renderStatusBar(); assert.match(enabled, /data-action="toggle-notification-shade"/); assert.match(enabled, /aria-expanded="false"/);
  assert.match(renderStatusBar({ notificationsEnabled: false }), /data-action="toggle-notification-shade"[^>]*disabled/);
});

test('toast renders its archived snapshot after source changes, with an app icon and escaped full text', () => {
  const record = { key: 'event', kind: 'message', app: 'messages', id: 'deleted', title: '旧发出者', text: '原消息<script>\n译文', timeLabel: '11:35' };
  const markup = renderPhoneNotice({ contacts: [], conversations: {} }, record);
  assert.match(markup, /旧发出者/); assert.match(markup, /原消息&lt;script&gt;/); assert.match(markup, /译文/); assert.match(markup, /app-icon/); assert.doesNotMatch(markup, /class="avatar/); assert.match(markup, /data-notification-key="event"/);
});

test('closed shade refresh skips history bodies and opening renders the latest records', async () => {
  const { state, shade, elements } = shadeHarness();
  let bodyReads = 0;
  const records = Array.from({ length: 100 }, (_, index) => ({ key: `event-${index}`, app: 'messages', title: '林舟', timeLabel: '10:00', get text() { bodyReads++; return `通知${index}`; } }));
  state.notifications.items = records;
  shade.attach(); shade.refresh();
  assert.equal(bodyReads, 0, 'normal closed-page updates do not render hidden history');
  state.notifications.items = [{ key: 'latest', app: 'social', title: '新动态', text: '关闭期间新来的通知', timeLabel: '10:01' }];
  await shade.open();
  assert.match(elements.get('.phone-notification-list').innerHTML, /关闭期间新来的通知/);
  assert.equal(shade.isOpen, true);
});

test('lock-screen shade covers its footer and excludes its controls while unlocked navigation stays available', async () => {
  for (const locked of [true, false]) {
    const { shade, layer, main, root, elements, footerButton } = shadeHarness(locked);
    await shade.open();
    assert.equal(layer.style.values['--notification-footer-inset'], locked ? '0px' : '48px');
    assert.equal(main.inert, true);
    const tab = () => shade.keydown({ key: 'Tab', preventDefault() {}, stopPropagation() {} });
    tab(); assert.equal(root.activeElement, elements.get('[data-action="clear-notifications"]'));
    tab(); assert.equal(root.activeElement, locked ? elements.get('[data-action="toggle-notification-theme"]') : footerButton);
  }
});
