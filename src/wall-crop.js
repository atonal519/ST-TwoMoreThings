const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
export const DEFAULT_WALL_CROP = Object.freeze({ x: 0, y: 0, zoom: 1.04 });
export function cleanWallCrop(value = DEFAULT_WALL_CROP) {
  const number = (key, fallback) => Number.isFinite(value?.[key]) ? value[key] : fallback;
  return { x: clamp(number('x', 0), -1, 1), y: clamp(number('y', 0), -1, 1), zoom: clamp(number('zoom', 1.04), 0, 4) };
}

// 0 收完整图，1 铺满；更大的值在铺满基础上放大。位置按可拖动余量归一。
export function wallCropGeometry(frame, image, value) {
  const crop = cleanWallCrop(value);
  const contain = Math.min(frame.width / image.width, frame.height / image.height);
  const cover = Math.max(frame.width / image.width, frame.height / image.height);
  const scale = crop.zoom <= 1 ? contain + (cover - contain) * crop.zoom : cover * crop.zoom;
  const width = image.width * scale, height = image.height * scale;
  const overflowX = Math.max(0, (width - frame.width) / 2), overflowY = Math.max(0, (height - frame.height) / 2);
  if (overflowX < 0.000001) crop.x = 0;
  if (overflowY < 0.000001) crop.y = 0;
  return { width, height, left: (frame.width - width) / 2 + crop.x * overflowX, top: (frame.height - height) / 2 + crop.y * overflowY, overflowX, overflowY, crop };
}

export function paintWallCrop(frame, image, crop) {
  if (!frame.clientWidth || !frame.clientHeight || !image.naturalWidth || !image.naturalHeight) return null;
  const geometry = wallCropGeometry({ width: frame.clientWidth, height: frame.clientHeight }, { width: image.naturalWidth, height: image.naturalHeight }, crop);
  Object.assign(image.style, { width: `${geometry.width}px`, height: `${geometry.height}px`, left: `${geometry.left}px`, top: `${geometry.top}px` });
  image.dataset.wallReady = '';
  return geometry;
}
