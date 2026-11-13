'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = Object.assign({ sets: {}, cur: null, hideDone: true },
  JSON.parse(localStorage.getItem('lf.v1') || 'null'));
delete store.key; // older versions kept a Rebrickable key here
const save = () => localStorage.setItem('lf.v1', JSON.stringify(store));
const cur = () => store.sets[store.cur];
const left = p => p.qty - (cur().found[p.key] || 0);
const partByKey = k => cur().parts.find(p => p.key === k);

function bump(key, delta) {
  const s = cur(), p = partByKey(key);
  s.found[key] = Math.max(0, Math.min(p.qty, (s.found[key] || 0) + delta));
  save();
}

// ---------- Rebrickable ----------
const SET_ERRORS = {
  no_key: 'Na serveru chybí API klíč Rebrickable (proměnná REBRICKABLE_API_KEY v Netlify).',
  bad_key: 'Rebrickable odmítl API klíč nastavený v Netlify.',
  bad_number: 'Tohle nevypadá jako číslo sady.',
  not_found: 'Sada s tímhle číslem neexistuje.',
  busy: 'Rebrickable je přetížený, zkus to za chvíli znovu.',
};

// The set comes from our own Netlify function, which holds the Rebrickable key.
async function loadSet(input) {
  let num = input.trim();
  if (!num) return;
  if (!/-\d+$/.test(num)) num += '-1';
  const r = await fetch('/api/set/' + encodeURIComponent(num));
  const isJson = (r.headers.get('content-type') || '').includes('json');
  const d = isJson ? await r.json() : {};
  if (!r.ok || !d.parts) throw new Error(SET_ERRORS[d.error] || 'Sadu se nepodařilo načíst (chyba ' + r.status + ').');
  const old = store.sets[d.num];
  store.sets[d.num] = { num: d.num, name: d.name, img: d.img, parts: d.parts, found: old ? old.found : {} };
  store.cur = d.num;
  save();
}

// ---------- Tab: set ----------
function renderSaved() {
  $('#savedSets').innerHTML = Object.values(store.sets).map(s =>
    `<button class="chip ${s.num === store.cur ? 'on' : ''}" data-set="${esc(s.num)}">${esc(s.num.replace(/-1$/, ''))} ${esc(s.name)}</button>`).join('');
}

function renderSet() {
  renderSaved();
  const s = cur(), el = $('#setView');
  if (!s) { el.innerHTML = '<p class="mut">Zadej číslo sady a načti její dílky.</p>'; return; }
  const total = s.parts.reduce((a, p) => a + p.qty, 0);
  const found = s.parts.reduce((a, p) => a + (s.found[p.key] || 0), 0);
  const groups = new Map();
  for (const p of s.parts) {
    if (store.hideDone && left(p) <= 0) continue;
    if (!groups.has(p.colorName)) groups.set(p.colorName, []);
    groups.get(p.colorName).push(p);
  }
  let html = `<div class="card">
    <div class="row">${s.img ? `<img src="${esc(s.img)}" alt="" style="width:72px;height:72px;object-fit:contain;background:#fff;border-radius:8px">` : ''}
      <div style="flex:1;min-width:0"><b>${esc(s.num)} ${esc(s.name)}</b>
        <div class="mut">Nalezeno ${found} z ${total} dílků</div>
        <div class="bar"><i style="width:${total ? found / total * 100 : 0}%"></i></div></div></div>
    <div class="row" style="justify-content:space-between;flex-wrap:wrap">
      <label class="mut"><input type="checkbox" id="hideDone" ${store.hideDone ? 'checked' : ''}> Skrýt nalezené</label>
      <span><button class="btn" id="resetSet">Vynulovat</button> <button class="btn" id="delSet">Smazat sadu</button></span>
    </div></div>`;
  for (const [name, parts] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    html += `<div class="grp"><span class="sw" style="background:#${esc(parts[0].rgb)}"></span>${esc(name)}</div>`;
    for (const p of parts.sort((a, b) => a.name.localeCompare(b.name))) {
      const f = s.found[p.key] || 0;
      html += `<div class="part ${f >= p.qty ? 'done' : ''}" data-key="${esc(p.key)}">
        <img loading="lazy" src="${esc(p.img)}" alt="">
        <div class="nm">${esc(p.name)}<small>${esc(p.partNum)}</small></div>
        <div class="cnt"><button data-d="-1" aria-label="Ubrat">−</button><b>${f}/${p.qty}</b><button class="plus" data-d="1" aria-label="Našel jsem">+</button></div>
      </div>`;
    }
  }
  if (!groups.size) html += '<p class="mut">Všechno nalezeno. 🎉</p>';
  el.innerHTML = html;
}

