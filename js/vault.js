// Доступ к скинам. Они лежат зашифрованными в приватном репозитории GitHub:
// без токена файлы не скачать, без пароля не расшифровать. На устройстве ничего не сохраняется,
// ключ и токен живут только в памяти открытой вкладки.
import { lockoutSeconds, waitText } from './guard.js';

const OWNER = 'letmesh0w', REPO = 'd1s4-skins-data', DIR = 'enc';
const GUARD = 'd1s4.guard';
const BAD = 'Неверный токен или пароль.';
const te = new TextEncoder(), td = new TextDecoder();

// Адрес API подменяется только при локальной разработке: на сайте токен уходит исключительно на api.github.com.
const LOCAL_DEV = ['127.0.0.1', 'localhost'].includes(location.hostname);
const api = () => {
  if (LOCAL_DEV) { try { return localStorage.getItem('d1s4.apiBase') || 'https://api.github.com'; } catch { /* нет хранилища */ } }
  return 'https://api.github.com';
};

export class VaultError extends Error {}

let S = null; // { token, key, manifest, pals: Map<name, Map<path, Uint8Array>>, urls: Map<string, string> }
export const isUnlocked = () => !!S;
export const palettes = () => (S ? S.manifest.palettes.slice() : []);

// ---- защита от перебора ----
function guardGet() {
  try { const g = JSON.parse(localStorage.getItem(GUARD)); return g && Number.isFinite(g.n) ? g : { n: 0, until: 0 }; } catch { return { n: 0, until: 0 }; }
}
function guardCheck() {
  const left = (guardGet().until - Date.now()) / 1000;
  if (left > 0) throw new VaultError(`Слишком много неверных попыток. Подождите ${waitText(Math.min(left, 600))}.`);
}
function guardFail(msg = BAD) {
  const n = guardGet().n + 1, sec = lockoutSeconds(n);
  try { localStorage.setItem(GUARD, JSON.stringify({ n, until: Date.now() + sec * 1000 })); } catch { /* приватный режим */ }
  return msg + (sec ? ` Следующая попытка через ${waitText(sec)}.` : '');
}
function guardOk() { try { localStorage.removeItem(GUARD); } catch { /* приватный режим */ } }

// ---- GitHub ----
async function gh(path, token, raw) {
  let r;
  try {
    r = await fetch(api() + path, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    });
  } catch { throw new VaultError('Нет связи с GitHub. Проверьте интернет.'); }
  if (r.status === 401) throw new VaultError(guardFail('GitHub не принял токен: он неверный, отозван или истёк.'));
  if (r.status === 403 || r.status === 429) {
    throw new VaultError(r.headers.get('x-ratelimit-remaining') === '0' ? 'GitHub временно ограничил число запросов. Попробуйте через несколько минут.' : 'У токена нет доступа к хранилищу скинов.');
  }
  if (r.status === 404) { const e = new VaultError('404'); e.notFound = true; throw e; }
  if (!r.ok) throw new VaultError(`GitHub ответил ошибкой ${r.status}. Попробуйте позже.`);
  return r;
}
const filePath = name => `/repos/${OWNER}/${REPO}/contents/${DIR}/${name}`;

async function fetchFile(name, token) {
  try { return await gh(filePath(name), token, true); } catch (e) {
    if (!e.notFound) throw e;
    // 404 — либо токен не видит приватный репозиторий, либо скины ещё не зашифрованы
    let sees = false;
    try { await gh(`/repos/${OWNER}/${REPO}`, token, false); sees = true; } catch (e2) { if (!e2.notFound) throw e2; }
    throw new VaultError(sees
      ? 'Скины ещё не зашифрованы. Запустите «Зашифровать скины.command» в папке d1s4-skins-data.'
      : guardFail('Этот токен не видит хранилище скинов. Нужен токен с доступом на чтение к репозиторию d1s4-skins-data.'));
  }
}

