// d1s4 Skin Studio — галерея скинов. Скины зашифрованы и открываются по токену GitHub и паролю (js/vault.js).
import { unlock, lock, isUnlocked, loadLooks, loadPalette, hasPalette, skinUrl, skinBlob, palettes, VaultError } from './vault.js';

const CAT_RU = {
  suits: 'Костюмы', shirt: 'Рубашки', coats: 'Пальто', street: 'Стрит', summer: 'Лето', winter: 'Зима', sport: 'Спорт',
  home: 'Дом', stealth: 'Худи', farm: 'Ферма', adventure: 'Приключения', work: 'Работа', fantasy: 'Фэнтези', space: 'Космос',
};
const PAL_META = {
  burgundy: ['Бордо', '#7E2F3C'], green: ['Зелёный', '#4F7A48'], navy: ['Синий', '#708298'], olive: ['Олива', '#7F8557'],
  black: ['Чёрный', '#2A2A30'], purple: ['Пурпур', '#6F5590'], frost: ['Лёд', '#A9BBCC'], synthwave: ['Синтвейв', '#3F3F66'],
  coffee: ['Кофе', '#624938'], ivory: ['Айвори', '#E2DACA'], rust: ['Ржавый', '#A2683F'], sakura: ['Сакура', '#DBA8B9'],
  mint: ['Мята', '#A3CBB8'], honey: ['Мёд', '#DBAF52'],
};
const palName = p => (PAL_META[p] ? PAL_META[p][0] : p);
const palColor = p => (PAL_META[p] ? PAL_META[p][1] : '#8a8f9c');
const catName = c => CAT_RU[c] || c;

const I = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5"/><path d="M4 19h16"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01" stroke-width="2.6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  glasses: '<circle cx="7" cy="14" r="3.5"/><circle cx="17" cy="14" r="3.5"/><path d="M10.5 14h3M3.5 13l1.5-6M20.5 13L19 7"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.3h.01" stroke-width="2.4"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  strip: '<rect x="3" y="8" width="18" height="8" rx="1.5"/><path d="M9 8v8M15 8v8"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8.5-8.5M16.5 6.5l2.5 2.5M14 9l2 2"/>',
};
const icon = n => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, a, b, c) => { const m = Math.abs(n) % 100, k = m % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k >= 2 && k <= 4 ? b : c; };
const $ = id => document.getElementById(id);
const root = $('root'), modalRoot = $('modal-root');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const has3D = () => !!window.skinview3d;

const st = { pal: 'burgundy', cat: 'all', q: '', sg: false, fav: false, pose: 'idle', spin: !reduceMotion, layer: true, look: null };
let LOOKS = [], PALS = [], byId = new Map();
let favs = new Set();
const imgs = new Map(); // "pal/id" -> Promise<HTMLImageElement>
try { favs = new Set(JSON.parse(localStorage.getItem('d1s4-favs') || '[]').filter(x => typeof x === 'string')); } catch { /* нет хранилища */ }
const saveFavs = () => { try { localStorage.setItem('d1s4-favs', JSON.stringify([...favs])); } catch { /* нет хранилища */ } };

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ---------- адресная строка: #pal=navy&cat=coats&look=id ----------
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  st.pal = PALS.includes(h.get('pal')) ? h.get('pal') : PALS.includes('burgundy') ? 'burgundy' : PALS[0];
  const cat = h.get('cat');
  st.cat = cat && LOOKS.some(v => v.cat === cat) ? cat : 'all';
  st.sg = h.get('sg') === '1';
  st.fav = h.get('fav') === '1';
  st.look = byId.has(h.get('look')) ? h.get('look') : null;
}
function writeHash() {
  const h = new URLSearchParams();
  if (st.pal !== 'burgundy') h.set('pal', st.pal);
  if (st.cat !== 'all') h.set('cat', st.cat);
  if (st.sg) h.set('sg', '1');
  if (st.fav) h.set('fav', '1');
  if (st.look) h.set('look', st.look);
  const s = h.toString();
  history.replaceState(null, '', s ? '#' + s : location.pathname + location.search);
}

