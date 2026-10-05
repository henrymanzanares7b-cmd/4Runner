// Motor del probador virtual de V-TryOn Studio
// Es el mismo código de la versión publicada en Firebase, empaquetado como JS puro.
(function (global) {
'use strict';

// ===== Imágenes =====
const objectUrlCache = new WeakMap();
const srcOf = (fileOrUrl) => {
  if (!fileOrUrl) return '';
  if (typeof fileOrUrl === 'string') return fileOrUrl;
  if (!objectUrlCache.has(fileOrUrl)) objectUrlCache.set(fileOrUrl, URL.createObjectURL(fileOrUrl));
  return objectUrlCache.get(fileOrUrl);
};

const loadImage = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  if (typeof src === 'string' && !src.startsWith('data:') && !src.startsWith('blob:')) {
    img.crossOrigin = 'anonymous';
  }
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('No se pudo cargar la imagen.'));
  img.src = src;
});

// Reduce el peso de la foto para que quepa en un documento de Firestore (máx. 1 MB)
const compressImage = async (file) => {
  const img = await loadImage(srcOf(file));
  for (const maxSide of [800, 600, 450]) {
    const s = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * s));
    c.height = Math.max(1, Math.round(img.naturalHeight * s));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    let url = c.toDataURL('image/webp', 0.85);
    if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/png');
    if (url.length < 850000) return url;
  }
  throw new Error('La imagen es demasiado pesada. Usa una más pequeña.');
};

// Quita el fondo liso de la foto de la prenda y la recorta a su contorno
const prepareGarment = (img, removeBg) => {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const s = Math.min(1, 900 / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * s));
  const h = Math.max(1, Math.round(ih * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  if (!removeBg) return c;

  let data;
  try { data = ctx.getImageData(0, 0, w, h); } catch (e) { return c; }
  const px = data.data;
  const original = new Uint8ClampedArray(px);

  let r = 0, g = 0, b = 0, n = 0, clear = 0;
  const sample = (x, y) => {
    const i = (y * w + x) * 4;
    if (px[i + 3] < 20) { clear++; return; }
    r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
  };
  for (let x = 0; x < w; x += 2) { sample(x, 0); sample(x, h - 1); }
  for (let y = 0; y < h; y += 2) { sample(0, y); sample(w - 1, y); }

  if (n > 0 && clear < n) {
    r /= n; g /= n; b /= n;
    const TOL = 70;
    const visited = new Uint8Array(w * h);
    const stack = [];
    const push = (x, y) => { const k = y * w + x; if (!visited[k]) { visited[k] = 1; stack.push(k); } };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    let removed = 0;
    while (stack.length) {
      const k = stack.pop();
      const i = k * 4;
      const d = Math.abs(px[i] - r) + Math.abs(px[i + 1] - g) + Math.abs(px[i + 2] - b);
      if (px[i + 3] < 20 || d < TOL) {
        px[i + 3] = 0; removed++;
        const x = k % w, y = (k / w) | 0;
        if (x > 0) push(x - 1, y);
        if (x < w - 1) push(x + 1, y);
        if (y > 0) push(x, y - 1);
        if (y < h - 1) push(x, y + 1);
      }
    }
    // Si se borró casi todo, la foto no tenía un fondo liso: se deja como estaba
    if (removed > w * h * 0.93) {
      px.set(original);
    } else {
      // Suaviza el borde para que no se vea recortado a tijera
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = (y * w + x) * 4;
          if (px[i + 3] === 0) continue;
          if (px[i - 1] === 0 || px[i + 7] === 0 || px[i - w * 4 + 3] === 0 || px[i + w * 4 + 3] === 0) {
            px[i + 3] = Math.min(px[i + 3], 160);
          }
        }
      }
    }
    ctx.putImageData(data, 0, 0);
  }

  // Recorte al contorno de la prenda
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 20) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return c;
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = cw; out.height = ch;
  out.getContext('2d').drawImage(c, minX, minY, cw, ch, 0, 0, cw, ch);
  return out;
};

// ===== Posición de la prenda =====
// Posición estándar (cuando no se detecta el cuerpo o el ajuste automático está apagado)
const standardPlacement = (category, W, H, aspect) => {
  const cfg = { head: [0.38, 0.03], bottom: [0.48, 0.46], shoes: [0.45, 0.80], full: [0.58, 0.12], top: [0.52, 0.12] }[category] || [0.52, 0.12];
  const w = W * cfg[0];
  const h = w * aspect;
  return { cx: W / 2, cy: H * cfg[1] + h / 2, w, h, angle: 0 };
};

// Ajuste automático: usa los puntos del cuerpo detectados por MediaPipe
const bodyPlacement = (category, W, H, aspect, lm, stretch = false) => {
  if (!lm || lm.length < 33) return null;
  const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H, v: lm[i].visibility == null ? 1 : lm[i].visibility });
  const ok = (...pts) => pts.every(p => p.v > 0.35 && p.x > -0.1 * W && p.x < 1.1 * W && p.y > -0.1 * H && p.y < 1.1 * H);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, v: Math.min(a.v, b.v) });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const lineAngle = (a, b) => {
    const [p, q] = a.x <= b.x ? [a, b] : [b, a];
    const ang = Math.atan2(q.y - p.y, q.x - p.x);
    return Math.max(-0.5, Math.min(0.5, ang));
  };
  // Alto de la prenda: se estira un poco hacia el largo del cuerpo sin deformarla de más
  const fitH = (w, desired) => {
    const nat = w * aspect;
    // Con silueta el ancho lo marca el cuerpo, así que el largo puede seguir al cuerpo con más libertad
    return stretch ? Math.min(Math.max(desired, nat * 0.6), nat * 1.9) : Math.min(Math.max(desired, nat * 0.8), nat * 1.25);
  };
  // Centro a partir de un punto de anclaje, desplazado sobre el eje del cuerpo
  const fromAnchor = (anchor, angle, dy) => ({ cx: anchor.x - Math.sin(angle) * dy, cy: anchor.y + Math.cos(angle) * dy });

  const ls = P(11), rs = P(12), lh = P(23), rh = P(24);
  const lk = P(25), rk = P(26), la = P(27), ra = P(28);
  const lheel = P(29), rheel = P(30), lfoot = P(31), rfoot = P(32);
  const shouldersOk = ok(ls, rs);
  const hipsOk = ok(lh, rh);
  const sMid = mid(ls, rs), hMid = mid(lh, rh);
  const sW = dist(ls, rs), hW = dist(lh, rh);
  const torso = shouldersOk && hipsOk ? dist(sMid, hMid) : sW * 1.3;

  if (category === 'top' || category === 'full') {
    if (!shouldersOk) return null;
    const angle = lineAngle(ls, rs);
    const w = sW * (category === 'full' ? 1.75 : 1.8);
    let desired;
    if (category === 'top') {
      desired = torso * 1.4;
    } else {
      const kMid = mid(lk, rk);
      desired = ok(lk, rk) ? (kMid.y - sMid.y) * 1.25 : torso * 2.3;
    }
    const h = fitH(w, desired);
    const top = fromAnchor(sMid, angle, -0.15 * torso);
    const c = fromAnchor({ x: top.cx, y: top.cy }, angle, h / 2);
    return { cx: c.cx, cy: c.cy, w, h, angle };
  }

  if (category === 'bottom') {
    if (!hipsOk) return null;
    const angle = lineAngle(lh, rh) * 0.5;
    let legLen;
    if (ok(la, ra)) legLen = mid(la, ra).y - hMid.y;
    else if (ok(lk, rk)) legLen = (mid(lk, rk).y - hMid.y) * 2.05;
    else return null;
    const w = Math.max(hW * 2.3, sW * 0.95);
    const h = fitH(w, legLen * 1.15);
    const top = fromAnchor(hMid, angle, -0.12 * torso);
    const c = fromAnchor({ x: top.cx, y: top.cy }, angle, h / 2);
    return { cx: c.cx, cy: c.cy, w, h, angle };
  }

  if (category === 'head') {
    const nose = P(0), leye = P(2), reye = P(5), lear = P(7), rear = P(8);
    if (!ok(nose)) return null;
    const earsOk = ok(lear, rear);
    const earW = earsOk ? dist(lear, rear) : sW * 0.45;
    const eyesOk = ok(leye, reye);
    const eyeMid = eyesOk ? mid(leye, reye) : { x: nose.x, y: nose.y - earW * 0.2 };
    const angle = eyesOk ? lineAngle(leye, reye) : 0;
    const w = Math.max(earW * 1.7, sW * 0.6);
    const h = w * aspect;
    const anchor = { x: earsOk ? mid(lear, rear).x : eyeMid.x, y: eyeMid.y - earW * 0.22 };
    const c = fromAnchor(anchor, angle, -h / 2);
    return { cx: c.cx, cy: c.cy, w, h, angle };
  }

  if (category === 'shoes') {
    if (!ok(la, ra)) return null;
    const footLen = ok(lheel, lfoot, rheel, rfoot)
      ? (dist(lheel, lfoot) + dist(rheel, rfoot)) / 2
      : (shouldersOk ? sW * 0.55 : H * 0.06);
    const spread = dist(la, ra);
    const w = Math.max(spread + footLen * 1.8, footLen * 2.6);
    const h = w * aspect;
    const ys = [la.y, ra.y];
    [lheel, rheel, lfoot, rfoot].forEach(p => { if (ok(p)) ys.push(p.y); });
    const ground = Math.max(...ys) + footLen * 0.08;
    return { cx: mid(la, ra).x, cy: ground - h / 2, w, h, angle: 0 };
  }

  return null;
};

