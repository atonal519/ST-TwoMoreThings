import { avatar, refKey, renderAvatarMenu } from './ui/shared.js';
import { renderHome } from './ui/home.js';
import { createPhoneClock } from './ui/status.js';
import { renderFeedback, renderShell } from './ui/shell.js';
import { renderDesktop } from './ui/desktop.js';
import { renderInbox, renderChat, renderChatMenu, renderInboxMenu, renderMessageMenu } from './ui/messages.js';
import { renderForum, renderPost } from './ui/forum.js';
import { forumComments } from './forum.js';
import { renderSettings, renderSettingsVersion, renderStorySmsInstall } from './ui/settings.js';
import { renderProfile, renderIdentityOptions } from './ui/profiles.js';
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
import { renderLiangshi, renderLiangshiOwnMenu } from './ui/liangshi.js';
import { findLiangshiTopicForPost, isLiangshiFollowingPost, isLiangshiUserPost, liangshiInteractions } from './liangshi.js';
import { imagePath } from './image-files.js';
import { findBlobEmoji } from './emojis.js';
import { readContactAvatars, readContactAvatarDraft } from './contact-avatars.js';
import { createCameoAvatar, isCameoAvatar } from './cameo-avatar.js';
import { displayName } from './profiles.js';
import { renderPhoneNotice } from './ui/notifications.js';
import { readSocialPosts } from './social.js';
import { createPluginUpdatesView } from './ui/plugin-updates-view.js';
import { createPhoneDialog } from './ui/dialog.js';
import { createEditingRenderer } from './ui/editing.js';
import { createPhoneSelects } from './ui/selects.js';
import { createPhoneActionMenu } from './ui/action-menu.js';
import { MEMORY_CONFLICT_CODE } from './memory-sources.js';
import { phoneUrl } from './paths.js';

// 新应用在这里注册入口和页面，页面模板保留在 src/ui/。
const apps = [
  { id: 'liangshi', label: '两事', view: 'liangshi' },
  { id: 'social', label: 'ainstgram', view: 'social' },
  { id: 'messages', label: '短信', view: 'inbox' },
  { id: 'forum', label: '论坛', view: 'forum' },
  { id: 'calendar', label: '日历', view: 'calendar' },
  { id: 'settings', label: '设置', view: 'settings' },
];
const pages = {
  home: renderHome,
  desktop: renderDesktop,
  inbox: renderInbox,
  chat: renderChat,
  'group-chat': renderChat,
  'group-profile': renderGroupProfile,
  forum: renderForum,
  post: renderPost,
  settings: renderSettings,
  'contact-profile': renderProfile,
  'user-profile': renderProfile,
  authoring: renderAuthoring,
  calendar: renderCalendar,
  social: renderSocial,
  'social-profile': renderSocialProfile,
  liangshi: renderLiangshi,
};