// ---------- картинки ----------
function getImg(v, pal = st.pal) {
  const key = pal + '/' + v.id;
  if (!imgs.has(key)) {
    imgs.set(key, loadPalette(pal).then(() => new Promise((res, rej) => {
      const url = skinUrl(v, pal);
      if (!url) return rej(new Error('нет файла'));
      const im = new Image();
      im.onload = () => res(im); im.onerror = rej; im.src = url;
    })));
    imgs.get(key).catch(() => imgs.delete(key));
  }
  return imgs.get(key);
}
// Вид спереди 16×32 со вторым слоем; холст растягивается стилями без сглаживания.
function drawFront(canvas, img) {
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, 16, 32);
  const p = (sx, sy, sw, sh, dx, dy) => c.drawImage(img, sx, sy, sw, sh, dx, dy, sw, sh);
  p(8, 8, 8, 8, 4, 0); p(40, 8, 8, 8, 4, 0);
  p(20, 20, 8, 12, 4, 8); p(20, 36, 8, 12, 4, 8);
  p(44, 20, 4, 12, 0, 8); p(44, 36, 4, 12, 0, 8);
  p(36, 52, 4, 12, 12, 8); p(52, 52, 4, 12, 12, 8);
  p(4, 20, 4, 12, 4, 20); p(4, 36, 4, 12, 4, 20);
  p(20, 52, 4, 12, 8, 20); p(4, 52, 4, 12, 8, 20);
}
function drawFace(canvas, img) {
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, 8, 8);
  c.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8);
  c.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8);
}

// ---------- фильтр ----------
const isSg = v => v.id.endsWith('_sg');
function matches(v, { cat = st.cat } = {}) {
  if (cat !== 'all' && v.cat !== cat) return false;
  if (!st.sg && isSg(v)) return false;
  if (st.fav && !favs.has(v.id)) return false;
  if (st.q) {
    const hay = `${v.name} ${v.num} ${catName(v.cat)} ${v.traits.join(' ')}`.toLowerCase();
    if (!st.q.split(/\s+/).every(w => hay.includes(w))) return false;
  }
  return true;
}
const visible = () => LOOKS.filter(v => matches(v));
const cats = () => [...new Set(Object.keys(CAT_RU).concat(LOOKS.map(v => v.cat)))].filter(c => LOOKS.some(v => v.cat === c));

// ---------- 3D ----------
function setOverlay(vw, on) {
  const skin = vw.playerObject && vw.playerObject.skin;
  if (!skin) return;
  for (const p of ['head', 'body', 'rightArm', 'leftArm', 'rightLeg', 'leftLeg']) if (skin[p] && skin[p].outerLayer) skin[p].outerLayer.visible = on;
}
function applyView(vw) {
  vw.autoRotate = st.spin && !reduceMotion;
  vw.autoRotateSpeed = 0.6;
  vw.animation = st.pose === 'walk' ? new skinview3d.WalkingAnimation() : new skinview3d.IdleAnimation();
  if (st.pose === 'walk') vw.animation.speed = 0.6;
  if (reduceMotion && st.pose === 'idle') vw.animation.paused = true;
  setOverlay(vw, st.layer);
}
function loadInto(vw, v) {
  return getImg(v).then(() => vw.loadSkin(skinUrl(v, st.pal), { model: 'default' })).then(() => setOverlay(vw, st.layer)).catch(() => {});
}
function makeViewer(canvas, v, { controls = false, zoom = 0.88, onReady } = {}) {
  const box = canvas.parentElement.getBoundingClientRect();
  const vw = new skinview3d.SkinViewer({ canvas, width: Math.max(120, Math.round(box.width)), height: Math.max(160, Math.round(box.height)) });
  vw.fov = 34; vw.zoom = zoom;
  if (vw.controls) { vw.controls.enabled = controls; vw.controls.enablePan = false; vw.controls.enableZoom = controls; }
  applyView(vw);
  loadInto(vw, v).then(() => { if (onReady) onReady(vw); });
  return vw;
}
function killViewer(vw, canvas) {
  try { vw.dispose(); } catch { /* уже освобождён */ }
  if (canvas && canvas.isConnected) { const fresh = canvas.cloneNode(false); fresh.removeAttribute('style'); canvas.replaceWith(fresh); }
}