// ===== Silueta: la prenda sigue el contorno del cuerpo =====
// Guarda, por cada fila de la prenda, dónde empieza y termina la tela
const garmentRows = (g) => {
  if (g._rows) return g._rows;
  const ctx = g.getContext('2d', { willReadFrequently: true });
  let px;
  try { px = ctx.getImageData(0, 0, g.width, g.height).data; } catch (e) { g._rows = null; return null; }
  const rows = new Array(g.height);
  for (let y = 0; y < g.height; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < g.width; x++) {
      if (px[(y * g.width + x) * 4 + 3] > 40) { if (l < 0) l = x; r = x; }
    }
    // Tramo continuo alrededor del centro (el cuerpo de la prenda, sin mangas separadas)
    let cl = -1, cr = -1;
    if (l >= 0) {
      const mid = Math.floor(g.width / 2);
      let start = -1;
      for (let d = 0; d < g.width * 0.15 && start < 0; d++) {
        if (mid - d >= 0 && px[(y * g.width + mid - d) * 4 + 3] > 40) start = mid - d;
        else if (mid + d < g.width && px[(y * g.width + mid + d) * 4 + 3] > 40) start = mid + d;
      }
      if (start >= 0) {
        cl = start; cr = start;
        while (cl > 0 && px[(y * g.width + cl - 1) * 4 + 3] > 40) cl--;
        while (cr < g.width - 1 && px[(y * g.width + cr + 1) * 4 + 3] > 40) cr++;
      }
    }
    rows[y] = [l, r, cl, cr];
  }
  g._rows = rows;
  return rows;
};

const maskAt = (mask, x, y, W, H) => {
  const mx = Math.floor((x / W) * mask.w), my = Math.floor((y / H) * mask.h);
  if (mx < 0 || my < 0 || mx >= mask.w || my >= mask.h) return 0;
  return mask.data[my * mask.w + mx];
};

const smooth = (arr, radius) => arr.map((v, i) => {
  if (v == null) return v;
  let sum = 0, n = 0;
  for (let k = i - radius; k <= i + radius; k++) {
    if (k >= 0 && k < arr.length && arr[k] != null) { sum += arr[k]; n++; }
  }
  return sum / n;
});

// Dibuja la prenda fila por fila, estirando cada fila al ancho real del cuerpo en esa altura
const drawOnSilhouette = (ctx, g, place, mask, W, H, category, lm) => {
  const rows = garmentRows(g);
  if (!rows || !mask) return false;

  // Líneas de los brazos (hombro, codo, muñeca) para separar el torso de los brazos
  const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H, v: lm[i].visibility == null ? 1 : lm[i].visibility });
  let arms = [], sW = 0, shoulderY = 0, torsoLen = 0;
  if (lm && lm.length >= 33) {
    arms = [[11, 13, 15], [12, 14, 16]].map(ids => ids.map(P)).filter(pts => pts.every(p => p.v > 0.35));
    const ls = P(11), rs = P(12), lh = P(23), rh = P(24);
    sW = Math.hypot(ls.x - rs.x, ls.y - rs.y);
    shoulderY = (ls.y + rs.y) / 2;
    torsoLen = Math.abs((lh.y + rh.y) / 2 - shoulderY) || sW * 1.3;
  }
  const armXAt = (pts, y) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y);
      if (y >= lo && y <= hi && hi - lo > 1) return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
    }
    return null;
  };
  const k = place.w / g.width;
  const top = Math.round(place.cy - place.h / 2);
  const total = Math.max(1, Math.round(place.h));
  const widths = [], centers = [], src = [];
  let fitted = 0, used = 0;

  for (let i = 0; i < total; i++) {
    const ty = top + i;
    const r = Math.min(g.height - 1, Math.floor((i / total) * g.height));
    const [gl, gr] = rows[r];
    if (gl < 0 || ty < 0 || ty >= H) { widths.push(null); centers.push(null); src.push(null); continue; }
    used++;
    const natW = (gr - gl + 1) * k;
    const natC = place.cx + ((gl + gr) / 2 - g.width / 2) * k;
    let bl = -1, br = -1;
    // En pantalones se busca más cerca del centro para no confundir las manos con la cadera
    const reach = category === 'bottom' ? 0.6 : 0.9;
    let x0 = Math.max(0, Math.floor(natC - natW * reach)), x1 = Math.min(W - 1, Math.ceil(natC + natW * reach));
    // Fila de torso (sin manga): se mide solo el torso, entre los brazos, para que la tela no se estire sobre ellos
    let torsoRow = false, armGap = 0;
    if (category !== 'bottom' && arms.length === 2 && natW < sW * 1.35 && ty > shoulderY + torsoLen * 0.15) {
      const xa = armXAt(arms[0], ty), xb = armXAt(arms[1], ty);
      if (xa != null && xb != null) {
        x0 = Math.max(x0, Math.floor(Math.min(xa, xb)));
        x1 = Math.min(x1, Math.ceil(Math.max(xa, xb)));
        torsoRow = true;
        armGap = Math.abs(xa - xb);
      }
    }
    for (let x = x0; x <= x1; x += 2) {
      if (maskAt(mask, x, ty, W, H)) { if (bl < 0) bl = x; br = x; }
    }
    let tw = natW, tc = natC;
    if (bl >= 0 && br - bl > natW * 0.25) {
      fitted++;
      const bodyW = (br - bl + 1) * (torsoRow ? 1.0 : 1.05);
      tw = torsoRow
        ? Math.min(natW * 1.6, Math.max(natW * 0.75, armGap - sW * 0.24))
        : Math.min(natW * 1.2, Math.max(natW * 0.75, bodyW));
      tc = Math.min(natC + natW * 0.15, Math.max(natC - natW * 0.15, (bl + br) / 2));
    }
    widths.push(tw); centers.push(tc); src.push([gl, r, gr - gl + 1]);
  }
  if (used === 0 || fitted < used * 0.3) return false;

  const sw = smooth(widths, 6), sc = smooth(centers, 6);
  for (let i = 0; i < total; i++) {
    if (!src[i]) continue;
    const [sx, sy, sWid] = src[i];
    ctx.drawImage(g, sx, sy, sWid, 1, sc[i] - sw[i] / 2, top + i, sw[i], 1.6);
  }
  return true;
};

// Ajusta el tamaño de camisas y vestidos para que el cuerpo de la prenda (sin mangas)
// tenga el ancho real del torso. Se escala parejo: la prenda no se deforma.
const sizeTopToTorso = (place, g, lm, W, H, category = 'top') => {
  const rows = garmentRows(g);
  if (!rows || !lm || lm.length < 33) return place;
  const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H, v: lm[i].visibility == null ? 1 : lm[i].visibility });
  const ls = P(11), rs = P(12), lh = P(23), rh = P(24);
  if (ls.v < 0.35 || rs.v < 0.35) return place;
  const sW = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  const shoulderY = (ls.y + rs.y) / 2;
  const torso = (lh.v > 0.35 && rh.v > 0.35) ? Math.abs((lh.y + rh.y) / 2 - shoulderY) : sW * 1.3;

  // Forma de la prenda en la parte baja (entre 55% y 85% del alto)
  let lowerFrac = 1, runFrac = 1;
  for (let f = 0.55; f <= 0.85; f += 0.05) {
    const row = rows[Math.floor(g.height * f)];
    if (!row || row[0] < 0) continue;
    lowerFrac = Math.min(lowerFrac, (row[1] - row[0] + 1) / g.width);
    if (row[2] >= 0) runFrac = Math.min(runFrac, (row[3] - row[2] + 1) / g.width);
  }
  // Ancho del torso: distancia entre los brazos a la altura del pecho, menos el grosor de los brazos
  let torsoW = sW * 1.15;
  const chestY = shoulderY + torso * 0.4;
  const armX = (ids) => {
    const pts = ids.map(P);
    if (pts.some(p => p.v < 0.35)) return null;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (chestY >= Math.min(a.y, b.y) && chestY <= Math.max(a.y, b.y) && Math.abs(b.y - a.y) > 1) {
        return a.x + ((b.x - a.x) * (chestY - a.y)) / (b.y - a.y);
      }
    }
    return null;
  };
  const xa = armX([11, 13, 15]), xb = armX([12, 14, 16]);
  if (xa != null && xb != null) torsoW = Math.max(sW * 1.0, Math.abs(xa - xb) - sW * 0.24);

  let w;
  if (lowerFrac < 0.8) {
    // Manga corta o sin mangas: el cuerpo de la prenda cubre el torso y las mangas quedan en los hombros
    w = (torsoW * 1.08) / lowerFrac;
  } else if (runFrac < lowerFrac * 0.85) {
    // Manga larga separada del cuerpo en la foto: se mide solo el cuerpo de la prenda
    w = (torsoW * 1.08) / runFrac;
  } else {
    // Manga larga pegada al cuerpo: la prenda completa cubre torso y brazos
    const outer = (xa != null && xb != null) ? Math.abs(xa - xb) + sW * 0.3 : sW * 1.7;
    w = (outer * 1.05) / lowerFrac;
  }
  w = Math.min(sW * 3, Math.max(sW * 1.3, w));
  let h = w * (g.height / g.width);
  const topY = place.cy - place.h / 2;
  // Una camisa no debe pasar mucho de la cadera: se acorta un poco (máximo 22%) si queda muy larga
  if (category === 'top') {
    const maxH = shoulderY + torso * 1.38 - topY;
    if (h > maxH) h = Math.max(maxH, h * 0.78);
  }
  return { ...place, w, h, cy: topY + h / 2 };
};

