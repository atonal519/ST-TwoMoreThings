export async function readImage(file, doc, maxSize = 384) {
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('这张图片无法读取，请换一张图片。'); });
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = doc.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/webp', .85);
}
