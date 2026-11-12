import { h, rupiah, waLink } from './util.js';
import { readCache } from './api.js';
import { session, adminLogin, adminLogout, adminOrders, adminSetStatus } from './admin-api.js';

const $ = (id) => document.getElementById(id);
const POLL_MS = 15000;
const NEED = ['DIPESAN', 'PEMBAYARAN'];          // kolom "Perlu konfirmasi"
const RUNNING = ['DIPESAN', 'PEMBAYARAN', 'DIKEMAS'];
const RIWAYAT_AWAL = 20;
const HARI_TRANSAKSI = 5;

const CARA_LABEL = { antar: 'Antar', ambil: 'Ambil', cod: 'COD' };
const STATUS_LABEL = {
  DIPESAN: 'Dipesan', PEMBAYARAN: 'Menunggu bayar', DIKEMAS: 'Dikemas', DIKIRIM: 'Selesai', DIBATALKAN: 'Dibatalkan'
};
const FILTERS = [['semua', 'Semua'], ['berjalan', 'Berjalan'], ['selesai', 'Selesai'], ['batal', 'Dibatalkan']];
const MATCH = {
  semua: () => true,
  berjalan: (o) => RUNNING.includes(o.status),
  selesai: (o) => o.status === 'DIKIRIM',
  batal: (o) => o.status === 'DIBATALKAN'
};

let data = null;
let tab = 'pesanan';
let filter = 'semua';
let riwayatMax = RIWAYAT_AWAL;
let lastKey = '';
let prevNeed = null;
let timer = 0;
let toastTimer = 0;
let busy = false;
let loading = false;
let soundOn = false;
let audio = null;
let ui = null;

/* ---------- Util ---------- */
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

function addDays(key, n) {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dayLabel(key) {
  return new Date(key + 'T00:00:00Z').toLocaleDateString('id-ID',
    { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function waktuText(o, hariIni) {
  const d = new Date(o.waktu);
  if (isNaN(d)) return '';
  const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  if (o.hari === hariIni) return jam;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ' ' + jam;
}

const sum = (list) => list.reduce((s, o) => s + o.total, 0);

/* ---------- Suara ---------- */
function ensureAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!audio && AC) audio = new AC();
  if (audio && audio.state === 'suspended') audio.resume();
}

function beep() {
  if (!soundOn || !audio || audio.state !== 'running') return;
  [[880, 0], [1175, 0.18]].forEach(([freq, at]) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t0 = audio.currentTime + at;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + 0.3);
  });
}

function paintSound() {
  const b = $('soundBtn');
  b.textContent = soundOn ? 'Suara nyala' : 'Suara mati';
  b.setAttribute('aria-pressed', String(soundOn));
}

function toggleSound() {
  soundOn = !soundOn;
  if (soundOn) { ensureAudio(); setTimeout(beep, 50); }
  paintSound();
}

/* ---------- Dialog konfirmasi ---------- */
function confirmDialog(title, text, okLabel) {
  const dlg = $('confirmDialog');
  return new Promise((resolve) => {
    let answer = false;
    dlg.replaceChildren(h('div', { class: 'sheet-inner' },
      h('h2', { id: 'confirmTitle', class: 'sheet-title' }, title),
      h('p', { class: 'muted' }, text),
      h('div', { class: 'confirm-actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => dlg.close() }, 'Kembali'),
        h('button', { class: 'btn btn-solid btn-danger-solid', type: 'button', onclick: () => { answer = true; dlg.close(); } }, okLabel)
      )
    ));
    dlg.addEventListener('close', () => resolve(answer), { once: true });
    dlg.showModal();
  });
}

/* ---------- Login ---------- */
function renderLogin(msg) {
  stopPolling();
  data = null; ui = null; lastKey = ''; prevNeed = null; busy = false;
  $('tabsHost').replaceChildren();
  $('soundBtn').hidden = true;
  $('logoutBtn').hidden = true;
  document.title = 'Admin | ' + brandName();

  const err = h('p', { class: 'form-error', role: 'alert' }, msg || '');
  const pw = h('input', { id: 'f-pw', class: 'input', type: 'password', autocomplete: 'current-password', maxlength: '200' });
  const submit = h('button', { class: 'btn btn-solid btn-block', type: 'submit' }, 'Masuk');
  const form = h('form', { class: 'login-card', novalidate: true },
    h('h1', { class: 'page-title login-title' }, 'Masuk admin'),
    h('label', { for: 'f-pw', class: 'label' }, 'Password'),
    pw, err, submit
  );
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (busy) return;
    err.textContent = '';
    if (!pw.value) { err.textContent = 'Password wajib diisi.'; pw.focus(); return; }
    busy = true;
    submit.disabled = true;
    submit.textContent = 'Memeriksa…';
    try {
      const res = await adminLogin(pw.value);
      session.set(res.token);
      pw.value = '';
      busy = false;
      await showApp();
    } catch (e) {
      err.textContent = (e && e.message) || 'Gagal masuk.';
      pw.select();
    } finally {
      busy = false;
      submit.disabled = false;
      submit.textContent = 'Masuk';
    }
  });
  $('app').replaceChildren(form);
  pw.focus();
}