// Dibujo rígido (gorras, zapatos o cuando no hay silueta)
const drawRigid = (ctx, g, place) => {
  ctx.save();
  ctx.translate(place.cx, place.cy);
  ctx.rotate(place.angle || 0);
  ctx.drawImage(g, -place.w / 2, -place.h / 2, place.w, place.h);
  ctx.restore();
};

// Devuelve la cara, el cuello y las manos al frente para que la ropa no los tape.
// Solo se recupera la piel (y la cara completa), nunca la ropa vieja de la foto.
const restoreBodyParts = (ctx, base, lm, mask, W, H) => {
  if (!lm || !mask) return;
  const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H, v: lm[i].visibility == null ? 1 : lm[i].visibility });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const ls = P(11), rs = P(12), lh = P(23), rh = P(24), nose = P(0), leye = P(2), reye = P(5), lear = P(7), rear = P(8);
  if (ls.v < 0.35 || rs.v < 0.35) return;
  const sMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const sW = dist(ls, rs);
  const orig = base.getContext('2d').getImageData(0, 0, W, H);
  const od = orig.data;

  const toCrCb = (i) => {
    const r = od[i], g = od[i + 1], b = od[i + 2];
    return [0.5 * r - 0.4187 * g - 0.0813 * b + 128, -0.1687 * r - 0.3313 * g + 0.5 * b + 128, 0.299 * r + 0.587 * g + 0.114 * b];
  };

  // Tono de piel tomado de la cara (mejillas y nariz)
  let mCr = 0, mCb = 0, n = 0;
  const eyesOk = leye.v > 0.35 && reye.v > 0.35;
  const eyeD = eyesOk ? dist(leye, reye) : sW * 0.2;
  if (nose.v > 0.35) {
    for (let y = Math.floor(nose.y - eyeD * 0.1); y <= nose.y + eyeD * 0.45; y++) {
      for (let x = Math.floor(nose.x - eyeD * 0.6); x <= nose.x + eyeD * 0.6; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H || !maskAt(mask, x, y, W, H)) continue;
        const [cr, cb, yy] = toCrCb((y * W + x) * 4);
        if (yy < 30) continue;
        mCr += cr; mCb += cb; n++;
      }
    }
  }
  const sampled = n > 30;
  if (sampled) { mCr /= n; mCb /= n; }
  const isSkin = (i) => {
    const [cr, cb, yy] = toCrCb(i);
    if (yy < 30) return false;
    return sampled ? Math.abs(cr - mCr) < 11 && Math.abs(cb - mCb) < 11 : (cr > 135 && cr < 180 && cb > 85 && cb < 135);
  };

  const regions = [];
  if (nose.v > 0.35) {
    const eyeY = eyesOk ? (leye.y + reye.y) / 2 : nose.y - eyeD * 0.3;
    const chinY = nose.y + Math.max(nose.y - eyeY, eyeD * 0.3) * 1.9;
    const headHalf = Math.max((lear.v > 0.35 && rear.v > 0.35) ? dist(lear, rear) * 0.85 : 0, sW * 0.3);
    // Cara completa hasta la barbilla; debajo, solo la franja del cuello (no el pecho)
    const neckHalf = Math.max((lear.v > 0.35 && rear.v > 0.35) ? dist(lear, rear) * 0.36 : 0, sW * 0.13);
    regions.push({ type: 'head', chinY, neckHalf, cx: nose.x, x0: nose.x - headHalf, x1: nose.x + headHalf, y0: 0, y1: sMid.y - sW * 0.04 });
  }
  [[15, 17, 19, 21], [16, 18, 20, 22]].forEach((ids) => {
    const pts = ids.map(P).filter(p => p.v > 0.35);
    if (pts.length < 2) return;
    // Cápsula de la muñeca a la punta de los dedos: solo la mano, sin tocar cadera ni muslos
    const wrist = pts[0];
    const tip = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
    const dx = tip.x - wrist.x, dy = tip.y - wrist.y, len = Math.hypot(dx, dy) || 1;
    const end = { x: wrist.x + (dx / len) * Math.max(len * 2.2, sW * 0.35), y: wrist.y + (dy / len) * Math.max(len * 2.2, sW * 0.35) };
    const r = sW * 0.13;
    regions.push({ type: 'hand', a: wrist, b: end, r,
      x0: Math.min(wrist.x, end.x) - r, x1: Math.max(wrist.x, end.x) + r, y0: Math.min(wrist.y, end.y) - r, y1: Math.max(wrist.y, end.y) + r });
  });
  if (!regions.length) return;

  const out = ctx.getImageData(0, 0, W, H);
  regions.forEach((rg) => {
    const x0 = Math.max(0, Math.floor(rg.x0)), x1 = Math.min(W - 1, Math.ceil(rg.x1));
    const y0 = Math.max(0, Math.floor(rg.y0)), y1 = Math.min(H - 1, Math.ceil(rg.y1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!maskAt(mask, x, y, W, H)) continue;
        const i = (y * W + x) * 4;
        if (rg.type === 'hand') {
          // Las manos solo se recuperan si hay tono de piel medido en la cara (nunca la ropa vieja)
          if (!sampled || !isSkin(i)) continue;
          const vx = rg.b.x - rg.a.x, vy = rg.b.y - rg.a.y;
          const t = Math.max(0, Math.min(1, ((x - rg.a.x) * vx + (y - rg.a.y) * vy) / (vx * vx + vy * vy)));
          if (Math.hypot(x - (rg.a.x + vx * t), y - (rg.a.y + vy * t)) > rg.r) continue;
        } else if (y > rg.chinY) {
          // debajo de la barbilla solo vuelve la piel del cuello
          if (Math.abs(x - rg.cx) > rg.neckHalf || !isSkin(i)) continue;
        }
        out.data[i] = od[i]; out.data[i + 1] = od[i + 1]; out.data[i + 2] = od[i + 2];
      }
    }
  });
  ctx.putImageData(out, 0, 0);
};

// Dibuja el contorno del cuerpo detectado (opción "Ver silueta")
const drawSilhouette = (ctx, mask, W, H) => {
  if (!mask) return;
  const c = document.createElement('canvas');
  c.width = mask.w; c.height = mask.h;
  const cctx = c.getContext('2d');
  const img = cctx.createImageData(mask.w, mask.h);
  const d = mask.data, w = mask.w, h = mask.h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      if (!d[k]) continue;
      const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !d[k - 1] || !d[k + 1] || !d[k - w] || !d[k + w];
      const i = k * 4;
      img.data[i] = edge ? 165 : 99; img.data[i + 1] = edge ? 180 : 102; img.data[i + 2] = edge ? 252 : 241;
      img.data[i + 3] = edge ? 255 : 55;
    }
  }
  cctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(c, 0, 0, W, H);
  ctx.restore();
};