// Живая модель в сетке только одна — под курсором: браузер ограничивает число 3D-холстов.
const hover = { id: null, vw: null, timer: null };
function hoverOff() {
  clearTimeout(hover.timer);
  if (hover.vw) {
    const card = document.querySelector(`.card[data-id="${hover.id}"]`);
    killViewer(hover.vw, card && card.querySelector('.live'));
    if (card) card.classList.remove('is-live');
  }
  hover.id = null; hover.vw = null;
}
function hoverOn(card) {
  const v = byId.get(card.dataset.id);
  if (!v || !has3D() || hover.id === v.id || st.look) return;
  hoverOff();
  hover.id = v.id;
  hover.timer = setTimeout(() => {
    if (hover.id !== v.id || !card.isConnected || !hasPalette(st.pal)) return;
    try { hover.vw = makeViewer(card.querySelector('.live'), v, { onReady: vw => { if (hover.vw === vw) card.classList.add('is-live'); } }); } catch { hover.vw = null; }
  }, 140);
}

// ---------- вход ----------
const gate = { busy: false, error: '', token: '' };
function renderGate() {
  document.title = 'd1s4 Skin Studio';
  modalRoot.innerHTML = '';
  root.innerHTML = `<div class="gate"><div class="gate-card">
    <span class="gate-logo">${icon('lock')}</span>
    <h1>d1s4 Skin Studio</h1>
    <p class="lead">Галерея закрыта. Введите токен GitHub и пароль.</p>
    <form id="gate-form" class="fields">
      <input class="input secret" name="token" required autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Токен GitHub (github_pat_…)" aria-label="Токен GitHub" value="${esc(gate.token)}">
      <input class="input" type="password" name="pass" required autocomplete="current-password" placeholder="Пароль" aria-label="Пароль">
      <button class="btn primary" type="submit" id="gate-go">${icon('lock')}<span>Открыть</span></button>
    </form>
    <div id="gate-msg"></div>
    <details class="fold"><summary>Где взять токен${icon('chevron')}</summary><ol class="steps">
      <li>Откройте <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">создание токена на GitHub</a> (fine-grained).</li>
      <li>Repository access → Only select repositories → <b>d1s4-skins-data</b>.</li>
      <li>Permissions → Repository permissions → Contents → <b>Read-only</b>. Срок поставьте 1 год.</li>
      <li>Скопируйте токен (github_pat_…) и вставьте сюда. Браузер предложит сохранить его вместе с паролем — согласитесь.</li></ol></details>
    <p class="foot">Скины зашифрованы. На этом устройстве ничего не сохраняется.</p>
  </div></div>`;
  gateStatus();
}
function gateStatus() {
  const go = $('gate-go');
  if (go) { go.disabled = gate.busy; go.querySelector('span').textContent = gate.busy ? 'Проверяю…' : 'Открыть'; }
  const msg = $('gate-msg');
  if (msg) msg.innerHTML = gate.error ? `<div class="notice bad">${icon('alert')}<div>${esc(gate.error)}</div></div>` : '';
}
async function submitGate(form) {
  if (gate.busy) return;
  const fd = Object.fromEntries(new FormData(form));
  gate.token = String(fd.token || '').trim();
  gate.busy = true; gate.error = ''; gateStatus();
  try {
    await unlock(fd.token, fd.pass);
    LOOKS = await loadLooks();
    byId = new Map(LOOKS.map(v => [v.id, v]));
    const have = palettes();
    PALS = Object.keys(PAL_META).filter(p => have.includes(p)).concat(have.filter(p => !PAL_META[p]));
    if (!LOOKS.length || !PALS.length) throw new VaultError('В хранилище нет скинов.');
    readHash();
    await loadPalette(st.pal);
    Object.assign(gate, { busy: false, error: '', token: '' });
    renderApp();
  } catch (err) {
    lock();
    gate.busy = false;
    gate.error = err instanceof VaultError ? err.message : 'Не удалось открыть галерею.';
    if (!(err instanceof VaultError)) console.error(err);
    gateStatus();
    const p = document.querySelector('#gate-form [name=pass]'); if (p) { p.value = ''; p.focus(); }
  }
}
function lockNow() {
  hoverOff(); closeLook(true);
  lock(); imgs.clear(); LOOKS = []; byId = new Map(); PALS = [];
  document.body.style.removeProperty('--pal');
  renderGate();
}

// ---------- каркас ----------
function renderApp() {
  root.innerHTML = `<div class="app">
    <aside class="side" id="side"></aside>
    <div class="main">
      <header class="top" id="top"></header>
      <main class="content" id="content" tabindex="-1"></main>
    </div></div>`;
  renderSide(); renderTop(); renderGrid();
  if (st.look) openLook(st.look, true);
}

