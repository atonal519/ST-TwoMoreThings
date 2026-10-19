const REQUEST = 'generate-image-request', RESPONSE = 'generate-image-response';
const nameOf = item => String(item?.nameCN || item?.nameEN || '').split('|')[0].trim();

export function createImageProviders({ host, baibai = () => globalThis.STBaiBaiImage, timeoutMs = 300000 }) {
  const settingsKey = host.phoneSettingsKey || 'pocketPhone';
  const settings = () => host.readSettings()['st-chatu8'] || {};
  const chatu8 = {
    apiVersion: 1,
    getBackendStatus() {
      const source = settings(), events = host.getEventSource();
      const configured = [true, 'true'].includes(source.scriptEnabled) && Boolean(source.mode) && Boolean(events?.on && events?.emit && events?.removeListener);
      return { configured, supportsCharacters: false, reason: '请安装并开启智绘姬，在其中配置好生图渠道后再生成。' };
    },
    getCharacters() {
      const source = settings();
      const characters = Object.values(source.characterPresets || {}).flatMap(person => {
        const name = nameOf(person);
        const hasAppearance = ['characterTraits', 'facialFeatures', 'upperBodySFW', 'fullBodySFW'].some(field => person[field]?.trim());
        return name && hasAppearance ? [{ name, tag: `$${JSON.stringify({ name, angle: 'front view', upperBody: 'sfw', lowerBody: 'sfw' })}$` }] : [];
      });
      const outfits = Object.values(source.outfitPresets || {}).flatMap(item => {
        const name = nameOf(item);
        return name && (item.upperBody || item.fullBody) ? [{ name, tag: `$${JSON.stringify({ name, upperBody: 'visible', lowerBody: 'visible' })}$` }] : [];
      });
      return { characters, outfits };
    },
    async generate({ prompt, size }) {
      const events = host.getEventSource(), id = `tmt:${globalThis.crypto.randomUUID()}`;
      const result = await new Promise((resolve, reject) => {
        const finish = (error, value) => { clearTimeout(timer); events.removeListener(RESPONSE, receive); error ? reject(error) : resolve(value); };
        const receive = reply => {
          if (reply?.id !== id) return;
          if (!reply.success) finish(new Error(reply.error || '智绘姬没有生成成功，请检查其中的生图配置。'));
          else if (reply.isVideo) finish(new Error('智绘姬返回了视频，请选择图片生图渠道。'));
          else finish(null, reply.imageData || reply.imageUrl);
        };
        const timer = setTimeout(() => finish(new Error('智绘姬生图等待超时，请检查渠道后重试。')), timeoutMs);
        events.on(RESPONSE, receive);
        // 仅发送明确的生图请求，不制造正文消息，也不修改对方的渠道或缓存设置。
        try { Promise.resolve(events.emit(REQUEST, { id, prompt, width: size === 'landscape' ? 1216 : 832, height: size === 'landscape' ? 832 : 1216 })).catch(error => finish(error)); }
        catch (error) { finish(error); }
      });
      const match = typeof result === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,([\s\S]+)$/i.exec(result);
      if (!match) throw new Error('智绘姬没有返回可保存的图片，请检查生图渠道。');
      let response;
      try { response = await host.request('/api/images/upload', { method: 'POST', body: JSON.stringify({ image: match[2], format: /^jpe?g$/i.test(match[1]) ? 'jpg' : match[1].toLowerCase(), ch_name: 'pocket-phone', filename: `generated-${globalThis.crypto.randomUUID()}` }) }); }
      catch { throw new Error('图片已生成，但保存失败，请检查酒馆连接。'); }
      if (!response.ok) throw new Error('图片已生成，但保存失败，请检查酒馆连接。');
      let data;
      try { data = await response.json(); } catch { throw new Error('图片已生成，但酒馆没有返回可读取的图片地址。'); }
      if (typeof data.path !== 'string' || !data.path.trim()) throw new Error('图片已生成，但酒馆没有返回图片地址。');
      return { path: data.path.startsWith('/') ? data.path : `/${data.path}` };
    },
  };
  const getSelected = () => host.readSettings()[settingsKey]?.imageProvider === 'chatu8' ? 'chatu8' : 'baibai';
  return {
    getSelected,
    async select(value) {
      if (!['baibai', 'chatu8'].includes(value)) throw new Error('请选择柏宝绘或智绘姬。');
      const all = host.readSettings(), previous = all[settingsKey];
      all[settingsKey] = { ...previous, imageProvider: value };
      try { await host.saveSettings(); }
      catch { all[settingsKey] = previous; throw new Error('生图设置保存失败，请重试。'); }
    },
    resolve: () => getSelected() === 'chatu8' ? { api: chatu8, label: '智绘姬' } : { api: baibai(), label: '柏宝绘' },
  };
}
