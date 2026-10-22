import { avatar, refKey } from './ui/shared.js';
import { renderHome } from './ui/home.js';
import { createPhoneClock } from './ui/status.js';
import { renderFeedback, renderShell } from './ui/shell.js';
import { renderDesktop } from './ui/desktop.js';
import { renderInbox, renderChat } from './ui/messages.js';
import { renderForum, renderPost } from './ui/forum.js';
import { renderSettings } from './ui/settings.js';
import { renderProfile } from './ui/profiles.js';
import { readImage } from './ui/images.js';
import { renderGroupProfile } from './ui/groups.js';
import { renderDeletion } from './ui/deletion.js';
import { renderModelOptions } from './ui/models.js';
import { readLockWeather } from './weather.js';
import { renderAuthoring } from './ui/authoring.js';
import { LOCAL_CORE_URL, REMOTE_CORE_URL } from './authoring.js';
import { renderCalendar } from './ui/calendar.js';
import { createCalendarReader } from './calendar.js';
import { mountChatParticles } from './ui/particles.js';
import { mountAvatarCropper } from './ui/avatar-cropper.js';
import { createPhoneWindow } from './ui/window.js';
import { createChatScroll } from './ui/chat-scroll.js';
import { renderSocial, renderSocialProfile } from './ui/social.js';
import { imagePath } from './image-files.js';
import { findBlobEmoji } from './emojis.js';
import { readContactAvatars } from './contact-avatars.js';
import { displayName } from './profiles.js';
import { renderTodos } from './ui/todos.js';
import { renderPhoneNotice } from './ui/notifications.js';
import { readSocialPosts } from './social.js';
import { createPluginUpdatesView } from './ui/plugin-updates-view.js';
import { createPhoneDialog } from './ui/dialog.js';

// 新应用在这里注册入口和页面，页面模板保留在 src/ui/。
const apps = [
  { id: 'messages', label: '短信', view: 'inbox' },
  { id: 'forum', label: '论坛', view: 'forum' },
  { id: 'calendar', label: '日历', view: 'calendar' },
  { id: 'todos', label: '待办', view: 'todos' },
  { id: 'settings', label: '设置', view: 'settings' },
  { id: 'social', label: 'ainstgram', view: 'social' },
];
const pages = {
  home: renderHome,
  desktop: renderDesktop,
  inbox: renderInbox,
  chat: renderChat,
  'group-chat': renderChat,
  'group-profile': renderGroupProfile,
  'delete-confirm': renderDeletion,
  forum: renderForum,
  post: renderPost,
  settings: renderSettings,
  'contact-profile': renderProfile,
  'user-profile': renderProfile,
  authoring: renderAuthoring,
  calendar: renderCalendar,
  todos: renderTodos,
  social: renderSocial,
  'social-profile': renderSocialProfile,
};

