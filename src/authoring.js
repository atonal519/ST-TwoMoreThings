import { cleanBackground } from './backgrounds.js';

export const REMOTE_CORE_URL = 'https://cdn.jsdelivr.net/gh/atonal519/ST-TwoMoreThings@main/embed.js';
export const LOCAL_CORE_URL = new URL('../embed.js', import.meta.url).href;

const string = value => typeof value === 'string' ? value : '';
const profile = person => Object.fromEntries(['name', 'nickname', 'avatar', 'expression', 'language', 'personality', 'tone', 'background'].filter(key => typeof person?.[key] === 'string').map(key => [key, person[key]]));

// 作者配置保存在卡片或角色脚本数据中；运行时的手机档案只属于当前聊天。
export function readCardPreset(character) {
  const extensions = character?.data?.extensions;
  if (extensions?.twoMoreThings) return extensions.twoMoreThings;
  const scripts = extensions?.tavern_helper?.scripts || [];
  for (const item of scripts) for (const script of item.type === 'folder' ? item.scripts || [] : [item]) {
    if (script.data?.twoMoreThings) return script.data.twoMoreThings;
  }
  return null;
}

export function stateFromPreset(preset) {
  if (preset?.schemaVersion !== 1) throw new Error('卡内手机配置版本不支持，请让作者更新随卡包。');
  const contacts = (preset.contacts || []).map(person => ({ ...profile(person), background: cleanBackground(person.background, true), id: string(person.id), source: { kind: 'card' }, edited: true, manualFields: ['name', 'nickname', 'avatar', 'expression', 'language'] }));
  const ids = new Set(contacts.map(person => person.id));
  if (ids.size !== contacts.length || contacts.some(person => !person.id || !person.name?.trim())) throw new Error('卡内手机的联系人缺少姓名或编号重复，请让作者重新导出。');
  const groups = (preset.groups || []).map(group => ({ id: string(group.id), name: string(group.name), avatar: string(group.avatar), background: cleanBackground(group.background, true), memberIds: [...new Set(group.memberIds || [])], userIsMember: group.userIsMember !== false }));
  if (new Set(groups.map(group => group.id)).size !== groups.length || groups.some(group => !group.id || !group.name.trim() || ids.has(group.id) || group.memberIds.some(id => !ids.has(id)))) throw new Error('卡内手机的群聊资料或成员无法对应，请让作者重新导出。');
  return { schemaVersion: 1, contacts, groups, conversations: {}, forum: { posts: [] }, injectEnabled: preset.injectEnabled === true, theme: preset.theme === 'night' ? 'night' : 'day',
    wallpapers: { day: cleanBackground(preset.wallpapers?.day), night: cleanBackground(preset.wallpapers?.night) },
    ...(['stacked', 'rounded'].includes(preset.lockStyle) ? { lockStyle: preset.lockStyle } : {}),
    ...(preset.userProfile ? { userProfile: profile(preset.userProfile) } : {}),
  };
}

// 此函数会写入随卡脚本，必须自包含；只更新核心地址，不发送或改写作者配置与读者档案。
async function loadEmbedded(nodeId, coreUrl, followUpdates) {
  const node = document.getElementById(nodeId);
  try {
    if (followUpdates) {
      try {
        const response = await fetch('https://api.github.com/repos/atonal519/ST-TwoMoreThings/git/ref/heads/main', { cache: 'no-store', credentials: 'omit' });
        if (!response.ok) throw new Error();
        const { object } = await response.json();
        if (object?.type !== 'commit' || typeof object.sha !== 'string' || !/^[a-f0-9]{40}$/i.test(object.sha)) throw new Error();
        // 固定整套相对依赖的提交地址，避免 main 的长期缓存或混用新旧模块。
        coreUrl = coreUrl.replace('@main/', `@${object.sha}/`);
      } catch { throw new Error('无法读取手机最新版本，请检查 GitHub 连接后重新加载脚本。'); }
    }
    const { mountEmbedded } = await import(coreUrl).catch(() => { throw new Error('卡内手机核心加载失败，请检查网络后重新加载脚本。'); });
    const app = mountEmbedded({ preset: node.preset });
    node.owner.addEventListener('pagehide', () => app.dispose(), { once: true });
  } catch (error) {
    globalThis.toastr?.error(error.message || '卡内手机加载失败，请重新加载脚本。');
    console.error('两三事随卡加载失败', error);
  } finally { node.remove(); }
}

