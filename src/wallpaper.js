export function createWallpaperService({ host, store }) {
  return {
    async upload(theme, dataUrl) {
      const image = /^data:image\/webp;base64,(.+)$/.exec(dataUrl)?.[1];
      if (!image) throw new Error('背景图片无法读取，请重新选择图片。');
      let response;
      try { response = await host.request('/api/images/upload', { method: 'POST', body: JSON.stringify({ image, format: 'webp', ch_name: 'pocket-phone', filename: globalThis.crypto.randomUUID() }) }); }
      catch { throw new Error('背景图片上传失败，请检查酒馆连接后重试。'); }
      if (!response.ok) throw new Error('背景图片上传失败，请检查酒馆连接后重试。');
      let data;
      try { data = await response.json(); }
      catch { throw new Error('背景图片上传后没有返回可读取的图片地址。'); }
      const path = typeof data.path === 'string' ? data.path.trim() : '';
      if (!path) throw new Error('背景图片上传后没有返回图片地址。');
      const source = path.startsWith('/') ? path : `/${path}`;
      await store.setWallpaper(theme, source);
      return source;
    },
    restore: theme => store.setWallpaper(theme, ''),
  };
}
