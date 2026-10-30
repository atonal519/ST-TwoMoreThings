export function imagePath(value) {
  if (typeof value !== 'string') return '';
  const path = value.trim();
  return /^\/?user\/images\//.test(path) ? `/${path.replace(/^\/+/, '')}` : '';
}

// 存档和删除接口使用原始磁盘路径，只有浏览器请求地址逐段编码。
export function imageSource(value) {
  const path = imagePath(value);
  return path ? path.split('/').map(encodeURIComponent).join('/') : value;
}

// 当前聊天的内容与稳定照片引用，不扫描图库，也不接管头像和背景。
export function contentImagePaths(state) {
  const paths = new Set();
  const add = item => { const path = imagePath(item.image?.path); if (path) paths.add(path); };
  for (const messages of Object.values(state.conversations || {})) for (const message of messages) if (message.type === 'image') add(message);
  for (const app of [state.social, state.forum, state.liangshi]) for (const post of app?.posts || []) {
    add(post);
    if (app !== state.social) for (const row of [...(post.comments || []), ...(Array.isArray(post.reposts) ? post.reposts : [])]) add(row);
  }
  for (const photo of state.albumPhotos || []) { const path = imagePath(photo.path); if (path) paths.add(path); }
  return paths;
}

export function createImageFiles({ host }) {
  const paths = values => [...new Set(values.map(imagePath).filter(Boolean))];
  async function removeFile(endpoint, path) {
    const response = await host.request(endpoint, { method: 'POST', body: JSON.stringify({ path }) });
    if (!response.ok && response.status !== 404) throw new Error('图片文件删除失败');
  }
  return {
    async remove(values) {
      let failed = false;
      for (const path of paths(values)) {
        const work = [removeFile('/api/images/delete', path)];
        // 柏宝绘图库侧写按图片同名存于user/files；只处理其明确的文件名合同。
        const file = path.split('/').at(-1);
        if (/^bbi_[a-zA-Z0-9_]+-[a-zA-Z0-9]+\.[a-z0-9]+$/i.test(file)) work.push(removeFile('/api/files/delete', `/user/files/${file.replace(/\.[^.]+$/, '.json')}`));
        const results = await Promise.allSettled(work);
        if (results.some(result => result.status === 'rejected')) failed = true;
      }
      if (failed) throw new Error('图片文件清理失败');
    },
    async findMissing(values) {
      const missing = await Promise.all(paths(values).map(async path => {
        try {
          const response = await host.request(imageSource(path), { method: 'HEAD', cache: 'no-store' });
          return response.status === 404 ? path : '';
        } catch { return ''; }
      }));
      return missing.filter(Boolean);
    },
  };
}
