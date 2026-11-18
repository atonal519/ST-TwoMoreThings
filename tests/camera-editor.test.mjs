import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCameraPresetEditor } from '../src/ui/camera-editor.js';
import { createPhoneDialog } from '../src/ui/dialog.js';
import { newCameraPreset } from '../src/camera-presets.js';

// A small DOM boundary exercises the actual editor and dialog controllers, without layout.
function documentFixture() {
  const doc = { defaultView: { matchMedia: () => ({ matches: true }) }, activeElement: null };
  function node(tag) {
    const value = { tagName: tag.toUpperCase(), ownerDocument: doc, children: [], attributes: {}, dataset: {}, listeners: {}, value: '', disabled: false,
      className: '', textContent: '', type: tag === 'textarea' ? 'textarea' : tag === 'input' ? 'text' : '',
      classList: { contains: name => value.className.split(' ').includes(name), add: name => { value.className += ` ${name}`; } },
      setAttribute(name, input) {
        this.attributes[name] = input;
        if (['class', 'id', 'name', 'type', 'value'].includes(name)) this[name === 'class' ? 'className' : name] = input;
        if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = input;
      },
      hasAttribute(name) { return Object.hasOwn(this.attributes, name); },
      append(...items) { items.forEach(item => { item.parentNode = this; this.children.push(item); }); },
      prepend(item) { item.parentNode = this; this.children.unshift(item); },
      remove() { this.parentNode.children = this.parentNode.children.filter(item => item !== this); this.parentNode = null; },
      get isConnected() { return this === mount || Boolean(this.parentNode?.isConnected); },
      getRootNode() { return this.parentNode?.getRootNode() || this; },
      focus() { doc.activeElement = this; mount.activeElement = this; },
      getClientRects() { return [1]; },
      reportValidity() { return Boolean(this.querySelector('[name="presetName"]')?.value); },
      addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
      fire(type, event = {}) { for (const listener of this.listeners[type] || []) listener({ target: this, stopPropagation() {}, preventDefault() {}, ...event }); },
      click() { this.fire('click'); },
      matches(selector) {
        return selector.split(',').some(part => {
          part = part.trim();
          if (part.startsWith('.')) return this.classList.contains(part.slice(1));
          if (part.startsWith('#')) return this.id === part.slice(1);
          const present = part.match(/^\[([^=]+)\]$/);
          if (present) return this.hasAttribute(present[1]);
          const attribute = part.match(/^\[([^=]+)="(.*)"\]$/);
          return attribute ? this.attributes[attribute[1]] === attribute[2] : this.tagName.toLowerCase() === part;
        });
      },
      closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector); },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      querySelectorAll(selector) { return this.children.flatMap(child => [child, ...child.querySelectorAll('*')]).filter(child => selector === '*' || child.matches(selector)); },
      get selectedOptions() { return this.children.filter(child => child.tagName === 'OPTION' && (this.value ? child.value === this.value : child.hasAttribute('selected'))); },
      set innerHTML(html) {
        this.markup = html; this.children = [];
        for (const match of html.matchAll(/<(input|textarea|select|button|div|p|option)\b([^>]*)>/g)) {
          const child = node(match[1]);
          for (const attribute of match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)) child.setAttribute(attribute[1], attribute[2] || '');
          this.append(child);
        }
        if (tag === 'select') this.value = this.selectedOptions[0]?.value || '';
      },
      get innerHTML() { return this.markup || ''; },
    };
    return value;
  }
  const mount = node('mount'); doc.createElement = node;
  return { doc, mount };
}
const settle = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
const source = await readFile(new URL('../src/ui.js', import.meta.url), 'utf8');
const openBody = source.slice(source.indexOf('  function openCameraPreset('), source.indexOf('  function openInspectionOwner('));
function modalFixture({ fail = false } = {}) {
  const { doc, mount } = documentFixture(), ui = { value: { presets: [], selectedId: '' } };
  let saves = 0, reads = 0, renders = 0;
  const camera = { readPresets: () => ui.value, readCharacters: () => { reads++; return [{ name: '甲', scope: '' }, { name: '乙', scope: 'chat' }, { name: '丙', scope: '' }]; },
    savePreset: async (_id, draft) => { if (fail) throw Error('保存失败'); saves++; ui.value = { presets: [structuredClone(draft)], selectedId: draft.id }; }, removePreset: async () => { saves++; ui.value = { presets: [], selectedId: '' }; } };
  const dialog = createPhoneDialog({ mount, documentRef: doc });
  const open = new Function('isCurrentChat', 'camera', 'renderedRoute', 'createCameraPresetEditor', 'doc', 'newCameraPreset', 'dialog', 'render', `${openBody}\nreturn openCameraPreset;`)(() => true, camera, 'camera', createCameraPresetEditor, doc, newCameraPreset, dialog, () => { renders++; });
  const form = () => mount.querySelector('form');
  const input = (name, value) => { const field = form().querySelector(`[name="${name}"]`); field.value = value; form().fire('input', { target: field }); return field; };
  const action = name => { const button = form().querySelector(`[data-camera-editor="${name}"]`); form().fire('click', { target: button }); };
  const dialogButton = name => mount.querySelectorAll('button').find(button => button.textContent === name);
  return { open, form, input, action, dialogButton, mount, focused: () => mount.activeElement, counts: () => [saves, reads, renders], allowSave() { fail = false; } };
}