function bootstrap(coreUrl) {
  return `const coreUrl = ${JSON.stringify(coreUrl)};
const node = window.parent.document.createElement('script');
node.type = 'module';
node.id = 'tmt-card-loader-' + crypto.randomUUID();
node.owner = window;
node.preset = getVariables({ type: 'script' }).twoMoreThings;
node.textContent = '(' + ${JSON.stringify(loadEmbedded.toString())} + ')(' + JSON.stringify(node.id) + ',' + JSON.stringify(coreUrl) + ',${coreUrl === REMOTE_CORE_URL})';
window.parent.document.head.append(node);`;
}

export function createAuthoringService({ store, host, readEntries = () => host.readSettings()[host.phoneSettingsKey || 'pocketPhone'] || {}, fetchImage = url => host.request(url, { method: 'GET' }), baseUrl = globalThis.location?.href || 'http://localhost/' }) {
  return {
    async exportScript({ coreUrl = REMOTE_CORE_URL } = {}) {
      const state = store.read(), images = new Map();
      const portable = async source => {
        if (!source || source.startsWith('data:image/') || source.startsWith('builtin:') || source.startsWith('color:')) return source || '';
        const url = new URL(source, baseUrl);
        if (url.protocol !== 'blob:' && url.origin !== new URL(baseUrl).origin) return source;
        if (!images.has(source)) images.set(source, (async () => {
          try {
            const response = await fetchImage(source);
            if (!response.ok || !response.headers.get('Content-Type')?.startsWith('image/')) throw new Error();
            const bytes = new Uint8Array(await response.arrayBuffer());
            let binary = '';
            for (let index = 0; index < bytes.length; index += 16384) binary += String.fromCharCode(...bytes.subarray(index, index + 16384));
            return `data:${response.headers.get('Content-Type').split(';')[0]};base64,${btoa(binary)}`;
          } catch { throw new Error('图片打包失败，请检查头像或背景是否还能打开，或重新上传后再导出。'); }
        })());
        return images.get(source);
      };
      const ids = new Map(state.contacts.map((person, index) => [person.id, `card:contact-${index + 1}`]));
      const contacts = await Promise.all(state.contacts.map(async person => ({ ...profile(person), id: ids.get(person.id), avatar: await portable(person.avatar), background: await portable(person.background) })));
      const groups = await Promise.all((state.groups || []).map(async (group, index) => ({ id: `card:group-${index + 1}`, name: group.name, avatar: await portable(group.avatar), background: await portable(group.background), memberIds: group.memberIds.map(id => ids.get(id)), userIsMember: group.userIsMember })));
      const userProfile = state.userProfile ? { ...profile(state.userProfile), avatar: await portable(state.userProfile.avatar) } : undefined;
      const preferences = readEntries();
      const preset = { schemaVersion: 1, theme: state.theme === 'night' ? 'night' : 'day', injectEnabled: state.injectEnabled === true, contacts, groups, entries: { fabShow: preferences.fabShow !== false, qrShow: preferences.qrShow === true },
        ...(['stacked', 'rounded'].includes(state.lockStyle) ? { lockStyle: state.lockStyle } : {}),
        wallpapers: { day: await portable(state.wallpapers?.day), night: await portable(state.wallpapers?.night) }, ...(userProfile ? { userProfile } : {}),
      };
      stateFromPreset(preset);
      const script = { type: 'script', id: crypto.randomUUID(), name: '两三事 · 卡内手机', enabled: true, content: bootstrap(coreUrl), info: '两三事随卡手机。角色资料和外观由作者配置，手机核心随正式版本更新。', button: { enabled: false, buttons: [] }, data: { twoMoreThings: preset }, export_with: { data: true, button: false } };
      const name = (host.captureChat().character?.name || '角色卡').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_');
      return { script, filename: `${name}-两三事随卡包.json` };
    },
  };
}