function renderSide() {
  const all = LOOKS.filter(v => matches(v, { cat: 'all' })).length;
  const row = (cat, label, n) => `<button class="nav" data-cat="${esc(cat)}" aria-current="${st.cat === cat ? 'true' : 'false'}"${n ? '' : ' disabled'}><span>${esc(label)}</span><small>${n}</small></button>`;
  $('side').innerHTML = `<div class="brand"><canvas class="face" id="brand-face" width="8" height="8"></canvas><div><b>d1s4</b><span>Skin Studio</span></div></div>
    <label class="search">${icon('search')}<input id="q" type="search" placeholder="Поиск" aria-label="Поиск по образам" value="${esc(st.q)}" autocomplete="off"><kbd>/</kbd></label>
    <nav class="navs" aria-label="Категории">
      ${row('all', 'Все образы', all)}
      <div class="nav-title">Категории</div>
      ${cats().map(c => row(c, catName(c), LOOKS.filter(v => matches(v, { cat: c })).length)).join('')}
    </nav>
    <div class="side-foot">
      <button class="switch-row" data-act="fav" aria-pressed="${st.fav}">${icon('star')}<span>Только избранное</span><small>${favs.size}</small></button>
      <button class="switch-row" data-act="sg" aria-pressed="${st.sg}">${icon('glasses')}<span>Варианты в очках</span><i class="sw"></i></button>
      <button class="switch-row" data-act="lock">${icon('lock')}<span>Заблокировать</span></button>
    </div>`;
  getImg(LOOKS[0]).then(im => { const c = $('brand-face'); if (c) drawFace(c, im); }).catch(() => {});
}

function renderTop() {
  const tg = (act, label, on) => `<button class="tg" data-act="${act}" aria-pressed="${on}">${label}</button>`;
  $('top').innerHTML = `<div class="pals" role="group" aria-label="Палитра">
      ${PALS.map(p => `<button class="sw-dot" data-pal="${esc(p)}" aria-pressed="${p === st.pal}" title="${esc(palName(p))}" aria-label="Палитра: ${esc(palName(p))}"><i style="background:${palColor(p)}"></i></button>`).join('')}
      <span class="pal-name">${esc(palName(st.pal))}</span>
    </div>
    <div class="tools">
      <div class="seg" role="group" aria-label="Поза">${tg('idle', 'Стоит', st.pose === 'idle')}${tg('walk', 'Идёт', st.pose === 'walk')}</div>
      ${tg('spin', 'Вращение', st.spin)}${tg('layer', '3D-слой', st.layer)}
      <button class="btn" data-act="random">${icon('dice')}Случайный</button>
    </div>`;
  document.body.style.setProperty('--pal', palColor(st.pal));
}

function cardHtml(v) {
  return `<article class="card" data-id="${esc(v.id)}">
    <button class="stage" data-act="open" aria-label="Открыть образ «${esc(v.name)}»">
      <canvas class="flat" width="16" height="32"></canvas><canvas class="live"></canvas>
    </button>
    <div class="quick">
      <button class="ib star" data-act="star" aria-pressed="${favs.has(v.id)}" title="В избранное" aria-label="В избранное">${icon('star')}</button>
      <button class="ib" data-act="dl" title="Скачать PNG в текущей палитре" aria-label="Скачать PNG">${icon('download')}</button>
    </div>
    <div class="info"><span class="num">${esc(v.num)}</span><h3 title="${esc(v.name)}">${esc(v.name)}</h3></div></article>`;
}