$('#setForm').addEventListener('submit', async e => {
  e.preventDefault();
  const err = $('#setErr'), btn = e.target.querySelector('button');
  err.hidden = true; btn.disabled = true; btn.textContent = 'Načítám…';
  try { await loadSet($('#setNum').value); $('#setNum').value = ''; renderSet(); }
  catch (ex) { err.textContent = ex.message || 'Načtení se nepovedlo. Jsi online?'; err.hidden = false; }
  btn.disabled = false; btn.textContent = 'Načíst';
});
$('#savedSets').addEventListener('click', e => {
  const b = e.target.closest('[data-set]'); if (!b) return;
  store.cur = b.dataset.set; save(); renderSet();
});
$('#setView').addEventListener('click', e => {
  const s = cur();
  if (e.target.id === 'resetSet') { if (confirm('Vynulovat všechny odškrtnuté dílky téhle sady?')) { s.found = {}; save(); renderSet(); } return; }
  if (e.target.id === 'delSet') {
    if (confirm('Smazat sadu ' + s.num + ' i s postupem?')) { delete store.sets[s.num]; store.cur = Object.keys(store.sets)[0] || null; save(); renderSet(); }
    return;
  }
  const d = e.target.dataset.d, row = e.target.closest('.part');
  if (d && row) { bump(row.dataset.key, +d); renderSet(); }
});
$('#setView').addEventListener('change', e => {
  if (e.target.id === 'hideDone') { store.hideDone = e.target.checked; save(); renderSet(); }
});

// ---------- Tab: live colour search ----------
let stream = null, raf = 0, liveColor = null, target = null;
const cv = $('#liveCv'), ctx = cv.getContext('2d', { willReadFrequently: true });

function makeTarget(rgb, tol) {
  const r = parseInt(rgb.slice(0, 2), 16), g = parseInt(rgb.slice(2, 4), 16), b = parseInt(rgb.slice(4, 6), 16);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn, v = mx / 255, s = mx ? c / mx : 0;
  if (v < 0.25) return { mode: 'dark', vmax: 0.12 + tol * 0.03 };
  if (s < 0.2) return { mode: 'gray', v, smax: 0.12 + tol * 0.025, vtol: 0.08 + tol * 0.03 };
  let h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
  h *= 60; if (h < 0) h += 360;
  return { mode: 'hue', h, htol: 6 + tol * 3 };
}

function renderLive() {
  const s = cur();
  $('#liveEmpty').hidden = !!s; $('#liveBody').hidden = !s;
  if (!s) return;
  const colors = new Map();
  for (const p of s.parts) {
    const l = left(p); if (l <= 0) continue;
    const c = colors.get(p.colorId) || { id: p.colorId, name: p.colorName, rgb: p.rgb, left: 0 };
    c.left += l; colors.set(p.colorId, c);
  }
  if (liveColor != null && !colors.has(liveColor)) liveColor = null;
  $('#liveColors').innerHTML = [...colors.values()].sort((a, b) => b.left - a.left).map(c =>
    `<button class="chip ${c.id === liveColor ? 'on' : ''}" data-color="${c.id}"><span class="sw" style="background:#${esc(c.rgb)}"></span>${esc(c.name)} · ${c.left}</button>`).join('')
    || '<span class="mut">Všechno nalezeno. 🎉</span>';
  const c = colors.get(liveColor);
  target = c ? makeTarget(c.rgb, +$('#tol').value) : null;
  $('#liveHint').hidden = !!c;
  $('#liveParts').innerHTML = c ? s.parts.filter(p => p.colorId === liveColor && left(p) > 0).map(p =>
    `<button class="tile" data-key="${esc(p.key)}"><img src="${esc(p.img)}" alt=""><b>zbývá ${left(p)}</b>${esc(p.name)}</button>`).join('') : '';
}