// ===== Adaptar la prenda al cuerpo de la foto (contorno + luz y sombras) =====
// Se calcula una vez por foto: silueta un poco ensanchada y la luz del cuerpo difuminada
const buildBodyData = (base, mask, W, H, sW) => {
  // Silueta ensanchada con bordes suaves
  const small = document.createElement('canvas');
  small.width = mask.w; small.height = mask.h;
  const sctx = small.getContext('2d');
  const img = sctx.createImageData(mask.w, mask.h);
  for (let i = 0; i < mask.data.length; i++) if (mask.data[i]) img.data[i * 4 + 3] = 255;
  sctx.putImageData(img, 0, 0);
  const grown = document.createElement('canvas');
  grown.width = W; grown.height = H;
  const gctx = grown.getContext('2d');
  gctx.imageSmoothingEnabled = true;
  const radius = Math.max(3, (sW || W * 0.25) * 0.05);
  gctx.drawImage(small, 0, 0, W, H);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    [radius * 0.5, radius].forEach((rr) => gctx.drawImage(small, Math.cos(a) * rr, Math.sin(a) * rr, W, H));
  }
  const ga = gctx.getImageData(0, 0, W, H).data;
  const bodyAlpha = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i++) bodyAlpha[i] = ga[i * 4 + 3];

  // Luz del cuerpo: se achica y se vuelve a agrandar para quedarse solo con las sombras grandes
  const f1 = document.createElement('canvas');
  f1.width = Math.max(4, Math.round(W / 6)); f1.height = Math.max(4, Math.round(H / 6));
  f1.getContext('2d').drawImage(base, 0, 0, f1.width, f1.height);
  const f2 = document.createElement('canvas');
  f2.width = Math.max(4, Math.round(W / 24)); f2.height = Math.max(4, Math.round(H / 24));
  f2.getContext('2d').drawImage(f1, 0, 0, f2.width, f2.height);
  const blur = document.createElement('canvas');
  blur.width = W; blur.height = H;
  const bctx = blur.getContext('2d');
  bctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in bctx) bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(f2, 0, 0, W, H);
  const bd = bctx.getImageData(0, 0, W, H).data;
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = 0.299 * bd[i * 4] + 0.587 * bd[i * 4 + 1] + 0.114 * bd[i * 4 + 2];
  return { bodyAlpha, lum };
};

// Recorta la prenda al contorno del cuerpo y le pasa las luces y sombras de la foto
const fitLayerToBody = (layer, body, W, H, clip) => {
  const lctx = layer.getContext('2d');
  const id = lctx.getImageData(0, 0, W, H);
  const p = id.data;
  let sum = 0, n = 0;
  for (let i = 0; i < W * H; i++) {
    if (p[i * 4 + 3] > 40 && body.bodyAlpha[i] > 128) { sum += body.lum[i]; n++; }
  }
  const mean = n > 50 ? sum / n : 0;
  for (let i = 0; i < W * H; i++) {
    const j = i * 4;
    let a = p[j + 3];
    if (!a) continue;
    if (clip) {
      a = (a * body.bodyAlpha[i]) / 255;
      p[j + 3] = a;
      if (!a) continue;
    }
    if (mean > 0) {
      const f = 1 + Math.max(-0.3, Math.min(0.2, ((body.lum[i] - mean) / mean) * 0.55));
      p[j] = Math.min(255, p[j] * f);
      p[j + 1] = Math.min(255, p[j + 1] * f);
      p[j + 2] = Math.min(255, p[j + 2] * f);
    }
  }
  lctx.putImageData(id, 0, 0);
};

// Acomoda la prenda (ya colocada) al contorno del cuerpo, fila por fila, con un estiramiento suave
// (máximo ±15%) para que siga la silueta sin deformar el diseño de la prenda.
// RESPALDO: ajuste por filas horizontales. Solo se usa cuando la malla TPS
// no se puede aplicar (pocos puntos del cuerpo visibles en la foto).
const conformLayerToBody = (layer, category, mask, lm, W, H) => {
  if (!mask || !lm || lm.length < 33) return;
  const lctx = layer.getContext('2d', { willReadFrequently: true });
  const px = lctx.getImageData(0, 0, W, H).data;
  const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H, v: lm[i].visibility == null ? 1 : lm[i].visibility });
  const ls = P(11), rs = P(12), lh = P(23), rh = P(24);
  const sW = Math.hypot(ls.x - rs.x, ls.y - rs.y) || W * 0.25;
  const shoulderY = (ls.y + rs.y) / 2;
  const hipY = (lh.y + rh.y) / 2;
  const torso = Math.abs(hipY - shoulderY) || sW * 1.3;
  const arms = [[11, 13, 15], [12, 14, 16]].map(ids => ids.map(P)).filter(pts => pts.every(p => p.v > 0.35));
  const armXAt = (pts, y) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y) && Math.abs(b.y - a.y) > 1) return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
    }
    return null;
  };

  const factors = new Array(H).fill(null), shifts = new Array(H).fill(null), centers = new Array(H).fill(null);
  let rowsWithCloth = 0;
  for (let y = 0; y < H; y++) {
    let l = -1, r = -1;
    for (let x = 0; x < W; x += 2) {
      if (px[(y * W + x) * 4 + 3] > 60) { if (l < 0) l = x; r = x; }
    }
    if (l < 0 || r - l < 6) continue;
    rowsWithCloth++;
    // En vestidos solo se ajusta hasta la cadera; la falda queda libre
    if (category === 'full' && y > hipY + torso * 0.1) { factors[y] = 1; shifts[y] = 0; centers[y] = (l + r) / 2; continue; }
    const gW = r - l, gC = (l + r) / 2;
    let x0 = Math.max(0, Math.floor(l - gW * 0.2)), x1 = Math.min(W - 1, Math.ceil(r + gW * 0.2));
    // Debajo de las axilas, si la prenda no cubre los brazos, se mide solo el torso
    if (category !== 'bottom' && arms.length === 2 && y > shoulderY + torso * 0.2) {
      const xa = armXAt(arms[0], y), xb = armXAt(arms[1], y);
      if (xa != null && xb != null && gW < Math.abs(xa - xb) + sW * 0.1) {
        x0 = Math.max(x0, Math.floor(Math.min(xa, xb) + sW * 0.12));
        x1 = Math.min(x1, Math.ceil(Math.max(xa, xb) - sW * 0.12));
      }
    }
    let bl = -1, br = -1;
    for (let x = x0; x <= x1; x += 2) {
      if (maskAt(mask, x, y, W, H)) { if (bl < 0) bl = x; br = x; }
    }
    if (bl < 0 || br - bl < gW * 0.4) { factors[y] = 1; shifts[y] = 0; centers[y] = gC; continue; }
    const bodyW = (br - bl) * 1.04;
    factors[y] = Math.max(0.85, Math.min(1.15, bodyW / gW));
    shifts[y] = Math.max(-sW * 0.06, Math.min(sW * 0.06, (bl + br) / 2 - gC));
    centers[y] = gC;
  }
  if (!rowsWithCloth) return;

  const sf = smooth(factors, 14), ss = smooth(shifts, 14);
  const copy = document.createElement('canvas');
  copy.width = W; copy.height = H;
  copy.getContext('2d').drawImage(layer, 0, 0);
  lctx.clearRect(0, 0, W, H);
  for (let y = 0; y < H; y++) {
    if (sf[y] == null) continue;
    const f = sf[y], c = centers[y], t = c + ss[y];
    lctx.drawImage(copy, 0, y, W, 1, t - c * f, y, W * f, 1.5);
  }
};

// =====================================================================
//  Deformación orgánica de la prenda (Thin Plate Spline + malla)
//  Sustituye al escalado por tiras horizontales: en vez de estirar cada
//  fila por separado, se construye un campo de deformación suave (C²) a
//  partir de puntos de control anatómicos y se dibuja la prenda como una
//  malla de triángulos con textura. Así la tela se curva con el cuerpo.
// =====================================================================

// Núcleo del TPS en 2D: U(r) = r² · log(r)
const tpsKernel = (r2) => (r2 <= 1e-10 ? 0 : 0.5 * r2 * Math.log(r2));

// Gauss con pivoteo parcial. Devuelve null si el sistema es singular.
const solveLinearSystem = (A, b) => {
  const n = b.length;
  const M = A.map((fila, i) => [...fila, b[i]]);
  for (let col = 0; col < n; col++) {
    let mejor = col;
    for (let f = col + 1; f < n; f++) if (Math.abs(M[f][col]) > Math.abs(M[mejor][col])) mejor = f;
    if (Math.abs(M[mejor][col]) < 1e-12) return null;
    if (mejor !== col) { const t = M[col]; M[col] = M[mejor]; M[mejor] = t; }
    const pivote = M[col][col];
    for (let f = col + 1; f < n; f++) {
      const factor = M[f][col] / pivote;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) M[f][c] -= factor * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let f = n - 1; f >= 0; f--) {
    let suma = M[f][n];
    for (let c = f + 1; c < n; c++) suma -= M[f][c] * x[c];
    x[f] = suma / M[f][f];
  }
  return x;
};

/**
 * Construye la función de deformación TPS que lleva los puntos `origen`
 * a los puntos `destino`.
 * @param {Array<[number,number]>} origen   puntos en la imagen de la prenda
 * @param {Array<[number,number]>} destino  puntos sobre el cuerpo
 * @param {number} suavizado  0 = pasa exacto por los puntos; >0 relaja y
 *        evita que la malla se pliegue sobre sí misma
 * @returns {(x:number,y:number)=>[number,number]} o null si no se pudo resolver
 */