function brandName() {
  const c = readCache();
  return (c && c.pengaturan && c.pengaturan.nama_toko) || 'DL BEAUTY';
}

function handleAuth(e) {
  if (e && e.code === 'AUTH') {
    session.clear();
    renderLogin('Sesi berakhir. Silakan masuk lagi.');
    return true;
  }
  return false;
}

/* ---------- Kerangka aplikasi ---------- */
async function showApp() {
  const badge = h('span', { class: 'badge', hidden: true }, '0');
  const tabs = [
    { id: 'pesanan', label: 'Pesanan', extra: badge },
    { id: 'transaksi', label: 'Transaksi' }
  ].map((t) => ({
    ...t,
    el: h('button', {
      class: 'tab', type: 'button', role: 'tab', id: 'tab-' + t.id, 'aria-controls': 'panel-' + t.id,
      onclick: () => selectTab(t.id)
    }, t.label, t.extra || null)
  }));
  const list = h('div', { class: 'container tabs-inner', role: 'tablist', 'aria-label': 'Bagian admin' }, tabs.map((t) => t.el));
  list.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    const i = tabs.findIndex((t) => t.id === tab);
    const next = tabs[(i + (ev.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    selectTab(next.id);
    next.el.focus();
  });
  $('tabsHost').replaceChildren(h('nav', { class: 'tabs' }, list));

  const stats = {
    hari: h('strong', { class: 'stat-val' }, '–'),
    omzet: h('strong', { class: 'stat-val' }, '–'),
    perlu: h('strong', { class: 'stat-val' }, '–'),
    kemas: h('strong', { class: 'stat-val' }, '–')
  };
  const statCard = (label, el) => h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), el);
  const updated = h('p', { class: 'muted updated', 'aria-live': 'off' });
  const board = h('div', { class: 'board' });
  const panelP = h('section', { id: 'panel-pesanan', role: 'tabpanel', 'aria-labelledby': 'tab-pesanan' },
    h('div', { class: 'stats' },
      statCard('Pesanan hari ini', stats.hari), statCard('Omzet hari ini', stats.omzet),
      statCard('Perlu konfirmasi', stats.perlu), statCard('Sedang dikemas', stats.kemas)),
    updated, board);
  const panelT = h('section', { id: 'panel-transaksi', role: 'tabpanel', 'aria-labelledby': 'tab-transaksi', hidden: true });

  ui = { tabs, badge, stats, updated, board, panelP, panelT };
  $('app').replaceChildren(panelP, panelT);
  $('soundBtn').hidden = false;
  $('logoutBtn').hidden = false;
  paintSound();
  selectTab(tab);
  await refresh(true);
  if (!ui) return; // sesi ditolak saat memuat: layar login sudah tampil
  startPolling();
}

function selectTab(id) {
  tab = id;
  if (!ui) return;
  ui.tabs.forEach((t) => {
    const on = t.id === id;
    t.el.classList.toggle('is-active', on);
    t.el.setAttribute('aria-selected', String(on));
    t.el.tabIndex = on ? 0 : -1;
  });
  ui.panelP.hidden = id !== 'pesanan';
  ui.panelT.hidden = id !== 'transaksi';
}