export function mountPhone({ mount, store, messages, groups, directory, forum, social, liangshi, apiSettings, imageProviders, wallpaper, entries, appearance, images, authoring, mode, updates, renderUpdateMarkdown, notifyUpdate, storySmsInstaller, qqjBridgeProvider = () => globalThis.qqj_v3_public_bridge_v1, calendar = createCalendarReader(), control = { isEnabled: () => true }, readWeather = readLockWeather, readTime, readTimeline, defaultUser = '我', onClose, onEnable = () => {}, onContextChange = () => {} }) {
  const doc = mount.ownerDocument;
  const element = doc.createElement('div');
  element.id = mode === 'embedded' ? 'pocket-phone-card-host' : 'pocket-phone-host';
  element.dataset.mode = mode || 'standalone';
  element.className = 'pocket-phone';
  const root = element.attachShadow({ mode: 'open' });
  const fontStyle = doc.createElement('style');
  fontStyle.dataset.pocketPhoneFont = '';
  fontStyle.textContent = `@font-face { font-family: PocketPhoneClock; src: url("${phoneUrl('assets/clock-dorsa.ttf')}") format("truetype"); font-display: block; }
    @font-face { font-family: PocketPhoneRoundClock; src: url("${phoneUrl('assets/clock-fredoka.woff2')}") format("woff2"); font-weight: 500; font-display: block; }`;
  doc.head.append(fontStyle);
  const stylesheet = doc.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = phoneUrl('style.css');
  const surface = doc.createElement('div');
  surface.className = 'phone-shell';
  surface.setAttribute('role', 'region');
  surface.setAttribute('aria-label', '两三事');
  root.append(stylesheet, surface);
  mount.append(element);
  const windowControls = createPhoneWindow(surface);
  const chatScroll = createChatScroll(root);
  const dialog = createPhoneDialog({ mount: surface, documentRef: doc });
  const editing = createEditingRenderer(surface);
  const selects = createPhoneSelects({ root, beforeOpen: () => { closeSources(); closeModels(); } });
  // 这里只持有未保存的页面状态；联系人和消息始终从 store 读取。
  const ui = {
    view: 'home', feedback: null, defaultUser, conflict: control.hasConflict?.(doc) === true,
    contactId: '', groupId: '', postId: '',
    drafts: new Map(), visibleMessages: 60, batch: null,
    historyOpen: false, visibleHistory: 60,
    inboxMenu: false, chatMenu: false, selectedMessage: '', confirmClear: false,
    editor: '', editId: '', profileDraft: {},
    groupEditId: '', groupDraft: {},
    groupMembersOpen: false,
    socialAuthorId: '', socialPastOpen: false, socialLimit: 30, socialScroll: 0,
    socialCommentOpen: new Set(), socialDrafts: new Map(), notice: null,
    forumDrafts: new Map(), forumVotes: new Map(), forumScroll: 0, forumTag: '',
    liangshiPage: { kind: 'feed', tab: 'square' }, liangshiTrail: [], liangshiExpanded: new Set(), liangshiDraft: null, liangshiMenu: '', liangshiReplyDrafts: new Map(),
    drawers: { connection: false, appearance: false, content: false },
    manual: false, apiDraft: apiSettings.readDraft?.() || {}, models: [], modelSearch: '', modelsOpen: false, sourcesOpen: false,
    attachment: '', attachmentDraft: {}, stickerPack: 'emoji', photo: null,
    calendarOffset: 0, calendarDay: null,
    replyToId: '',
  };
  const actionMenu = createPhoneActionMenu({ root, onClose: () => {
    ui.chatMenu = false; ui.liangshiMenu = ''; ui.inboxMenu = false; ui.avatarMenuOpen = false; ui.selectedMessage = '';
    root.querySelectorAll('.is-selected').forEach(node => node.classList.remove('is-selected'));
    root.querySelectorAll('[data-message][aria-expanded="true"]').forEach(node => node.setAttribute('aria-expanded', 'false'));
  } });
  const busy = new Set();
  let renderedRoute = '', apiEditor = 0, renderedApiEditor = 0, photoReturn = null;
  if (!control.isEnabled()) ui.view = 'settings';
  const clock = createPhoneClock({ root, element, readTime });
  const inChat = () => ['chat', 'group-chat'].includes(ui.view);
  const conversationId = () => ui.view === 'group-chat' ? ui.groupId : ui.contactId;
  let particles = null, avatarCropper = null, lockImageNode = null, lockImageSrc = '', noticeTimer, feedbackTimer;

  function setFeedback(feedback) {
    doc.defaultView.clearTimeout(feedbackTimer);
    if (!element.isConnected || element.hidden && !feedback?.error) feedback = null;
    ui.feedback = feedback;
    const current = surface.querySelector('.feedback'), markup = renderFeedback(feedback);
    if (current) current.outerHTML = markup;
    else if (markup) {
      const modal = ui.conflict && surface.querySelector(':scope > .phone-dialog-backdrop');
      if (modal) modal.insertAdjacentHTML('beforeend', markup);
      else surface.querySelector(':scope > .phone-main')?.insertAdjacentHTML('afterend', markup);
    }
    if (feedback) feedbackTimer = doc.defaultView.setTimeout(() => {
      if (ui.feedback !== feedback) return;
      ui.feedback = null;
      surface.querySelector('.feedback')?.remove();
    }, feedback.error ? 5000 : 2500);
  }

  const updatesView = updates && createPluginUpdatesView({ updates, dialog, documentRef: doc, renderMarkdown: renderUpdateMarkdown,
    notifyUser: notification => {
      if (!element.isConnected) { notifyUpdate?.(notification); return; }
      setFeedback({ text: notification.text, ...(notification.kind === 'error' ? { error: true } : {}) });
    },
    ...(mode === 'embedded' ? { successText: '两三事已更新，可继续使用。' } : {}) });

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
    }).catch(() => { setFeedback({ error: true, text: '回复的已读状态未能保存，请检查酒馆连接。' }); render(); });
  }
  function notifyCompletion(key, result) {
    let notice;
    if (key === 'forum' && ui.view !== 'forum') notice = { kind: 'forum' };
    if (key.startsWith('forum-more:') && result !== null) { const id = key.slice('forum-more:'.length); if (ui.view !== 'post' || ui.postId !== id) notice = { kind: 'forum-post', id }; }
    if (key === 'social' && ui.view !== 'social') notice = { kind: 'social-feed' };
    if (key === 'liangshi' && (ui.view !== 'liangshi' || ui.liangshiPage.kind !== 'feed' || ui.liangshiPage.tab !== 'square')) notice = { kind: 'liangshi-feed' };
    if (key === 'liangshi-following' && (ui.view !== 'liangshi' || ui.liangshiPage.kind !== 'feed' || ui.liangshiPage.tab !== 'following')) notice = { kind: 'liangshi-following' };
    if (key === 'liangshi-hot' && (ui.view !== 'liangshi' || ui.liangshiPage.kind !== 'feed' || ui.liangshiPage.tab !== 'hot')) notice = { kind: 'liangshi-hot' };
    if (key.startsWith('liangshi-topic:')) {
      const id = key.slice('liangshi-topic:'.length);
      if (ui.view !== 'liangshi' || ui.liangshiPage.kind !== 'hot-topic' || ui.liangshiPage.id !== id) notice = { kind: 'liangshi-topic', id };
    }
    if (key.startsWith('liangshi-more:') || key.startsWith('liangshi-replies:')) {
      if (result === null) return;
      const id = key.slice(key.indexOf(':') + 1);
      if (ui.view !== 'liangshi' || ui.liangshiPage.kind !== 'post' || ui.liangshiPage.id !== id) notice = { kind: 'liangshi-post', id };
    }
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

  function revealClassicArtwork() {
    const artwork = root.querySelector('.view-home.is-classic .home-artboard');
    if (!artwork) return;
    const image = artwork.querySelector('img'), font = '480px PocketPhoneClock', digits = '0123456789';
    const reveal = () => artwork.classList.add('is-ready');
    if (image.complete && image.naturalWidth && doc.fonts.check(font, digits)) { reveal(); return; }
    // 经典图案与动态时钟是同一画面，只等待当前图和当前字体。
    void Promise.all([image.decode(), doc.fonts.load(font, digits)]).then(reveal, reveal);
  }

  // 导航、草稿、事件与服务调用由控制器统一持有，页面只负责展示。
  function render({ bottom = false } = {}) {
    if (!element.isConnected) return;
    const route = JSON.stringify([ui.view, ui.view === 'liangshi' ? [ui.liangshiPage, ui.liangshiPage.kind === 'compose' ? ui.liangshiDraft?.postId : ''] : ui.view === 'post' ? ui.postId : ui.view === 'social-profile' ? ui.socialAuthorId : ui.view === 'contact-profile' ? [ui.editor, ui.editId] : ui.view === 'group-profile' ? ui.groupEditId : inChat() ? conversationId() : '']);
    const sameRoute = route === renderedRoute;
    if (!sameRoute) actionMenu.close();
    const sameEditor = sameRoute && (ui.view !== 'settings' || renderedApiEditor === apiEditor);
    renderedApiEditor = apiEditor;
    renderedRoute = route;
    const currentLockImage = root.querySelector('.view-home img.home-wallpaper, .view-home img.home-art');
    if (currentLockImage) {
      lockImageNode = currentLockImage;
      lockImageSrc = currentLockImage.getAttribute('src') || '';
    }
    const mainScroll = sameRoute ? root.querySelector('.phone-main')?.scrollTop : undefined;
    const scrollTop = sameRoute && inChat() ? root.querySelector('.message-feed')?.scrollTop : undefined;
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
    if (!['contact-profile', 'user-profile', 'group-profile'].includes(ui.view)) ui.avatarMenuOpen = false;
    const weather = ui.view === 'home' ? readWeather() : null;
    surface.classList.toggle('is-stacked-lock', ui.view === 'home' && state.lockStyle === 'stacked');
    surface.classList.toggle('is-rounded-theme', ['home', 'desktop'].includes(ui.view) && state.lockStyle === 'rounded');
    const calendarMonth = ui.view === 'calendar'
      ? calendar.month(ui.calendarOffset)
      : ui.view === 'desktop' ? calendar.month(0) : null;
    editing.render(renderShell({
      content: page(state, { ui, busy, apiSettings, imageProviders, entries, appearance, control, mode, apps, calendar: calendarMonth, weather, updates,
        profileAvatar: ui.view === 'contact-profile' ? readContactAvatarDraft(ui.profileDraft, store.read().contacts.find(person => person.id === ui.editId), qqjBridgeProvider?.()) : undefined }),
      view: ui.view, enabled, weather,
      feedback: ui.feedback, photo: ui.photo,
      conflict: ui.conflict, mode, conflictBusy: busy.has('conflict'),
      lockStyle: state.lockStyle,
      settingsVersion: ui.view === 'settings' ? renderSettingsVersion(mode, updates) : '',
    }), sameEditor);
    selects.mount(route, busy);
    if (updatesView && ui.view === 'settings') {
      root.querySelector('[data-update-controls]')?.append(updatesView.controls);
      root.querySelector('[data-update-notice]')?.append(updatesView.noticeButton);
    }
    if (!ui.conflict && enabled) surface.insertAdjacentHTML('beforeend', renderPhoneNotice(state, ui.notice));
    dialog.attach();
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
    revealClassicArtwork();
    resizeDraft();
    chatScroll.attach({ followFocus: !sameRoute || bottom });
    if (bottom) {
      const feed = root.querySelector('.message-feed');
      if (feed) feed.scrollTop = feed.scrollHeight;
    } else if (scrollTop !== undefined) root.querySelector('.message-feed').scrollTop = scrollTop;
    if (mainScroll !== undefined) root.querySelector('.phone-main').scrollTop = mainScroll;
    actionMenu.update(route);
    chatScroll.revealEditor();
    syncParticles();
    avatarCropper?.attach();
    if (ui.photo) {
      const viewer = root.querySelector('.photo-viewer');
      for (const child of surface.children) child.inert = child !== viewer;
      root.querySelector('[data-action="close-photo"]')?.focus({ preventScroll: true });
    }
  }
  async function perform(key, task, after) {
    if (busy.has(key)) return;
    busy.add(key);
    setFeedback(null);
    render({ bottom: key.startsWith('continue:') });
    try { const result = await task(); notifyCompletion(key, result); after?.(result); }
    catch (error) {
      if (error?.code === MEMORY_CONFLICT_CODE) {
        const content = doc.createElement('p'); content.textContent = error.message;
        void dialog.custom({ title: '记忆插件冲突', content, confirmText: '知道了', submit: () => true });
      } else setFeedback({ error: true, text: error?.message || '操作未完成，请重试。' });
    }
    finally {
      if (!element.hidden && inChat() && control.isEnabled()) {
        try { await store.markRead(conversationId()); }
        catch { setFeedback({ error: true, text: '消息的已读状态保存失败，请检查酒馆连接。' }); }
      }
      busy.delete(key); render({ bottom: inChat() && (key === 'profile' || key === 'group-profile' || key === `send:${conversationId()}` || key === `continue:${conversationId()}`) });
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
      setFeedback({ error: true, text: error.message || '图片状态未能保存，请检查酒馆连接。' });
      // 失败只更新提示，避免重挂同一张破图再次触发error。
      return null;
    }
  }
  const defaultAvatarError = '默认头像未能保存，请检查酒馆连接后重新打开手机。';
  async function refreshStorySmsStatus() {
    if (!storySmsInstaller?.readStatus) return;
    const updateRow = () => {
      const row = root.querySelector('[data-story-sms-install]');
      if (row) row.outerHTML = renderStorySmsInstall(ui, busy, control);
    };
    busy.add('story-sms-status'); updateRow();
    try { ui.storySmsStatus = await storySmsInstaller.readStatus(); }
    catch (error) {
      ui.storySmsStatus = null;
      setFeedback({ error: true, text: error.message || '楼内信息注入状态读取失败，请重新打开内容设置。' });
    } finally { busy.delete('story-sms-status'); updateRow(); }
  }
  function fillDefaultAvatars() {
    if (!control.isEnabled()) return;
    if (ui.feedback?.text === defaultAvatarError) { setFeedback(null); }
    void store.fillMissingAvatars().catch(() => {
      setFeedback({ error: true, text: defaultAvatarError });
    });
  }
  function recoverVisibleImages() {
    // 只在打开页面时核对本页图片，捕捉图库删除后仍被浏览器缓存的旧图。
    void recoverImages([...root.querySelectorAll('img[data-phone-image]')].map(image => image.dataset.phoneImage));
  }
  function imageError(event) {
    if (event.target.matches?.('img[data-phone-image]')) void recoverImages([event.target.dataset.phoneImage]);
  }
  async function viewPhoto(readImage, trigger) {
    const route = renderedRoute, position = listPosition(trigger), feedScroll = root.querySelector('.message-feed')?.scrollTop;
    const selector = trigger && [...trigger.attributes].filter(attribute => attribute.name.startsWith('data-')).map(({ name, value }) => `[${name}="${CSS.escape(value)}"]`).join('');
    const image = readImage();
    if (!image?.path) return;
    if (await recoverImages([image.path]) === null) return;
    const current = readImage();
    if (current?.path && route === renderedRoute) { photoReturn = { route, position, feedScroll, selector }; ui.photo = current; render(); }
  }
  function closePhoto() {
    const previous = photoReturn; photoReturn = null; ui.photo = null; render();
    if (previous?.route !== renderedRoute) return;
    restoreListPosition(previous.position);
    const feed = root.querySelector('.message-feed'); if (feed && previous.feedScroll !== undefined) feed.scrollTop = previous.feedScroll;
    if (previous.selector) root.querySelector(previous.selector)?.focus({ preventScroll: true });
  }
  function discardLiangshiDraft() {
    ui.liangshiDraft = null;
    if (ui.liangshiPage.kind === 'compose') { ui.liangshiPage = { kind: 'feed', tab: 'mine' }; ui.liangshiTrail = []; }
  }
  function close() {
    discardLiangshiDraft();
    setFeedback(null);
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
  // 沿千千结fill/clearModels：重进连接页或换配置时重填，模型点选仍为草稿。
  function fillApiDraft(manual = false) {
    apiEditor++;
    ui.manual = manual; ui.apiDraft = apiSettings.readDraft(manual ? null : apiSettings.getSelected());
    ui.models = []; ui.modelSearch = ''; ui.modelsOpen = false; ui.sourcesOpen = false;
  }
  const manualApi = () => ui.manual || !apiSettings.listSources().length || apiSettings.getSelected()?.kind === 'none';
  function listPosition(source) {
    const main = root.querySelector('.phone-main'), item = source?.closest('.forum-card[data-post], .social-post[data-social-post], .ls-post[data-liangshi-id], .ls-hot-row[data-liangshi-hot]');
    const attribute = item && ['data-post', 'data-social-post', 'data-liangshi-id', 'data-liangshi-hot'].find(name => item.hasAttribute(name));
    return { scroll: main?.scrollTop || 0, ...(item && main ? { anchor: { attribute, id: item.getAttribute(attribute), offset: item.getBoundingClientRect().top - main.getBoundingClientRect().top } } : {}) };
  }
  function restoreListPosition(position) {
    const main = root.querySelector('.phone-main'); if (!main) return;
    const saved = typeof position === 'number' ? { scroll: position } : position;
    main.scrollTop = saved?.scroll || 0;
    const anchor = saved?.anchor, item = anchor && main.querySelector(`[${anchor.attribute}="${CSS.escape(anchor.id)}"]`);
    if (item) {
      const bounds = main.getBoundingClientRect(), header = main.querySelector('.social-header, .ls-chrome')?.getBoundingClientRect();
      const offset = Math.min(main.clientHeight - 24, Math.max((header ? header.bottom - bounds.top : 0) + 8, anchor.offset));
      main.scrollTop += item.getBoundingClientRect().top - bounds.top - offset;
    }
  }
  function showPage(view, { bottom = false, sourceNode } = {}) {
    if (view !== 'liangshi') discardLiangshiDraft();
    if (view === 'settings' && ui.view !== 'settings') fillApiDraft();
    if (ui.view === 'social' && view !== 'social') ui.socialScroll = listPosition(sourceNode);
    dismissMenus();
    if (view !== 'group-chat') ui.replyToId = '';
    ui.view = view;
    setFeedback(null);
    ui.confirmClear = false;
    ui.attachment = '';
    ui.photo = null;
    render({ bottom });
    if (view === 'settings' && ui.drawers.content) void refreshStorySmsStatus();
    recoverVisibleImages();
    if (view === 'social') restoreListPosition(ui.socialScroll);
    readVisibleSocialReplies();
  }
  function openConversation(id, isGroup = false) {
    if (isGroup) { ui.groupId = id; ui.view = 'group-chat'; }
    else { ui.contactId = id; ui.view = 'chat'; }
    ui.chatMenu = false; ui.inboxMenu = false; ui.confirmClear = false; ui.selectedMessage = ''; ui.visibleMessages = 60; ui.historyOpen = false; ui.visibleHistory = 60; setFeedback(null);
    ui.attachment = ''; ui.attachmentDraft = {};
    render({ bottom: true });
    recoverVisibleImages();
    void store.markRead(id).catch(() => { setFeedback({ error: true, text: '消息的已读状态保存失败，请检查酒馆连接。' }); render(); });
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
  function openLiangshiPage(page, remember = true, sourceNode) {
    if (page.kind !== 'compose') ui.liangshiDraft = null;
    if (remember && ui.view === 'liangshi') ui.liangshiTrail.push({ page: ui.liangshiPage, ...listPosition(sourceNode) });
    ui.liangshiPage = page;
    showPage('liangshi');
    root.querySelector('.phone-main').scrollTop = 0;
  }
  // 返回先收起当前聊天的清空确认，再按页面父级走，不另存应用历史栈。
  function goBack() {
    if (ui.view === 'liangshi' && (ui.liangshiTrail.length || ui.liangshiPage.kind !== 'feed')) {
      if (ui.liangshiPage.kind === 'compose') ui.liangshiDraft = null;
      const previous = ui.liangshiTrail.pop();
      ui.liangshiPage = previous?.page || { kind: 'feed', tab: 'square' };
      showPage('liangshi'); restoreListPosition(previous); return;
    }
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
    }
    if (parent === 'forum') ui.forumTag = ui.forumScroll?.tag || '';
    showPage(parent, { bottom: ['chat', 'group-chat'].includes(parent) });
    if (parent === 'forum') restoreListPosition(ui.forumScroll);
  }
  function editGroup(id = '') {
    const group = store.read().groups?.find(item => item.id === id);
    ui.groupEditId = id; ui.groupDraft = { name: group?.name || '', avatar: group?.avatar || '', background: group?.background || '', memberIds: [...(group?.memberIds || [])], userIsMember: group?.userIsMember ?? true };
    ui.groupMembersOpen = !id;
    ui.view = 'group-profile'; ui.chatMenu = false; ui.inboxMenu = false; setFeedback(null); render();
  }
  function closeActionMenu() { actionMenu.close(true); }
  function closeLiangshiMenu() { closeActionMenu(); ui.liangshiMenu = ''; }
  function openActionMenu(title, content, triggerSelector) {
    selects.close(); closeSources(); closeModels();
    actionMenu.open({ title, content, triggerSelector, route: renderedRoute });
  }
  function closeModels() {
    ui.modelsOpen = false;
    root.querySelector('.model-picker .model-popup')?.remove();
    root.querySelector('[data-action="models-menu"]')?.setAttribute('aria-expanded', 'false');
  }
  function closeSources() {
    ui.sourcesOpen = false;
    root.querySelector('.source-picker > .source-popup')?.remove();
    root.querySelector('#api-source')?.setAttribute('aria-expanded', 'false');
  }
  function openSources(direction = 1) {
    closeModels(); ui.sourcesOpen = true; render();
    const options = [...root.querySelectorAll('[data-api-source]')];
    (options.find(option => option.getAttribute('aria-selected') === 'true') || (direction > 0 ? options[0] : options.at(-1)))?.focus();
  }
  function dismissMenus(event) {
    selects.dismiss(event);
    actionMenu.dismiss(event);
    if (ui.identityOwnersOpen && !event?.composedPath().some(node => node.getRootNode?.() === root && node.matches?.('.identity-picker'))) closeIdentityOptions();
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
    if (ui.attachment && event && !event.composedPath().some(node => node.getRootNode?.() === root && node.matches?.('.attachment-panel, .attachment-button, .phone-action-popup, .phone-select-popup'))) {
      ui.attachment = ''; root.querySelector('.attachment-panel')?.remove();
    }
    if (ui.modelsOpen && !event?.composedPath().some(node => node.getRootNode?.() === root && node.matches?.('.api-form'))) closeModels();
    if (ui.sourcesOpen && !event?.composedPath().some(node => node.getRootNode?.() === root && node.matches?.('.source-picker'))) closeSources();

  }
  function closeIdentityOptions() {
    ui.identityOwnersOpen = false;
    root.querySelector('.identity-popup')?.remove();
    root.querySelector('#identity-owner')?.setAttribute('aria-expanded', 'false');
  }
  function openIdentityOptions() {
    closeIdentityOptions(); ui.identityOwnersOpen = true;
    root.querySelector('.identity-picker')?.insertAdjacentHTML('beforeend', renderIdentityOptions(store.read(), ui));
    root.querySelector('#identity-owner')?.setAttribute('aria-expanded', 'true');
    root.querySelector('[data-identity-owner][aria-selected="true"]')?.focus({ preventScroll: true });
  }
  function editProfile(kind, id = '') {
    ui.editor = kind; ui.editId = id;
    const state = store.read();
    const person = kind === 'user' ? state.userProfile || { name: defaultUser } : state.contacts.find(item => item.id === id) || {};
    ui.profileDraft = Object.fromEntries(['name', 'nickname', 'avatar', ...(kind === 'contact' ? ['expression', 'language', 'background', 'identityOwnerId'] : [])].map(key => [key, person[key] || '']));
    ui.view = `${kind}-profile`; ui.chatMenu = false; ui.inboxMenu = false; setFeedback(null); render();
  }
  function keydown(event) {
    if (actionMenu.keydown(event) || selects.keydown(event)) return;
    if (ui.identityOwnersOpen || event.target.id === 'identity-owner') {
      if (event.key === 'Escape' && ui.identityOwnersOpen) { event.preventDefault(); event.stopPropagation(); closeIdentityOptions(); root.querySelector('#identity-owner')?.focus({ preventScroll: true }); return; }
      if (['ArrowDown', 'ArrowUp'].includes(event.key) && (event.target.id === 'identity-owner' || event.target.closest('.identity-popup'))) {
        event.preventDefault(); event.stopPropagation();
        if (!ui.identityOwnersOpen) openIdentityOptions();
        const options = [...root.querySelectorAll('[data-identity-owner]')], index = options.indexOf(event.target), step = event.key === 'ArrowDown' ? 1 : -1;
        options[index < 0 ? step > 0 ? 0 : options.length - 1 : (index + step + options.length) % options.length]?.focus({ preventScroll: true }); return;
      }
    }
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
    const sourceOption = event.target.closest('[data-api-source]'), sourceTrigger = event.target.id === 'api-source';
    if (sourceTrigger || ui.sourcesOpen && (sourceOption || event.key === 'Escape')) {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); closeSources(); root.querySelector('#api-source')?.focus(); return; }
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        if (sourceTrigger) openSources(direction);
        else {
          const options = [...root.querySelectorAll('[data-api-source]')], index = options.indexOf(sourceOption);
          options[(index + direction + options.length) % options.length]?.focus();
        }
        return;
      }
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
    if (ui.photo && event.key === 'Tab') { event.preventDefault(); event.stopPropagation(); root.querySelector('[data-action="close-photo"]')?.focus({ preventScroll: true }); return; }
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (ui.avatarMenuOpen) { dismissMenus(); root.querySelector('.avatar-menu-toggle')?.focus({ preventScroll: true }); }
      else if (ui.photo) closePhoto();
      else if (ui.notice) dismissPhoneNotice();
      else close();
    } else if (event.target.matches('input, textarea, select') || event.target.isContentEditable) {
      // Shadow 外只能看到宿主节点的焦点，须在根内阻止编辑键触发酒馆快捷键。
      event.stopPropagation();
    }
  }
  function click(event) {
    if (selects.click(event)) return;
    if (event.target.closest('button[data-action="dismiss"]')) { setFeedback(null); return; }
    if (ui.conflict) {
      const button = event.target.closest('button');
      if (!button || button.disabled) return;
      if (button.dataset.action === 'conflict-continue') { ui.conflict = false; setFeedback(null); render(); }
      if (button.dataset.action === 'conflict-disable') void perform('conflict', () => control.setEnabled(false), () => { ui.conflict = false; ui.view = 'settings'; entries.refreshVisibility?.(); onContextChange(); });
      return;
    }
    const content = event.target.closest('.message-original, .message-translation, .message-reply > span, .post-body, .post-excerpt, .social-caption, .social-comment, .comment-row p, .ls-copy, .ls-quote, .photo-description, .photo-viewer p, .location-message > strong, .location-message > small, .transfer-amount, .transfer-message > span:not(.card-label)');
    const selection = root.getSelection?.() || doc.getSelection();
    // 拖选正文后松开鼠标保留选区，点击导航或消息菜单会重绘正文。
    if (content && selection && !selection.isCollapsed && selection.containsNode(content, true)) return;
    if (event.target.matches('.photo-viewer')) { closePhoto(); return; }
    const button = event.target.closest('button');
    if (button?.disabled) return;
    if (button?.closest('.phone-action-popup')) closeActionMenu();
    if (button?.dataset.apiSource) {
      const value = button.dataset.apiSource; closeSources();
      if (value === 'manual') { fillApiDraft(true); render(); return; }
      const source = apiSettings.listSources().find(item => refKey(item.ref) === value);
      if (source) void perform('api', () => apiSettings.select(source.ref), () => fillApiDraft());
      return;
    }
    if (button?.dataset.liangshiHot !== undefined) {
      const id = button.dataset.liangshiHot;
      openLiangshiPage({ kind: 'hot-topic', id }, true, button);
      return;
    }
    if (button?.dataset.liangshiTopic !== undefined) { openLiangshiPage({ kind: 'topic', topic: button.dataset.liangshiTopic, source: button.dataset.liangshiTopicSource }, true, button); return; }
    if (button?.dataset.liangshiDetailTab) { ui.liangshiPage = { ...ui.liangshiPage, tab: button.dataset.liangshiDetailTab }; render(); return; }
    const liangshiPost = event.target.closest('[data-liangshi-open]');
    if (liangshiPost) { openLiangshiPage({ kind: 'post', id: liangshiPost.dataset.liangshiOpen, tab: liangshiPost.dataset.liangshiSection || 'comments' }, true, liangshiPost); return; }
    if (button?.dataset.liangshiTab) { ui.liangshiTrail = []; openLiangshiPage({ kind: 'feed', tab: button.dataset.liangshiTab }, false); return; }
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
    if (button.hasAttribute('data-identity-owner')) {
      ui.profileDraft.identityOwnerId = button.dataset.identityOwner;
      const label = button.textContent; closeIdentityOptions();
      const trigger = root.querySelector('#identity-owner'); if (trigger) { trigger.querySelector('span').textContent = label; trigger.focus({ preventScroll: true }); }
      return;
    }
    if (button.dataset.model) { ui.apiDraft.model = button.dataset.model; root.querySelector('#api-model').value = button.dataset.model; root.querySelector('.model-options').innerHTML = renderModelOptions(ui); return; }
    if (button.dataset.drawer) { const key = button.dataset.drawer; closeSources(); closeModels(); ui.drawers[key] = !ui.drawers[key]; render(); if (key === 'content' && ui.drawers.content) void refreshStorySmsStatus(); return; }
    if (button.dataset.tab) {
      showPage(apps.find(app => app.id === button.dataset.tab)?.view || button.dataset.tab);
      return;
    }
    if (button.dataset.contact || button.dataset.group) {
      openConversation(button.dataset.group || button.dataset.contact, Boolean(button.dataset.group)); return;
    }
    if (button.dataset.message) {
      const messageId = button.dataset.message, wasOpen = ui.selectedMessage === messageId;
      closeActionMenu();
      if (!wasOpen) {
        ui.selectedMessage = messageId;
        button.closest('.message-row')?.classList.add('is-selected');
        const selector = `${button.classList.contains('card-more') ? '.card-more' : '.bubble'}[data-message="${CSS.escape(messageId)}"]`;
        openActionMenu('短信操作', () => renderMessageMenu(store.read(), { ui, busy }), selector);
      }
      return;
    }
    if (button.dataset.post) { ui.forumScroll = { ...listPosition(button), tag: ui.forumTag }; ui.postId = button.dataset.post; ui.view = 'post'; setFeedback(null); render(); return; }
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
        else if (notice?.kind === 'forum-post') { ui.forumScroll = 0; ui.forumTag = ''; ui.postId = notice.id; showPage('post'); }
        else if (notice?.kind === 'liangshi-feed') { ui.liangshiTrail = []; openLiangshiPage({ kind: 'feed', tab: 'square' }, false); }
        else if (notice?.kind === 'liangshi-following') { ui.liangshiTrail = []; openLiangshiPage({ kind: 'feed', tab: 'following' }, false); }
        else if (notice?.kind === 'liangshi-hot') { ui.liangshiTrail = []; openLiangshiPage({ kind: 'feed', tab: 'hot' }, false); }
        else if (notice?.kind === 'liangshi-topic') { ui.liangshiTrail = [{ page: { kind: 'feed', tab: 'hot' }, scroll: 0 }]; openLiangshiPage({ kind: 'hot-topic', id: notice.id }, false); }
        else if (notice?.kind === 'liangshi-post') {
          const data = store.read().liangshi, topic = findLiangshiTopicForPost(data, notice.id);
          ui.liangshiTrail = isLiangshiUserPost(data, notice.id) ? [{ page: { kind: 'feed', tab: 'mine' }, scroll: 0 }] : isLiangshiFollowingPost(data, notice.id) ? [{ page: { kind: 'feed', tab: 'following' }, scroll: 0 }] : topic ? [{ page: { kind: 'feed', tab: 'hot' }, scroll: 0 }, { page: { kind: 'hot-topic', id: topic.id }, scroll: 0 }] : [];
          openLiangshiPage({ kind: 'post', id: notice.id }, false);
        }
        break;
      }
      case 'open-social-reply': dismissPhoneNotice(); openSocialReply(button.dataset.socialPost); break;
      case 'unlock': showPage('desktop'); break;
      case 'system-home': showPage('desktop'); break;
      case 'system-back': goBack(); break;
      case 'liangshi-back': goBack(); break;
      case 'liangshi-menu': {
        const id = button.dataset.liangshiId;
        if (ui.liangshiMenu === id) closeLiangshiMenu();
        else {
          closeActionMenu(); ui.liangshiMenu = id; button.setAttribute('aria-expanded', 'true');
          openActionMenu('本人微博操作', () => { const post = liangshi.getPost(id); return post ? renderLiangshiOwnMenu(post, busy) : ''; }, `[data-action="liangshi-menu"][data-liangshi-id="${CSS.escape(id)}"]`);
        }
        break;
      }
      case 'liangshi-reply': {
        const id = button.dataset.liangshiId, previous = ui.liangshiReplyDrafts.get(id);
        ui.liangshiReplyDrafts.set(id, { replyToId: button.dataset.liangshiComment, text: previous?.text || '' });
        render(); root.querySelector('#ls-reply-text')?.focus({ preventScroll: true }); break;
      }
      case 'liangshi-reply-cancel': ui.liangshiReplyDrafts.delete(button.dataset.liangshiId); render(); break;
      case 'liangshi-generate-replies':
      case 'liangshi-regenerate-replies': {
        const id = button.dataset.liangshiId, regenerate = button.dataset.action === 'liangshi-regenerate-replies'; closeLiangshiMenu();
        void perform(`liangshi-replies:${id}`, () => liangshi.generateReplies(id, { regenerate }), result => { if (result === null) setFeedback({ text: '暂时没有新的回应。' }); }); break;
      }
      case 'liangshi-edit': {
        const data = store.read().liangshi, post = data.posts.find(row => row.id === button.dataset.liangshiId), account = data.accounts.find(row => row.id === post?.authorId);
        if (post?.userAuthored !== true || account?.ownerId !== '@user') break;
        closeLiangshiMenu();
        ui.liangshiDraft = { postId: post.id, text: post.text, seed: post.text, imageDescription: post.image?.description || '', imageSeed: post.image?.description || '', translation: post.translation || '' };
        openLiangshiPage({ kind: 'compose' }); break;
      }
      case 'liangshi-delete': {
        const postId = button.dataset.liangshiId, content = doc.createElement('p'); closeLiangshiMenu(); content.textContent = '删除这条本人微博？';
        void dialog.custom({ title: '删除微博', content, confirmText: '删除', cancelText: '取消', danger: true, submit: () => true }).then(confirmed => {
          if (confirmed) void perform(`liangshi-delete:${postId}`, () => liangshi.deleteUser(postId), () => {
            if (ui.notice?.kind === 'liangshi-post' && ui.notice.id === postId) dismissPhoneNotice();
            if (ui.view === 'liangshi' && ui.liangshiPage.kind === 'post' && ui.liangshiPage.id === postId) { ui.liangshiTrail = []; openLiangshiPage({ kind: 'feed', tab: 'mine' }, false); }
          });
        }); break;
      }
      case 'liangshi-compose': {
        ui.liangshiDraft = { text: '', seed: '', imageDescription: '', imageSeed: '', translation: '' };
        openLiangshiPage({ kind: 'compose' }); break;
      }
      case 'liangshi-draft': {
        const draft = ui.liangshiDraft, before = { ...draft };
        void perform('liangshi-draft', () => liangshi.draftUser({ seed: before.seed, imageSeed: before.imageSeed }), result => {
          if (ui.view === 'liangshi' && ui.liangshiPage.kind === 'compose' && ui.liangshiDraft === draft && draft.text === before.text && draft.seed === before.seed && draft.imageSeed === before.imageSeed && draft.imageDescription === before.imageDescription) Object.assign(draft, result, { translation: result.translation || '' });
        }); break;
      }
      case 'liangshi-refresh': void perform('liangshi', () => liangshi.refresh(), () => { if (ui.view === 'liangshi' && ui.liangshiPage.kind === 'feed' && ui.liangshiPage.tab === 'square') { ui.liangshiTrail = []; ui.liangshiExpanded.clear(); } }); break;
      case 'liangshi-following-refresh': void perform('liangshi-following', () => liangshi.refreshFollowing(), () => { if (ui.view === 'liangshi' && ui.liangshiPage.kind === 'feed' && ui.liangshiPage.tab === 'following') { ui.liangshiTrail = []; ui.liangshiExpanded.clear(); } }); break;
      case 'liangshi-hot-refresh': void perform('liangshi-hot', () => liangshi.refreshHot()); break;
      case 'liangshi-topic-load':
      case 'liangshi-topic-refresh': { const id = ui.liangshiPage.id; void perform(`liangshi-topic:${id}`, () => liangshi.loadTopic(id, { refresh: button.dataset.action === 'liangshi-topic-refresh' })); break; }
      case 'liangshi-more': { const postId = ui.liangshiPage.id; void perform(`liangshi-more:${postId}`, () => liangshi.loadMore(postId), result => { if (result === null) setFeedback({ text: '暂时没有新的互动。' }); }); break; }
      case 'liangshi-like': {
        const postId = button.dataset.liangshiLike;
        let liked = false;
        void perform(`liangshi-like:${postId}`, () => liangshi.toggleLike(postId), post => { liked = post.userLiked; }).then(() => {
          if (liked && !doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            root.querySelector(`[data-liangshi-like="${CSS.escape(postId)}"] svg`)?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.2)', offset: .4 }, { transform: 'scale(1)' }], { duration: 200, easing: 'cubic-bezier(.16, 1, .3, 1)' });
          }
        });
        break;
      }
      case 'liangshi-image': {
        const postId = button.dataset.liangshiImage, id = button.dataset.liangshiRow, collection = button.dataset.liangshiCollection || 'comments';
        const readImage = () => { const post = store.read().liangshi?.posts.find(post => post.id === postId); return id && post ? liangshiInteractions(post, collection).find(row => row.id === id)?.image : post?.image; };
        if (readImage()?.path) void viewPhoto(readImage, button);
        else void perform(`liangshi-image:${postId}${id ? `:${id}` : ''}`, () => images.generateLiangshi(postId, { collection, id }));
        break;
      }
      case 'liangshi-expand': { const postId = button.dataset.liangshiId; ui.liangshiExpanded.has(postId) ? ui.liangshiExpanded.delete(postId) : ui.liangshiExpanded.add(postId); render(); break; }
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
          ui.socialAuthorId = authorId; showPage('social-profile', { sourceNode: button });
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
        const postId = button.dataset.socialImage, readImage = () => store.read().social?.posts.find(item => item.id === postId)?.image;
        if (readImage()?.path) void viewPhoto(readImage, button);
        else void perform(`social-image:${postId}`, () => images.generatePost(postId));
        break;
      }
      case 'restore-chat-background': {
        const draft = ui.view === 'group-profile' ? ui.groupDraft : ui.profileDraft;
        draft.background = ''; render(); break;
      }
      case 'open-calendar':
        ui.view = 'calendar'; ui.calendarOffset = 0; ui.calendarDay = null;
        setFeedback(null); render(); break;
      case 'calendar-prev': ui.calendarOffset--; ui.calendarDay = null; render(); break;
      case 'calendar-next': ui.calendarOffset++; ui.calendarDay = null; render(); break;
      case 'calendar-today': ui.calendarOffset = 0; ui.calendarDay = null; render(); break;
      case 'calendar-month': ui.calendarDay = null; render(); break;
      case 'authoring': ui.view = 'authoring'; setFeedback(null); render(); break;
      case 'back-authoring': goBack(); break;
      case 'export-card':
        void perform('export', () => authoring.exportScript({ coreUrl: ui.exportLocal ? LOCAL_CORE_URL : REMOTE_CORE_URL }), result => {
          const url = URL.createObjectURL(new Blob([JSON.stringify(result.script, null, 2)], { type: 'application/json' }));
          const link = doc.createElement('a'); link.href = url; link.download = result.filename; doc.body.append(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(url), 0);
          setFeedback({ text: '酒馆助手脚本已导出。' });
        });
        break;
      case 'attachments': ui.attachment = ui.attachment ? '' : 'menu'; ui.selectedMessage = ''; ui.chatMenu = false; render(); break;
      case 'choose-stickers': ui.attachment = 'stickers'; render(); break;
      case 'choose-location': ui.attachment = 'location'; ui.attachmentDraft = {}; render(); break;
      case 'choose-transfer': ui.attachment = 'transfer'; ui.attachmentDraft = { currency: 'CNY' }; render(); break;
      case 'close-attachment': ui.attachment = ''; render(); break;
      case 'close-photo': closePhoto(); break;
      case 'photo': {
        const message = store.read().conversations[id]?.find(item => item.id === button.dataset.photo);
        if (message?.image.path) void viewPhoto(() => store.read().conversations[id]?.find(item => item.id === button.dataset.photo)?.image, button);
        else void perform(`image:${button.dataset.photo}`, () => images.generate(id, button.dataset.photo));
        break;
      }
      case 'forum-reply': {
        const previous = ui.forumDrafts.get(ui.postId); ui.forumDrafts.set(ui.postId, { text: previous?.text || '', replyToId: button.dataset.forumComment });
        render(); root.querySelector('.forum-comment-form')?.scrollIntoView({ block: 'nearest' }); root.querySelector('#forum-comment-text')?.focus({ preventScroll: true }); break;
      }
      case 'forum-reply-cancel': { const previous = ui.forumDrafts.get(ui.postId); ui.forumDrafts.set(ui.postId, { text: previous?.text || '', replyToId: '' }); render(); break; }
      case 'forum-jump': {
        const target = button.dataset.forumComment === ui.postId ? root.querySelector('.post-detail') : [...root.querySelectorAll('.comment-row[data-forum-comment]')].find(row => row.dataset.forumComment === button.dataset.forumComment);
        if (target) {
          target.scrollIntoView({ block: 'center' }); target.focus({ preventScroll: true });
          if (!doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            const body = target.querySelector(':scope > div') || target;
            body.animate([{ backgroundColor: doc.defaultView.getComputedStyle(target).getPropertyValue('--pp-pale') }, { backgroundColor: doc.defaultView.getComputedStyle(body).backgroundColor }], { duration: 1000, easing: 'cubic-bezier(.16,1,.3,1)' });
          }
        }
        break;
      }
      case 'forum-vote': {
        const vote = button.dataset.forumVote; ui.forumVotes.set(ui.postId, ui.forumVotes.get(ui.postId) === vote ? '' : vote); render();
        if (!doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)').matches) root.querySelector(`[data-forum-vote="${vote}"]`)?.animate([{ transform: 'scale(1)' },{ transform: 'scale(1.12)', offset: .4 },{ transform: 'scale(1)' }], { duration: 200, easing: 'cubic-bezier(.16,1,.3,1)' });
        break;
      }
      case 'forum-more': { const id = ui.postId; void perform(`forum-more:${id}`, () => forum.loadMore(id), result => { if (result === null) setFeedback({ text: '暂时没有新的回帖。' }); }); break; }
      case 'forum-tag': ui.forumTag = button.dataset.forumTag; render(); root.querySelector('.phone-main').scrollTop = 0; break;
      case 'forum-image': { const id = ui.postId, commentId = button.dataset.forumComment, readImage = () => { const post = store.read().forum?.posts.find(post => post.id === id); return commentId && post ? forumComments(post).find(row => row.id === commentId)?.image : post?.image; }; if (readImage()?.path) void viewPhoto(readImage, button); else void perform(`forum-image:${id}${commentId ? `:${commentId}` : ''}`, () => images.generateForum(id, commentId)); break; }
      case 'back-inbox':
      case 'back-forum': goBack(); break;
      case 'profile': editProfile('contact', id); break;
      case 'edit-user': editProfile('user'); break;
      case 'add-contact': editProfile('contact'); break;
      case 'inbox-menu': {
        const wasOpen = ui.inboxMenu; closeActionMenu();
        if (!wasOpen) { ui.inboxMenu = true; openActionMenu('通讯录操作', () => renderInboxMenu(busy), '[data-action="inbox-menu"]'); }
        break;
      }
      case 'add-group': editGroup(); break;
      case 'edit-group': editGroup(ui.groupId); break;
      case 'back-group': goBack(); break;
      case 'organize': ui.inboxMenu = false; void perform('directory', () => directory.organize(), result => { setFeedback({ text: result.contacts.length || result.groups.length ? `新增 ${result.contacts.length} 位联系人、${result.groups.length} 个群聊。` : '没有需要新增的联系人或群聊。' }); onContextChange(); }); break;
      case 'remove-contact':
      case 'remove-group': {
        if (busy.has('remove')) break;
        const group = button.dataset.action === 'remove-group';
        const key = group ? ui.view === 'group-profile' ? ui.groupEditId : ui.groupId : ui.view === 'contact-profile' ? ui.editId : ui.contactId;
        const person = (group ? store.read().groups || [] : store.read().contacts).find(item => item.id === key);
        const item = { kind: group ? 'group' : 'contact', id: key, name: person.name }, content = doc.createElement('div');
        content.innerHTML = renderDeletion(item);
        void dialog.custom({ title: `删除${group ? '群聊' : '联系人'}`, content, confirmText: '确认删除', cancelText: '取消', danger: true, dismissOnBackdrop: true, submit: () => true }).then(confirmed => {
          if (confirmed) void perform('remove', () => item.kind === 'group' ? store.deleteGroup(item.id) : store.deleteContact(item.id), () => { ui.drafts.delete(item.id); ui.selectedMessage = ''; ui.profileDraft = {}; ui.groupDraft = {}; ui.view = 'inbox'; onContextChange(); });
        });
        break;
      }
      case 'back-profile': goBack(); break;
      case 'identity-menu': if (ui.identityOwnersOpen) closeIdentityOptions(); else openIdentityOptions(); break;
      case 'avatar-menu': {
        const wasOpen = ui.avatarMenuOpen; closeActionMenu();
        if (!wasOpen) { ui.avatarMenuOpen = true; openActionMenu('头像操作', () => renderAvatarMenu(root.querySelector('.avatar-menu-toggle')?.dataset.avatarCanRestore === 'true'), '.avatar-menu-toggle'); }
        break;
      }
      case 'upload-avatar': root.querySelector('.avatar-picker input[type="file"]')?.click(); break;
      case 'remove-avatar': {
        ui.avatarMenuOpen = false;
        const draft = ui.view === 'group-profile' ? ui.groupDraft : ui.profileDraft;
        draft.avatar = ''; if (ui.editor === 'contact' && ui.view === 'contact-profile') draft.automaticAvatar = false;
        render(); root.querySelector('.avatar-menu-toggle')?.focus({ preventScroll: true }); break;
      }
      case 'restore-avatar': {
        ui.avatarMenuOpen = false;
        const draft = ui.profileDraft, current = store.read().contacts.find(person => person.id === ui.editId);
        draft.avatar = isCameoAvatar(draft.avatar) ? draft.avatar : isCameoAvatar(current?.avatar) ? current.avatar : createCameoAvatar();
        draft.automaticAvatar = true; render(); root.querySelector('.avatar-menu-toggle')?.focus({ preventScroll: true }); break;
      }
      case 'refine-style': {
        const draft = ui.profileDraft, original = draft.expression, contactId = ui.editId;
        void perform('style', () => messages.refineOnlineStyle(contactId), result => {
          if (draft.expression === original) draft.expression = result;
          else setFeedback({ text: '你已手动修改线上方式，保留当前编辑。' });
        });
        break;
      }
      case 'chat-menu':
        if (ui.chatMenu) closeActionMenu();
        else { closeActionMenu(); ui.chatMenu = true; ui.selectedMessage = ''; openActionMenu('聊天选项', () => renderChatMenu(store.read(), { ui, busy }), '[data-action="chat-menu"]'); }
        break;
      case 'clear-chat': ui.confirmClear = true; ui.chatMenu = false; render(); break;
      case 'cancel-clear': ui.confirmClear = false; render(); break;
      case 'confirm-clear': {
        const anchor = ui.batch;
        void perform(`clear:${id}`, () => store.clearConversation(id, anchor), () => { ui.confirmClear = false; ui.selectedMessage = ''; ui.drafts.delete(id); onContextChange(); }); break;
      }
      case 'delete-message': {
        const messageId = button.dataset.messageTarget;
        void perform(`delete:${id}`, () => store.deleteMessage(id, messageId), () => { ui.selectedMessage = ''; onContextChange(); }); break;
      }
      case 'reply-message': {
        if (ui.view !== 'group-chat') break;
        ui.replyToId = button.dataset.messageTarget; ui.selectedMessage = ''; render(); root.querySelector('#sms-draft')?.focus({ preventScroll: true }); break;
      }
      case 'cancel-reply': ui.replyToId = ''; render(); root.querySelector('#sms-draft')?.focus({ preventScroll: true }); break;
      case 'earlier': ui.visibleMessages += 60; render(); break;
      case 'history': ui.historyOpen = !ui.historyOpen; ui.selectedMessage = ''; render(); break;
      case 'earlier-history': ui.visibleHistory += 60; render(); break;
      case 'install-story-sms': void perform('story-sms-install', () => storySmsInstaller.install(), result => { ui.storySmsStatus = { state: 'installed', bookName: result.bookName }; }); break;
      case 'close': close(); break;
      case 'send': {
        const text = (ui.drafts.get(id) || '').trim();
        if (text) void perform(`send:${id}`, () => ui.view === 'group-chat' ? service.send(id, text, { replyToId: ui.replyToId }) : service.send(id, text), () => { if ((ui.drafts.get(id) || '').trim() === text) ui.drafts.set(id, ''); ui.replyToId = ''; onContextChange(); });
        break;
      }
      case 'continue': void perform(`continue:${id}`, () => service.continueChat(id), onContextChange); break;
      case 'refresh': void perform('forum', () => forum.refresh(), () => { const ids = new Set(store.read().forum.posts.map(post => post.id)); for (const id of ui.forumDrafts.keys()) if (!ids.has(id)) ui.forumDrafts.delete(id); for (const id of ui.forumVotes.keys()) if (!ids.has(id)) ui.forumVotes.delete(id); }); break;
      case 'restore-wallpaper': { const theme = store.read().theme; void perform('wallpaper', () => wallpaper.restore(theme)); break; }
      case 'sources-menu': if (ui.sourcesOpen) closeSources(); else openSources(); break;
      case 'models-menu': closeSources(); ui.modelsOpen = !ui.modelsOpen; render(); if (ui.modelsOpen) root.querySelector('#model-search').focus(); break;
      case 'api-save-as': {
        const form = root.querySelector('.api-form'); if (!form.reportValidity()) break;
        const draft = { ...ui.apiDraft }, ref = manualApi() ? null : apiSettings.getSelected();
        const content = doc.createElement('div'), label = doc.createElement('label'), input = doc.createElement('input');
        label.className = 'field-label'; label.htmlFor = 'api-preset-name'; label.textContent = '预设名称';
        input.id = 'api-preset-name'; input.setAttribute('aria-label', '预设名称'); input.required = true;
        input.value = apiSettings.listSources().find(source => refKey(source.ref) === refKey(ref))?.label || '新连接';
        input.addEventListener('input', () => input.setCustomValidity('')); content.append(label, input);
        void dialog.custom({ title: '另存为预设', content, confirmText: '保存', cancelText: '取消', submit: () => {
          input.setCustomValidity(input.value.trim() ? '' : '请输入预设名称。'); return input.reportValidity();
        } }).then(confirmed => { if (confirmed) void perform('api', () => apiSettings.saveAs(draft, input.value, ref), () => { fillApiDraft(); setFeedback({ text: '预设已另存。' }); }); });
        break;
      }
      case 'api-delete': {
        const ref = apiSettings.getSelected(), source = apiSettings.listSources().find(item => refKey(item.ref) === refKey(ref));
        if (!source || manualApi()) break;
        const content = doc.createElement('p'); content.textContent = `删除「${source.label}」？这是共享预设，使用它的其他插件也会失去这条连接；两三事将改为未配置。`;
        void dialog.custom({ title: '删除 API 预设', content, confirmText: '删除', cancelText: '取消', danger: true, submit: () => true }).then(confirmed => {
          if (confirmed) void perform('api', () => apiSettings.deletePreset(ref), () => { fillApiDraft(true); setFeedback({ text: '预设已删除。' }); });
        });
        break;
      }
      case 'fetch-models': {
        const draft = { ...ui.apiDraft }, ref = manualApi() ? null : apiSettings.getSelected();
        void perform('models', () => apiSettings.fetchModels(draft, ref), models => {
          if (ui.apiDraft.url !== draft.url || ui.apiDraft.key !== draft.key || refKey(manualApi() ? null : apiSettings.getSelected()) !== refKey(ref)) { setFeedback({ text: '连接已修改，请重新拉取模型。' }); return; }
          ui.models = models; ui.modelSearch = ''; ui.modelsOpen = true;
          if (!ui.apiDraft.model?.trim()) ui.apiDraft.model = models[0];
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
    const replyForm = event.target.closest('.ls-reply-form');
    if (replyForm && event.target.name === 'reply') { const draft = ui.liangshiReplyDrafts.get(replyForm.dataset.liangshiReplyForm); if (draft) draft.text = event.target.value; }
    const forumComment = event.target.closest('.forum-comment-form');
    if (forumComment && event.target.name === 'comment') { const id = forumComment.dataset.forumPost, draft = ui.forumDrafts.get(id) || { text: '', replyToId: '' }; draft.text = event.target.value; ui.forumDrafts.set(id, draft); }
    const socialComment = event.target.closest('.social-comment-form');
    if (socialComment && event.target.name === 'comment') ui.socialDrafts.set(socialComment.dataset.socialCommentForm, event.target.value);
    if (event.target.closest('.ls-compose-form') && ui.liangshiDraft) {
      const draft = ui.liangshiDraft;
      if (event.target.name === 'text') { draft.text = event.target.value; draft.seed = event.target.value; draft.translation = ''; root.querySelector('.ls-draft-translation')?.remove(); }
      if (event.target.name === 'imageDescription') { draft.imageDescription = event.target.value; draft.imageSeed = event.target.value; }
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
      if (event.target.name === 'avatar') draft.automaticAvatar = false;
      if (event.target.name === 'avatar' || ['name', 'nickname'].includes(event.target.name) && !root.querySelector('.profile-avatar img')) root.querySelector('.profile-avatar').innerHTML = avatar(draft);
    }
  }
  function change(event) {
    if (event.target.id === 'default-language') {
      void perform('default-language', () => store.setDefaultLanguage(event.target.value), onContextChange);
    }
    if (event.target.id === 'image-provider') void perform('image-provider', () => imageProviders.select(event.target.value));
    if (event.target.id === 'export-source') { ui.exportLocal = event.target.value === 'local'; render(); }
    if (event.target.id === 'phone-enabled') {
      const enabled = event.target.checked;
      void perform('enabled', () => control.setEnabled(enabled), () => { ui.view = 'settings'; entries.refreshVisibility?.(); onContextChange(); if (enabled) { fillDefaultAvatars(); onEnable(); } });
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
      void perform('entry', () => entries.set(key, value), result => { if (result?.notice) setFeedback({ text: result.notice }); });
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
      ui.avatarMenuOpen = false;
      void perform('avatar', async () => {
        avatarCropper = mountAvatarCropper(surface, file);
        try { return await avatarCropper.result; }
        finally { avatarCropper = null; }
      }, value => { if (value) { draft.avatar = value; draft.automaticAvatar = false; } }).then(() => root.querySelector('.avatar-menu-toggle')?.focus({ preventScroll: true }));
    }
  }
  function submit(event) {
    if (event.target.matches('.forum-comment-form')) {
      event.preventDefault(); const id = event.target.dataset.forumPost, draft = ui.forumDrafts.get(id); if (!draft) return;
      const before = { ...draft };
      void perform(`forum-comment:${id}`, () => forum.publishComment(id, before), () => { if (ui.forumDrafts.get(id) === draft && draft.text === before.text && draft.replyToId === before.replyToId) ui.forumDrafts.delete(id); }); return;
    }
    const replyForm = event.target.closest('.ls-reply-form');
    if (replyForm) {
      event.preventDefault(); const id = replyForm.dataset.liangshiReplyForm, draft = ui.liangshiReplyDrafts.get(id);
      if (!draft) return;
      const before = { ...draft };
      void perform(`liangshi-reply:${id}`, () => liangshi.publishReply(id, before), () => {
        if (ui.liangshiReplyDrafts.get(id) === draft && draft.text === before.text && draft.replyToId === before.replyToId) ui.liangshiReplyDrafts.delete(id);
      }); return;
    }

    event.preventDefault();
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
    if (event.target.matches('.ls-compose-form')) {
      const draft = ui.liangshiDraft, before = { ...draft };
      void perform(before.postId ? `liangshi-edit:${before.postId}` : 'liangshi-publish', () => before.postId ? liangshi.editUser(before.postId, before) : liangshi.publishUser(before), post => {
        if (ui.view === 'liangshi' && ui.liangshiPage.kind === 'compose' && ui.liangshiDraft === draft && draft.text === before.text && draft.imageDescription === before.imageDescription) {
          ui.liangshiTrail = [{ page: { kind: 'feed', tab: 'mine' }, scroll: 0 }]; openLiangshiPage({ kind: 'post', id: post.id }, false);
        } else pushPhoneNotice({ kind: 'liangshi-post', id: post.id });
      });
    }
    if (event.target.matches('.api-form')) void perform('api', () => manualApi() ? apiSettings.saveManual({ ...ui.apiDraft }) : apiSettings.saveCurrent({ ...ui.apiDraft }), () => { fillApiDraft(); setFeedback({ text: '连接已保存。' }); });
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
  fillDefaultAvatars();
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
      fillDefaultAvatars();
      recoverVisibleImages();
      windowControls.refresh();
    },
    refreshTime() {
      clock.refresh();
      if (element.hidden) return;
      if (inChat() || ['inbox', 'calendar', 'desktop'].includes(ui.view)) render();
      if (ui.view === 'home') {
        const weather = readWeather(), label = root.querySelector('.lock-weather');
        label.title = weather.source === 'decoration' ? '装饰天气' : '构画剧情天气';
        label.lastElementChild.textContent = `${weather.text} ${weather.temperature}`;
      }
    },
    dispose() {
      setFeedback(null);
      selects.close(); actionMenu.close(); dialog.dispose(); updatesView?.dispose();
      dismissPhoneNotice();
      avatarCropper?.close();
      unsubscribeAppearance();
      clock.stop();
      particles?.dispose();
      chatScroll.dispose(); editing.dispose();
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