const buildTPS = (origen, destino, suavizado = 0) => {
  const n = origen.length;
  if (n < 3 || destino.length !== n) return null;

  // Normalizar a escala ~1 para que el sistema esté bien condicionado
  let cx = 0, cy = 0;
  origen.forEach(([x, y]) => { cx += x; cy += y; });
  cx /= n; cy /= n;
  let escala = 0;
  origen.forEach(([x, y]) => { escala = Math.max(escala, Math.hypot(x - cx, y - cy)); });
  escala = escala || 1;
  const nx = origen.map(([x, y]) => [(x - cx) / escala, (y - cy) / escala]);

  const N = n + 3;
  const A = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const dx = nx[i][0] - nx[j][0], dy = nx[i][1] - nx[j][1];
      A[i][j] = i === j ? suavizado : tpsKernel(dx * dx + dy * dy);
    }
    A[i][n] = 1; A[i][n + 1] = nx[i][0]; A[i][n + 2] = nx[i][1];
    A[n][i] = 1; A[n + 1][i] = nx[i][0]; A[n + 2][i] = nx[i][1];
  }

  const bx = new Array(N).fill(0), by = new Array(N).fill(0);
  for (let i = 0; i < n; i++) { bx[i] = destino[i][0]; by[i] = destino[i][1]; }
  const wx = solveLinearSystem(A, bx);
  const wy = solveLinearSystem(A, by);
  if (!wx || !wy) return null;

  return (x, y) => {
    const px = (x - cx) / escala, py = (y - cy) / escala;
    let ox = wx[n] + wx[n + 1] * px + wx[n + 2] * py;
    let oy = wy[n] + wy[n + 1] * px + wy[n + 2] * py;
    for (let i = 0; i < n; i++) {
      const dx = px - nx[i][0], dy = py - nx[i][1];
      const u = tpsKernel(dx * dx + dy * dy);
      if (u === 0) continue;
      ox += wx[i] * u;
      oy += wy[i] * u;
    }
    return [ox, oy];
  };
};

// Dibuja un triángulo de la textura con transformación afín.
// `margen` agranda el recorte para que no se vean costuras entre triángulos.
const drawTexturedTriangle = (ctx, img, s0, s1, s2, d0, d1, d2, margen) => {
  const den = s0[0] * (s2[1] - s1[1]) - s1[0] * s2[1] + s2[0] * s1[1] + (s1[0] - s2[0]) * s0[1];
  if (!isFinite(den) || Math.abs(den) < 1e-8) return;

  const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3;
  const crecer = (p) => {
    const dx = p[0] - cx, dy = p[1] - cy, l = Math.hypot(dx, dy);
    return l < 1e-6 ? p : [p[0] + (dx / l) * margen, p[1] + (dy / l) * margen];
  };
  const e0 = crecer(d0), e1 = crecer(d1), e2 = crecer(d2);

  const a = (d0[0] * (s2[1] - s1[1]) - d1[0] * s2[1] + d2[0] * s1[1] + (d1[0] - d2[0]) * s0[1]) / den;
  const b = -(d0[0] * (s2[0] - s1[0]) - d1[0] * s2[0] + d2[0] * s1[0] + (d1[0] - d2[0]) * s0[0]) / den;
  const c = (d0[1] * (s2[1] - s1[1]) - d1[1] * s2[1] + d2[1] * s1[1] + (d1[1] - d2[1]) * s0[1]) / den;
  const d = -(d0[1] * (s2[0] - s1[0]) - d1[1] * s2[0] + d2[1] * s1[0] + (d1[1] - d2[1]) * s0[0]) / den;
  const e = (d0[0] * (s2[0] * s1[1] - s1[0] * s2[1]) + s0[0] * (d1[0] * s2[1] - d2[0] * s1[1]) + s0[1] * (d2[0] * s1[0] - d1[0] * s2[0])) / den;
  const f = (d0[1] * (s2[0] * s1[1] - s1[0] * s2[1]) + s0[0] * (d1[1] * s2[1] - d2[1] * s1[1]) + s0[1] * (d2[1] * s1[0] - d1[1] * s2[0])) / den;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.lineTo(e2[0], e2[1]);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, c, b, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
};

/**
 * Dibuja la imagen `img` deformada por `mapear`, como una malla de triángulos.
 * @param {Function} mapear (x,y) -> [x,y] en coordenadas del lienzo destino
 * @param {object} rect zona de la imagen a mallar {x0,y0,x1,y1}
 */
const drawWarpedMesh = (ctx, img, rect, mapear, columnas, filas) => {
  const { x0, y0, x1, y1 } = rect;
  const anchoPaso = (x1 - x0) / columnas, altoPaso = (y1 - y0) / filas;

  // Se calculan todos los vértices una sola vez y se reutilizan
  const origen = [], destino = [];
  for (let f = 0; f <= filas; f++) {
    const filaO = [], filaD = [];
    for (let c = 0; c <= columnas; c++) {
      const sx = x0 + c * anchoPaso, sy = y0 + f * altoPaso;
      filaO.push([sx, sy]);
      filaD.push(mapear(sx, sy));
    }
    origen.push(filaO); destino.push(filaD);
  }

  // Margen proporcional al tamaño del triángulo, para tapar costuras
  const margen = Math.max(0.6, Math.min(anchoPaso, altoPaso) * 0.08);
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      const sA = origen[f][c], sB = origen[f][c + 1], sC = origen[f + 1][c + 1], sD = origen[f + 1][c];
      const dA = destino[f][c], dB = destino[f][c + 1], dC = destino[f + 1][c + 1], dD = destino[f + 1][c];
      drawTexturedTriangle(ctx, img, sA, sB, sC, dA, dB, dC, margen);
      drawTexturedTriangle(ctx, img, sA, sC, sD, dA, dC, dD, margen);
    }
  }
};

// ===== Puntos de control: prenda y cuerpo =====

// Interpolación suave entre puntos de una polilínea (Catmull-Rom)
const curvaEn = (puntos, t) => {
  const n = puntos.length;
  if (n === 0) return [0, 0];
  if (n === 1) return puntos[0];
  const pos = Math.max(0, Math.min(1, t)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(pos));
  const u = pos - i;
  const p0 = puntos[Math.max(0, i - 1)], p1 = puntos[i], p2 = puntos[i + 1], p3 = puntos[Math.min(n - 1, i + 2)];
  const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])];
};

// Punto del eje anatómico a una altura dada. Fuera del rango, extrapola
// con la pendiente del extremo, para no acortar la prenda.
const ejeEnAltura = (eje, y) => {
  const n = eje.length;
  if (n === 1) return { x: eje[0][0], pend: 0 };
  let i = 0;
  while (i < n - 2 && y > eje[i + 1][1]) i++;
  const a = eje[i], b = eje[i + 1];
  const dy = b[1] - a[1];
  const pend = Math.abs(dy) < 1e-6 ? 0 : (b[0] - a[0]) / dy;
  return { x: a[0] + (y - a[1]) * pend, pend };
};

/**
 * Anatomía del cuerpo para una categoría de prenda: eje central curvo y
 * media anchura a lo largo de ese eje. Los anchos se miden en la silueta
 * real (mask) y, si no se puede, caen a proporciones de los landmarks.
 */
