import { createHostAdapter } from './src/host.js';
import { createPhoneStore } from './src/store.js';
import { createApiSettings, createModelClient } from './src/api.js';
import { createContextReader, createBackflowService } from './src/context.js';
import { createMessageService } from './src/messages.js';
import { createForumService } from './src/forum.js';
import { createGroupService } from './src/groups.js';
import { createDirectoryService } from './src/directory.js';
import { mountPhone } from './src/ui.js';
import { readPhoneTime } from './src/time.js';
import { readTimeline } from './src/timeline.js';
import { createWallpaperService } from './src/wallpaper.js';
import { createPhoneEntries } from './src/entries.js';
import { createPhoneControl } from './src/control.js';
import { createPhoneImageService } from './src/phone-images.js';
import { readLockWeather } from './src/weather.js';
export { createPhoneControl, createPhoneImageService };

export function initialize({ host = createHostAdapter(), documentRef = document, qqjBridgeProvider } = {}) {
  let phone, targetId, activeRequests = 0;
  const entries = createPhoneEntries({ host, documentRef, open, toggle: () => phone?.isOpen ? phone.close() : open() });
  const onBusyChange = value => { activeRequests += value ? 1 : -1; entries.fab.setBusy(activeRequests > 0); };
  const unsubscribe = host.onBeforeMainGeneration(async (type, _params, dryRun) => {
    if (dryRun || ['quiet', 'impersonate'].includes(type)) return;
    const target = host.captureChat();
    host.setPrompt('');
    const control = createPhoneControl({ host, target });
    if (!control.isEnabled()) return;
    const store = createPhoneStore({ target });
    const modelClient = createModelClient({ host, sourceProvider: createApiSettings({ host }), onBusyChange });
    try { host.setPrompt(await createBackflowService({ target, store, modelClient, isEnabled: control.isEnabled }).prepare()); }
    catch (error) { host.reportError(`手机摘要未生成，本次正文未带入手机消息。${error.message || '请检查手机生成连接后重试。'}`); }
  });
  const unsubscribeTime = host.onStoryChanged(() => phone?.refreshTime());
  function open() {
    const target = host.captureChat();
    if (target.embeddedPhone) host.reportNotice('这张角色卡也带有两三事。建议在设置顶部关闭其中一份；同时开启可能重复生成或回流。');
    if (phone && targetId === target.id) { phone.open(); return; }
    phone?.dispose();
    targetId = target.id;
    const control = createPhoneControl({ host, target });
    let currentPhone;
    const store = createPhoneStore({ target, assertEnabled: control.assertEnabled, isReading: id => currentPhone?.isReading(id) });
    const apiSettings = createApiSettings({ host, onBusyChange });
    const client = createModelClient({ host, sourceProvider: apiSettings, onBusyChange });
    const modelClient = { async complete(request) { control.assertEnabled(); const answer = await client.complete(request); control.assertEnabled(); return answer; } };
    const contextReader = createContextReader({ target, store, qqjBridgeProvider });
    currentPhone = mountPhone({ mount: documentRef.documentElement, store, defaultUser: target.user, readTime: () => readPhoneTime(target.messages), readTimeline: () => readTimeline(target.messages),
      messages: createMessageService({ target, store, contextReader, modelClient }),
      groups: createGroupService({ target, store, contextReader, modelClient }),
      directory: createDirectoryService({ store, contextReader, modelClient }),
      forum: createForumService({ store, contextReader, modelClient }), apiSettings,
      wallpaper: createWallpaperService({ host, store }), entries,
      control, images: createPhoneImageService({ store, modelClient, assertEnabled: control.assertEnabled, readBatch: () => readTimeline(target.messages), onBusyChange, defaultUser: target.user }), readWeather: readLockWeather,
      onContextChange: () => host.setPrompt(''),
      onClose: () => entries.focus(),
    });
    phone = currentPhone;
  }
  return { open, dispose() { phone?.dispose(); unsubscribe(); unsubscribeTime(); entries.dispose(); host.setPrompt(''); } };
}

if (globalThis.SillyTavern?.getContext || globalThis.Luker?.getContext) initialize();