function renderGrid() {
  hoverOff();
  const list = visible();
  const title = st.q ? 'Результаты поиска' : st.cat === 'all' ? (st.fav ? 'Избранное' : 'Все образы') : catName(st.cat);
  const sub = `${list.length} ${plural(list.length, 'образ', 'образа', 'образов')} · палитра «${esc(palName(st.pal))}»${st.fav && st.cat !== 'all' ? ' · только избранное' : ''}`;
  let body;
  if (!list.length) {
    const why = st.q ? `По запросу «${esc(st.q)}» ничего не нашлось.` : st.fav ? 'В избранном пока пусто. Отметьте образ звёздочкой.' : 'В этой категории нет образов без очков. Включите «Варианты в очках».';
    body = `<div class="empty">${icon(st.fav && !st.q ? 'star' : 'search')}<p>${why}</p>${st.q || st.fav || st.cat !== 'all' ? '<button class="btn" data-act="reset">Показать все образы</button>' : ''}</div>`;
  } else if (st.cat === 'all' && !st.q) {
    body = cats().map(c => {
      const part = list.filter(v => v.cat === c);
      return part.length ? `<section class="group"><h2><button data-cat="${esc(c)}">${esc(catName(c))}</button><small>${part.length}</small></h2><div class="grid">${part.map(cardHtml).join('')}</div></section>` : '';
    }).join('');
  } else {
    body = `<div class="grid">${list.map(cardHtml).join('')}</div>`;
  }
  $('content').innerHTML = `<div class="head"><h1>${esc(title)}</h1><p>${sub}</p></div>${body}`;
  paintGrid();
  writeHash();
}
function paintGrid() {
  const pal = st.pal;
  document.querySelectorAll('.card').forEach(card => {
    const v = byId.get(card.dataset.id);
    getImg(v, pal).then(im => {
      if (pal !== st.pal || !card.isConnected) return;
      drawFront(card.querySelector('.flat'), im); card.classList.add('ready');
    }).catch(() => card.classList.add('broken'));
  });
}

// ---------- действия ----------
let palSeq = 0;
async function setPal(p) {
  if (!PALS.includes(p) || p === st.pal) return;
  const n = ++palSeq;
  document.body.classList.add('loading');
  try { await loadPalette(p); } catch (e) {
    if (n === palSeq) document.body.classList.remove('loading');
    toast(e instanceof VaultError ? e.message : 'Не удалось загрузить палитру'); return;
  }
  if (n !== palSeq || !isUnlocked()) return;
  document.body.classList.remove('loading');
  st.pal = p;
  hoverOff();
  renderTop();
  document.querySelectorAll('.head p').forEach(el => { el.innerHTML = el.innerHTML.replace(/палитра «[^»]*»/, `палитра «${esc(palName(p))}»`); });
  paintGrid();
  getImg(LOOKS[0]).then(im => { const c = $('brand-face'); if (c) drawFace(c, im); }).catch(() => {});
  if (st.look) { renderDetail(); if (modal.vw) loadInto(modal.vw, byId.get(st.look)); }
  writeHash();
}
function setCat(c) {
  st.cat = c;
  if (c !== 'all' && st.q) { st.q = ''; }
  renderSide(); renderGrid();
  $('content').scrollTop = 0; window.scrollTo(0, 0);
}
function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function downloadSkin(v) {
  try {
    await loadPalette(st.pal);
    saveBlob(skinBlob(v, st.pal), `skin_${v.id}_${st.pal}.png`);
    toast(`Сохранено: «${v.name}», ${palName(st.pal)}`);
  } catch (e) { toast(e instanceof VaultError ? e.message : 'Не удалось скачать'); }
}
async function downloadStrip(v, btn) {
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    const list = await Promise.all(PALS.map(p => getImg(v, p)));
    const canvas = document.createElement('canvas');
    canvas.width = 64 * list.length; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    list.forEach((im, i) => ctx.drawImage(im, i * 64, 0));
    saveBlob(await new Promise(res => canvas.toBlob(res, 'image/png')), `skin_${v.id}_all_palettes.png`);
    toast(`Сохранена полоса из ${list.length} палитр`);
  } catch (e) { toast(e instanceof VaultError ? e.message : 'Не удалось собрать полосу'); } finally { btn.disabled = false; }
}
function toggleFav(id) {
  if (favs.has(id)) favs.delete(id); else favs.add(id);
  saveFavs();
  document.querySelectorAll(`.card[data-id="${id}"] .star, #detail .star`).forEach(b => b.setAttribute('aria-pressed', String(favs.has(id))));
  const cnt = document.querySelector('[data-act=fav] small'); if (cnt) cnt.textContent = favs.size;
  if (st.fav && !st.look) { renderSide(); renderGrid(); }
}
function applyViewAll() {
  renderTop();
  if (hover.vw) applyView(hover.vw);
  if (modal.vw) applyView(modal.vw);
}