/* ---------- Kartu pesanan ---------- */
function actionLabel(o, ke) {
  if (ke === 'DIKEMAS') return o.status === 'PEMBAYARAN' ? 'Terima pembayaran' : 'Konfirmasi pesanan';
  if (ke === 'DIKIRIM') return { antar: 'Tandai dikirim', ambil: 'Tandai diambil', cod: 'Tandai diterima' }[o.cara_terima] || 'Tandai selesai';
  return 'Batalkan';
}

function tag(status) {
  return h('span', { class: 'tag tag-' + status.toLowerCase() }, STATUS_LABEL[status] || status);
}

function orderCard(o, hariIni) {
  const wa = waLink(o.wa, 'Halo ' + o.nama + ', ini admin DL BEAUTY soal pesanan #' + o.id + '.');
  const detail = [];
  if (o.alamat) detail.push(h('p', { class: 'ocard-line' }, h('span', { class: 'ocard-key' }, o.cara_terima === 'cod' ? 'Titik temu' : 'Alamat'), o.alamat));
  if (o.catatan) detail.push(h('p', { class: 'ocard-line' }, h('span', { class: 'ocard-key' }, 'Catatan'), o.catatan));
  if (o.status === 'DIPESAN' && o.cara_terima === 'antar') {
    detail.push(h('p', { class: 'ocard-hint' }, 'Menunggu pelanggan memilih cara bayar.'));
  }

  const actions = (o.lanjut || []).map((ke) => h('button', {
    class: 'btn btn-sm ' + (ke === 'DIBATALKAN' ? 'btn-danger' : 'btn-solid'), type: 'button',
    onclick: () => doAction(o, ke)
  }, actionLabel(o, ke)));
  if (wa) actions.push(h('a', { class: 'btn btn-sm', href: wa, target: '_blank', rel: 'noopener' }, 'Chat'));

  return h('article', { class: 'ocard', 'data-id': String(o.id) },
    h('div', { class: 'ocard-head' },
      h('strong', null, '#' + o.id + ' · ' + o.nama),
      h('span', { class: 'ocard-time' }, waktuText(o, hariIni))
    ),
    h('div', { class: 'ocard-tags' }, h('span', { class: 'tag' }, CARA_LABEL[o.cara_terima] || o.cara_terima), tag(o.status)),
    h('ul', { class: 'ocard-items' }, (o.items || []).map((it) => h('li', null, it.jumlah + '× ' + it.nama))),
    h('p', { class: 'ocard-total' }, rupiah(o.total)),
    detail,
    actions.length ? h('div', { class: 'ocard-actions' }, actions) : null
  );
}

async function doAction(o, ke) {
  if (busy) return;
  if (ke === 'DIBATALKAN') {
    const yes = await confirmDialog('Batalkan pesanan #' + o.id + '?',
      'Pesanan atas nama ' + o.nama + ' akan dibatalkan dan statusnya tidak bisa diubah lagi.', 'Ya, batalkan');
    if (!yes) return;
  }
  busy = true;
  document.querySelectorAll('.ocard button').forEach((b) => { b.disabled = true; });
  try {
    await adminSetStatus(o.id, o.status, ke);
    toast('Pesanan #' + o.id + ': ' + (STATUS_LABEL[ke] || ke));
  } catch (e) {
    if (handleAuth(e)) return;
    toast((e && e.message) || 'Gagal mengubah status.');
  } finally {
    busy = false;
  }
  lastKey = '';
  await refresh(true);
}