export function mountPhone({ mount, store, messages, groups, directory, forum, social, apiSettings, imageProviders, wallpaper, entries, appearance, images, authoring, mode, updates, renderUpdateMarkdown, notifyUpdate, qqjBridgeProvider = () => globalThis.qqj_v3_public_bridge_v1, calendar = createCalendarReader(), control = { isEnabled: () => true }, readWeather = readLockWeather, readTime, readTimeline, defaultUser = '我', onClose, onContextChange = () => {} }) {
  const doc = mount.ownerDocument;
  const element = doc.createElement('div');
  element.id = mode === 'embedded' ? 'pocket-phone-card-host' : 'pocket-phone-host';
  element.dataset.mode = mode || 'standalone';
  element.className = 'pocket-phone';
  const root = element.attachShadow({ mode: 'open' });
  const fontStyle = doc.createElement('style');
  fontStyle.dataset.pocketPhoneFont = '';
  fontStyle.textContent = `@font-face { font-family: PocketPhoneClock; src: url("${new URL('../assets/clock-dorsa.ttf', import.meta.url).href}") format("truetype"); font-display: block; }
    @font-face { font-family: PocketPhoneRoundClock; src: url("${new URL('../assets/clock-fredoka.woff2', import.meta.url).href}") format("woff2"); font-weight: 500; font-display: block; }`;
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
  const windowControls = createPhoneWindow(surface);
  const chatScroll = createChatScroll(root);
  const dialog = createPhoneDialog({ mount: surface, documentRef: doc });
  const updatesView = updates && createPluginUpdatesView({ updates, dialog, documentRef: doc, renderMarkdown: renderUpdateMarkdown, notifyUser: notifyUpdate,
    ...(mode === 'embedded' ? { successText: '两三事已更新，可继续使用。' } : {}) });
  // 这里只持有未保存的页面状态；联系人和消息始终从 store 读取。
  const ui = {
    view: 'home', feedback: null, defaultUser, conflict: control.hasConflict?.(doc) === true,
    contactId: '', groupId: '', postId: '',
    drafts: new Map(), visibleMessages: 60, batch: null,
    historyOpen: false, visibleHistory: 60,
    inboxMenu: false, chatMenu: false, selectedMessage: '', confirmClear: false,
    editor: '', editId: '', profileDraft: {},
    groupEditId: '', groupDraft: {}, deletion: null,
    groupMembersOpen: false,
    socialAuthorId: '', socialPastOpen: false, socialLimit: 30, socialScroll: 0,
    socialCommentOpen: new Set(), socialDrafts: new Map(), notice: null,
    drawers: { connection: true, appearance: false, content: false },
    manual: false, apiDraft: {}, models: [], modelSearch: '', modelsOpen: false,
    attachment: '', attachmentDraft: {}, stickerPack: 'emoji', photo: null,
    calendarOffset: 0, calendarDay: null,
    todoEditing: new Set(), todoDrafts: new Map(),
    replyToId: '',
  };
  const busy = new Set();
  if (!control.isEnabled()) ui.view = 'settings';
  const clock = createPhoneClock({ root, element, readTime });
  const inChat = () => ['chat', 'group-chat'].includes(ui.view);
  const conversationId = () => ui.view === 'group-chat' ? ui.groupId : ui.contactId;
  let particles = null, avatarCropper = null, lockImageNode = null, lockImageSrc = '', noticeTimer;

  function dismissPhoneNotice() {
    doc.defaultView.clearTimeout(noticeTimer);
    ui.notice = null;
    root.querySelector('.phone-top-notice')?.remove();
  }
  function pushPhoneNotice(notice) {
    if (element.hidden || !element.isConnected || !control.isEnabled()) return;
    dismissPhoneNotice();
    ui.notice = notice;
    noticeTimer = doc.defaultView.setTimeout(dismissPhoneNotice, 6000);
  }
  function visibleInPage(node, page) {
    if (!node || !page) return false;
    const box = node.getBoundingClientRect(), frame = page.getBoundingClientRect();
    return box.bottom > frame.top && box.top < frame.bottom;
  }
  function isReadingSocial(postId) {
    if (element.hidden || !element.isConnected || !['social', 'social-profile'].includes(ui.view)) return false;
    const post = root.querySelector(`.social-post[data-social-post="${CSS.escape(postId)}"]`);
    return visibleInPage(post?.querySelector('.social-comment:last-child') || post?.querySelector('.social-stats'), root.querySelector('.phone-main'));
  }
  function readVisibleSocialReplies(event) {
    if (event && !event.target.matches?.('.view-social, .view-social-profile')) return;
    if (element.hidden || !['social', 'social-profile'].includes(ui.view)) return;
    const main = root.querySelector('.phone-main');
    const ids = [...new Set([...root.querySelectorAll('.social-comment[data-unread-reply]')]
      .filter(node => visibleInPage(node, main)).map(node => node.closest('.social-post').dataset.socialPost))];
    if (!ids.length) return;
    void social.markRepliesRead(ids).then(() => {
      for (const id of ids) root.querySelectorAll(`.social-post[data-social-post="${CSS.escape(id)}"] [data-unread-reply]`).forEach(node => node.removeAttribute('data-unread-reply'));
      if (ui.notice?.kind === 'social-reply' && ids.includes(ui.notice.id)) dismissPhoneNotice();
    }).catch(() => { ui.feedback = { error: true, text: '回复的已读状态未能保存，请检查酒馆连接。' }; render(); });
  }
  function notifyCompletion(key) {
    let notice;
    if (key === 'forum' && ui.view !== 'forum') notice = { kind: 'forum' };
    if (key === 'social' && ui.view !== 'social') notice = { kind: 'social-feed' };
    if (key.startsWith('social-author:')) {
      const id = key.slice('social-author:'.length);
      if (ui.view !== 'social-profile' || ui.socialAuthorId !== id) notice = { kind: 'social-author', id };
    }
    if (notice) pushPhoneNotice(notice);
  }

  function syncParticles() {
    const chatStage = root.querySelector('.chat-stage');
    if (chatStage && !element.hidden && appearance.particlesEnabled()) {
      if (particles) particles.attach(chatStage);
      else particles = mountChatParticles(chatStage);
    } else {
      particles?.dispose();
      particles = null;
    }
  }

  // 导航、草稿、事件与服务调用由控制器统一持有，页面只负责展示。
  function render({ bottom = false } = {}) {
    if (!element.isConnected) return;
    const currentLockImage = root.querySelector('.view-home img.home-wallpaper, .view-home img.home-art');
    if (currentLockImage) {
      lockImageNode = currentLockImage;
      lockImageSrc = currentLockImage.getAttribute('src') || '';
    }
    const previousDraft = root.querySelector('#sms-draft');
    const selection = previousDraft && { text: previousDraft.value, start: previousDraft.selectionStart, end: previousDraft.selectionEnd };
    const activeSocialComment = root.activeElement?.matches?.('.social-comment-form textarea') ? root.activeElement : null;
    const socialSelection = activeSocialComment && {
      postId: activeSocialComment.closest('.social-comment-form')?.dataset.socialCommentForm,
      text: activeSocialComment.value,
      start: activeSocialComment.selectionStart,
      end: activeSocialComment.selectionEnd,
    };
    const scrollTop = inChat() ? root.querySelector('.message-feed')?.scrollTop : undefined;
    const settingsScroll = root.querySelector('.view-settings')?.scrollTop;
    const socialScroll = ['social', 'social-profile'].includes(ui.view) ? root.querySelector(`.view-${ui.view}`)?.scrollTop : undefined;
    let state = store.read();
    const enabled = control.isEnabled();
    element.dataset.enabled = String(enabled);
    if (!enabled) { ui.view = 'settings'; ui.photo = null; ui.attachment = ''; }
    if (['inbox', 'chat', 'group-chat', 'group-profile', 'social', 'social-profile'].includes(ui.view)) {
      state = { ...state, contacts: readContactAvatars(state.contacts, qqjBridgeProvider?.()) };
    }
    const batch = readTimeline();
    if (ui.batch?.key !== batch.key) { ui.historyOpen = false; ui.visibleHistory = 60; }
    ui.batch = batch;
    element.dataset.theme = state.theme === 'night' ? 'night' : 'day';
    const page = pages[ui.view];
    const weather = ui.view === 'home' ? readWeather() : null;
    surface.classList.toggle('is-stacked-lock', ui.view === 'home' && state.lockStyle === 'stacked');
    surface.classList.toggle('is-rounded-theme', ['home', 'desktop'].includes(ui.view) && state.lockStyle === 'rounded');
    const calendarMonth = ui.view === 'calendar'
      ? calendar.month(ui.calendarOffset)
      : ui.view === 'desktop' ? calendar.month(0) : null;
    surface.innerHTML = renderShell({
      content: page(state, { ui, busy, apiSettings, imageProviders, entries, appearance, control, mode, apps, calendar: calendarMonth, weather, todos: store, updates }),
      view: ui.view, enabled, weather,
      feedback: ui.feedback, photo: ui.photo,
      conflict: ui.conflict, mode, conflictBusy: busy.has('conflict'),
      lockStyle: state.lockStyle,
    });
    if (updatesView && ui.view === 'settings') {
      root.querySelector('[data-update-controls]')?.append(updatesView.controls);
      root.querySelector('[data-update-feedback]')?.append(updatesView.feedback);
      root.querySelector('[data-update-notice]')?.append(updatesView.noticeRow);
    }
    dialog.attach();
    if (!ui.conflict && enabled) surface.insertAdjacentHTML('beforeend', renderPhoneNotice(state, ui.notice));
    const nextLockImage = root.querySelector('.view-home img.home-wallpaper, .view-home img.home-art');
    if (lockImageNode && nextLockImage && lockImageSrc === nextLockImage.getAttribute('src')) {
      lockImageNode.alt = nextLockImage.alt;
      lockImageNode.className = nextLockImage.className;
      if (lockImageNode !== nextLockImage) nextLockImage.replaceWith(lockImageNode);
    } else if (nextLockImage) {
      lockImageNode = nextLockImage;
      lockImageSrc = nextLockImage.getAttribute('src') || '';
    }
    if (ui.conflict) {
      for (const child of surface.children) child.inert = !child.classList.contains('phone-dialog-backdrop');
      root.querySelector('[data-action="conflict-continue"]').focus({ preventScroll: true });
    }
    clock.refresh();
    resizeDraft();
    const draft = root.querySelector('#sms-draft');
    if (selection && draft?.value === selection.text) draft.setSelectionRange(selection.start, selection.end);
    if (socialSelection) {
      const textarea = root.querySelector(`[data-social-comment-form="${CSS.escape(socialSelection.postId)}"] textarea`);
      if (textarea?.value === socialSelection.text) {
        textarea.setSelectionRange(socialSelection.start, socialSelection.end);
        textarea.focus({ preventScroll: true });
      }
    }
    chatScroll.attach();
    if (settingsScroll !== undefined && ui.view === 'settings') root.querySelector('.view-settings').scrollTop = settingsScroll;
    if (socialScroll !== undefined && ['social', 'social-profile'].includes(ui.view)) root.querySelector('.phone-main').scrollTop = socialScroll;
    if (bottom) {
      const feed = root.querySelector('.message-feed');
      if (feed) feed.scrollTop = feed.scrollHeight;
    } else if (scrollTop !== undefined) root.querySelector('.message-feed').scrollTop = scrollTop;
    syncParticles();
    avatarCropper?.attach();
  }
  async function perform(key, task, after) {
    if (busy.has(key)) return;
    busy.add(key);
    ui.feedback = null;
    render({ bottom: key.startsWith('continue:') });
    try { const result = await task(); notifyCompletion(key); after?.(result); }
    catch (error) { ui.feedback = { error: true, text: error?.message || '操作未完成，请重试。' }; }
    finally {
      if (!element.hidden && inChat() && control.isEnabled()) {
        try { await store.markRead(conversationId()); }
        catch { ui.feedback = { error: true, text: '消息的已读状态保存失败，请检查酒馆连接。' }; }
      }
      busy.delete(key); render({ bottom: inChat() && (key === 'profile' || key === 'group-profile' || key.startsWith('send:') || key.startsWith('continue:')) });
    }
  }
  async function recoverImages(paths) {
    if (!paths.length || !images?.recoverMissing || !control.isEnabled()) return [];
    try {
      const missing = await images.recoverMissing(paths);
      if (missing.length) {
        if (ui.photo && missing.includes(imagePath(ui.photo.path))) ui.photo = null;
        render();
      }
      return missing;
    } catch (error) {
      ui.feedback = { error: true, text: error.message || '图片状态未能保存，请检查酒馆连接。' };
      // 失败只更新提示，避免重挂同一张破图再次触发error。
      const feedback = surface.querySelector('.feedback');
      if (feedback) feedback.outerHTML = renderFeedback(ui.feedback);
      else surface.insertAdjacentHTML('beforeend', renderFeedback(ui.feedback));
      return null;
    }
  }
  function recoverVisibleImages() {
    // 只在打开页面时核对本页图片，捕捉图库删除后仍被浏览器缓存的旧图。
    void recoverImages([...root.querySelectorAll('img[data-phone-image]')].map(image => image.dataset.phoneImage));
  }
  function imageError(event) {
    if (event.target.matches?.('img[data-phone-image]')) void recoverImages([event.target.dataset.phoneImage]);
  }
  async function viewPhoto(readImage) {
    const image = readImage();
    if (!image?.path) return;
    if (await recoverImages([image.path]) === null) return;
    const current = readImage();
    if (current?.path) { ui.photo = current; render(); }
  }
  function close() {
    avatarCropper?.close();
    dismissMenus();
    dismissPhoneNotice();
    windowControls.stop();
    chatScroll.stop();
    element.hidden = true;
    clock.stop();
    particles?.dispose();
    particles = null;
    onClose?.();
  }
  function isFrontmost() {
    if (element.hidden) return false;
    for (let next = element.nextElementSibling; next; next = next.nextElementSibling) {
      if (next.matches('.pocket-phone:not([hidden])')) return false;
    }
    return true;
  }
  function showPage(view, { bottom = false } = {}) {
    if (ui.view === 'social' && view !== 'social') ui.socialScroll = root.querySelector('.view-social')?.scrollTop || 0;
    dismissMenus();
    if (view !== 'group-chat') ui.replyToId = '';
    ui.view = view;
    ui.feedback = null;
    ui.confirmClear = false;
    ui.attachment = '';
    ui.photo = null;
    render({ bottom });
    recoverVisibleImages();
    if (view === 'social') root.querySelector('.view-social').scrollTop = ui.socialScroll;
    readVisibleSocialReplies();
  }
  function openConversation(id, isGroup = false) {
    if (isGroup) { ui.groupId = id; ui.view = 'group-chat'; }
    else { ui.contactId = id; ui.view = 'chat'; }
    ui.chatMenu = false; ui.inboxMenu = false; ui.confirmClear = false; ui.selectedMessage = ''; ui.visibleMessages = 60; ui.historyOpen = false; ui.visibleHistory = 60; ui.feedback = null;
    ui.attachment = ''; ui.attachmentDraft = {};
    render({ bottom: true });
    recoverVisibleImages();
    void store.markRead(id).catch(() => { ui.feedback = { error: true, text: '消息的已读状态保存失败，请检查酒馆连接。' }; render(); });
  }
  function openSocialReply(postId) {
    const state = store.read(), post = state.social?.posts.find(item => item.id === postId);
    if (!post) return;
    ui.socialAuthorId = post.authorId;
    ui.socialLimit = Math.max(ui.socialLimit, readSocialPosts(state, { authorId: post.authorId }).findIndex(item => item.id === postId) + 1);
    showPage('social-profile');
    const article = root.querySelector(`.social-post[data-social-post="${CSS.escape(postId)}"]`), main = root.querySelector('.view-social-profile');
    const anchor = article?.querySelector('.social-comments') || article;
    if (anchor && main) main.scrollTop += anchor.getBoundingClientRect().top - main.getBoundingClientRect().top - 8;
    readVisibleSocialReplies();
  }
  // 返回先收起当前聊天的清空确认，再按页面父级走，不另存应用历史栈。
  function goBack() {
    if (inChat() && ui.confirmClear) { ui.confirmClear = false; render(); return; }
    let parent = 'desktop';
    switch (ui.view) {
      case 'chat':
      case 'group-chat': parent = 'inbox'; break;
      case 'post': parent = 'forum'; break;
      case 'social-profile': parent = 'social'; break;
      case 'contact-profile':
        parent = ui.editId ? 'chat' : 'inbox';
        ui.profileDraft = {};
        break;
      case 'group-profile':
        parent = ui.groupEditId ? 'group-chat' : 'inbox';
        ui.groupDraft = {};
        break;
      case 'user-profile':
        ui.profileDraft = {};
        parent = 'settings';
        break;
      case 'authoring': parent = 'settings'; break;
      case 'delete-confirm':
        parent = ui.deletion.from;
        ui.deletion = null;
        break;
    }
    showPage(parent, { bottom: ['chat', 'group-chat'].includes(parent) });
  }
  function editGroup(id = '') {
    const group = store.read().groups?.find(item => item.id === id);
    ui.groupEditId = id; ui.groupDraft = { name: group?.name || '', avatar: group?.avatar || '', background: group?.background || '', memberIds: [...(group?.memberIds || [])], userIsMember: group?.userIsMember ?? true };
    ui.groupMembersOpen = !id;
    ui.view = 'group-profile'; ui.chatMenu = false; ui.inboxMenu = false; ui.feedback = null; render();
  }
  function closeModels() {
    ui.modelsOpen = false;
    root.querySelector('.model-popup')?.remove();
    root.querySelector('[data-action="models-menu"]')?.setAttribute('aria-expanded', 'false');
  }
  function dismissMenus(event) {
    if (event) {
      const path = event.composedPath();
      for (const form of root.querySelectorAll('.social-comment-form')) {
        const postId = form.dataset.socialCommentForm;
        if (path.includes(form) || path.some(node => node.dataset?.action === 'social-comment-toggle' && node.dataset.socialPost === postId)) continue;
        const input = form.querySelector('textarea');
        if (root.activeElement === input) input.blur();
        if (input.value.trim()) continue;
        ui.socialCommentOpen.delete(postId);
        ui.socialDrafts.delete(postId);
        form.remove();
        root.querySelector(`[data-action="social-comment-toggle"][data-social-post="${CSS.escape(postId)}"]`)?.setAttribute('aria-expanded', 'false');
      }
    }
    if (ui.attachment && event && !event.composedPath().some(node => node.getRootNode?.() === root && node.matches?.('.attachment-panel, .attachment-button'))) {
      ui.attachment = ''; root.querySelector('.attachment-panel')?.remove();
    }
    if (ui.modelsOpen && !event?.composedPath().some(node => node.getRootNode?.() === root && node.matches?.('.model-picker'))) closeModels();
    if (!ui.chatMenu && !ui.inboxMenu && !ui.selectedMessage) return;
    if (event?.composedPath().some(node => node.getRootNode?.() === root && node.matches?.('.chat-options, .inbox-options, .bubble, .message-actions'))) return;
    ui.chatMenu = false; ui.inboxMenu = false; ui.selectedMessage = '';
    // 仅移除弹出操作，保留输入节点和焦点，让下一次点击直接开始打字。
    root.querySelectorAll('.chat-menu, .message-actions').forEach(node => node.remove());
    root.querySelectorAll('.is-selected').forEach(node => node.classList.remove('is-selected'));
    root.querySelectorAll('.bubble[aria-expanded="true"]').forEach(node => node.setAttribute('aria-expanded', 'false'));
  }
  function editProfile(kind, id = '') {
    ui.editor = kind; ui.editId = id;
    const state = store.read();
    const person = kind === 'user' ? state.userProfile || { name: defaultUser } : state.contacts.find(item => item.id === id) || {};
    ui.profileDraft = Object.fromEntries(['name', 'nickname', 'avatar', ...(kind === 'contact' ? ['expression', 'language', 'background'] : [])].map(key => [key, person[key] || '']));
    ui.view = `${kind}-profile`; ui.chatMenu = false; ui.inboxMenu = false; ui.feedback = null; render();
  }
  function keydown(event) {
    if (ui.conflict) {
      event.stopPropagation();
      if (event.key === 'Escape' && !busy.has('conflict')) { ui.conflict = false; render(); }
      if (event.key === 'Tab') {
        const buttons = [...root.querySelectorAll('.phone-dialog button:not(:disabled)')], index = buttons.indexOf(root.activeElement);
        event.preventDefault();
        buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
      }
      return;
    }
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
      else if (ui.notice) dismissPhoneNotice();
      else close();
    } else if (event.target.matches('input, textarea, select') || event.target.isContentEditable) {
      // Shadow 外只能看到宿主节点的焦点，须在根内阻止编辑键触发酒馆快捷键。
      event.stopPropagation();
    }
  }
  function click(event) {
    if (ui.conflict) {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.dataset.action === 'conflict-continue') { ui.conflict = false; ui.feedback = null; render(); }
      if (button.dataset.action === 'conflict-disable') void perform('conflict', () => control.setEnabled(false), () => { ui.conflict = false; ui.view = 'settings'; entries.refreshVisibility?.(); onContextChange(); });
      return;
    }
    if (event.target.matches('.photo-viewer')) { ui.photo = null; render(); return; }
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.wallpaper !== undefined) { const theme = store.read().theme; void perform('wallpaper', () => store.setWallpaper(theme, button.dataset.wallpaper)); return; }
    if (button.dataset.chatBackground !== undefined) {
      const draft = ui.view === 'group-profile' ? ui.groupDraft : ui.profileDraft;
      draft.background = button.dataset.chatBackground; render(); return;
    }
    if (button.dataset.calendarDay) { ui.calendarDay = Number(button.dataset.calendarDay); render(); return; }
    if (button.dataset.mentionId && ui.view === 'group-chat') {
      const person = store.read().contacts?.find(item => item.id === button.dataset.mentionId), draft = root.querySelector('#sms-draft');
      if (person && draft && !draft.disabled) {
        const mention = `@${displayName(person)} `;
        const start = draft.selectionStart ?? draft.value.length, end = draft.selectionEnd ?? start;
        draft.setRangeText(mention, start, end, 'end');
        draft.focus({ preventScroll: true }); input({ target: draft });
      }
      return;
    }
    const todoContainer = button.closest('[data-todo-candidate], [data-todo-row]');
    if (todoContainer && button.dataset.action?.startsWith('todo-')) {
      const todoId = todoContainer.dataset.todoCandidate || todoContainer.dataset.todoRow;
      if (button.dataset.action === 'todo-edit') {
        if (ui.todoEditing.has(todoId)) ui.todoEditing.delete(todoId); else ui.todoEditing.add(todoId);
        render(); return;
      }
      if (button.dataset.action === 'todo-accept') {
        void perform(`todo:${todoId}`, () => store.confirmTodo(todoId, ui.todoDrafts.get(todoId) || {}), () => { ui.todoEditing.delete(todoId); ui.todoDrafts.delete(todoId); onContextChange(); });
        return;
      }
      if (button.dataset.action === 'todo-done') {
        const todo = store.read().todos?.find(item => item.id === todoId);
        if (todo) void perform(`todo:${todoId}`, () => store.setTodoDone(todoId, todo.status !== 'done'), onContextChange);
        return;
      }
      if (button.dataset.action === 'todo-delete') {
        void perform(`todo:${todoId}`, () => store.deleteTodo(todoId), () => { ui.todoEditing.delete(todoId); ui.todoDrafts.delete(todoId); onContextChange(); });
        return;
      }
    }
    if (button.dataset.inlineEmoji) {
      const emoji = findBlobEmoji(button.dataset.inlineEmoji), draft = root.querySelector('#sms-draft');
      if (emoji && draft && !draft.disabled) {
        draft.setRangeText(emoji.emoji, draft.selectionStart, draft.selectionEnd, 'end');
        input({ target: draft });
      }
      return;
    }
    if (button.dataset.stickerPack) { ui.stickerPack = button.dataset.stickerPack; render(); return; }
    if (button.dataset.sticker) {
      const id = conversationId(), service = ui.view === 'group-chat' ? groups : messages;
      void perform(`send:${id}`, () => service.sendCard(id, { type: 'sticker', stickerId: button.dataset.sticker }, ui.view === 'group-chat' ? { replyToId: ui.replyToId } : undefined), () => { ui.attachment = ''; ui.replyToId = ''; onContextChange(); }); return;
    }
    if (button.dataset.transferId) {
      const id = conversationId(), batch = ui.batch;
      void perform(`transfer:${button.dataset.transferId}`, () => store.respondTransfer(id, button.dataset.transferId, button.dataset.transferStatus, '@user', batch), onContextChange); return;
    }
    if (button.dataset.model) { ui.apiDraft.model = button.dataset.model; root.querySelector('#api-model').value = button.dataset.model; closeModels(); root.querySelector('[data-action="models-menu"]').focus(); return; }
    if (button.dataset.drawer) { const key = button.dataset.drawer; ui.drawers[key] = !ui.drawers[key]; render(); return; }
    if (button.dataset.tab) {
      showPage(apps.find(app => app.id === button.dataset.tab)?.view || button.dataset.tab);
      return;
    }
    if (button.dataset.contact || button.dataset.group) {
      openConversation(button.dataset.group || button.dataset.contact, Boolean(button.dataset.group)); return;
    }
    if (button.dataset.message) { ui.chatMenu = false; ui.selectedMessage = ui.selectedMessage === button.dataset.message ? '' : button.dataset.message; render(); return; }
    if (button.dataset.post) { ui.postId = button.dataset.post; ui.view = 'post'; ui.feedback = null; render(); return; }
    const id = conversationId(), service = ui.view === 'group-chat' ? groups : messages;
    switch (button.dataset.action) {
      case 'dismiss-phone-notice': dismissPhoneNotice(); break;
      case 'open-phone-notice': {
        const notice = ui.notice;
        dismissPhoneNotice();
        if (notice?.kind === 'message') openConversation(notice.id, store.read().groups?.some(group => group.id === notice.id));
        else if (notice?.kind === 'social-reply') openSocialReply(notice.id);
        else if (notice?.kind === 'social-author') { ui.socialAuthorId = notice.id; showPage('social-profile'); }
        else if (notice?.kind === 'social-feed') showPage('social');
        else if (notice?.kind === 'forum') showPage('forum');
        break;
      }
      case 'open-social-reply': dismissPhoneNotice(); openSocialReply(button.dataset.socialPost); break;
      case 'unlock': showPage('desktop'); break;
      case 'system-home': showPage('desktop'); break;
      case 'system-back': goBack(); break;
      case 'social-like': {
        const postId = button.dataset.socialPost;
        void perform(`social-like:${postId}`, () => social.toggleLike(postId));
        break;
      }
      case 'social-refresh': {
        const previousIds = new Set((store.read().social?.posts || []).map(post => post.id));
        void perform('social', () => social.refresh(), result => {
          const currentIds = new Set((Array.isArray(result) ? result : store.read().social?.posts || []).map(post => post.id));
          for (const postId of previousIds) {
            if (!currentIds.has(postId)) {
              ui.socialDrafts.delete(postId);
              ui.socialCommentOpen.delete(postId);
            }
          }
          onContextChange();
        });
        break;
      }
      case 'social-comment-toggle': {
        const postId = button.dataset.socialPost;
        if (ui.socialCommentOpen.has(postId)) ui.socialCommentOpen.delete(postId);
        else ui.socialCommentOpen.add(postId);
        render();
        if (ui.socialCommentOpen.has(postId)) root.querySelector(`[data-social-comment-form="${CSS.escape(postId)}"] textarea`)?.focus({ preventScroll: true });
        break;
      }
      case 'social-author': {
        const authorId = button.dataset.socialAuthor;
        if (ui.view !== 'social-profile' || ui.socialAuthorId !== authorId) {
          ui.socialAuthorId = authorId; showPage('social-profile');
        }
        break;
      }
      case 'social-author-refresh': {
        const authorId = ui.socialAuthorId;
        void perform(`social-author:${authorId}`, () => social.generateAuthor(authorId)); break;
      }
      case 'social-back': goBack(); break;
      case 'social-past': ui.socialPastOpen = !ui.socialPastOpen; render(); break;
      case 'social-earlier': ui.socialLimit += 30; render(); break;
      case 'social-image': {
        const post = store.read().social?.posts.find(item => item.id === button.dataset.socialImage);
        if (post?.image?.path) void viewPhoto(() => store.read().social?.posts.find(item => item.id === button.dataset.socialImage)?.image);
        else void perform(`social-image:${button.dataset.socialImage}`, () => images.generatePost(button.dataset.socialImage));
        break;
      }
      case 'restore-chat-background': {
        const draft = ui.view === 'group-profile' ? ui.groupDraft : ui.profileDraft;
        draft.background = ''; render(); break;
      }
      case 'open-calendar':
        ui.view = 'calendar'; ui.calendarOffset = 0; ui.calendarDay = null;
        ui.feedback = null; render(); break;
      case 'calendar-prev': ui.calendarOffset--; ui.calendarDay = null; render(); break;
      case 'calendar-next': ui.calendarOffset++; ui.calendarDay = null; render(); break;
      case 'calendar-today': ui.calendarOffset = 0; ui.calendarDay = null; render(); break;
      case 'calendar-month': ui.calendarDay = null; render(); break;
      case 'authoring': ui.view = 'authoring'; ui.feedback = null; render(); break;
      case 'back-authoring': goBack(); break;
      case 'export-card':
        void perform('export', () => authoring.exportScript({ coreUrl: ui.exportLocal ? LOCAL_CORE_URL : REMOTE_CORE_URL }), result => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(result.script, null, 2)], { type: 'application/json' }));
          const link = doc.createElement('a'); link.href = url; link.download = result.filename; doc.body.append(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 0);
          ui.feedback = { text: '酒馆助手脚本已导出。' };
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
        if (message?.image.path) void viewPhoto(() => store.read().conversations[id]?.find(item => item.id === button.dataset.photo)?.image);
        else void perform(`image:${button.dataset.photo}`, () => images.generate(id, button.dataset.photo));
        break;
      }
      case 'back-inbox':
      case 'back-forum': goBack(); break;
      case 'profile': editProfile('contact', id); break;
      case 'edit-user': editProfile('user'); break;
      case 'add-contact': editProfile('contact'); break;
      case 'inbox-menu': ui.inboxMenu = !ui.inboxMenu; render(); break;
      case 'add-group': editGroup(); break;
      case 'edit-group': editGroup(ui.groupId); break;
      case 'back-group': goBack(); break;
      case 'organize': ui.inboxMenu = false; void perform('directory', () => directory.organize(), result => { ui.feedback = { text: result.contacts.length || result.groups.length ? `新增 ${result.contacts.length} 位联系人、${result.groups.length} 个群聊。` : '没有需要新增的联系人或群聊。' }; onContextChange(); }); break;
      case 'remove-contact':
      case 'remove-group': {
        const group = button.dataset.action === 'remove-group';
        const key = group ? ui.view === 'group-profile' ? ui.groupEditId : ui.groupId : ui.view === 'contact-profile' ? ui.editId : ui.contactId;
        const person = (group ? store.read().groups || [] : store.read().contacts).find(item => item.id === key);
        ui.deletion = { kind: group ? 'group' : 'contact', id: key, name: person.name, from: ui.view };
        ui.chatMenu = false; ui.view = 'delete-confirm'; render(); break;
      }
      case 'cancel-delete': goBack(); break;
      case 'confirm-delete': {
        const item = ui.deletion;
        void perform('remove', () => item.kind === 'group' ? store.deleteGroup(item.id) : store.deleteContact(item.id), () => { ui.drafts.delete(item.id); ui.selectedMessage = ''; ui.profileDraft = {}; ui.groupDraft = {}; ui.deletion = null; ui.view = 'inbox'; onContextChange(); });
        break;
      }
      case 'back-profile': goBack(); break;
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
      case 'reply-message': {
        if (ui.view !== 'group-chat') break;
        ui.replyToId = ui.selectedMessage; ui.selectedMessage = ''; render(); root.querySelector('#sms-draft')?.focus({ preventScroll: true }); break;
      }
      case 'cancel-reply': ui.replyToId = ''; render(); root.querySelector('#sms-draft')?.focus({ preventScroll: true }); break;
      case 'earlier': ui.visibleMessages += 60; render(); break;
      case 'history': ui.historyOpen = !ui.historyOpen; ui.selectedMessage = ''; render(); break;
      case 'earlier-history': ui.visibleHistory += 60; render(); break;
      case 'dismiss': ui.feedback = null; render(); break;
      case 'close': close(); break;
      case 'send': {
        const text = (ui.drafts.get(id) || '').trim();
        if (text) void perform(`send:${id}`, () => ui.view === 'group-chat' ? service.send(id, text, { replyToId: ui.replyToId }) : service.send(id, text), () => { if ((ui.drafts.get(id) || '').trim() === text) ui.drafts.set(id, ''); ui.replyToId = ''; onContextChange(); });
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
    const todoForm = event.target.closest('.todo-form');
    if (todoForm && event.target.name) {
      const id = todoForm.dataset.todoForm, source = store.read().todos?.find(item => item.id === id) || {};
      const draft = { ...(ui.todoDrafts.get(id) || source) };
      if (event.target.name === 'participantIds') draft.participantIds = [...event.target.selectedOptions].map(option => option.value);
      else draft[event.target.name] = event.target.value;
      ui.todoDrafts.set(id, draft);
    }
    const socialComment = event.target.closest('.social-comment-form');
    if (socialComment && event.target.name === 'comment') ui.socialDrafts.set(socialComment.dataset.socialCommentForm, event.target.value);
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
    const todoForm = event.target.closest('.todo-form');
    if (todoForm && event.target.name) {
      const id = todoForm.dataset.todoForm, source = store.read().todos?.find(item => item.id === id) || {};
      const draft = { ...(ui.todoDrafts.get(id) || source) };
      draft[event.target.name] = event.target.multiple ? [...event.target.selectedOptions].map(option => option.value) : event.target.value;
      ui.todoDrafts.set(id, draft);
    }
    if (event.target.id === 'image-provider') void perform('image-provider', () => imageProviders.select(event.target.value));
    if (event.target.id === 'export-source') { ui.exportLocal = event.target.value === 'local'; render(); }
    if (event.target.id === 'phone-enabled') {
      const enabled = event.target.checked;
      void perform('enabled', () => control.setEnabled(enabled), () => { ui.view = 'settings'; entries.refreshVisibility?.(); onContextChange(); });
    }
    if (event.target.closest('.attachment-form') && event.target.name) ui.attachmentDraft[event.target.name] = event.target.value;
    if (event.target.closest('.group-form') && event.target.name === 'member') {
      const { value, checked } = event.target;
      if (value === '@user') ui.groupDraft.userIsMember = checked;
      else ui.groupDraft.memberIds = checked ? [...ui.groupDraft.memberIds, value] : ui.groupDraft.memberIds.filter(id => id !== value);
      root.querySelector('.group-members-fold summary span').textContent = `${ui.groupDraft.memberIds.length + Number(ui.groupDraft.userIsMember)} 人`;
    }
    if (event.target.id === 'inject-enabled') {
      const enabled = event.target.checked;
      void perform('injection', async () => { await store.setInjectionEnabled(enabled); onContextChange(); });
    }
    if (event.target.dataset.entryPreference) {
      const key = event.target.dataset.entryPreference, value = event.target.checked;
      void perform('entry', () => entries.set(key, value), result => { if (result?.notice) ui.feedback = { text: result.notice }; });
    }
    if (event.target.id === 'particles-enabled') {
      const enabled = event.target.checked;
      void perform('particles', () => appearance.setParticlesEnabled(enabled));
    }
    if (event.target.id === 'phone-theme') void perform('theme', () => store.setTheme(event.target.value));
    if (event.target.id === 'phone-lock-style') void perform('lock-style', () => store.setLockStyle(event.target.value));
    if (event.target.id === 'wallpaper-file' && event.target.files[0]) {
      const file = event.target.files[0], theme = store.read().theme;
      void perform('wallpaper', async () => wallpaper.upload(theme, await readImage(file, doc, 1600)));
    }
    if (event.target.id === 'chat-background-file' && event.target.files[0]) {
      const file = event.target.files[0], draft = ui.view === 'group-profile' ? ui.groupDraft : ui.profileDraft;
      void perform('chat-background', async () => wallpaper.uploadImage(await readImage(file, doc, 1600)), path => { draft.background = path; });
    }
    if (event.target.matches('.avatar-picker input[type="file"]') && event.target.files[0]) {
      const file = event.target.files[0], draft = event.target.closest('.group-form') ? ui.groupDraft : ui.profileDraft;
      void perform('avatar', async () => {
        avatarCropper = mountAvatarCropper(surface, file);
        try { return await avatarCropper.result; }
        finally { avatarCropper = null; }
      }, value => { if (value) draft.avatar = value; }).then(() => root.querySelector('.avatar-picker input')?.focus({ preventScroll: true }));
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
    if (event.target.matches('.todo-form')) {
      const id = event.target.dataset.todoForm, source = store.read().todos?.find(item => item.id === id);
      if (!source) return;
      const draft = ui.todoDrafts.get(id) || source;
      void perform(`todo:${id}`, async () => {
        if (source.status === 'candidate') await store.confirmTodo(id, draft);
        else await store.saveTodo(id, draft);
      }, () => { ui.todoEditing.delete(id); ui.todoDrafts.delete(id); onContextChange(); });
      return;
    }
    if (event.target.matches('.attachment-form')) {
      const id = conversationId(), service = ui.view === 'group-chat' ? groups : messages, type = ui.attachment;
      const draft = { type, [type]: { ...ui.attachmentDraft } };
      void perform(`send:${id}`, () => ui.view === 'group-chat' ? service.sendCard(id, draft, { replyToId: ui.replyToId }) : service.sendCard(id, draft), () => { ui.attachment = ''; ui.attachmentDraft = {}; ui.replyToId = ''; onContextChange(); });
    }
    if (event.target.matches('.composer')) {
      const send = root.querySelector('[data-action="send"]');
      send?.click();
    }
    if (event.target.matches('.social-comment-form')) {
      const postId = event.target.dataset.socialCommentForm;
      const text = (ui.socialDrafts.get(postId) || '').trim();
      if (!text) return;
      let postedId;
      void perform(`social-comment:${postId}`, () => social.comment(postId, text, { onPosted: comment => {
        postedId = comment.id;
        if ((ui.socialDrafts.get(postId) || '').trim() === text) ui.socialDrafts.delete(postId);
        render();
      } }), result => {
        if (!isReadingSocial(postId) && result.comments?.some(comment => comment.replyToId === postedId && comment.read === false)) pushPhoneNotice({ kind: 'social-reply', id: postId });
        onContextChange();
      });
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
  const refreshCalendar = () => {
    if (!element.hidden && ['calendar', 'desktop'].includes(ui.view)) render();
  };
  const rememberMembersFold = event => { if (event.target.matches?.('.group-members-fold')) ui.groupMembersOpen = event.target.open; };
  const unsubscribeAppearance = appearance.subscribe(() => {
    const toggle = root.querySelector('#particles-enabled');
    if (toggle) toggle.checked = appearance.particlesEnabled();
    syncParticles();
  });
  doc.defaultView.addEventListener('st-sevendayscal:calendar-changed', refreshCalendar);
  root.addEventListener('keydown', keydown);
  root.addEventListener('click', click);
  root.addEventListener('input', input);
  root.addEventListener('change', change);
  root.addEventListener('submit', submit);
  root.addEventListener('toggle', rememberMembersFold, true);
  root.addEventListener('error', imageError, true);
  root.addEventListener('scroll', readVisibleSocialReplies, true);
  doc.addEventListener('pointerdown', dismissMenus, true);
  render();
  void updates?.ensureChecked();
  return {
    get isOpen() { return !element.hidden; },
    get isFrontmost() { return isFrontmost(); },
    isReading(id) { return element.isConnected && !element.hidden && inChat() && conversationId() === id; },
    isReadingSocial,
    notifyMessage(id) { if (!(inChat() && conversationId() === id)) pushPhoneNotice({ kind: 'message', id }); },
    close,
    open() {
      ui.conflict = control.hasConflict?.(doc) === true;
      // 关闭后重开统一进入锁屏；已显示时调用 open 只刷新当前页。
      if (element.hidden) {
        ui.view = 'home';
        ui.photo = null;
        ui.attachment = '';
      }
      element.hidden = false;
      // 两份手机共享层级；打开已有窗口时按同层 DOM 顺序置前，不改另一份状态。
      if (!isFrontmost()) mount.append(element);
      render();
      recoverVisibleImages();
      windowControls.refresh();
    },
    refreshTime() {
      clock.refresh();
      if (element.hidden) return;
      if (inChat() || ['calendar', 'desktop'].includes(ui.view)) render();
      if (ui.view === 'home') {
        const weather = readWeather(), label = root.querySelector('.lock-weather');
        label.title = weather.source === 'decoration' ? '装饰天气' : '构画剧情天气';
        label.lastElementChild.textContent = `${weather.text} ${weather.temperature}`;
      }
    },
    dispose() {
      dialog.dispose(); updatesView?.dispose();
      dismissPhoneNotice();
      avatarCropper?.close();
      unsubscribeAppearance();
      clock.stop();
      particles?.dispose();
      chatScroll.dispose();
      windowControls.dispose();
      lockImageNode = null;
      lockImageSrc = '';
      doc.defaultView.removeEventListener('st-sevendayscal:calendar-changed', refreshCalendar);
      doc.removeEventListener('pointerdown', dismissMenus, true);
      root.removeEventListener('keydown', keydown);
      root.removeEventListener('click', click);
      root.removeEventListener('input', input);
      root.removeEventListener('change', change);
      root.removeEventListener('submit', submit);
      root.removeEventListener('toggle', rememberMembersFold, true);
      root.removeEventListener('error', imageError, true);
      root.removeEventListener('scroll', readVisibleSocialReplies, true);
      element.remove(); fontStyle.remove();
    },
  };
}
