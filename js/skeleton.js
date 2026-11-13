// UX-4: skeleton screen. Memakai kelas konten asli (.stat, .pcard, .ocard, dst.) dan tinggi
// baris yang sama, supaya tidak ada layout shift saat data datang. Semua ukuran lewat kelas CSS.
import { h } from './util.js';

const bar = (cls) => h('span', { class: 'sk sk-bar ' + cls });
const rep = (n, fn) => Array.from({ length: n }, fn);
const hide = (n) => { n.setAttribute('aria-hidden', 'true'); return n; };
// Teks "Memuat…" hanya untuk pembaca layar; kerangkanya disembunyikan dari mereka.
const wrap = (...nodes) => [h('span', { class: 'sr' }, 'Memuat\u2026'), ...nodes.map(hide)];

const stat = () => h('div', { class: 'stat' }, bar('sk-statlabel sk-w60'), bar('sk-statval sk-w50'));
const stats = (n, two) => h('div', { class: 'stats' + (two ? ' stats-2' : '') }, rep(n, stat));
const title = () => bar('sk-title');
const toolbar = () => h('div', { class: 'toolbar' }, bar('sk-title'), bar('sk-btn'));

const trow = () => h('div', { class: 'trow' },
  bar('trow-main sk-line sk-w60'), bar('trow-meta sk-line sk-sm sk-w40'),
  bar('sk-pill sk-tag'), bar('sk-line sk-total'));
const day = (n) => h('section', { class: 'day' }, bar('sk-dayhead'), rep(n, trow));

const ocard = () => h('article', { class: 'ocard' },
  h('div', { class: 'ocard-head' }, bar('sk-line sk-w50'), bar('sk-line sk-w30')),
  h('div', { class: 'ocard-tags' }, bar('sk-pill sk-tag'), bar('sk-pill sk-tag')),
  bar('sk-line sk-w80'), bar('sk-line sk-w60'), bar('sk-line sk-w40'),
  h('div', { class: 'ocard-actions' }, bar('sk-btn'), bar('sk-btn sk-btn-s')));

const pcard = () => h('article', { class: 'pcard' },
  h('div', { class: 'pthumb sk' }),
  h('div', { class: 'pbody' },
    bar('sk-line sk-w60'), bar('sk-line sk-w40'),
    h('div', { class: 'ocard-tags' }, bar('sk-pill sk-tag'), bar('sk-pill sk-tag')),
    h('div', { class: 'ocard-actions' }, bar('sk-btn sk-btn-s'), bar('sk-btn sk-btn-s'), bar('sk-btn sk-btn-s'))));

const rcard = () => h('article', { class: 'rcard' },
  h('div', { class: 'ocard-head' }, bar('sk-line sk-w40'), bar('sk-line sk-w30')),
  bar('sk-stars sk-w30'),
  bar('sk-line sk-w100'), bar('sk-line sk-w60'),
  h('div', { class: 'rcard-foot' }, bar('sk-pill sk-w40'), bar('sk-btn sk-btn-s')));

const krow = () => h('li', { class: 'krow' },
  h('div', { class: 'krow-main sk-krow-main' }, bar('sk-line sk-w60'), bar('sk-line sk-sm sk-w40')),
  h('div', { class: 'krow-actions' }, bar('sk-btn sk-sq'), bar('sk-btn sk-sq'), bar('sk-btn sk-btn-s')));

/* ---------- Admin ---------- */
export function skBoard() {
  const col = (n) => h('section', { class: 'col' },
    h('h2', { class: 'col-head' }, bar('sk-colhead'), bar('sk-count')),
    rep(n, ocard));
  return wrap(col(2), col(1), col(1));
}

export function skTransaksi() {
  return wrap(title(), h('div', { class: 'seg' }, rep(4, () => bar('sk-btn sk-btn-m'))), stats(4), day(3));
}

export function skKeuangan() {
  return wrap(toolbar(), stats(4),
    h('div', { class: 'fin-note' }, bar('sk-line sk-sm sk-w100'), bar('sk-line sk-sm sk-w80')),
    bar('sk-subtitle'), day(2), day(1));
}

export function skUlasan() {
  return wrap(title(), stats(2, true), h('div', { class: 'rlist' }, rep(4, rcard)));
}

export function skProduk() {
  return wrap(toolbar(), h('div', { class: 'plist' }, rep(4, pcard)));
}

export function skKategori() {
  return wrap(title(), bar('sk-line sk-sm sk-w80'),
    h('ul', { class: 'klist' }, rep(3, krow)),
    h('div', { class: 'kform' }, bar('sk-label'), bar('sk-input')));
}

export function skTampilan() {
  const field = () => [bar('sk-label'), bar('sk-input')];
  return wrap(title(), h('div', { class: 'panel' }, bar('sk-line sk-w50'), bar('sk-line sk-sm sk-w30')),
    ...field(), ...field(), ...field(), ...field());
}

/* ---------- Halaman pesanan (publik) ---------- */
// Harus sama dengan markup statis di pesanan.html, supaya tidak ada lompatan saat JS menggantikannya.
export function skPesanan() {
  const step = () => h('li', { class: 'step' }, h('span', { class: 'sk sk-dot' }), bar('sk-steplabel'));
  const panel = (n) => h('section', { class: 'panel' }, bar('sk-ptitle'), rep(n, (_, i) => bar('sk-line sk-w' + (i % 2 ? '60' : '100'))));
  return wrap(bar('sk-pagetitle'), bar('sk-pageid'), h('ol', { class: 'steps' }, rep(4, step)),
    panel(2), panel(3), panel(3));
}