/* ---------- Tab Pesanan ---------- */
function renderPesanan(d) {
  const orders = d.orders;
  const today = orders.filter((o) => o.hari === d.hari_ini && o.status !== 'DIBATALKAN');
  const need = orders.filter((o) => NEED.includes(o.status));
  const kemas = orders.filter((o) => o.status === 'DIKEMAS');
  const riwayat = orders.filter((o) => o.status === 'DIKIRIM' || o.status === 'DIBATALKAN');

  ui.stats.hari.textContent = String(today.length);
  ui.stats.omzet.textContent = rupiah(sum(today.filter((o) => o.status === 'DIKEMAS' || o.status === 'DIKIRIM')));
  ui.stats.perlu.textContent = String(need.length);
  ui.stats.kemas.textContent = String(kemas.length);

  ui.badge.textContent = String(need.length);
  ui.badge.hidden = need.length === 0;
  ui.tabs[0].el.setAttribute('aria-label', need.length ? 'Pesanan, ' + need.length + ' perlu konfirmasi' : 'Pesanan');
  document.title = (need.length ? '(' + need.length + ') ' : '') + 'Admin | ' + brandName();

  const col = (title, list, empty, extra) => h('section', { class: 'col', 'aria-label': title },
    h('h2', { class: 'col-head' }, title, h('span', { class: 'col-count' }, String(list.length))),
    list.length ? list.map((o) => orderCard(o, d.hari_ini)) : h('p', { class: 'empty' }, empty),
    extra || null
  );

  const more = riwayat.length > riwayatMax
    ? h('button', {
      class: 'btn btn-block', type: 'button',
      onclick: () => { riwayatMax += RIWAYAT_AWAL; lastKey = ''; render(); }
    }, 'Tampilkan lebih banyak')
    : null;

  ui.board.replaceChildren(
    col('Perlu konfirmasi', need, 'Tidak ada pesanan yang menunggu.'),
    col('Sedang dikemas', kemas, 'Belum ada pesanan yang dikemas.'),
    col('Riwayat', riwayat.slice(0, riwayatMax), 'Belum ada riwayat.', more)
  );
}

/* ---------- Tab Transaksi ---------- */
function table(caption, head, rows) {
  return h('table', { class: 'tbl' },
    h('caption', null, caption),
    h('thead', null, h('tr', null, head.map((c, i) => h('th', { scope: 'col', class: i ? 'num' : '' }, c)))),
    h('tbody', null, rows.map((r) => h('tr', null, r.map((c, i) => h(i ? 'td' : 'th', i ? { class: 'num' } : { scope: 'row' }, c)))))
  );
}

function groupBy(list, keyFn, labelFn) {
  const m = new Map();
  list.forEach((o) => {
    const k = keyFn(o);
    const g = m.get(k) || { label: labelFn(o), n: 0, total: 0 };
    g.n += 1;
    g.total += o.total;
    m.set(k, g);
  });
  return [...m.values()].sort((a, b) => b.total - a.total);
}

function renderTransaksi(d) {
  const days = Array.from({ length: HARI_TRANSAKSI }, (_, i) => addDays(d.hari_ini, -i));
  const inRange = d.orders.filter((o) => days.includes(o.hari));
  const base = inRange.filter(MATCH[filter]);
  // Pesanan dibatalkan tidak dihitung sebagai transaksi, kecuali filter Dibatalkan.
  const counted = filter === 'batal' ? base : base.filter((o) => o.status !== 'DIBATALKAN');
  const total = sum(counted);
  const batal = inRange.filter((o) => o.status === 'DIBATALKAN').length;

  const card = (label, val) => h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label), h('strong', { class: 'stat-val' }, val));
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Filter status' }, FILTERS.map(([k, label]) =>
    h('button', {
      class: 'seg-btn' + (filter === k ? ' is-on' : ''), type: 'button', 'aria-pressed': String(filter === k),
      onclick: () => { filter = k; lastKey = ''; render(); }
    }, label)));

  const parts = [
    h('h2', { class: 'section-title' }, HARI_TRANSAKSI + ' hari terakhir'),
    seg,
    h('div', { class: 'stats' },
      card('Transaksi', String(counted.length)), card('Total nilai', rupiah(total)),
      card('Rata-rata', rupiah(counted.length ? Math.round(total / counted.length) : 0)), card('Dibatalkan', String(batal)))
  ];

  if (!counted.length) {
    parts.push(h('p', { class: 'empty' }, 'Tidak ada transaksi untuk filter ini.'));
  } else {
    const perTerima = groupBy(counted, (o) => o.cara_terima, (o) => CARA_LABEL[o.cara_terima] || o.cara_terima);
    const perBayar = groupBy(counted, (o) => o.cara_bayar || '-', (o) => o.cara_bayar || '-');
    parts.push(h('div', { class: 'recap' },
      table('Per cara terima', ['Cara', 'Jumlah', 'Nilai'], perTerima.map((g) => [g.label, String(g.n), rupiah(g.total)])),
      table('Per cara bayar', ['Cara', 'Jumlah', 'Nilai'], perBayar.map((g) => [g.label, String(g.n), rupiah(g.total)]))
    ));

    const prod = new Map();
    counted.forEach((o) => (o.items || []).forEach((it) => {
      const p = prod.get(it.produk_id) || { nama: it.nama, qty: 0, nilai: 0 };
      p.qty += it.jumlah;
      p.nilai += it.jumlah * it.harga;
      prod.set(it.produk_id, p);
    }));
    const top = [...prod.values()].sort((a, b) => b.qty - a.qty || b.nilai - a.nilai).slice(0, 5);
    parts.push(table('Produk terlaris', ['Produk', 'Terjual', 'Nilai'], top.map((p) => [p.nama, String(p.qty), rupiah(p.nilai)])));
  }

  const kosong = [];
  days.forEach((day) => {
    const list = base.filter((o) => o.hari === day);
    if (!list.length) { kosong.push(day); return; }
    const dayTotal = sum(list.filter((o) => o.status !== 'DIBATALKAN' || filter === 'batal'));
    parts.push(h('section', { class: 'day' },
      h('h3', { class: 'day-head' }, h('span', null, dayLabel(day)), h('span', { class: 'day-sum' }, list.length + ' pesanan · ' + rupiah(dayTotal))),
      list.map((o) => h('div', { class: 'trow' },
        h('span', { class: 'trow-main' }, '#' + o.id + ' ' + o.nama),
        h('span', { class: 'trow-meta' }, (CARA_LABEL[o.cara_terima] || o.cara_terima) + ' · ' + waktuText(o, d.hari_ini)),
        tag(o.status),
        h('span', { class: 'trow-total' }, rupiah(o.total))
      ))
    ));
  });
  if (kosong.length) {
    parts.push(h('section', { class: 'day' },
      h('h3', { class: 'day-head' }, h('span', null, 'Hari tanpa transaksi')),
      h('ul', { class: 'plain' }, kosong.map((k) => h('li', null, dayLabel(k))))
    ));
  }
  ui.panelT.replaceChildren(...parts);
}

