import { getSharedBodyWrappers } from './shared-body-wrappers.js';
import { initializeSharedProcessingPrompt } from './shared-processing-prompt.js';
import { createHostAdapter, renderUpdateMarkdown } from './host.js';
import { createPhoneStore } from './store.js';
import { createApiSettings, createModelClient } from './api.js';
import { createContextReader, createBackflowService } from './context.js';
import { createMessageService } from './messages.js';
import { createForumService } from './forum.js';
import { createGroupService } from './groups.js';
import { createDirectoryService } from './directory.js';
import { mountPhone } from './ui.js';
import { readPhoneTime } from './time.js';
import { readTimeline } from './timeline.js';
import { createWallpaperService } from './wallpaper.js';
import { createPhoneEntries } from './entries.js';
import { createPhoneControl } from './control.js';
import { createPhoneImageService } from './phone-images.js';
import { readLockWeather } from './weather.js';
import { createAuthoringService, stateFromPreset } from './authoring.js';
import { createCalendarReader } from './calendar.js';
import { createSocialService } from './social.js';
import { createLiangshiService } from './liangshi.js';
import { createImageFiles } from './image-files.js';
import { createImageProviders } from './image-providers.js';
import { createAppearanceSettings } from './appearance.js';
import { createPluginUpdates } from './plugin-updates.js';
import { createEmbeddedUpdates } from './embedded-updates.js';
import { UPDATE_NOTICE_PATH } from './release.js';
import { VERSION } from './version.js';
import { createMemorySources } from './memory-sources.js';
import { createStorySmsInstaller, syncStorySms } from './story-sms.js';
export { createPhoneControl, createPhoneImageService };