function frame() {
  if (!stream) return;
  const v = $('#video');
  if (v.readyState >= 2 && v.videoWidth) {
    const W = 480, H = Math.round(W * v.videoHeight / v.videoWidth);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    ctx.drawImage(v, 0, 0, W, H);
    const t = target;
    if (t) {
      const im = ctx.getImageData(0, 0, W, H), d = im.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const mx = Math.max(r, g, b), c = mx - Math.min(r, g, b), val = mx / 255, sat = mx ? c / mx : 0;
        let ok;
        if (t.mode === 'dark') ok = val < t.vmax;
        else if (t.mode === 'gray') ok = sat < t.smax && Math.abs(val - t.v) < t.vtol;
        else if (sat < 0.28 || val < 0.18) ok = false;
        else {
          let h = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
          h *= 60; if (h < 0) h += 360;
          let dh = Math.abs(h - t.h); if (dh > 180) dh = 360 - dh;
          ok = dh < t.htol;
        }
        if (!ok) d[i] = d[i + 1] = d[i + 2] = (r * 0.3 + g * 0.59 + b * 0.11) * 0.35;
      }
      ctx.putImageData(im, 0, 0);
    }
  }
  raf = requestAnimationFrame(frame);
}

async function startCam() {
  if (stream || !cur()) return;
  const err = $('#liveErr'); err.hidden = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    const v = $('#video'); v.srcObject = stream; await v.play();
    raf = requestAnimationFrame(frame);
  } catch (ex) {
    stream = null;
    err.textContent = 'Kameru se nepodařilo spustit. Povol přístup ke kameře a otevři appku přes https.';
    err.hidden = false;
  }
}
function stopCam() {
  cancelAnimationFrame(raf);
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null;
}
$('#liveColors').addEventListener('click', e => {
  const b = e.target.closest('[data-color]'); if (!b) return;
  liveColor = liveColor === +b.dataset.color ? null : +b.dataset.color; renderLive();
});
$('#liveParts').addEventListener('click', e => {
  const b = e.target.closest('[data-key]'); if (!b) return;
  bump(b.dataset.key, 1); renderLive();
});
$('#tol').addEventListener('input', renderLive);

// ---------- Tab: photo scan ----------
let blobs = [], selBlob = -1, scanRun = 0;

