import { action, avatar, escape, icon, refKey } from './ui/shared.js';
import { createHomeClock, renderHome } from './ui/home.js';
import { renderInbox, renderChat } from './ui/messages.js';
import { renderForum, renderPost } from './ui/forum.js';
import { renderSettings } from './ui/settings.js';
import { renderProfile } from './ui/profiles.js';
import { readImage } from './ui/images.js';
import { renderGroupProfile } from './ui/groups.js';
import { renderDeletion } from './ui/deletion.js';
import { renderModelOptions } from './ui/models.js';
import { renderPhotoViewer } from './ui/cards.js';
import { readLockWeather } from './weather.js';
import { renderAuthoring } from './ui/authoring.js';
import { LOCAL_CORE_URL, REMOTE_CORE_URL } from './authoring.js';

// 新应用在这里注册入口和页面，页面模板保留在 src/ui/。
const apps = [
  { id: 'messages', label: '短信', view: 'inbox', pages: ['inbox', 'chat', 'contact-profile', 'group-chat', 'group-profile', 'delete-confirm'] },
  { id: 'forum', label: '论坛', view: 'forum', pages: ['forum', 'post'] },
  { id: 'settings', label: '设置', view: 'settings', pages: ['settings', 'user-profile', 'authoring'] },
];
const pages = { home: renderHome, inbox: renderInbox, chat: renderChat, 'group-chat': renderChat, 'group-profile': renderGroupProfile, 'delete-confirm': renderDeletion, forum: renderForum, post: renderPost, settings: renderSettings, 'contact-profile': renderProfile, 'user-profile': renderProfile, authoring: renderAuthoring };

