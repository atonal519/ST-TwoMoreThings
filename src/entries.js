import { createFab } from './ui/fab.js';
import { icon } from './ui/shared.js';
import { syncQuickReply } from './quick-reply.js';

export function createPhoneEntries({ host, documentRef, open, toggle, defaults = {}, isEnabled = () => true }) {
  const embedded = host.mode === 'embedded', label = embedded ? '两三事 · 随卡' : '两三事', settingsKey = host.phoneSettingsKey || 'pocketPhone';
  const qr = embedded ? { setName: label, command: host.openCommand } : {};
  const launcher = documentRef.createElement('div');
  launcher.id = embedded ? 'pocket-phone-card-launch' : 'pocket-phone-launch'; launcher.className = 'list-group-item flex-container flexGap5';
  launcher.style.cssText = 'display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;white-space:nowrap';
  launcher.setAttribute('role', 'button'); launcher.tabIndex = 0;
  launcher.setAttribute('aria-label', `打开${label}`);
  launcher.innerHTML = `<span class="extensionsMenuExtensionButton" style="flex:none">${icon('phone')}</span><span>${label}</span>`;
  launcher.querySelector('svg').style.cssText = 'display:block;flex:none;width:.9em;height:.9em';
  const menu = documentRef.querySelector('#sp_wand_container') || documentRef.querySelector('#extensionsMenu') || documentRef.querySelector('#extensions_settings2') || documentRef.body;
  menu.append(launcher);
  const launch = () => { try { open(); } catch (error) { host.reportError(error.message || '两三事暂时无法打开，请刷新页面后重试。'); } };
  const keyOpen = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); launch(); } };
  launcher.addEventListener('click', launch); launcher.addEventListener('keydown', keyOpen);
  const fab = createFab({ documentRef, windowRef: documentRef.defaultView, ...(embedded ? { id: 'tmt-card-fab-host', storageKey: 'tmt-card-fab-pos', offset: 46, label: '打开两三事 · 随卡（悬浮球）' } : {}), onClick: () => { try { toggle(); } catch (error) { host.reportError(error.message); } } });
  documentRef.documentElement.append(fab.host);
  const unregisterCommand = host.registerOpenCommand(launch);
  const read = () => { const value = { ...defaults, ...host.readSettings()[settingsKey] }; return { fabShow: value.fabShow !== false, qrShow: value.qrShow === true }; };
  const refreshVisibility = () => {
    const preferences = read(), enabled = isEnabled(), qrApi = host.readQuickReplies();
    fab.host.hidden = !preferences.fabShow || !enabled;
    if (preferences.qrShow && qrApi) void syncQuickReply(qrApi, true, { ...qr, visible: enabled }).catch(error => host.reportError(error.message));
  };
  refreshVisibility();
  // 随卡脚本常在 APP_READY 后加载；QR 已可用时直接同步，不再等待旧事件。
  let unsubscribeReady = () => {};
  if (!host.readQuickReplies()) unsubscribeReady = host.onReady(refreshVisibility);
  return {
    launcher, fab, read, refreshVisibility,
    async set(key, enabled) {
      const qrApi = key === 'qrShow' ? host.readQuickReplies() : null;
      if (key === 'qrShow') {
        if (enabled && !unregisterCommand) throw new Error('当前酒馆没有提供快捷命令入口。');
        await syncQuickReply(qrApi, enabled, { ...qr, visible: isEnabled() });
      }
      const settings = host.readSettings(), previous = settings[settingsKey];
      settings[settingsKey] = { ...previous, [key]: enabled };
      try { await host.saveSettings(); }
      catch { settings[settingsKey] = previous; throw new Error('入口设置保存失败，请重试。'); }
      refreshVisibility();
      if (enabled && qrApi?.settings?.isEnabled === false) return { notice: 'QR入口已保存，开启酒馆的快速回复功能后显示。' };
    },
    focus() { launcher.focus({ preventScroll: true }); },
    dispose({ preserveQuickReply = false } = {}) { unregisterCommand?.(); unsubscribeReady(); fab.destroy(); fab.host.remove(); launcher.removeEventListener('click', launch); launcher.removeEventListener('keydown', keyOpen); launcher.remove(); if (embedded && !preserveQuickReply && read().qrShow) void syncQuickReply(host.readQuickReplies(), false, qr).catch(() => host.reportError('随卡快捷按钮移除失败，请在快速回复的“两三事 · 随卡”组中删除“手机”按钮。')); },
  };
}