// Finds separate pieces on a plain background. Returns boxes in 0..1 coordinates with mean colour.
function segment(img) {
  const W = Math.min(480, img.naturalWidth), H = Math.round(W * img.naturalHeight / img.naturalWidth);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  const br = [], bg = [], bb = [];
  const edge = (px, py) => { const i = (py * W + px) * 4; br.push(d[i]); bg.push(d[i + 1]); bb.push(d[i + 2]); };
  for (let px = 0; px < W; px += 2) { edge(px, 0); edge(px, H - 1); }
  for (let py = 0; py < H; py += 2) { edge(0, py); edge(W - 1, py); }
  const med = a => a.sort((p, q) => p - q)[a.length >> 1];
  const R = med(br), G = med(bg), B = med(bb);
  const mask = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const i = p * 4, dr = d[i] - R, dg = d[i + 1] - G, db = d[i + 2] - B;
    if (dr * dr + dg * dg + db * db > 48 * 48) mask[p] = 1;
  }
  const out = [], stack = new Int32Array(W * H), minArea = Math.max(60, W * H * 0.0006);
  for (let p0 = 0; p0 < W * H; p0++) {
    if (mask[p0] !== 1) continue;
    let n = 0, sp = 0, x0 = W, y0 = H, x1 = 0, y1 = 0, sr = 0, sg = 0, sb = 0;
    stack[sp++] = p0; mask[p0] = 2;
    while (sp) {
      const p = stack[--sp], px = p % W, py = (p / W) | 0, i = p * 4;
      n++; sr += d[i]; sg += d[i + 1]; sb += d[i + 2];
      if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py;
      if (px > 0 && mask[p - 1] === 1) { mask[p - 1] = 2; stack[sp++] = p - 1; }
      if (px < W - 1 && mask[p + 1] === 1) { mask[p + 1] = 2; stack[sp++] = p + 1; }
      if (py > 0 && mask[p - W] === 1) { mask[p - W] = 2; stack[sp++] = p - W; }
      if (py < H - 1 && mask[p + W] === 1) { mask[p + W] = 2; stack[sp++] = p + W; }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (n < minArea || bw * bh > W * H * 0.6) continue;
    const pad = Math.max(bw, bh) * 0.15;
    const ax = Math.max(0, x0 - pad), ay = Math.max(0, y0 - pad), zx = Math.min(W, x1 + 1 + pad), zy = Math.min(H, y1 + 1 + pad);
    out.push({ x: ax / W, y: ay / H, w: (zx - ax) / W, h: (zy - ay) / H, area: n, rgb: [sr / n, sg / n, sb / n], status: 'pending' });
  }
  return out.sort((a, b) => b.area - a.area).slice(0, 60);
}

function cropBlob(img, b) {
  const sx = b.x * img.naturalWidth, sy = b.y * img.naturalHeight, sw = b.w * img.naturalWidth, sh = b.h * img.naturalHeight;
  const k = Math.min(1, 320 / Math.max(sw, sh));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k));
  c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.85));
}

const colorDist = (hex, rgb) => Math.hypot(parseInt(hex.slice(0, 2), 16) - rgb[0], parseInt(hex.slice(2, 4), 16) - rgb[1], parseInt(hex.slice(4, 6), 16) - rgb[2]);

async function identify(img, b) {
  const fd = new FormData(); fd.append('query_image', await cropBlob(img, b), 'piece.jpg');
  const r = await fetch('https://api.brickognize.com/predict/parts/', { method: 'POST', body: fd });
  if (!r.ok) throw new Error('Brickognize ' + r.status);
  const items = (await r.json()).items || [];
  b.guess = items[0] ? items[0].name : 'Nerozpoznáno';
  b.cands = [];
  for (const it of items.slice(0, 3)) {
    if (it.score < 0.4) break;
    const c = cur().parts.filter(p => p.partNum === it.id || p.blIds.includes(it.id));
    if (c.length) { b.cands = c.sort((p, q) => colorDist(p.rgb, b.rgb) - colorDist(q.rgb, b.rgb)).map(p => p.key); break; }
  }
  classify(b);
}

function classify(b) {
  if (b.taken) { b.status = 'taken'; return; }
  if (!b.cands || !b.cands.length) { b.status = 'other'; return; }
  const open = b.cands.map(partByKey).filter(p => left(p) > 0);
  if (!open.length) b.status = 'done';
  else b.status = colorDist(open[0].rgb, b.rgb) < 110 ? 'need' : 'color';
}