const bodyAnchors = (category, lm, mask, W, H) => {
  if (!lm || lm.length < 33) return null;
  const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H, v: lm[i].visibility == null ? 1 : lm[i].visibility });
  const visible = (...ps) => ps.every(p => p.v > 0.35);
  const medio = (a, b) => [(a.x + b.x) / 2, (a.y + b.y) / 2];

  const ls = P(11), rs = P(12), lh = P(23), rh = P(24);
  if (!visible(ls, rs)) return null;
  const sMid = medio(ls, rs);
  const sW = Math.hypot(ls.x - rs.x, ls.y - rs.y) || W * 0.25;
  const hayCadera = visible(lh, rh);
  const hMid = hayCadera ? medio(lh, rh) : [sMid[0], sMid[1] + sW * 1.3];
  const hW = hayCadera ? Math.hypot(lh.x - rh.x, lh.y - rh.y) : sW * 0.78;
  const torso = Math.hypot(hMid[0] - sMid[0], hMid[1] - sMid[1]) || sW * 1.3;

  // Brazos, para no medir el ancho del torso por encima de ellos
  const brazos = [[11, 13, 15], [12, 14, 16]].map(ids => ids.map(P)).filter(ps => ps.every(p => p.v > 0.35));
  const brazoEnY = (ps, y) => {
    for (let i = 0; i < ps.length - 1; i++) {
      const a = ps[i], b = ps[i + 1];
      if (y >= Math.min(a.y, b.y) && y <= Math.max(a.y, b.y) && Math.abs(b.y - a.y) > 1) {
        return a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
      }
    }
    return null;
  };

  // Eje central: de hombros a cadera y, en pantalones, sigue hasta los tobillos
  let eje, mediaAnchuraBase;
  if (category === 'bottom') {
    const lk = P(25), rk = P(26), la = P(27), ra = P(28);
    const kMid = visible(lk, rk) ? medio(lk, rk) : [hMid[0], hMid[1] + torso * 0.9];
    const aMid = visible(la, ra) ? medio(la, ra) : [kMid[0], kMid[1] + torso * 0.9];
    eje = [hMid, [(hMid[0] + kMid[0]) / 2, (hMid[1] + kMid[1]) / 2], kMid, aMid];
    const piernas = Math.hypot(aMid[0] - hMid[0], aMid[1] - hMid[1]) || torso * 1.8;
    mediaAnchuraBase = [hW * 0.62, hW * 0.55, hW * 0.42, hW * 0.34];
    return { eje, mediaAnchuraBase, sW, hW, torso, largo: piernas, brazos, brazoEnY, desdeY: hMid[1], hastaY: aMid[1] };
  }

  const pecho = [sMid[0] + (hMid[0] - sMid[0]) * 0.32, sMid[1] + (hMid[1] - sMid[1]) * 0.32];
  const cintura = [sMid[0] + (hMid[0] - sMid[0]) * 0.72, sMid[1] + (hMid[1] - sMid[1]) * 0.72];
  if (category === 'full') {
    const lk = P(25), rk = P(26);
    const kMid = visible(lk, rk) ? medio(lk, rk) : [hMid[0], hMid[1] + torso];
    const ruedo = [hMid[0] + (kMid[0] - hMid[0]) * 0.85, hMid[1] + (kMid[1] - hMid[1]) * 0.85];
    eje = [sMid, pecho, cintura, hMid, ruedo];
    mediaAnchuraBase = [sW * 0.5, sW * 0.47, sW * 0.42, hW * 0.56, hW * 0.72];
    return { eje, mediaAnchuraBase, sW, hW, torso, largo: Math.hypot(ruedo[0] - sMid[0], ruedo[1] - sMid[1]), brazos, brazoEnY, desdeY: sMid[1], hastaY: ruedo[1] };
  }

  eje = [sMid, pecho, cintura, hMid];
  mediaAnchuraBase = [sW * 0.5, sW * 0.47, sW * 0.43, hW * 0.58];
  return { eje, mediaAnchuraBase, sW, hW, torso, largo: torso, brazos, brazoEnY, desdeY: sMid[1], hastaY: hMid[1] };
};

// Media anchura real del cuerpo a una altura dada, medida en la silueta
const mediaAnchuraEnY = (ana, mask, y, W, H, centroX, limite) => {
  if (!mask) return null;
  let x0 = Math.max(0, Math.floor(centroX - limite * 1.6));
  let x1 = Math.min(W - 1, Math.ceil(centroX + limite * 1.6));
  if (ana.brazos.length === 2) {
    const xa = ana.brazoEnY(ana.brazos[0], y), xb = ana.brazoEnY(ana.brazos[1], y);
    if (xa != null && xb != null && Math.abs(xa - xb) > ana.sW * 0.5) {
      x0 = Math.max(x0, Math.floor(Math.min(xa, xb) + ana.sW * 0.1));
      x1 = Math.min(x1, Math.ceil(Math.max(xa, xb) - ana.sW * 0.1));
    }
  }
  let bl = -1, br = -1;
  for (let x = x0; x <= x1; x += 2) {
    if (maskAt(mask, x, Math.round(y), W, H)) { if (bl < 0) bl = x; br = x; }
  }
  if (bl < 0 || br - bl < ana.sW * 0.25) return null;
  return { centro: (bl + br) / 2, media: (br - bl) / 2 };
};

/**
 * Deforma la prenda para que siga el cuerpo y la dibuja en `ctx`.
 * Devuelve true si se pudo deformar; false si conviene el dibujo rígido.
 *
 * @param ctx      lienzo destino (tamaño W×H)
 * @param g        lienzo de la prenda ya recortada
 * @param place    colocación rígida calculada antes {cx, cy, w, h, angle}
 * @param elastico cuánto se permite estirar la tela (0.18 = ±18%)
 */
const warpGarmentToBody = (ctx, g, place, category, lm, mask, W, H, elastico = 0.18) => {
  // Escape de emergencia: window.VTRYON_SIN_MALLA = true vuelve al método
  // anterior (útil para comparar y para equipos muy lentos)
  if (typeof window !== 'undefined' && window.VTRYON_SIN_MALLA) return false;
  // Solo prendas de torso: el pantalón son dos piernas separadas y un eje
  // único lo partiría por la mitad. Ese caso sigue con el ajuste por filas.
  if (category !== 'top' && category !== 'full') return false;
  const ana = bodyAnchors(category, lm, mask, W, H);
  if (!ana) return false;
  const filas = garmentRows(g);
  if (!filas) return false;

  // Zona útil de la prenda: filas con tela
  let gTop = -1, gBot = -1;
  for (let y = 0; y < g.height; y++) if (filas[y][0] >= 0) { if (gTop < 0) gTop = y; gBot = y; }
  if (gTop < 0 || gBot - gTop < 8) return false;

  // Rectángulo que ocupa la prenda colocada de forma rígida
  const izq = place.cx - place.w / 2, arriba = place.cy - place.h / 2;
  const aEscalaX = place.w / g.width, aEscalaY = place.h / g.height;

  // --- Pares de control ---
  // Para varias alturas de la prenda se toma su borde izquierdo, su centro
  // y su borde derecho, y se llevan al eje y al ancho reales del cuerpo.
  const NIVELES = 9;
  const origen = [], destino = [];
  let medidos = 0;

  for (let k = 0; k < NIVELES; k++) {
    const t = k / (NIVELES - 1);
    const gy = gTop + t * (gBot - gTop);
    const fila = filas[Math.min(g.height - 1, Math.round(gy))];
    if (!fila || fila[0] < 0) continue;

    // Cuerpo de la prenda (tramo continuo central, sin mangas sueltas)
    const usarCentro = fila[2] >= 0 && (fila[3] - fila[2]) > (fila[1] - fila[0]) * 0.35;
    const gl = usarCentro ? fila[2] : fila[0];
    const gr = usarCentro ? fila[3] : fila[1];
    const gc = (gl + gr) / 2;

    // Posición rígida de esos tres puntos. La altura NO se toca: el largo de
    // la prenda ya lo decidió bodyPlacement/sizeTopToTorso. La malla solo
    // ajusta el contorno lateral y la curvatura.
    const sxIzq = izq + gl * aEscalaX, sxDer = izq + gr * aEscalaX, sxCen = izq + gc * aEscalaX;
    const syRigido = arriba + gy * aEscalaY;
    const mediaRigida = Math.max(4, (sxDer - sxIzq) / 2);

    // Eje del cuerpo a esa misma altura, y su inclinación
    const enEje = ejeEnAltura(ana.eje, syRigido);
    const nX = 1 / Math.hypot(1, enEje.pend), nY = -enEje.pend / Math.hypot(1, enEje.pend);

    // Media anchura objetivo: la medida en la silueta, o la anatómica
    const tAnat = Math.max(0, Math.min(1, (syRigido - ana.desdeY) / Math.max(1, ana.hastaY - ana.desdeY)));
    let mediaObjetivo = curvaEn(ana.mediaAnchuraBase.map(m => [m, 0]), tAnat)[0];
    let centroX = enEje.x;
    const medida = mediaAnchuraEnY(ana, mask, syRigido, W, H, enEje.x, Math.max(mediaRigida, ana.sW));
    if (medida) {
      mediaObjetivo = medida.media;
      // El eje se corrige hacia el centro real del cuerpo, con tope
      const corr = Math.max(-ana.sW * 0.12, Math.min(ana.sW * 0.12, medida.centro - enEje.x));
      centroX = enEje.x + corr;
      medidos++;
    }

    // La tela estira poco: se limita respecto a su ancho natural.
    // Arriba (hombros y mangas) no se deja encoger, o asomaría la piel.
    const encoge = t < 0.22 ? 0.02 : elastico;
    const media = Math.max(mediaRigida * (1 - encoge), Math.min(mediaRigida * (1 + elastico), mediaObjetivo * 1.02));

    // Curvatura envolvente: la tela rodea un cuerpo redondo, así que el
    // dobladillo se ve curvo (los costados quedan más arriba que el centro).
    // Solo se aplica del pecho hacia abajo; arriba la prenda debe quedarse
    // pegada a los hombros.
    const horizonte = (ana.desdeY + ana.hastaY) / 2;
    const envolver = -0.07 * Math.max(0, syRigido - horizonte);

    origen.push([sxIzq, syRigido], [sxCen, syRigido], [sxDer, syRigido]);
    destino.push(
      [centroX - nX * media, syRigido - nY * media + envolver],
      [centroX, syRigido],
      [centroX + nX * media, syRigido + nY * media + envolver]
    );
  }

  // Sin suficientes medidas reales no vale la pena deformar
  if (origen.length < 9 || medidos < 3) return false;

  const suavizado = 0.02;
  const mapear = buildTPS(origen, destino, suavizado);
  if (!mapear) return false;

  // Seguridad: si el campo pliega la malla sobre sí misma, se descarta
  const pruebaA = mapear(izq, arriba);
  const pruebaB = mapear(izq + place.w, arriba + place.h);
  if (!isFinite(pruebaA[0]) || !isFinite(pruebaB[0])) return false;
  const diagonal = Math.hypot(pruebaB[0] - pruebaA[0], pruebaB[1] - pruebaA[1]);
  if (diagonal < place.w * 0.4 || diagonal > place.w * 4) return false;

  // La malla no debe plegarse sobre sí misma: se comprueba que el
  // jacobiano siga siendo positivo en una rejilla de muestra.
  const pasoX = place.w / 6, pasoY = place.h / 8;
  for (let my = arriba; my <= arriba + place.h + 0.1; my += pasoY) {
    for (let mx = izq; mx <= izq + place.w + 0.1; mx += pasoX) {
      const p0 = mapear(mx, my), p1 = mapear(mx + 1, my), p2 = mapear(mx, my + 1);
      const jac = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]);
      if (!isFinite(jac) || jac <= 0.02) return false;
    }
  }

  // Malla: más densa en prendas grandes, sin pasarse para no perder fluidez
  const lado = Math.max(place.w, place.h);
  const columnas = Math.max(8, Math.min(18, Math.round(lado / 34)));
  const filasMalla = Math.max(10, Math.min(26, Math.round(lado / 24)));

  // Se mallan las coordenadas del lienzo destino que ocupa la prenda rígida
  const rect = { x0: izq, y0: arriba, x1: izq + place.w, y1: arriba + place.h };

  // La textura hay que dibujarla en las mismas coordenadas: lienzo temporal
  // con la prenda ya colocada de forma rígida.
  const rigido = document.createElement('canvas');
  rigido.width = W; rigido.height = H;
  drawRigid(rigido.getContext('2d'), g, place);

  drawWarpedMesh(ctx, rigido, rect, mapear, columnas, filasMalla);
  return true;
};