const fromB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function open(name, bytes, key) {
  const b = new Uint8Array(bytes);
  if (b.length < 29) throw new VaultError('Файл повреждён.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.subarray(0, 12), additionalData: te.encode('d1s4-skins-v1|' + name) }, key, b.subarray(12));
  return new Uint8Array(pt);
}

/** Вход: токен проверяет GitHub (без него манифест не скачать), пароль — расшифровка контрольной записи. */
export async function unlock(token, password) {
  token = String(token || '').trim();
  if (!token || !password) throw new VaultError('Введите токен и пароль.');
  guardCheck();
  let m;
  try { m = await (await fetchFile('manifest.json', token)).json(); } catch (e) {
    if (e instanceof VaultError) throw e;
    throw new VaultError('Манифест скинов повреждён.');
  }
  const it = Number(m && m.kdf && m.kdf.iterations);
  if (!m || m.app !== 'd1s4-skins' || typeof m.kdf.salt !== 'string' || typeof m.check !== 'string' || !Array.isArray(m.palettes)
    || !Number.isInteger(it) || it < 100000 || it > 5000000) throw new VaultError('Манифест скинов повреждён.');
  m.palettes = m.palettes.filter(p => typeof p === 'string' && /^[a-z0-9_-]{1,30}$/.test(p));
  const base = await crypto.subtle.importKey('raw', te.encode(password.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(m.kdf.salt), iterations: it }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  try {
    if (td.decode(await open('check', fromB64(m.check), key)) !== 'd1s4-ok') throw new Error();
  } catch { throw new VaultError(guardFail()); }
  guardOk();
  S = { token, key, manifest: m, pals: new Map(), urls: new Map(), pending: new Map() };
}

async function load(name) {
  const s = S;
  if (!s) throw new VaultError('Заперто.');
  const buf = await (await fetchFile(name + '.bin', s.token)).arrayBuffer();
  if (S !== s) throw new VaultError('Заперто.');
  try { return await open(name, buf, s.key); } catch { throw new VaultError('Не удалось расшифровать файл: его зашифровали другим паролем. Войдите заново.'); }
}

const str = (x, max) => (typeof x === 'string' ? x : x == null ? '' : String(x)).slice(0, max);
/** Список образов, приведённый к ожидаемым типам. */
export async function loadLooks() {
  let arr;
  try { arr = JSON.parse(td.decode(await load('looks'))); } catch (e) { if (e instanceof VaultError) throw e; throw new VaultError('Список образов повреждён.'); }
  return (Array.isArray(arr) ? arr : []).filter(v => v && typeof v === 'object' && /^[A-Za-z0-9_-]{1,60}$/.test(v.id) && /^[a-z0-9_-]{1,30}$/.test(v.cat) && /^[A-Za-z0-9_.-]{1,80}\.png$/.test(v.file))
    .map(v => ({ id: v.id, num: str(v.num, 6), name: str(v.name, 80), cat: v.cat, file: v.file, traits: (Array.isArray(v.traits) ? v.traits : []).slice(0, 8).map(t => str(t, 200)) }));
}

function unpack(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (td.decode(b.subarray(0, 4)) !== 'D1S4') throw new VaultError('Файл палитры повреждён.');
  const out = new Map();
  let o = 8;
  for (let i = 0, n = dv.getUint32(4, true); i < n; i++) {
    const nl = dv.getUint16(o, true); o += 2;
    const name = td.decode(b.subarray(o, o + nl)); o += nl;
    const len = dv.getUint32(o, true); o += 4;
    out.set(name, b.subarray(o, o + len)); o += len;
  }
  return out;
}

/** Скачивает и расшифровывает палитру (один файл на все образы). Повторные вызовы берут из памяти. */
export function loadPalette(pal) {
  const s = S;
  if (!s) return Promise.reject(new VaultError('Заперто.'));
  if (s.pals.has(pal)) return Promise.resolve();
  if (!s.pending.has(pal)) {
    s.pending.set(pal, load('pal-' + pal).then(b => { s.pals.set(pal, unpack(b)); }).finally(() => s.pending.delete(pal)));
  }
  return s.pending.get(pal);
}
export const hasPalette = pal => !!S && S.pals.has(pal);

/** PNG образа в палитре (палитра должна быть загружена). */
export function skinBytes(v, pal) {
  const m = S && S.pals.get(pal);
  return (m && m.get(`${v.cat}/${v.file}`)) || null;
}
export function skinBlob(v, pal) {
  const b = skinBytes(v, pal);
  return b ? new Blob([b], { type: 'image/png' }) : null;
}
/** Адрес картинки для <img> и 3D-модели. Живёт до блокировки. */
export function skinUrl(v, pal) {
  if (!S) return null;
  const k = pal + '/' + v.id;
  if (!S.urls.has(k)) {
    const blob = skinBlob(v, pal);
    if (!blob) return null;
    S.urls.set(k, URL.createObjectURL(blob));
  }
  return S.urls.get(k);
}

/** Запереть: ключ, токен и расшифрованные скины исчезают из памяти. */
export function lock() {
  if (!S) return;
  for (const u of S.urls.values()) URL.revokeObjectURL(u);
  S = null;
}
