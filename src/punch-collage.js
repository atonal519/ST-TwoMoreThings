const WIDTH = 1000, HEIGHT = 1400;
const SWALLOW = 'M0 -52 C7 -48 11 -42 10 -34 C29 -38 65 -77 111 -100 C96 -66 79 -38 47 -17 C30 -10 18 -7 10 7 C8 25 16 53 23 76 C12 67 6 57 0 44 C-6 57 -12 67 -23 76 C-16 53 -8 25 -10 7 C-18 -7 -30 -10 -47 -17 C-79 -38 -96 -66 -111 -100 C-65 -77 -29 -38 -10 -34 C-11 -42 -7 -48 0 -52 Z';
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function fitPunchPhoto(width, height) {
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height))) throw new Error('图片尺寸无效。');
  const scale = Math.min(856 / width, 570 / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function curve(points, t) {
  const u = 1 - t;
  const point = [0, 1].map(k => u ** 3 * points[0][k] + 3 * u * u * t * points[1][k] + 3 * u * t * t * points[2][k] + t ** 3 * points[3][k]);
  const d = [0, 1].map(k => 3 * u * u * (points[1][k] - points[0][k]) + 6 * u * t * (points[2][k] - points[1][k]) + 3 * t * t * (points[3][k] - points[2][k]));
  return { x: point[0], y: point[1], angle: Math.atan2(d[1], d[0]) + Math.PI / 2 };
}

export function punchHoleBounds(piece) {
  if (piece.type === 'circle') return { left: -piece.sourceScale, right: piece.sourceScale, top: -piece.sourceScale, bottom: piece.sourceScale };
  const cos = Math.cos(piece.sourceAngle), sin = Math.sin(piece.sourceAngle);
  const points = [[-111, -100], [111, -100], [-111, 76], [111, 76]].map(([x, y]) => [(x * cos - y * sin) * piece.sourceScale, (x * sin + y * cos) * piece.sourceScale]);
  return { left: Math.min(...points.map(p => p[0])), right: Math.max(...points.map(p => p[0])), top: Math.min(...points.map(p => p[1])), bottom: Math.max(...points.map(p => p[1])) };
}

export function clampPunchHole(piece, photoRect, edit = {}) {
  const next = { ...piece, sx: edit.sx ?? piece.sx, sy: edit.sy ?? piece.sy, sourceScale: edit.sourceScale ?? piece.sourceScale };
  let bounds = punchHoleBounds(next);
  const fit = Math.min(1, photoRect.width / (bounds.right - bounds.left), photoRect.height / (bounds.bottom - bounds.top));
  next.sourceScale *= fit;
  bounds = punchHoleBounds(next);
  next.sx = clamp(next.sx, -bounds.left, photoRect.width - bounds.right);
  next.sy = clamp(next.sy, -bounds.top, photoRect.height - bounds.bottom);
  return next;
}

export function createPunchLayout(template, width, height) {
  if (!['circle', 'swallow'].includes(template)) throw new Error('未知拼贴模板。');
  const photo = fitPunchPhoto(width, height), fit = Math.min(photo.width / 856, photo.height / 570);
  const photoRect = { x: (WIDTH - photo.width) / 2, y: (template === 'circle' ? 78 : 748) + (570 - photo.height) / 2, ...photo };
  const locations = [[.13, .17], [.35, .16], [.57, .17], [.81, .18], [.16, .40], [.37, .40], [.59, .41], [.83, .43], [.16, .72], [.35, .70], [.50, .71], [.61, .58]];
  const pieces = Array.from({ length: template === 'circle' ? 12 : 11 }, (_, i) => {
    let piece;
    if (template === 'circle') {
      const radius = [42, 39, 44, 40, 38, 44, 41, 39, 43, 39, 44, 40][i];
      piece = { id: i + 1, type: template, sx: locations[i][0] * photo.width, sy: locations[i][1] * photo.height, sourceScale: radius * fit, sourceAngle: 0, dx: 168 + i % 4 * 221, dy: 829 + Math.floor(i / 4) * 192, destScale: radius * 1.28, destAngle: 0 };
    } else {
      const flight = curve([[124, 626], [100, 302], [510, 92], [875, 178]], i / 10), offset = i % 2 ? 28 : -16;
      const source = curve([[.12, .76], [.17, .38], [.56, .15], [.88, .20]].map(([x, y]) => [x * photo.width, y * photo.height]), [0, .10, .205, .305, .41, .51, .61, .70, .80, .90, 1][i]);
      const stagger = [-10, 19, -13, 21, -9, 22, -14, 20, -8, 18, 0][i] * fit;
      piece = { id: i + 1, type: template, sx: source.x + Math.cos(source.angle) * stagger, sy: source.y + Math.sin(source.angle) * stagger, sourceScale: [82, 61, 76, 58, 84, 62, 72, 55, 80, 61, 66][i] / 222 * fit, sourceAngle: source.angle,
        dx: flight.x + Math.cos(flight.angle) * offset, dy: flight.y + Math.sin(flight.angle) * offset, destScale: [148, 92, 117, 98, 145, 90, 124, 95, 130, 91, 105][i] / 222, destAngle: flight.angle };
    }
    return clampPunchHole(piece, photoRect);
  });
  return { template, width: WIDTH, height: HEIGHT, photoRect, pieces };
}

export function createPunchPath(template, windowRef = globalThis) {
  const path = new windowRef.Path2D(template === 'swallow' ? SWALLOW : undefined);
  if (template === 'circle') path.arc(0, 0, 1, 0, Math.PI * 2);
  return path;
}

export function renderPunchCollage(image, { template = 'swallow', sourceEdits = {} } = {}, { documentRef = document } = {}) {
  const canvas = (width, height) => Object.assign(documentRef.createElement('canvas'), { width, height });
  const layout = createPunchLayout(template, image.naturalWidth || image.width, image.naturalHeight || image.height), rect = layout.photoRect;
  const pieces = layout.pieces.map(piece => clampPunchHole(piece, rect, sourceEdits[piece.id]));
  const shape = createPunchPath(template, documentRef.defaultView), photo = canvas(rect.width, rect.height);
  photo.getContext('2d').drawImage(image, 0, 0, photo.width, photo.height);
  const small = canvas(24, 16), sample = small.getContext('2d'); sample.drawImage(image, 0, 0, 24, 16);
  const pixels = sample.getImageData(0, 0, 24, 16).data, sums = [0, 0, 0];
  for (let i = 0; i < pixels.length; i += 4) for (let k = 0; k < 3; k++) sums[k] += pixels[i + k];
  const rgb = sums.map((sum, k) => Math.round([247, 244, 235][k] * .94 + sum / (24 * 16) * .06));
  const artwork = canvas(WIDTH, HEIGHT), piecesCanvas = canvas(WIDTH, HEIGHT), ctx = artwork.getContext('2d');
  ctx.fillStyle = `rgb(${rgb.join(',')})`; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const grain = ctx.getImageData(0, 0, WIDTH, HEIGHT); let seed = 894;
  for (let i = 0; i < grain.data.length; i += 4) {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    const change = Math.round((((t ^ t >>> 14) >>> 0) / 4294967296 - .5) * 2);
    for (let k = 0; k < 3; k++) grain.data[i + k] += change;
  }
  ctx.putImageData(grain, 0, 0);
  const print = canvas(photo.width + 8, photo.height + 8), pc = print.getContext('2d');
  pc.fillStyle = '#fdfcf7'; pc.fillRect(0, 0, print.width, print.height); pc.drawImage(photo, 4, 4);
  for (const piece of pieces) {
    pc.save(); pc.translate(piece.sx + 4, piece.sy + 4); pc.rotate(piece.sourceAngle); pc.scale(piece.sourceScale, piece.sourceScale);
    pc.globalCompositeOperation = 'destination-out'; pc.fill(shape); pc.globalCompositeOperation = 'source-over';
    pc.strokeStyle = 'rgba(255,255,251,.65)'; pc.lineWidth = .8 / piece.sourceScale; pc.stroke(shape); pc.restore();
  }
  ctx.shadowColor = 'rgba(31,43,39,.13)'; ctx.shadowBlur = 13; ctx.shadowOffsetY = 5; ctx.drawImage(print, rect.x - 4, rect.y - 4); ctx.shadowColor = 'transparent';
  const output = piecesCanvas.getContext('2d');
  for (const piece of pieces) {
    output.save(); output.translate(piece.dx, piece.dy); output.rotate(piece.destAngle); output.scale(piece.destScale, piece.destScale);
    output.shadowColor = 'rgba(30,43,39,.15)'; output.shadowBlur = 8; output.shadowOffsetX = 1; output.shadowOffsetY = 4; output.fillStyle = '#fffdf5'; output.fill(shape); output.shadowColor = 'transparent';
    output.save(); output.clip(shape); output.scale(1 / piece.sourceScale, 1 / piece.sourceScale); output.rotate(-piece.sourceAngle); output.drawImage(photo, -piece.sx, -piece.sy); output.restore();
    output.strokeStyle = 'rgba(255,255,250,.72)'; output.lineWidth = .85 / piece.destScale; output.stroke(shape); output.restore();
  }
  ctx.drawImage(piecesCanvas, 0, 0);
  return { canvas: artwork, piecesCanvas, metadata: { ...layout, pieces } };
}