/**
 * Sombreado de volumen: oscurece los costados de la prenda siguiendo el
 * eje del cuerpo, para que la tela deje de verse plana. Es sutil y sigue
 * la misma curva que usó la deformación.
 */
const shadeGarmentVolume = (layer, category, lm, mask, W, H, fuerza = 0.3) => {
  const ana = bodyAnchors(category, lm, mask, W, H);
  if (!ana || fuerza <= 0) return;
  const ctx = layer.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, W, H);
  const p = img.data;

  const desde = Math.max(0, Math.floor(ana.desdeY - ana.torso * 0.1));
  const hasta = Math.min(H - 1, Math.ceil(ana.hastaY + ana.torso * 0.1));
  const alto = Math.max(1, hasta - desde);

  for (let y = desde; y <= hasta; y++) {
    const t = (y - desde) / alto;
    const centro = curvaEn(ana.eje, t);
    const media = Math.max(6, curvaEn(ana.mediaAnchuraBase.map(m => [m, 0]), t)[0]);
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (p[i + 3] < 8) continue;
      // u = -1 borde izquierdo, 0 centro, 1 borde derecho
      const u = Math.max(-1, Math.min(1, (x - centro[0]) / media));
      // Perfil cilíndrico: claro cerca del centro, oscuro en los bordes
      const factor = 1 + fuerza * (Math.cos(u * 1.35) - 0.78);
      p[i] = Math.max(0, Math.min(255, p[i] * factor));
      p[i + 1] = Math.max(0, Math.min(255, p[i + 1] * factor));
      p[i + 2] = Math.max(0, Math.min(255, p[i + 2] * factor));
    }
  }
  ctx.putImageData(img, 0, 0);
};

// ===== Camisas: tapar la ropa vieja que se asoma (cuello, hombros, costados) =====
// Rellena con el color de la prenda las partes del cuerpo que la prenda debería cubrir y no alcanza.
// Después se recupera la piel (cuello y manos), así que solo queda tapada la ropa original.
const fillTopGaps = (layer, mask, lm, W, H) => {
  if (!mask || !lm || lm.length < 33) return;
  const lctx = layer.getContext('2d', { willReadFrequently: true });
  const id = lctx.getImageData(0, 0, W, H);
  const p = id.data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < W * H; i += 3) {
    if (p[i * 4 + 3] > 220) { r += p[i * 4]; g += p[i * 4 + 1]; b += p[i * 4 + 2]; n++; }
  }
  if (n < 100) return;
  r /= n; g /= n; b /= n;

  const ext = new Array(H).fill(null);
  let lastRow = -1;
  for (let y = 0; y < H; y++) {
    let l = -1, rr = -1;
    for (let x = 0; x < W; x += 2) if (p[(y * W + x) * 4 + 3] > 60) { if (l < 0) l = x; rr = x; }
    if (l >= 0) { ext[y] = [l, rr]; lastRow = y; }
  }
  if (lastRow < 0) return;

  const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H });
  const shoulderY = (P(11).y + P(12).y) / 2;
  const hipY = (P(23).y + P(24).y) / 2;
  const torso = Math.abs(hipY - shoulderY) || H * 0.25;
  const y0 = Math.max(0, Math.floor(shoulderY - torso * 0.08));
  const look = Math.max(4, Math.round(torso * 0.15));

  for (let y = y0; y <= lastRow; y++) {
    let L = W, R = -1;
    for (let k = y; k <= Math.min(H - 1, y + look); k++) {
      if (ext[k]) { L = Math.min(L, ext[k][0]); R = Math.max(R, ext[k][1]); }
    }
    if (R < 0) continue;
    for (let x = L; x <= R; x++) {
      const j = (y * W + x) * 4;
      const a = p[j + 3];
      if (a > 230 || !maskAt(mask, x, y, W, H)) continue;
      const k = a / 255;
      p[j] = p[j] * k + r * (1 - k);
      p[j + 1] = p[j + 1] * k + g * (1 - k);
      p[j + 2] = p[j + 2] * k + b * (1 - k);
      p[j + 3] = 255;
    }
  }
  lctx.putImageData(id, 0, 0);
};

// ===== Zapatos: uno en cada pie =====
// Separa una foto de par en dos zapatos; si es un solo zapato, se usa en ambos pies (uno reflejado)
const cropCanvas = (src, x0, y0, w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  c.getContext('2d').drawImage(src, x0, y0, w, h, 0, 0, w, h);
  return c;
};

const analyzeShoe = (g) => {
  if (g._shoe) return g._shoe;
  let d;
  try { d = g.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, g.width, g.height).data; } catch (e) { return (g._shoe = [g]); }
  const cols = new Array(g.width).fill(0);
  for (let x = 0; x < g.width; x++) {
    for (let y = 0; y < g.height; y += 2) if (d[(y * g.width + x) * 4 + 3] > 40) cols[x]++;
  }
  const runs = [];
  let start = -1;
  for (let x = 0; x <= g.width; x++) {
    const on = x < g.width && cols[x] > 1;
    if (on && start < 0) start = x;
    if (!on && start >= 0) { runs.push([start, x - 1]); start = -1; }
  }
  const big = runs.filter(([a, b]) => b - a + 1 >= g.width * 0.2).sort((a, b) => a[0] - b[0]);
  if (big.length >= 2) {
    const pieces = [big[0], big[big.length - 1]].map(([a, b]) => {
      let top = g.height, bottom = -1;
      for (let y = 0; y < g.height; y++) {
        for (let x = a; x <= b; x++) if (d[(y * g.width + x) * 4 + 3] > 40) { if (y < top) top = y; bottom = y; break; }
      }
      return cropCanvas(g, a, top, b - a + 1, bottom - top + 1);
    });
    pieces.pair = true;
    return (g._shoe = pieces);
  }
  return (g._shoe = [g]);
};

// Hacia dónde apunta la punta: el lado del talón es más alto (ahí está el tobillo)
const toeDirection = (c) => {
  if (c._toe) return c._toe;
  let d;
  try { d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data; } catch (e) { return 'left'; }
  const colHeight = (x) => {
    for (let y = 0; y < c.height; y++) if (d[(y * c.width + x) * 4 + 3] > 40) return c.height - y;
    return 0;
  };
  let left = 0, right = 0;
  const q = Math.max(1, Math.floor(c.width * 0.25));
  for (let x = 0; x < q; x++) { left += colHeight(x); right += colHeight(c.width - 1 - x); }
  c._toe = left > right ? 'right' : 'left';
  return c._toe;
};