test('multiple group and prompt edits stay in one draft and cancel performs zero saves', () => {
  const f = modalFixture(); f.open();
  assert.deepEqual(f.counts(), [0, 0, 0]);
  f.input('presetName', '街拍');
  const textarea = f.input('promptText', '  first\nweighted::  ');
  f.action('new-group'); f.input('groupName', '三人');
  for (const box of f.form().querySelector('.camera-character-checks').children.filter(node => node.type === 'checkbox')) {
    box.checked = true; f.form().fire('change', { target: box });
  }
  f.action('finish-group'); f.action('new-group'); f.input('groupName', '备用');
  assert.equal(f.form().querySelector('[name="promptText"]'), textarea);
  assert.equal(textarea.value, '  first\nweighted::  ');
  f.action('new-prompt'); f.input('promptName', '第二词'); f.input('promptText', 'second');
  f.dialogButton('取消').click();
  assert.equal(f.mount.children.length, 0);
  assert.deepEqual(f.counts(), [0, 2, 0]);
});

test('whole-preset dialog keeps failed edits, then commits once through Enter with IME and Shift preserved', async () => {
  const f = modalFixture({ fail: true }); f.open();
  f.input('presetName', '整套');
  const textarea = f.input('promptText', '  raw\n1.4::light::  ');
  f.action('new-prompt'); f.input('promptText', 'other');
  const overlay = f.mount.children[0];
  for (const event of [{ shiftKey: true }, { isComposing: true }, { keyCode: 229 }]) overlay.fire('keydown', { target: textarea, key: 'Enter', ...event });
  await settle(); assert.deepEqual(f.counts(), [0, 0, 0]);
  f.dialogButton('保存').click(); await settle();
  assert.match(f.mount.querySelector('.phone-dialog-error').textContent, /保存失败/);
  assert.equal(f.form().querySelector('[name="promptText"]').value, 'other');
  f.allowSave(); overlay.fire('keydown', { target: textarea, key: 'Enter' }); await settle();
  assert.equal(f.mount.children.length, 0); assert.deepEqual(f.counts(), [1, 0, 1]);
  f.open(true); f.dialogButton('删除预设').click();
  assert.equal(f.mount.querySelector('form'), null);
  f.dialogButton('删除').click(); await settle(); assert.deepEqual(f.counts(), [2, 0, 2]);
});

const clickBody = source.slice(source.indexOf('  function click(event)'), source.indexOf('  function input(event)'));
const runtime = await readFile(new URL('../src/runtime.js', import.meta.url), 'utf8');
test('desktop wall and camera app use current-chat rebinding callbacks with standalone navigation fallbacks', () => {
  for (const callbackPresent of [true, false]) {
    const calls = [], ui = { view: 'desktop', albumPage: 'detail', albumPath: 'old' };
    const click = new Function('selects', 'ui', 'root', 'doc', 'onOpenAlbum', 'onOpenCamera', 'showPage', 'apps', 'conversationId', 'groups', 'messages', `${clickBody}\nreturn click;`)(
      { click: () => false }, ui, {}, { getSelection: () => null },
      callbackPresent ? () => calls.push('current-album') : undefined,
      callbackPresent ? () => calls.push('current-camera') : undefined,
      view => calls.push(view), [{ id: 'camera' }], () => '', {}, {},
    );
    for (const dataset of [{ action: 'album-open' }, { tab: 'camera' }]) {
      const button = { dataset, matches: () => false, hasAttribute: () => false,
        closest: selector => selector === 'button' ? button : null };
      click({ target: button, stopPropagation() {} });
    }
    assert.deepEqual(calls, callbackPresent ? ['current-album', 'current-camera'] : ['album', 'camera']);
    if (!callbackPresent) assert.equal(ui.albumPath, '');
  }
  for (const [callback, method] of [['onOpenAlbum', 'openAlbum'], ['onOpenCamera', 'openCamera']]) {
    const expression = runtime.match(new RegExp(`${callback}: \\(\\) => \\{ ([^\\n]+) \\},`))[1];
    const calls = [];
    new Function('boundTo', 'host', 'open', 'phone', expression)(() => false, { captureChat: () => ({ id: 'new-chat' }) }, () => calls.push('rebind'), { [method]: () => calls.push(method) });
    assert.deepEqual(calls, ['rebind', method]);
  }
});


test('existing camera preset starts on its panel while new dialogs keep input focus and panel Shift-Tab reaches the last control', async () => {
  const f = modalFixture(); f.open();
  assert.equal(f.focused().name, 'presetName');
  f.input('presetName', '已存预设'); f.input('promptText', 'scene');
  f.dialogButton('保存').click(); await settle();
  f.open(true);
  assert.equal(f.focused().classList.contains('phone-dialog'), true);
  assert.equal(f.focused().tabIndex, -1);
  f.mount.children[0].fire('keydown', { key: 'Tab', shiftKey: true, target: f.focused() });
  assert.equal(f.focused().textContent, '保存');
  f.dialogButton('取消').click();
});
