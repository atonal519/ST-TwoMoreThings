import test from 'node:test';
import assert from 'node:assert/strict';
import { createFab } from '../src/ui/fab.js';

function fixture(signals = {}, light = true) {
  const observers = new Set(), systemListeners = new Set();
  const media = { matches: light, addEventListener: (_name, listener) => systemListeners.add(listener), removeEventListener: (_name, listener) => systemListeners.delete(listener) };
  const button = { setAttribute() {}, addEventListener() {}, classList: { toggle() {} } };
  const documentRef = { documentElement: {}, createElement: () => ({
    style: { values: new Map(), setProperty(name, value) { this.values.set(name, value); } }, attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
    attachShadow() { this.shadowRoot = { querySelector: () => button }; },
  }) };
  const windowRef = {
    innerWidth: 1100, innerHeight: 800, localStorage: { getItem: () => null },
    addEventListener() {}, removeEventListener() {},
    getComputedStyle: () => ({ getPropertyValue: name => signals[name] || '' }),
    matchMedia: query => query === '(prefers-color-scheme: light)' ? media : { matches: false },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(target, options) { this.target = target; this.options = options; observers.add(this); }
      disconnect() { observers.delete(this); }
    },
  };
  return { documentRef, windowRef, signals, observers, systemListeners,
    mutate() { for (const observer of observers) observer.callback(); },
    system(value) { media.matches = value; for (const listener of systemListeners) listener(); },
  };
}
const colors = fab => Object.fromEntries(['primary', 'ink', 'surface'].map(key => [key, fab.host.style.values.get(`--tmt-fab-${key}`)]));

test('FAB resolves the host quote/body and alpha-composites bot tint on the QQJ auto panel at creation', () => {
  const f = fixture({ '--SmartThemeBodyColor': '#22282b', '--SmartThemeQuoteColor': '#b63745', '--SmartThemeBotMesBlurTintColor': 'rgba(20, 40, 60, .5)', '--SmartThemeBlurTintColor': '#ffffff' });
  const fab = createFab(f);
  assert.deepEqual(colors(fab), { primary: '#b63745', ink: '#22282b', surface: 'rgb(133, 144, 154)' });
  assert.equal(fab.host.attributes.get('data-theme-mode'), 'auto');
  assert.equal(fab.host.attributes.get('data-effective-theme'), 'day');
  fab.destroy();
});

test('host style/class changes resync both instances and disposing one releases only its theme listeners', () => {
  const f = fixture({ '--SmartThemeBodyColor': '#22282b' });
  const first = createFab(f), second = createFab({ ...f, id: 'tmt-card-fab-host' });
  assert.equal(f.observers.size, 2); assert.equal(f.systemListeners.size, 2);
  for (const observer of f.observers) assert.deepEqual(observer.options, { attributes: true, attributeFilter: ['style', 'class'] });
  Object.assign(f.signals, { '--SmartThemeBodyColor': '#e7ecee80', '--SmartThemeQuoteColor': 'rgba(217, 112, 122, .25)', '--SmartThemeBotMesBlurTintColor': '#20406080' });
  f.mutate();
  const expected = { primary: 'rgb(217, 112, 122)', ink: '#e7ecee', surface: 'rgb(30, 50, 68)' };
  assert.deepEqual(colors(first), expected); assert.deepEqual(colors(second), expected);
  assert.equal(first.host.attributes.get('data-effective-theme'), 'night');
  f.system(false); assert.deepEqual(colors(first), expected, 'host signal keeps priority over the system');
  first.destroy(); assert.equal(f.observers.size, 1); assert.equal(f.systemListeners.size, 1);
  f.signals['--SmartThemeQuoteColor'] = '#770000'; f.mutate();
  assert.deepEqual(colors(first), expected); assert.equal(colors(second).primary, '#770000');
  second.destroy(); assert.equal(f.observers.size, 0); assert.equal(f.systemListeners.size, 0);
});

test('missing host signals use QQJ auto day/night fallbacks and follow system changes until a host signal appears', () => {
  const f = fixture(), fab = createFab(f);
  assert.deepEqual(colors(fab), { primary: '#a8322f', ink: '#22282b', surface: '#f6f8f8' });
  f.system(false);
  assert.deepEqual(colors(fab), { primary: '#d9707a', ink: '#e7ecee', surface: '#1c2327' });
  f.signals['--SmartThemeBodyColor'] = 'rgb(10%, 10%, 10%)'; f.mutate();
  assert.equal(fab.host.attributes.get('data-effective-theme'), 'day');
  assert.deepEqual(colors(fab), { primary: '#a8322f', ink: 'rgb(26, 26, 26)', surface: '#f6f8f8' });
  fab.destroy();
});