export function initialize({ mode = 'standalone', host = createHostAdapter({ mode }), documentRef = document, qqjBridgeProvider, preset, coreUrl, release, updateError, replaceCore } = {}) {
  initializeSharedProcessingPrompt(host.readSettings(), host.saveSettings);
  const updates = host.mode === 'embedded'
    ? createEmbeddedUpdates({ coreUrl, version: VERSION, release, updateError, replaceCore })
    : createPluginUpdates({ moduleUrl: import.meta.url, extensionTypes: () => host.readExtensionTypes(), headers: () => host.getRequestHeaders(), noticePath: UPDATE_NOTICE_PATH });
  const wrapperSettingsProvider = () => ({ ...getSharedBodyWrappers(host.readSettings()) });
  const initialState = preset ? stateFromPreset(preset) : undefined;
  const files = createImageFiles({ host });
  const imageProviders = createImageProviders({ host });
  const appearance = createAppearanceSettings({ host, documentRef });
  const makeStore = (target, options = {}) => createPhoneStore({ target, initialState, removeImages: files.remove, ...options });
  let phone, phoneTarget, phoneStore, activeRequests = 0;
  const entries = createPhoneEntries({ host, documentRef, open, defaults: preset?.entries,
    isEnabled: () => createPhoneControl({ host, target: host.captureChat() }).isEnabled(),
    toggle: () => phone?.isOpen && phone.isFrontmost ? phone.close() : open() });
  const unsubscribeEntries = host.onChatChanged?.(entries.refreshVisibility);
  const onBusyChange = value => { activeRequests += value ? 1 : -1; entries.fab.setBusy(activeRequests > 0); };
  const unsubscribe = host.onBeforeMainGeneration(async (type, _params, dryRun) => {
    if (dryRun || ['quiet', 'impersonate'].includes(type)) return;
    const target = host.captureChat();
    host.setPrompt('');
    const control = createPhoneControl({ host, target });
    if (!control.isEnabled()) return;
    const store = makeStore(target);
    const modelClient = createModelClient({ host, sourceProvider: createApiSettings({ host }), onBusyChange });
    try { host.setPrompt(await createBackflowService({ target, store, modelClient, isEnabled: control.isEnabled, wrapperSettingsProvider }).prepare(type)); }
    catch (error) { host.reportError(`手机参考准备失败，本次正文未带入手机消息。${error.message || '请检查手机生成连接后重试。'}`); }
  });
  const boundTo = target => phone && phoneTarget.id === target.id && phoneTarget.metadata === target.metadata;
  function synchronizeStory(target, store, currentPhone) {
    const failed = error => host.reportError(`主楼短信未能同步。${error.message || '请检查酒馆连接。'}`);
    try {
      if (createPhoneControl({ host, target }).isEnabled()) {
        const synced = syncStorySms({ target, store });
        if (synced) return synced.then(() => currentPhone?.refreshTime()).catch(failed);
      }
      currentPhone?.refreshTime();
    } catch (error) { failed(error); }
  }
  const unsubscribeTime = host.onStoryChanged(() => {
    const target = host.captureChat(), currentPhone = boundTo(target) ? phone : undefined;
    const control = createPhoneControl({ host, target });
    return synchronizeStory(target, currentPhone ? phoneStore : makeStore(target, { assertEnabled: control.assertEnabled }), currentPhone);
  });
  function open() {
    const target = host.captureChat();
    // 宿主首次加载聊天会替换 metadata 根；重开时让窗口绑定实际载入的档案。
    if (boundTo(target)) {
      phone.open();
      void synchronizeStory(target, phoneStore, phone);
      return;
    }
    phone?.dispose();
    phoneTarget = target;
    const control = createPhoneControl({ host, target });
    let currentPhone;
    const store = makeStore(target, { assertEnabled: control.assertEnabled, isReading: id => currentPhone?.isReading(id), onIncomingMessage: id => currentPhone?.notifyMessage(id) });
    phoneStore = store;
    const apiSettings = createApiSettings({ host, onBusyChange });
    const client = createModelClient({ host, sourceProvider: apiSettings, onBusyChange });
    const modelClient = { async complete(request) { control.assertEnabled(); const answer = await client.complete(request); control.assertEnabled(); return answer; } };
    const calendar = createCalendarReader();
    const memorySources = createMemorySources({ target, qqjBridgeProvider, settingsProvider: host.readSettings });
    const contextReader = createContextReader({ target, store, qqjBridgeProvider, calendar, wrapperSettingsProvider, memorySources });
    currentPhone = mountPhone({ mount: documentRef.documentElement, store, qqjBridgeProvider, defaultUser: target.user, readTime: () => readPhoneTime(target.messages), readTimeline: () => readTimeline(target.messages),
      messages: createMessageService({ target, store, contextReader, modelClient }),
      groups: createGroupService({ target, store, contextReader, modelClient }),
      directory: createDirectoryService({ store, contextReader, modelClient }),
      forum: createForumService({ store, contextReader, modelClient }), apiSettings, calendar, storySmsInstaller: createStorySmsInstaller({ host }),
      social: createSocialService({ store, contextReader, modelClient, defaultUser: target.user, isReadingPost: id => currentPhone?.isReadingSocial(id) }),
      liangshi: createLiangshiService({ store, contextReader, modelClient }),
      wallpaper: createWallpaperService({ host, store }), entries, appearance, authoring: createAuthoringService({ host, store, readEntries: entries.read }), mode: host.mode,
      updates, renderUpdateMarkdown, notifyUpdate: notification => {
        if (notification.kind === 'error') host.reportError(notification.text);
        else if (globalThis.toastr?.success) globalThis.toastr.success(notification.text);
        else globalThis.alert?.(notification.text);
      },
      control, imageProviders, images: createPhoneImageService({ store, modelClient, files, providers: imageProviders, assertEnabled: control.assertEnabled, onBusyChange, defaultUser: target.user }), readWeather: readLockWeather,
      onContextChange: () => host.setPrompt(''),
      onEnable: () => { void synchronizeStory(target, store, currentPhone); },
      onClose: () => entries.focus(),
    });
    phone = currentPhone;
    // 先建立唯一组件，入口连续点击仍复用同一store；保存完成只刷新本组件。
    void synchronizeStory(target, store, currentPhone);
  }
  return { open, dispose(options) { phone?.dispose(); unsubscribe(); unsubscribeTime(); unsubscribeEntries?.(); entries.dispose(options); host.setPrompt(''); } };
}