function renderScan() {
  const s = cur();
  $('#scanEmpty').hidden = !!s; $('#scanBody').hidden = !s;
  if (!s) return;
  $('#scanBoxes').innerHTML = blobs.map((b, i) =>
    `<button class="box ${b.status} ${i === selBlob ? 'sel' : ''}" data-i="${i}" aria-label="Kostka ${i + 1}" style="left:${b.x * 100}%;top:${b.y * 100}%;width:${b.w * 100}%;height:${b.h * 100}%"></button>`).join('');
  const b = blobs[selBlob], el = $('#scanDetail');
  if (!b) { el.innerHTML = ''; return; }
  if (b.status === 'pending') el.innerHTML = '<div class="card mut">Rozpoznávám…</div>';
  else if (b.status === 'err') el.innerHTML = '<div class="card mut">Tenhle kus se nepodařilo rozpoznat.</div>';
  else if (!b.cands.length) el.innerHTML = `<div class="card"><b>${esc(b.guess)}</b><div class="mut">Do téhle sady nepatří.</div></div>`;
  else el.innerHTML = `<div class="card"><b>${esc(b.guess)}</b>${b.taken ? '<div class="mut">Už odškrtnuto.</div>' : ''}` + b.cands.map(partByKey).map(p =>
    `<div class="part ${left(p) <= 0 ? 'done' : ''}"><img src="${esc(p.img)}" alt="">
      <div class="nm"><span class="sw" style="display:inline-block;vertical-align:-2px;background:#${esc(p.rgb)}"></span> ${esc(p.colorName)}<small>zbývá ${left(p)} z ${p.qty}</small></div>
      ${left(p) > 0 && !b.taken ? `<button class="btn pri" data-take="${esc(p.key)}">Mám ji</button>` : ''}</div>`).join('') + '</div>';
}

$('#scanFile').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  const run = ++scanRun, img = $('#scanImg'), st = $('#scanStatus');
  blobs = []; selBlob = -1;
  $('#scanWrap').hidden = false; $('#scanLegend').hidden = false;
  st.textContent = 'Načítám fotku…';
  const loaded = await new Promise(res => { img.onload = () => res(true); img.onerror = () => res(false); img.src = URL.createObjectURL(file); });
  if (!loaded) { st.textContent = 'Fotku se nepodařilo načíst.'; return; }
  blobs = segment(img);
  renderScan();
  if (!blobs.length) { st.textContent = 'Na fotce jsem nenašel žádné oddělené kostky. Zkus jednobarevný podklad, který se barvou liší od kostek.'; return; }
  let done = 0, failed = 0, next = 0;
  const tick = () => {
    const hits = blobs.filter(b => b.status === 'need').length;
    st.textContent = done < blobs.length ? `Rozpoznávám ${done}/${blobs.length}…`
      : `Hotovo. Kusů na fotce: ${blobs.length}, z toho do sady patří: ${hits}.` + (failed ? ` ${failed} se nepodařilo rozpoznat.` : '') + ' Ťukni na rámeček.';
  };
  tick();
  const worker = async () => {
    while (next < blobs.length && run === scanRun) {
      const b = blobs[next++];
      try { await identify(img, b); } catch { b.status = 'err'; b.cands = []; failed++; }
      if (run !== scanRun) return;
      done++; tick(); renderScan();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
});
$('#scanBoxes').addEventListener('click', e => {
  const b = e.target.closest('[data-i]'); if (!b) return;
  selBlob = +b.dataset.i; renderScan();
  $('#scanDetail').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});
$('#scanDetail').addEventListener('click', e => {
  const k = e.target.dataset.take; if (!k) return;
  bump(k, 1); blobs[selBlob].taken = true;
  blobs.forEach(b => { if (b.status !== 'pending' && b.status !== 'err') classify(b); });
  renderScan();
});

// ---------- Tabs ----------
function showTab(id) {
  for (const s of document.querySelectorAll('main > section')) s.hidden = s.id !== id;
  for (const b of document.querySelectorAll('nav button')) b.classList.toggle('on', b.dataset.tab === id);
  if (id === 'tabLive') { renderLive(); startCam(); } else stopCam();
  if (id === 'tabSet') renderSet();
  if (id === 'tabScan') renderScan();
}
$('nav').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopCam(); else if (!$('#tabLive').hidden) startCam();
});

renderSet();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