/* ---------- Render + data ---------- */
function render() {
  if (!data || !ui) return;
  const key = JSON.stringify([data, filter, riwayatMax]);
  if (key === lastKey) return;
  lastKey = key;
  renderPesanan(data);
  renderTransaksi(data);
}

function detectNew(orders) {
  const need = orders.filter((o) => NEED.includes(o.status)).map((o) => o.id);
  if (prevNeed && need.some((id) => !prevNeed.has(id))) beep();
  prevNeed = new Set(need);
}

async function refresh(force) {
  if (loading || (busy && !force) || !session.get()) return;
  loading = true;
  try {
    const next = await adminOrders();
    data = next;
    detectNew(next.orders);
    render();
    if (ui) ui.updated.textContent = 'Diperbarui ' + new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch (e) {
    if (handleAuth(e)) return;
    if (ui) ui.updated.textContent = 'Gagal memperbarui, mencoba lagi…';
  } finally {
    loading = false;
  }
}

function startPolling() {
  stopPolling();
  if (document.hidden) return;
  timer = setInterval(() => refresh(false), POLL_MS);
}

function stopPolling() {
  clearInterval(timer);
  timer = 0;
}

document.addEventListener('visibilitychange', () => {
  if (!session.get() || !ui) return;
  if (document.hidden) { stopPolling(); return; }
  refresh(false);
  startPolling();
});

/* ---------- Mulai ---------- */
async function logout() {
  const was = session.get();
  stopPolling();
  try { if (was) await adminLogout(); } catch (e) { /* sesi tetap dihapus di sini */ }
  session.clear();
  renderLogin('');
}

async function init() {
  const c = readCache();
  if (c && c.pengaturan) {
    if (c.pengaturan.nama_toko) $('brandName').textContent = c.pengaturan.nama_toko;
  }
  $('soundBtn').addEventListener('click', toggleSound);
  $('logoutBtn').addEventListener('click', logout);
  // Browser baru mengizinkan suara setelah ada interaksi pengguna.
  document.addEventListener('pointerdown', () => { if (soundOn) ensureAudio(); });

  if (!session.get()) { renderLogin(''); return; }
  await showApp();
}

init();