const drawShoes = (ctx, g, lm, mask, W, H) => {
  if (!lm || lm.length < 33) return false;
  const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H, v: lm[i].visibility == null ? 1 : lm[i].visibility });
  const ok = (p) => p.v > 0.35 && p.x > 0 && p.x < W && p.y > 0 && p.y < H * 1.05;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const ls = P(11), rs = P(12);
  const sW = (ok(ls) && ok(rs)) ? dist(ls, rs) : W * 0.2;
  const feet = [[27, 29, 31], [28, 30, 32]]
    .map(([a, h, t]) => ({ ankle: P(a), heel: P(h), toe: P(t) }))
    .filter(f => ok(f.ankle));
  if (feet.length < 2) return false;
  feet.sort((a, b) => a.ankle.x - b.ankle.x);
  const midX = (feet[0].ankle.x + feet[1].ankle.x) / 2;
  const pieces = analyzeShoe(g);

  feet.forEach((f, idx) => {
    const side = idx === 0 ? 'left' : 'right';
    const footLen = ok(f.heel) && ok(f.toe) ? Math.max(dist(f.heel, f.toe), sW * 0.18) : sW * 0.3;
    const ground = Math.max(f.ankle.y, ok(f.heel) ? f.heel.y : 0, ok(f.toe) ? f.toe.y : 0) + footLen * 0.15;

    // Zona del pie en la silueta (sin invadir el otro pie)
    let bx0 = W, bx1 = -1, by0 = H, by1 = -1;
    if (mask) {
      const xa = Math.max(0, Math.floor(side === 'left' ? f.ankle.x - sW * 0.5 : midX));
      const xb = Math.min(W - 1, Math.ceil(side === 'left' ? midX : f.ankle.x + sW * 0.5));
      const ya = Math.max(0, Math.floor(f.ankle.y - footLen * 0.35));
      const yb = Math.min(H - 1, Math.ceil(ground + footLen * 0.6));
      for (let y = ya; y <= yb; y += 2) {
        for (let x = xa; x <= xb; x += 2) {
          if (maskAt(mask, x, y, W, H)) {
            if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
            if (y < by0) by0 = y; if (y > by1) by1 = y;
          }
        }
      }
    }
    const found = bx1 > bx0 && by1 > by0;

    const piece = pieces.pair ? pieces[idx] : pieces[0];
    const aspect = piece.height / piece.width;
    let w = Math.max(found ? (bx1 - bx0) * 1.2 : 0, footLen * 1.8, sW * 0.35);
    let h = w * aspect;
    if (found && h < (by1 - by0) * 1.1) { h = (by1 - by0) * 1.1; w = h / aspect; }
    w = Math.min(w, sW * 0.95); h = w * aspect;

    const bottom = (found ? Math.max(by1, ground - footLen * 0.1) : ground) + h * 0.03;
    const cx = (found ? (bx0 + bx1) / 2 : f.ankle.x) + (side === 'left' ? -w * 0.1 : w * 0.1);
    const mirror = !pieces.pair && toeDirection(piece) !== side;

    ctx.save();
    ctx.translate(cx, bottom - h / 2);
    if (mirror) ctx.scale(-1, 1);
    ctx.drawImage(piece, -w / 2, -h / 2, w, h);
    ctx.restore();
  });
  return true;
};

// Revisa si la persona está bien parada dentro de la guía (coordenadas 0..1 del recuadro)
const checkPoseForPhoto = (lm) => {
  if (!lm || lm.length < 33) return { ok: false, msg: 'Colócate dentro de la silueta, de cuerpo completo' };
  const seen = (i) => lm[i].visibility > 0.5 && lm[i].x > 0.02 && lm[i].x < 0.98 && lm[i].y > 0.01 && lm[i].y < 0.99;
  if (!seen(27) || !seen(28)) return { ok: false, msg: 'Aléjate un poco: necesitamos verte hasta los pies' };
  if (!seen(0)) return { ok: false, msg: 'Aléjate un poco: tu cara debe quedar dentro del recuadro' };
  if (!seen(11) || !seen(12) || !seen(23) || !seen(24)) return { ok: false, msg: 'Colócate de frente dentro de la silueta' };
  const shoulderY = (lm[11].y + lm[12].y) / 2;
  const headTop = lm[0].y - (shoulderY - lm[0].y) * 0.9;
  const feetY = Math.max(lm[27].y, lm[28].y);
  const bodyH = feetY - lm[0].y;
  if (headTop < 0.02) return { ok: false, msg: 'Aléjate un poco: la cabeza queda muy arriba' };
  if (bodyH < 0.6) return { ok: false, msg: 'Acércate un poco a la cámara' };
  if (bodyH > 0.88) return { ok: false, msg: 'Aléjate un poco de la cámara' };
  const hipX = (lm[23].x + lm[24].x) / 2;
  if (hipX < 0.42) return { ok: false, msg: 'Muévete un poco hacia la derecha de la pantalla' };
  if (hipX > 0.58) return { ok: false, msg: 'Muévete un poco hacia la izquierda de la pantalla' };
  const shoulderW = Math.abs(lm[11].x - lm[12].x);
  if (shoulderW / bodyH < 0.13) return { ok: false, msg: 'Ponte de frente a la cámara' };
  const wristsSeen = seen(15) && seen(16);
  if (wristsSeen) {
    const gapL = Math.abs(lm[15].x - lm[23].x), gapR = Math.abs(lm[16].x - lm[24].x);
    if (Math.min(gapL, gapR) < shoulderW * 0.28) return { ok: false, msg: 'Separa un poco los brazos del cuerpo (manos fuera de los bolsillos)' };
  }
  return { ok: true, msg: '¡Perfecto! No te muevas' };
};

// ===== Maniquí de prueba (cuerpo conocido: no necesita detector) =====
const MANNEQUIN_BODY = "data:image/webp;base64,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";
const MANNEQUIN_POINTS = [[0.5, 0.132], [0.5147, 0.112], [0.524, 0.112], [0.5347, 0.112], [0.4853, 0.112], [0.476, 0.112], [0.4653, 0.112], [0.5653, 0.122], [0.4347, 0.122], [0.516, 0.156], [0.484, 0.156], [0.624, 0.238], [0.376, 0.238], [0.6827, 0.382], [0.3173, 0.382], [0.7093, 0.506], [0.2907, 0.506], [0.72, 0.56], [0.28, 0.56], [0.7107, 0.572], [0.2893, 0.572], [0.696, 0.548], [0.304, 0.548], [0.5653, 0.5], [0.4347, 0.5], [0.5573, 0.722], [0.4427, 0.722], [0.5493, 0.922], [0.4507, 0.922], [0.5467, 0.944], [0.4533, 0.944], [0.5867, 0.968], [0.4133, 0.968]];
let mannequinCache = null;
const buildMannequin = async (dark) => {
  if (mannequinCache && mannequinCache.dark === dark) return mannequinCache;
  const body = await loadImage(MANNEQUIN_BODY);
  const W = body.naturalWidth || 750, H = body.naturalHeight || 1000;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, dark ? '#2a2d36' : '#eef0f4');
  g.addColorStop(1, dark ? '#15171c' : '#cfd4dc');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H * 0.968); ctx.scale(1, 0.18);
  const sh = ctx.createRadialGradient(0, 0, 10, 0, 0, 150);
  sh.addColorStop(0, 'rgba(0,0,0,0.3)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 0, 150, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Silueta exacta a partir de la transparencia del cuerpo
  const only = document.createElement('canvas');
  only.width = W; only.height = H;
  const octx = only.getContext('2d', { willReadFrequently: true });
  octx.drawImage(body, 0, 0, W, H);
  const a = octx.getImageData(0, 0, W, H).data;
  const data = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) data[i] = a[i * 4 + 3] > 100 ? 1 : 0;
  ctx.drawImage(body, 0, 0, W, H);
  const url = c.toDataURL('image/jpeg', 0.93);
  const landmarks = MANNEQUIN_POINTS.map(([x, y]) => ({ x, y, z: 0, visibility: 0.99 }));
  mannequinCache = { dark, url, pose: { landmarks, mask: { w: W, h: H, data } } };
  return mannequinCache;
};

// Orden en que se visten las capas (de abajo hacia arriba)
const LAYER_ORDER = ['bottom', 'shoes', 'full', 'top', 'head'];

global.VTryOn = { loadImage, srcOf, compressImage, prepareGarment, standardPlacement, bodyPlacement, sizeTopToTorso, drawOnSilhouette, drawRigid, conformLayerToBody, buildBodyData, fitLayerToBody, fillTopGaps, drawShoes, restoreBodyParts, drawSilhouette, checkPoseForPhoto, buildMannequin, buildTPS, drawWarpedMesh, bodyAnchors, warpGarmentToBody, shadeGarmentVolume, LAYER_ORDER };
})(window);
