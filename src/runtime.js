import { createHostAdapter } from './host.js';
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
export { createPhoneControl, createPhoneImageService };

export function initialize({ host = createHostAdapter(), documentRef = document, qqjBridgeProvider, preset } = {}) {
  const initialState = preset ? stateFromPreset(preset) : undefined;
  const makeStore = (target, options = {}) => createPhoneStore({ target, initialState, ...options });
  let phone, targetId, activeRequests = 0;
  const entries = createPhoneEntries({ host, documentRef, open, defaults: preset?.entries, initialTheme: initialState?.theme, toggle: () => phone?.isOpen ? phone.close() : open() });
  const onBusyChange = value => { activeRequests += value ? 1 : -1; entries.fab.setBusy(activeRequests > 0); };
  const unsubscribe = host.onBeforeMainGeneration(async (type, _params, dryRun) => {
    if (dryRun || ['quiet', 'impersonate'].includes(type)) return;
    const target = host.captureChat();
    host.setPrompt('');
    const control = createPhoneControl({ host, target });
    if (!control.isEnabled()) return;
    const store = makeStore(target);
    const modelClient = createModelClient({ host, sourceProvider: createApiSettings({ host }), onBusyChange });
    try { host.setPrompt(await createBackflowService({ target, store, modelClient, isEnabled: control.isEnabled }).prepare()); }
    catch (error) { host.reportError(`手机摘要未生成，本次正文未带入手机消息。${error.message || '请检查手机生成连接后重试。'}`); }
  });
  const unsubscribeTime = host.onStoryChanged(() => phone?.refreshTime());
  function open() {
    const target = host.captureChat();
    if (host.mode !== 'embedded' && target.embeddedPhone) host.reportNotice('这张角色卡也带有两三事。建议在设置顶部关闭其中一份；同时开启可能重复生成或回流。');
    if (phone && targetId === target.id) { phone.open(); return; }
    phone?.dispose();
    targetId = target.id;
    const control = createPhoneControl({ host, target });
    let currentPhone;
    const store = makeStore(target, { assertEnabled: control.assertEnabled, isReading: id => currentPhone?.isReading(id) });
    const apiSettings = createApiSettings({ host, onBusyChange });
    const client = createModelClient({ host, sourceProvider: apiSettings, onBusyChange });
    const modelClient = { async complete(request) { control.assertEnabled(); const answer = await client.complete(request); control.assertEnabled(); return answer; } };
    const calendar = createCalendarReader();
    const contextReader = createContextReader({ target, store, qqjBridgeProvider, calendar });
    currentPhone = mountPhone({ mount: documentRef.documentElement, store, defaultUser: target.user, readTime: () => readPhoneTime(target.messages), readTimeline: () => readTimeline(target.messages),
      messages: createMessageService({ target, store, contextReader, modelClient }),
      groups: createGroupService({ target, store, contextReader, modelClient }),
      directory: createDirectoryService({ store, contextReader, modelClient }),
      forum: createForumService({ store, contextReader, modelClient }), apiSettings, calendar,
      wallpaper: createWallpaperService({ host, store }), entries, authoring: createAuthoringService({ host, store, readEntries: entries.read }), mode: host.mode,
      control, images: createPhoneImageService({ store, modelClient, assertEnabled: control.assertEnabled, readBatch: () => readTimeline(target.messages), onBusyChange, defaultUser: target.user }), readWeather: readLockWeather,
      onContextChange: () => host.setPrompt(''),
      onClose: () => entries.focus(),
    });
    phone = currentPhone;
  }
  return { open, dispose() { phone?.dispose(); unsubscribe(); unsubscribeTime(); entries.dispose(); host.setPrompt(''); } };
}