// ---------- окно образа ----------
const modal = { vw: null, list: [], dirty: false };
function openLook(id, keepList = false) {
  const v = byId.get(id);
  if (!v) return;
  hoverOff();
  if (!keepList || !modal.list.length) modal.list = visible();
  if (!modal.list.includes(v)) modal.list = [v];
  const fresh = !st.look || !modalRoot.firstChild;
  st.look = id;
  if (fresh) {
    modalRoot.innerHTML = `<div class="overlay" data-overlay><div class="modal" role="dialog" aria-modal="true" aria-label="Образ">
      <div class="viewer"><canvas id="mv"></canvas><canvas class="flat big" id="mflat" width="16" height="32"></canvas>
        <button class="arrow prev" data-act="prev" aria-label="Предыдущий образ">${icon('left')}</button>
        <button class="arrow next" data-act="next" aria-label="Следующий образ">${icon('right')}</button>
        <span class="hint3d">${has3D() ? 'Потяните, чтобы повернуть · колесо приближает' : ''}</span></div>
      <div class="detail" id="detail"></div>
      <button class="ib close" data-act="close" aria-label="Закрыть">${icon('x')}</button></div></div>`;
    document.body.classList.add('modal-open');
  }
  renderDetail();
  const flat = $('mflat');
  flat.classList.remove('ready');
  getImg(v).then(im => { if (st.look === id && flat.isConnected) { drawFront(flat, im); flat.classList.add('ready'); } }).catch(() => {});
  if (has3D()) {
    if (!modal.vw) {
      try { modal.vw = makeViewer($('mv'), v, { controls: true, zoom: 0.9, onReady: vw => { if (modal.vw === vw) modalRoot.querySelector('.viewer')?.classList.add('is-live'); } }); } catch { modal.vw = null; }
    } else loadInto(modal.vw, v);
  }
  writeHash();
}
function renderDetail() {
  const v = byId.get(st.look), d = $('detail');
  if (!v || !d) return;
  const i = modal.list.indexOf(v);
  const many = modal.list.length > 1;
  modalRoot.querySelectorAll('.arrow').forEach(b => { b.hidden = !many; });
  d.innerHTML = `<p class="crumb">LOOK ${esc(v.num)} · ${esc(catName(v.cat))}${many ? ` · ${i + 1} из ${modal.list.length}` : ''}</p>
    <h2>${esc(v.name)}</h2>
    ${v.traits.length ? `<ul class="traits">${v.traits.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    <h4>Палитра · ${esc(palName(st.pal))}</h4>
    <div class="pal-grid">${PALS.map(p => `<button class="sw-dot lg" data-pal="${esc(p)}" aria-pressed="${p === st.pal}" title="${esc(palName(p))}" aria-label="Палитра: ${esc(palName(p))}"><i style="background:${palColor(p)}"></i></button>`).join('')}</div>
    <div class="actions">
      <button class="btn primary" data-act="mdl">${icon('download')}Скачать PNG</button>
      <button class="btn" data-act="mstrip" title="Одна картинка 64×64 на каждую палитру, в ряд">${icon('strip')}Все палитры</button>
      <button class="ib star lg" data-act="mstar" aria-pressed="${favs.has(v.id)}" title="В избранное" aria-label="В избранное">${icon('star')}</button>
    </div>
    <p class="note"><code>${esc(v.file)}</code><br>Как поставить: minecraft.net → Profile → Skins, модель Classic (wide arms).</p>`;
}
function closeLook(silent = false) {
  if (modal.vw) { killViewer(modal.vw, null); modal.vw = null; }
  modalRoot.innerHTML = '';
  document.body.classList.remove('modal-open');
  const had = st.look; st.look = null; modal.list = [];
  if (silent) return;
  writeHash();
  if (st.fav) { renderSide(); renderGrid(); }
  if (had) document.querySelector(`.card[data-id="${had}"] .stage`)?.focus({ preventScroll: true });
}
function step(d) {
  const i = modal.list.indexOf(byId.get(st.look));
  if (i < 0 || modal.list.length < 2) return;
  openLook(modal.list[(i + d + modal.list.length) % modal.list.length].id, true);
}

// ---------- события ----------
document.addEventListener('submit', e => { if (e.target.id === 'gate-form') { e.preventDefault(); submitGate(e.target); } });

document.addEventListener('click', e => {
  if (!isUnlocked()) return;
  if (e.target.matches('[data-overlay]')) { closeLook(); return; }
  const palBtn = e.target.closest('[data-pal]');
  if (palBtn) { setPal(palBtn.dataset.pal); return; }
  const catBtn = e.target.closest('[data-cat]');
  if (catBtn) { setCat(catBtn.dataset.cat); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const card = el.closest('.card');
  const v = card ? byId.get(card.dataset.id) : byId.get(st.look);
  switch (el.dataset.act) {
    case 'open': openLook(v.id); break;
    case 'star': toggleFav(v.id); break;
    case 'dl': downloadSkin(v); break;
    case 'mdl': downloadSkin(v); break;
    case 'mstrip': downloadStrip(v, el); break;
    case 'mstar': toggleFav(v.id); break;
    case 'prev': step(-1); break;
    case 'next': step(1); break;
    case 'close': closeLook(); break;
    case 'idle': case 'walk': st.pose = el.dataset.act; applyViewAll(); break;
    case 'spin': st.spin = !st.spin; applyViewAll(); break;
    case 'layer': st.layer = !st.layer; applyViewAll(); break;
    case 'fav': st.fav = !st.fav; renderSide(); renderGrid(); break;
    case 'sg': st.sg = !st.sg; renderSide(); renderGrid(); break;
    case 'reset': st.q = ''; st.fav = false; st.cat = 'all'; renderSide(); renderGrid(); break;
    case 'lock': lockNow(); break;
    case 'random': {
      const pool = LOOKS.filter(x => st.sg || !isSg(x));
      const pick = pool[Math.floor(Math.random() * pool.length)];
      modal.list = pool;
      setPal(PALS[Math.floor(Math.random() * PALS.length)]);
      openLook(pick.id, true);
      break;
    }
  }
});

document.addEventListener('input', e => {
  if (e.target.id !== 'q') return;
  st.q = e.target.value.trim().toLowerCase();
  if (st.q && st.cat !== 'all') { st.cat = 'all'; document.querySelectorAll('.nav').forEach(b => b.setAttribute('aria-current', String(b.dataset.cat === 'all'))); }
  renderGrid();
});

document.addEventListener('mouseover', e => {
  const stage = e.target.closest && e.target.closest('.card .stage');
  if (stage) hoverOn(stage.closest('.card'));
});
document.addEventListener('mouseout', e => {
  const stage = e.target.closest && e.target.closest('.card .stage');
  if (stage && !stage.contains(e.relatedTarget)) hoverOff();
});

document.addEventListener('keydown', e => {
  if (!isUnlocked()) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  if (st.look) {
    if (e.key === 'Escape') closeLook();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    return;
  }
  if (e.key === '/' && !typing) { e.preventDefault(); $('q')?.focus(); }
  else if (e.key === 'Escape' && typing && document.activeElement.id === 'q') { document.activeElement.value = ''; st.q = ''; renderGrid(); document.activeElement.blur(); }
});

window.addEventListener('hashchange', () => {
  if (!isUnlocked()) return;
  const before = { pal: st.pal, look: st.look };
  const want = new URLSearchParams(location.hash.slice(1)).get('pal');
  readHash();
  const pal = st.pal; st.pal = before.pal;
  renderSide(); renderGrid();
  if (want && pal !== before.pal) setPal(pal);
  if (st.look && st.look !== before.look) openLook(st.look); else if (!st.look && before.look) { st.look = before.look; closeLook(); }
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (!modal.vw) return;
    const box = modalRoot.querySelector('.viewer')?.getBoundingClientRect();
    if (box) { modal.vw.width = Math.round(box.width); modal.vw.height = Math.round(box.height); }
  }, 120);
});

// Автоблокировка: 10 минут в фоне или без действий.
const AUTOLOCK = 10 * 60 * 1000;
let hiddenAt = 0, lastTouch = Date.now();
for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel']) window.addEventListener(ev, () => { lastTouch = Date.now(); }, { passive: true, capture: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
  if (isUnlocked() && hiddenAt && Date.now() - hiddenAt > AUTOLOCK) lockNow();
  lastTouch = Date.now();
});
setInterval(() => { if (isUnlocked() && Date.now() - lastTouch > AUTOLOCK) lockNow(); }, 20000);

// Внутри чужой страницы (рамки) галерея не запускается.
if (window.top === window.self) renderGate();
else document.body.textContent = 'Откройте галерею в отдельной вкладке.';
