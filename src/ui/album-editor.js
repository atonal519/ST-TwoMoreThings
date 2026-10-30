import { imageSource } from '../image-files.js';
import { createPunchLayout, clampPunchHole, createPunchPath, renderPunchCollage } from '../punch-collage.js';

export function createAlbumEditor({ root, documentRef: doc, readPhoto, isActive, onChange, onView, onFeedback, onMissing }) {
  const drafts = new Map(), urls = new Map();
  let path = '', image = null, loadToken = 0, revision = 0, exportId = 0, loading = false, error = '', template = 'swallow', tab = 'positions', selected = 1, result = null, exporting = false, viewerUrl = '';
  const current = (token, chosen = path) => token === loadToken && chosen === path && isActive() && Boolean(readPhoto(chosen));
  const edits = () => {
    const key = `${path}\n${template}`;
    if (!drafts.has(key)) drafts.set(key, {});
    return drafts.get(key);
  };
  const layout = () => image && createPunchLayout(template, image.naturalWidth, image.naturalHeight);
  const pieces = () => { const base = layout(); return base?.pieces.map(piece => clampPunchHole(piece, base.photoRect, edits()[piece.id])) || []; };
  function revoke(url) {
    if (!url) return;
    doc.defaultView.clearTimeout(urls.get(url)); urls.delete(url); doc.defaultView.URL.revokeObjectURL(url);
  }
  function releaseViewer() { revoke(viewerUrl); viewerUrl = ''; }
  function clearResult() { result = null; revision++; releaseViewer(); }
  function rendered() {
    if (!image || !readPhoto(path)) throw new Error('这张照片已不在相册中。');
    if (!result) result = renderPunchCollage(image, { template, sourceEdits: edits() }, { documentRef: doc });
    return result;
  }
  function readableError(reason) {
    return reason?.name === 'SecurityError' ? '图片来源不允许读取，无法制作拼贴。' : '这张图片无法用于拼贴，请检查图片来源后重试。';
  }
  async function select(chosen) {
    const token = ++loadToken;
    exportId++;
    releaseViewer(); loading = true; error = ''; tab = 'positions'; selected = 1; exporting = false;
    if (path !== chosen) { path = chosen; image = null; clearResult(); }
    onChange();
    try {
      if (!image) {
        const next = new doc.defaultView.Image();
        if (/^https?:\/\//i.test(chosen) && new URL(chosen).origin !== doc.defaultView.location.origin) next.crossOrigin = 'anonymous';
        next.src = imageSource(chosen); await next.decode();
        if (!current(token, chosen)) return;
        image = next;
      }
      if (!current(token, chosen)) return;
      loading = false; onChange();
    } catch (reason) {
      if (!current(token, chosen)) return;
      loading = false; error = readableError(reason); onChange(); onMissing?.(chosen);
    }
  }
  function model() {
    const base = layout(), piece = pieces().find(piece => piece.id === selected), original = base?.pieces.find(piece => piece.id === selected);
    return { template, tab, selected, loading, error, exporting, size: piece && original ? piece.sourceScale / original.sourceScale : 1 };
  }
  function drawSource(canvas) {
    const base = layout(); if (!base) return;
    if (canvas.width !== base.photoRect.width || canvas.height !== base.photoRect.height) { canvas.width = base.photoRect.width; canvas.height = base.photoRect.height; }
    const ctx = canvas.getContext('2d'), scale = canvas.getBoundingClientRect().width / canvas.width || 1, shape = createPunchPath(template, doc.defaultView);
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const color = doc.defaultView.getComputedStyle(canvas).getPropertyValue('--pp-active').trim();
    for (const piece of pieces()) {
      ctx.save(); ctx.translate(piece.sx, piece.sy); ctx.rotate(piece.sourceAngle); ctx.scale(piece.sourceScale, piece.sourceScale);
      ctx.fillStyle = piece.id === selected ? `${color}35` : 'rgba(250,248,238,.15)'; ctx.fill(shape);
      ctx.strokeStyle = piece.id === selected ? color : '#fffdf2'; ctx.lineWidth = (piece.id === selected ? 2 : 1) / (piece.sourceScale * scale); ctx.stroke(shape); ctx.restore();
    }
  }
  function attach() {
    if (!isActive() || loading || error || !image) return;
    const canvas = root.querySelector('[data-album-hole-canvas]');
    if (canvas) {
      drawSource(canvas);
      let drag;
      const point = event => { const box = canvas.getBoundingClientRect(); return { x: (event.clientX - box.left) / box.width * canvas.width, y: (event.clientY - box.top) / box.height * canvas.height }; };
      canvas.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        const p = point(event), ctx = canvas.getContext('2d'), shape = createPunchPath(template, doc.defaultView), scale = canvas.getBoundingClientRect().width / canvas.width;
        const hit = [...pieces()].reverse().find(piece => {
          const dx = p.x - piece.sx, dy = p.y - piece.sy, cos = Math.cos(piece.sourceAngle), sin = Math.sin(piece.sourceAngle);
          return ctx.isPointInPath(shape, (dx * cos + dy * sin) / piece.sourceScale, (-dx * sin + dy * cos) / piece.sourceScale);
        }) || pieces().filter(piece => Math.hypot(p.x - piece.sx, p.y - piece.sy) * scale < 22).sort((a, b) => Math.hypot(p.x - a.sx, p.y - a.sy) - Math.hypot(p.x - b.sx, p.y - b.sy))[0];
        if (!hit) return;
        event.preventDefault(); selected = hit.id; drag = { id: event.pointerId, dx: p.x - hit.sx, dy: p.y - hit.sy };
        canvas.setPointerCapture(event.pointerId); drawSource(canvas);
        const slider = root.querySelector('#album-hole-size'); if (slider) slider.value = model().size;
      });
      canvas.addEventListener('pointermove', event => {
        if (!drag || drag.id !== event.pointerId || !isActive()) return;
        const p = point(event), base = layout(), piece = pieces().find(piece => piece.id === selected);
        const next = clampPunchHole(piece, base.photoRect, { sx: p.x - drag.dx, sy: p.y - drag.dy });
        edits()[selected] = { sx: next.sx, sy: next.sy, sourceScale: next.sourceScale }; clearResult(); drawSource(canvas);
      });
      const end = () => { drag = null; }; canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
    }
    const target = root.querySelector('[data-album-result-canvas]');
    if (target) {
      try { const value = rendered().canvas; target.width = value.width; target.height = value.height; target.getContext('2d').drawImage(value, 0, 0); }
      catch (reason) { error = readableError(reason); onChange(); }
    }
  }
  function setTemplate(value) { template = value; selected = 1; clearResult(); onChange(); }
  function setTab(value) { tab = value; onChange(); }
  function setSize(value) {
    const base = layout(); if (!base) return;
    const original = base.pieces.find(piece => piece.id === selected), piece = pieces().find(piece => piece.id === selected);
    const next = clampPunchHole(piece, base.photoRect, { sourceScale: original.sourceScale * Number(value) });
    edits()[selected] = { sx: next.sx, sy: next.sy, sourceScale: next.sourceScale }; clearResult();
    const canvas = root.querySelector('[data-album-hole-canvas]'); if (canvas) drawSource(canvas);
  }
  function reset() { drafts.delete(`${path}\n${template}`); selected = 1; clearResult(); error = ''; onChange(); }
  async function png(kind) {
    const token = loadToken, chosen = path, change = revision;
    const canvas = kind === 'pieces' ? rendered().piecesCanvas : rendered().canvas;
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!current(token, chosen) || change !== revision) return null;
    if (!blob) throw new Error('图片导出失败，请重试。');
    return blob;
  }
  async function download(kind) {
    if (exporting || loading || error || !isActive()) return;
    const operation = ++exportId;
    exporting = true; onChange();
    try {
      const blob = await png(kind); if (!blob) return;
      const url = doc.defaultView.URL.createObjectURL(blob), link = doc.createElement('a');
      urls.set(url, null); link.href = url; link.download = `两三事-${template === 'circle' ? '圆孔' : '燕子'}-${kind === 'pieces' ? '透明碎片' : '拼贴'}.png`;
      doc.body.append(link); link.click(); link.remove(); urls.set(url, doc.defaultView.setTimeout(() => revoke(url), 1000));
    } catch (reason) { if (operation === exportId && isActive()) onFeedback(readableError(reason)); }
    finally { if (operation === exportId) { exporting = false; if (isActive()) onChange(); } }
  }
  async function zoom(trigger) {
    try {
      const blob = await png('art'); if (!blob) return;
      releaseViewer(); viewerUrl = doc.defaultView.URL.createObjectURL(blob); urls.set(viewerUrl, null);
      onView({ path: viewerUrl, description: `${template === 'circle' ? '圆孔' : '燕子'}拼贴`, derived: true }, trigger);
    } catch (reason) { if (isActive()) onFeedback(readableError(reason)); }
  }
  function leave() { loadToken++; exportId++; loading = false; exporting = false; releaseViewer(); }
  function forgetCurrent(chosen = path) {
    for (const key of drafts.keys()) if (key.startsWith(`${chosen}\n`)) drafts.delete(key);
    if (chosen !== path) return;
    leave();
    for (const url of urls.keys()) revoke(url);
    image = null; path = ''; result = null; error = ''; selected = 1;
  }
  function invalidate() { forgetCurrent(); drafts.clear(); template = 'swallow'; tab = 'positions'; }
  return { model, attach, select, setTemplate, setTab, setSize, reset, download, zoom, releaseViewer, leave, forgetCurrent, invalidate, dispose: invalidate };
}