export function mountPhone({ mount, store, messages, groups, directory, forum, apiSettings, wallpaper, entries, images, authoring, mode, control = { isEnabled: () => true }, readWeather = readLockWeather, readTime, readTimeline, defaultUser = '我', onClose, onContextChange = () => {} }) {
  const doc = mount.ownerDocument;
  const element = doc.createElement('div');
  element.id = mode === 'embedded' ? 'pocket-phone-card-host' : 'pocket-phone-host';
  element.dataset.mode = mode || 'standalone';
  element.className = 'pocket-phone';
  const root = element.attachShadow({ mode: 'open' });
  const fontStyle = doc.createElement('style');
  fontStyle.dataset.pocketPhoneFont = '';
  fontStyle.textContent = `@font-face { font-family: PocketPhoneClock; src: url("${new URL('../assets/clock-dorsa.ttf', import.meta.url).href}") format("truetype"); font-display: block; }`;
  doc.head.append(fontStyle);
  const stylesheet = doc.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('../style.css', import.meta.url).href;
  const surface = doc.createElement('div');
  surface.className = 'phone-shell';
  surface.setAttribute('role', 'region');
  surface.setAttribute('aria-label', '两三事');
  root.append(stylesheet, surface);
  mount.append(element);
  const ui = { view: 'home', contactId: '', groupId: '', groupEditId: '', groupDraft: {}, deletion: null, inboxMenu: false, postId: '', visibleMessages: 60, historyOpen: false, visibleHistory: 60, batch: null, drafts: new Map(), drawers: { connection: true, appearance: false, content: false }, manual: false, apiDraft: {}, models: [], modelSearch: '', modelsOpen: false, feedback: null, defaultUser, profileDraft: {}, editor: '', editId: '', selectedMessage: '', chatMenu: false, confirmClear: false };
  const busy = new Set();
  Object.assign(ui, { attachment: '', attachmentDraft: {}, stickerPack: 'blob', photo: null });
  if (!control.isEnabled()) ui.view = 'settings';
  const clock = createHomeClock({ root, element, isHome: () => ui.view === 'home', readTime });
  const inChat = () => ['chat', 'group-chat'].includes(ui.view);
  const conversationId = () => ui.view === 'group-chat' ? ui.groupId : ui.contactId;

  // 导航、草稿、事件与服务调用由控制器统一持有，页面只负责展示。
  function render({ bottom = false } = {}) {
    const scrollTop = inChat() ? root.querySelector('.message-feed')?.scrollTop : undefined;
    const settingsScroll = root.querySelector('.view-settings')?.scrollTop;
    const state = store.read();
    const enabled = control.isEnabled();
    element.dataset.enabled = String(enabled);
    if (!enabled) { ui.view = 'settings'; ui.photo = null; ui.attachment = ''; }
    const batch = readTimeline();
    if (ui.batch?.key !== batch.key) { ui.historyOpen = false; ui.visibleHistory = 60; }
    ui.batch = batch;
    element.dataset.theme = state.theme === 'night' ? 'night' : 'day';
    entries.setTheme(state.theme);
    const page = pages[ui.view];
    const active = apps.find(app => app.pages.includes(ui.view))?.id;
    const weather = ui.view === 'home' ? readWeather() : null;
    surface.innerHTML = `<div class="phone-tools">${action('close', '关闭手机', 'close', 'icon-button close-button')}</div><main class="phone-main view-${ui.view}">${page(state, { ui, busy, apiSettings, entries, control })}</main>${ui.feedback ? `<div class="feedback ${ui.feedback.error ? 'is-error' : ''}" role="${ui.feedback.error ? 'alert' : 'status'}"><span>${escape(ui.feedback.text)}</span>${action('dismiss', '关闭提示', 'close', 'icon-button')}</div>` : ''}<footer class="phone-footer ${ui.view === 'home' ? 'home-footer' : ''}">${weather ? `<div class="lock-meta"><span class="lock-weather" title="${weather.source === 'decoration' ? '装饰天气' : '构画剧情天气'}">${icon('sun')}<span>${escape(weather.text)} ${escape(weather.temperature)}</span></span><span class="home-date"></span></div>` : ''}<nav class="bottom-nav" aria-label="手机应用">${[...(ui.view === 'home' ? [] : [['home', '锁屏']]), ...apps.map(({ id, label }) => [id, label])].map(([id, label]) => `<button type="button" class="nav-item ${ui.view !== 'home' && active === id ? 'is-active' : ''}" data-tab="${id}" aria-label="${label}" title="${label}" ${!enabled && id !== 'settings' ? 'disabled' : ''} ${ui.view !== 'home' && active === id ? 'aria-current="page"' : ''}>${icon(id)}<span class="sr-only">${label}</span></button>`).join('')}</nav></footer>${renderPhotoViewer(ui.photo)}`;
    const toolbar = root.querySelector('[data-phone-tools]');
    if (toolbar) { const tools = root.querySelector('.phone-tools'); toolbar.append(tools.firstElementChild); tools.remove(); }
    clock.refresh();
    resizeDraft();
    if (settingsScroll !== undefined && ui.view === 'settings') root.querySelector('.view-settings').scrollTop = settingsScroll;
    if (bottom) {
      const feed = root.querySelector('.message-feed');
      if (feed) feed.scrollTop = feed.scrollHeight;
    } else if (scrollTop !== undefined) root.querySelector('.message-feed').scrollTop = scrollTop;
  }
  async function perform(key, task, after) {
    if (busy.has(key)) return;
    busy.add(key);
    ui.feedback = null;
    render({ bottom: key.startsWith('continue:') });
    try { const result = await task(); after?.(result); }
    catch (error) { ui.feedback = { error: true, text: error?.message || '操作未完成，请重试。' }; }
    finally {
      if (!element.hidden && inChat() && control.isEnabled()) {
        try { await store.markRead(conversationId()); }
        catch { ui.feedback = { error: true, text: '消息的已读状态保存失败，请检查酒馆连接。' }; }
      }
      busy.delete(key); render({ bottom: inChat() && (key === 'profile' || key === 'group-profile' || key.startsWith('send:') || key.startsWith('continue:')) });
    }
  }
  function close() {
    dismissMenus();
    element.hidden = true;
    clock.stop();
    onClose?.();
  }
  function editGroup(id = '') {
    const group = store.read().groups?.find(item => item.id === id);
    ui.groupEditId = id; ui.groupDraft = { name: group?.name || '', avatar: group?.avatar || '', memberIds: [...(group?.memberIds || [])], userIsMember: group?.userIsMember ?? true };
    ui.view = 'group-profile'; ui.chatMenu = false; ui.inboxMenu = false; ui.feedback = null; render();
  }
  function closeModels() {
    ui.modelsOpen = false;
    root.querySelector('.model-popup')?.remove();
    root.querySelector('[data-action="models-menu"]')?.setAttribute('aria-expanded', 'false');
  }
  function dismissMenus(event) {
    if (ui.attachment && event && !event.composedPath().some(node => node.getRootNode?.() === root && node.matches?.('.attachment-panel, .attachment-button'))) {
      ui.attachment = ''; root.querySelector('.attachment-panel')?.remove();
    }
    if (ui.modelsOpen && !event?.composedPath().some(node => node.getRootNode?.() === root && node.matches?.('.model-picker'))) closeModels();
    if (!ui.chatMenu && !ui.inboxMenu && !ui.selectedMessage) return;
    if (event?.composedPath().some(node => node.getRootNode?.() === root && node.matches?.('.chat-options, .inbox-options, .bubble, .message-delete'))) return;
    ui.chatMenu = false; ui.inboxMenu = false; ui.selectedMessage = '';
    // 仅移除弹出操作，保留输入节点和焦点，让下一次点击直接开始打字。
    root.querySelectorAll('.chat-menu, .message-delete').forEach(node => node.remove());
    root.querySelectorAll('.is-selected').forEach(node => node.classList.remove('is-selected'));
    root.querySelectorAll('.bubble[aria-expanded="true"]').forEach(node => node.setAttribute('aria-expanded', 'false'));
  }
  function editProfile(kind, id = '') {
    ui.editor = kind; ui.editId = id;
    const state = store.read();
    const person = kind === 'user' ? state.userProfile || { name: defaultUser } : state.contacts.find(item => item.id === id) || {};
    ui.profileDraft = Object.fromEntries(['name', 'nickname', 'avatar', ...(kind === 'contact' ? ['expression', 'language'] : [])].map(key => [key, person[key] || '']));
    ui.view = `${kind}-profile`; ui.chatMenu = false; ui.inboxMenu = false; ui.feedback = null; render();
  }
  function keydown(event) {
    const modelOption = event.target.closest('[data-model]');
    if (ui.modelsOpen && (modelOption || event.target.id === 'model-search')) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeModels(); root.querySelector('[data-action="models-menu"]')?.focus(); return; }
      const options = [...root.querySelectorAll('[data-model]')];
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const index = options.indexOf(modelOption), offset = event.key === 'ArrowDown' ? 1 : -1;
        const next = modelOption ? (index + offset + options.length) % options.length : offset > 0 ? 0 : options.length - 1;
        options[next]?.focus(); return;
      }
      if (event.target.id === 'model-search' && event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); options[0]?.click(); return; }
      if (modelOption && ['Enter', ' '].includes(event.key)) event.stopPropagation();
    }
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (ui.photo) { ui.photo = null; render(); }
      else close();
    } else if (event.target.matches('input, textarea, select') || event.target.isContentEditable) {
      // Shadow 外只能看到宿主节点的焦点，须在根内阻止编辑键触发酒馆快捷键。
      event.stopPropagation();
    }
  }
  function click(event) {
    if (event.target.matches('.photo-viewer')) { ui.photo = null; render(); return; }
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.stickerPack) { ui.stickerPack = button.dataset.stickerPack; render(); return; }
    if (button.dataset.sticker) {
      const id = conversationId(), service = ui.view === 'group-chat' ? groups : messages;
      void perform(`send:${id}`, () => service.sendCard(id, { type: 'sticker', stickerId: button.dataset.sticker }), () => { ui.attachment = ''; onContextChange(); }); return;
    }
    if (button.dataset.transferId) {
      const id = conversationId(), batch = ui.batch;
      void perform(`transfer:${button.dataset.transferId}`, () => store.respondTransfer(id, button.dataset.transferId, button.dataset.transferStatus, '@user', batch), onContextChange); return;
    }
    if (button.dataset.model) { ui.apiDraft.model = button.dataset.model; root.querySelector('#api-model').value = button.dataset.model; closeModels(); root.querySelector('[data-action="models-menu"]').focus(); return; }
    if (button.dataset.drawer) { const key = button.dataset.drawer; ui.drawers[key] = !ui.drawers[key]; render(); return; }
    if (button.dataset.tab) {
      ui.view = apps.find(app => app.id === button.dataset.tab)?.view || button.dataset.tab;
      ui.feedback = null; ui.chatMenu = false; ui.inboxMenu = false; ui.confirmClear = false; ui.selectedMessage = '';
      ui.attachment = ''; ui.photo = null;
      render();
      return;
    }
    if (button.dataset.contact || button.dataset.group) {
      if (button.dataset.group) { ui.groupId = button.dataset.group; ui.view = 'group-chat'; }
      else { ui.contactId = button.dataset.contact; ui.view = 'chat'; }
      ui.chatMenu = false; ui.inboxMenu = false; ui.confirmClear = false; ui.selectedMessage = ''; ui.visibleMessages = 60; ui.historyOpen = false; ui.visibleHistory = 60; ui.feedback = null;
      ui.attachment = ''; ui.attachmentDraft = {};
      render({ bottom: true });
      void store.markRead(conversationId()).catch(() => { ui.feedback = { error: true, text: '消息的已读状态保存失败，请检查酒馆连接。' }; render(); }); return;
    }
    if (button.dataset.message) { ui.chatMenu = false; ui.selectedMessage = ui.selectedMessage === button.dataset.message ? '' : button.dataset.message; render(); return; }
    if (button.dataset.post) { ui.postId = button.dataset.post; ui.view = 'post'; ui.feedback = null; render(); return; }
    const id = conversationId(), service = ui.view === 'group-chat' ? groups : messages;
    switch (button.dataset.action) {
      case 'authoring': ui.view = 'authoring'; ui.feedback = null; render(); break;
      case 'back-authoring': ui.view = 'settings'; render(); break;
      case 'export-card':
        void perform('export', () => authoring.exportScript({ coreUrl: ui.exportLocal ? LOCAL_CORE_URL : REMOTE_CORE_URL }), result => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(result.script, null, 2)], { type: 'application/json' }));
          const link = doc.createElement('a'); link.href = url; link.download = result.filename; doc.body.append(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 0);
          ui.feedback = { text: '随卡包已导出。' };
        });
        break;
      case 'attachments': ui.attachment = ui.attachment ? '' : 'menu'; ui.selectedMessage = ''; ui.chatMenu = false; render(); break;
      case 'choose-stickers': ui.attachment = 'stickers'; render(); break;
      case 'choose-location': ui.attachment = 'location'; ui.attachmentDraft = {}; render(); break;
      case 'choose-transfer': ui.attachment = 'transfer'; ui.attachmentDraft = { currency: 'CNY' }; render(); break;
      case 'close-attachment': ui.attachment = ''; render(); break;
      case 'close-photo': ui.photo = null; render(); break;
      case 'photo': {
        const message = store.read().conversations[id]?.find(item => item.id === button.dataset.photo);
        if (message?.image.path) { ui.photo = message.image; render(); }
        else void perform(`image:${button.dataset.photo}`, () => images.generate(id, button.dataset.photo));
        break;
      }
      case 'back-inbox': ui.view = 'inbox'; ui.feedback = null; render(); break;
      case 'back-forum': ui.view = 'forum'; render(); break;
      case 'profile': editProfile('contact', id); break;
      case 'edit-user': editProfile('user'); break;
      case 'add-contact': editProfile('contact'); break;
      case 'inbox-menu': ui.inboxMenu = !ui.inboxMenu; render(); break;
      case 'add-group': editGroup(); break;
      case 'edit-group': editGroup(ui.groupId); break;
      case 'back-group': ui.view = ui.groupEditId ? 'group-chat' : 'inbox'; ui.groupDraft = {}; render({ bottom: inChat() }); break;
      case 'organize': ui.inboxMenu = false; void perform('directory', () => directory.organize(), result => { ui.feedback = { text: result.contacts.length || result.groups.length ? `新增 ${result.contacts.length} 位联系人、${result.groups.length} 个群聊。` : '没有需要新增的联系人或群聊。' }; onContextChange(); }); break;
      case 'remove-contact':
      case 'remove-group': {
        const group = button.dataset.action === 'remove-group';
        const key = group ? ui.view === 'group-profile' ? ui.groupEditId : ui.groupId : ui.view === 'contact-profile' ? ui.editId : ui.contactId;
        const person = (group ? store.read().groups || [] : store.read().contacts).find(item => item.id === key);
        ui.deletion = { kind: group ? 'group' : 'contact', id: key, name: person.name, from: ui.view };
        ui.chatMenu = false; ui.view = 'delete-confirm'; render(); break;
      }
      case 'cancel-delete': ui.view = ui.deletion.from; ui.deletion = null; render(); break;
      case 'confirm-delete': {
        const item = ui.deletion;
        void perform('remove', () => item.kind === 'group' ? store.deleteGroup(item.id) : store.deleteContact(item.id), () => { ui.drafts.delete(item.id); ui.selectedMessage = ''; ui.profileDraft = {}; ui.groupDraft = {}; ui.deletion = null; ui.view = 'inbox'; onContextChange(); });
        break;
      }
      case 'back-profile': ui.view = ui.editor === 'user' ? 'settings' : ui.editId ? 'chat' : 'inbox'; ui.profileDraft = {}; render({ bottom: ui.view === 'chat' }); break;
      case 'remove-avatar': (ui.view === 'group-profile' ? ui.groupDraft : ui.profileDraft).avatar = ''; render(); break;
      case 'refine-style': {
        const draft = ui.profileDraft, original = draft.expression, contactId = ui.editId;
        void perform('style', () => messages.refineOnlineStyle(contactId), result => {
          if (draft.expression === original) draft.expression = result;
          else ui.feedback = { text: '你已手动修改线上方式，保留当前编辑。' };
        });
        break;
      }
      case 'chat-menu': ui.chatMenu = !ui.chatMenu; ui.selectedMessage = ''; render(); break;
      case 'clear-chat': ui.confirmClear = true; ui.chatMenu = false; render(); break;
      case 'cancel-clear': ui.confirmClear = false; render(); break;
      case 'confirm-clear': {
        const anchor = ui.batch;
        void perform(`clear:${id}`, () => store.clearConversation(id, anchor), () => { ui.confirmClear = false; ui.selectedMessage = ''; ui.drafts.delete(id); onContextChange(); }); break;
      }
      case 'delete-message': {
        const messageId = ui.selectedMessage;
        void perform(`delete:${id}`, () => store.deleteMessage(id, messageId), () => { ui.selectedMessage = ''; onContextChange(); }); break;
      }
      case 'earlier': ui.visibleMessages += 60; render(); break;
      case 'history': ui.historyOpen = !ui.historyOpen; ui.selectedMessage = ''; render(); break;
      case 'earlier-history': ui.visibleHistory += 60; render(); break;
      case 'dismiss': ui.feedback = null; render(); break;
      case 'close': close(); break;
      case 'send': {
        const text = (ui.drafts.get(id) || '').trim();
        if (text) void perform(`send:${id}`, () => service.send(id, text), () => { if ((ui.drafts.get(id) || '').trim() === text) ui.drafts.set(id, ''); onContextChange(); });
        break;
      }
      case 'continue': void perform(`continue:${id}`, () => service.continueChat(id), onContextChange); break;
      case 'refresh': void perform('forum', () => forum.refresh()); break;
      case 'restore-wallpaper': { const theme = store.read().theme; void perform('wallpaper', () => wallpaper.restore(theme)); break; }
      case 'models-menu': ui.modelsOpen = !ui.modelsOpen; render(); if (ui.modelsOpen) root.querySelector('#model-search').focus(); break;
      case 'fetch-models': {
        const draft = { ...ui.apiDraft };
        void perform('models', () => apiSettings.fetchModels(draft), models => {
          if (ui.apiDraft.url !== draft.url || ui.apiDraft.key !== draft.key) { ui.feedback = { text: '连接已修改，请重新拉取模型。' }; return; }
          ui.models = models; ui.modelSearch = ''; ui.modelsOpen = true;
          if (!ui.apiDraft.model) ui.apiDraft.model = models[0];
        });
        break;
      }
    }
  }
  function resizeDraft() {
    const draft = root.querySelector('#sms-draft');
    if (!draft) return;
    draft.style.height = 'auto';
    draft.style.height = `${Math.min(draft.scrollHeight + 2, 120)}px`;
  }
  function input(event) {
    if (event.target.closest('.attachment-form') && event.target.name) ui.attachmentDraft[event.target.name] = event.target.value;
    if (event.target.id === 'sms-draft') {
      ui.drafts.set(conversationId(), event.target.value);
      resizeDraft();
    }
    if (event.target.closest('.api-form') && event.target.name) ui.apiDraft[event.target.name] = event.target.value;
    if (event.target.id === 'model-search') {
      ui.modelSearch = event.target.value;
      root.querySelector('.model-options').innerHTML = renderModelOptions(ui);
    }
    if (['api-url', 'api-key'].includes(event.target.id)) {
      ui.models = []; ui.modelSearch = ''; closeModels(); root.querySelector('.model-list-toggle')?.remove();
    }
    if (event.target.id === 'api-model' && ui.modelsOpen) root.querySelector('.model-options').innerHTML = renderModelOptions(ui);
    const form = event.target.closest('.profile-form, .group-form');
    if (form && event.target.name && event.target.type !== 'checkbox') {
      const draft = form.matches('.group-form') ? ui.groupDraft : ui.profileDraft;
      draft[event.target.name] = event.target.value;
      if (['avatar', 'name', 'nickname'].includes(event.target.name)) root.querySelector('.profile-avatar').innerHTML = avatar(draft);
    }
  }
  function change(event) {
    if (event.target.id === 'export-source') { ui.exportLocal = event.target.value === 'local'; render(); }
    if (event.target.id === 'phone-enabled') {
      const enabled = event.target.checked;
      void perform('enabled', () => control.setEnabled(enabled), () => { ui.view = 'settings'; onContextChange(); });
    }
    if (event.target.closest('.attachment-form') && event.target.name) ui.attachmentDraft[event.target.name] = event.target.value;
    if (event.target.closest('.group-form') && event.target.name === 'member') {
      const { value, checked } = event.target;
      if (value === '@user') ui.groupDraft.userIsMember = checked;
      else ui.groupDraft.memberIds = checked ? [...ui.groupDraft.memberIds, value] : ui.groupDraft.memberIds.filter(id => id !== value);
    }
    if (event.target.id === 'inject-enabled') {
      const enabled = event.target.checked;
      void perform('injection', async () => { await store.setInjectionEnabled(enabled); onContextChange(); });
    }
    if (event.target.dataset.entryPreference) {
      const key = event.target.dataset.entryPreference, value = event.target.checked;
      void perform('entry', () => entries.set(key, value), result => { if (result?.notice) ui.feedback = { text: result.notice }; });
    }
    if (event.target.id === 'phone-theme') void perform('theme', () => store.setTheme(event.target.value));
    if (event.target.id === 'wallpaper-file' && event.target.files[0]) {
      const file = event.target.files[0], theme = store.read().theme;
      void perform('wallpaper', async () => wallpaper.upload(theme, await readImage(file, doc, 1600)));
    }
    if (event.target.matches('.profile-form input[type="file"], .group-form input[type="file"]') && event.target.files[0]) {
      const file = event.target.files[0], draft = event.target.closest('.group-form') ? ui.groupDraft : ui.profileDraft;
      void perform('avatar', () => readImage(file, doc), value => { draft.avatar = value; });
    }
    if (event.target.id === 'api-source') {
      ui.manual = event.target.value === 'manual';
      if (ui.manual) { render(); return; }
      const source = apiSettings.listSources().find(item => refKey(item.ref) === event.target.value);
      if (source) void perform('api', () => apiSettings.select(source.ref));
    }
  }
  function submit(event) {
    event.preventDefault();
    if (event.target.matches('.attachment-form')) {
      const id = conversationId(), service = ui.view === 'group-chat' ? groups : messages, type = ui.attachment;
      const draft = { type, [type]: { ...ui.attachmentDraft } };
      void perform(`send:${id}`, () => service.sendCard(id, draft), () => { ui.attachment = ''; ui.attachmentDraft = {}; onContextChange(); });
    }
    if (event.target.matches('.composer')) {
      const send = root.querySelector('[data-action="send"]');
      send?.click();
    }
    if (event.target.matches('.api-form')) void perform('api', () => apiSettings.saveManual({ ...ui.apiDraft }), () => { ui.apiDraft = {}; ui.manual = false; ui.feedback = { text: '连接已保存。' }; });
    if (event.target.matches('.profile-form')) {
      const draft = { ...ui.profileDraft }, kind = ui.editor, editId = ui.editId;
      void perform('profile', () => kind === 'user' ? store.saveUserProfile(draft) : store.saveContact(editId, draft), result => {
        if (kind === 'user') ui.view = 'settings';
        else { ui.contactId = result.id; ui.view = 'chat'; }
        ui.profileDraft = {}; onContextChange();
      });
    }
    if (event.target.matches('.group-form')) {
      const draft = { ...ui.groupDraft, memberIds: [...ui.groupDraft.memberIds] }, id = ui.groupEditId;
      void perform('group-profile', () => store.saveGroup(id, draft), result => { ui.groupId = result.id; ui.view = 'group-chat'; ui.groupDraft = {}; ui.selectedMessage = ''; ui.confirmClear = false; });
    }
  }
  root.addEventListener('keydown', keydown);
  root.addEventListener('click', click);
  root.addEventListener('input', input);
  root.addEventListener('change', change);
  root.addEventListener('submit', submit);
  doc.addEventListener('pointerdown', dismissMenus, true);
  render();
  return {
    get isOpen() { return !element.hidden; },
    isReading(id) { return element.isConnected && !element.hidden && inChat() && conversationId() === id; },
    close,
    open() { element.hidden = false; render(); if (inChat()) void store.markRead(conversationId()).catch(() => { ui.feedback = { error: true, text: '消息的已读状态保存失败，请检查酒馆连接。' }; render(); }); },
    refreshTime() {
      clock.refresh();
      if (element.hidden) return;
      if (inChat()) render();
      if (ui.view === 'home') {
        const weather = readWeather(), label = root.querySelector('.lock-weather');
        label.title = weather.source === 'decoration' ? '装饰天气' : '构画剧情天气';
        label.lastElementChild.textContent = `${weather.text} ${weather.temperature}`;
      }
    },
    dispose() { clock.stop(); doc.removeEventListener('pointerdown', dismissMenus, true); root.removeEventListener('keydown', keydown); root.removeEventListener('click', click); root.removeEventListener('input', input); root.removeEventListener('change', change); root.removeEventListener('submit', submit); element.remove(); fontStyle.remove(); },
  };
}
