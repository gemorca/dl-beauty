import { fetchBootstrap, readCache, getOrder, choosePayment, submitReview } from './api.js';
import { h, rupiah, waLink, stars, tanggal, fotoUrl, parseRekening } from './util.js';
import { toast as showToast, setLoading } from './ui.js';
import { skPesanan } from './skeleton.js';

const $ = (id) => document.getElementById(id);
const ORDERS_KEY = 'dlbeauty_orders_v1';
const POLL_MS = 15000;
const FINAL = ['DIKIRIM', 'DIBATALKAN'];

const CARA_LABEL = { antar: 'Antar ke rumah', ambil: 'Ambil di tempat', cod: 'COD' };
const ALAMAT_LABEL = { antar: 'Alamat pengiriman', cod: 'Titik pertemuan' };
const STEP_INDEX = { DIPESAN: 0, PEMBAYARAN: 1, DIKEMAS: 2, DIKIRIM: 3 };

let params = null;     // { id, token }
let pengaturan = {};
let order = null;
let lastRendered = '';
let busy = false;
let timer = 0;
let shown = false;

/* ---------- Util ---------- */
const toast = (msg) => showToast(msg, 2600);

function readParams() {
  const q = new URLSearchParams(location.search);
  const id = Math.floor(Number(q.get('id')));
  if (!(id >= 1)) return null;
  let token = (q.get('t') || '').trim();
  if (!token) {
    // Tanpa token di link: pakai token dari perangkat ini bila pesanan dibuat di sini.
    try {
      const saved = (JSON.parse(localStorage.getItem(ORDERS_KEY)) || []).find((o) => Number(o.id) === id);
      if (saved) token = String(saved.token || '');
    } catch (e) { /* abaikan */ }
  }
  return token ? { id, token } : null;
}

function applySettings(p) {
  const nama = p.nama_toko || 'DL BEAUTY';
  $('brandName').textContent = nama;
  if (p.logo_url) $('brandLogo').src = fotoUrl(p.logo_url);
  document.title = (order ? 'Pesanan #' + order.id + ' | ' : 'Pesanan | ') + nama;
}

/* ---------- Teks per status ---------- */
function statusText(o) {
  const t = o.cara_terima;
  const s = o.status;
  if (s === 'DIBATALKAN') return 'Pesanan ini dibatalkan. Hubungi admin bila kamu merasa ini keliru.';
  if (t === 'antar') {
    if (s === 'DIPESAN') return 'Pilih cara bayar untuk melanjutkan';
    if (s === 'DIKEMAS') return 'Pembayaran diterima. Pesananmu sedang dikemas.';
    if (s === 'DIKIRIM') return 'Pesananmu sudah dikirim. Terima kasih!';
  } else if (t === 'ambil') {
    if (s === 'DIPESAN') return 'Admin akan mengonfirmasi pesananmu. Bayar di tempat saat mengambil.';
    if (s === 'DIKEMAS') return 'Pesananmu sedang disiapkan. Admin akan memberi kabar saat siap diambil.';
    if (s === 'DIKIRIM') return 'Pesanan sudah diambil. Terima kasih!';
  } else if (t === 'cod') {
    if (s === 'DIPESAN') return 'Admin akan mengonfirmasi dan menyepakati titik pertemuan lewat WhatsApp.';
    if (s === 'DIKEMAS') return 'Pesananmu sedang dikemas. Siapkan uang tunai saat bertemu.';
    if (s === 'DIKIRIM') return 'Pesanan sudah diterima. Terima kasih!';
  }
  return 'Admin akan memperbarui status pesananmu.';
}

function stepLabels(o) {
  return [
    { label: 'Dipesan' },
    { label: 'Pembayaran', sub: o.cara_terima === 'ambil' ? 'di tempat' : o.cara_terima === 'cod' ? 'tunai' : '' },
    { label: 'Dikemas' },
    { label: o.cara_terima === 'ambil' ? 'Diambil' : 'Dikirim' }
  ];
}

/* ---------- Bagian halaman ---------- */
function stepper(o) {
  const cur = STEP_INDEX[o.status];
  const cancelled = o.status === 'DIBATALKAN';
  return h('ol', { class: 'steps' + (cancelled ? ' is-cancelled' : ''), 'aria-label': 'Status pesanan' },
    stepLabels(o).map((s, i) => {
      const done = !cancelled && (i < cur || o.status === 'DIKIRIM');
      const now = !cancelled && i === cur && o.status !== 'DIKIRIM';
      return h('li', { class: 'step' + (done ? ' is-done' : '') + (now ? ' is-now' : ''), 'aria-current': now ? 'step' : null },
        h('span', { class: 'step-dot', 'aria-hidden': 'true' }, done ? '✓' : String(i + 1)),
        h('span', { class: 'step-label' }, s.label),
        s.sub ? h('span', { class: 'step-sub' }, s.sub) : null
      );
    })
  );
}

function qrisScreen(o) {
  const src = fotoUrl(pengaturan.qris_url, 900);
  const img = src
    ? h('img', {
      class: 'qris-img', src, alt: 'Kode QRIS untuk membayar pesanan #' + o.id, decoding: 'async',
      onerror: (e) => {
        e.target.replaceWith(h('p', { class: 'form-error' }, 'Gambar QRIS gagal dimuat. Hubungi admin lewat WhatsApp.'));
      }
    })
    : h('p', { class: 'muted' }, 'Gambar QRIS belum disiapkan. Hubungi admin lewat WhatsApp untuk pembayaran.');
  return h('section', { class: 'panel qris', 'aria-labelledby': 'qrisTitle' },
    h('h2', { id: 'qrisTitle', class: 'panel-title' }, 'Scan untuk membayar'),
    img,
    h('p', { class: 'qris-amount' }, rupiah(o.total)),
    h('p', { class: 'muted' }, 'Setelah bayar, admin akan mengonfirmasi pesanan kamu.')
  );
}

// Layar bayar transfer bank: bank, nomor, atas nama, total, dan tombol salin nomor.
async function salinNomor(nomor) {
  try {
    await navigator.clipboard.writeText(nomor.replace(/\D/g, ''));
    toast('Nomor rekening disalin');
  } catch (e) {
    toast('Gagal menyalin. Salin nomornya secara manual.');
  }
}

function bankScreen(o) {
  const rek = parseRekening(pengaturan.rekening).find((r) => r.bank === o.cara_bayar);
  const kv = (k, v, cls) => h('div', { class: 'kv-row' }, h('dt', null, k), h('dd', { class: cls || null }, v));
  return h('section', { class: 'panel bank', 'aria-labelledby': 'bankTitle' },
    h('h2', { id: 'bankTitle', class: 'panel-title' }, 'Transfer ke ' + o.cara_bayar),
    rek
      ? h('dl', { class: 'kv' },
        kv('Bank', rek.bank),
        kv('Nomor rekening', rek.nomor, 'kv-big'),
        kv('Atas nama', rek.atas_nama),
        kv('Total', rupiah(o.total), 'kv-big'))
      : h('p', { class: 'muted' }, 'Data rekening ' + o.cara_bayar + ' tidak ditemukan. Hubungi admin lewat WhatsApp untuk pembayaran.'),
    rek ? h('button', { class: 'btn btn-block', type: 'button', onclick: () => salinNomor(rek.nomor) }, 'Salin nomor') : null,
    h('p', { class: 'muted' }, 'Setelah transfer, admin akan mengonfirmasi pesanan kamu.')
  );
}

// Semua metode bayar: QRIS dulu, lalu tiap bank dari pengaturan.rekening (kosong = hanya QRIS).
function semuaMetode() {
  return ['QRIS'].concat(parseRekening(pengaturan.rekening).map((r) => r.bank));
}

// Satu tombol per metode. ganti=false: memilih pertama kali; ganti=true: mengganti metode yang sudah dipilih.
function metodeButtons(daftar, ganti) {
  const btns = daftar.map((m) => {
    const label = ganti ? 'Ubah Metode Pembayaran ke ' + m : (m === 'QRIS' ? 'Bayar dengan QRIS' : 'Transfer ' + m);
    const btn = h('button', { class: 'btn btn-block' + (!ganti && m === 'QRIS' ? ' btn-solid' : ''), type: 'button' }, label);
    btn.addEventListener('click', async () => {
      if (busy) return;
      busy = true;
      btns.forEach((b) => { b.disabled = true; });
      setLoading(btn, true, 'Memproses…');
      try {
        order = await choosePayment(params.id, params.token, m);
        render();
        if (ganti) toast('Metode bayar diubah ke ' + m);
      } catch (e) {
        toast((e && e.message) || 'Gagal memilih cara bayar.');
        btns.forEach((b) => { b.disabled = false; });
        setLoading(btn, false, label);
      } finally {
        busy = false;
      }
    });
    return btn;
  });
  return btns;
}

// Tombol "Ganti metode bayar" di layar bayar (salah klik). Tidak ada bila tidak ada metode lain.
function gantiMetode(o) {
  const lain = semuaMetode().filter((m) => m !== (o.cara_bayar || 'QRIS'));
  if (!lain.length) return null;
  const list = h('div', { class: 'ganti-list', hidden: true }, metodeButtons(lain, true));
  const toggle = h('button', {
    class: 'btn btn-block', type: 'button', 'aria-expanded': 'false',
    onclick: () => { list.hidden = !list.hidden; toggle.setAttribute('aria-expanded', String(!list.hidden)); }
  }, 'Ubah Metode Pembayaran');
  return h('div', { class: 'ganti' }, toggle, list);
}

function statusPanel(o) {
  // cara_bayar kosong = data lama sebelum ada pilihan bank: tetap QRIS.
  if (o.status === 'PEMBAYARAN' && o.cara_terima === 'antar') {
    const layar = !o.cara_bayar || o.cara_bayar === 'QRIS' ? qrisScreen(o) : bankScreen(o);
    const ganti = gantiMetode(o);
    if (ganti) layar.append(ganti);
    return layar;
  }

  const kids = [h('p', { class: 'status-text' }, statusText(o))];
  if (o.status === 'DIPESAN' && o.cara_terima === 'antar') kids.push(...metodeButtons(semuaMetode(), false));
  return h('section', { class: 'panel' + (o.status === 'DIBATALKAN' ? ' panel-cancel' : '') }, kids);
}

function receiveCard(o) {
  const rows = [
    ['Cara terima', CARA_LABEL[o.cara_terima] || o.cara_terima],
    ['Penerima', o.nama]
  ];
  if (o.alamat) rows.push([ALAMAT_LABEL[o.cara_terima] || 'Alamat', o.alamat]);
  if (o.cara_bayar) rows.push(['Pembayaran', o.cara_bayar]);
  if (o.catatan) rows.push(['Catatan', o.catatan]);
  if (o.cara_terima === 'ambil' && pengaturan.alamat) rows.push(['Ambil di', pengaturan.alamat]);
  return h('section', { class: 'panel' },
    h('h2', { class: 'panel-title' }, 'Cara terima'),
    h('dl', { class: 'kv' }, rows.map(([k, v]) => h('div', { class: 'kv-row' }, h('dt', null, k), h('dd', null, v))))
  );
}

function summaryCard(o) {
  return h('section', { class: 'panel' },
    h('h2', { class: 'panel-title' }, 'Ringkasan pesanan'),
    h('div', { class: 'summary summary-flat' },
      (o.items || []).map((it) => h('div', { class: 'summary-row' },
        h('span', null, it.jumlah + '× ' + it.nama),
        h('span', null, rupiah(it.harga * it.jumlah))
      )),
      h('div', { class: 'total' }, h('span', null, 'Total'), h('strong', { class: 'total-val' }, rupiah(o.total)))
    ),
    o.waktu ? h('p', { class: 'muted' }, 'Dipesan ' + tanggal(o.waktu)) : null,
    h('button', { class: 'btn btn-block no-print', type: 'button', onclick: () => window.print() }, 'Cetak invoice')
  );
}

function reviewCard(o) {
  if (o.status !== 'DIKIRIM') return null;

  if (o.ulasan) {
    return h('section', { class: 'panel' },
      h('h2', { class: 'panel-title' }, 'Terima kasih atas ulasanmu'),
      h('div', { class: 'stars', role: 'img', 'aria-label': o.ulasan.bintang + ' bintang' }, stars(o.ulasan.bintang)),
      o.ulasan.komentar ? h('p', { class: 'review-text' }, o.ulasan.komentar) : null
    );
  }

  let picked = 0;
  const errEl = h('p', { class: 'form-error', role: 'alert' });
  const komentar = h('textarea', { id: 'r-komentar', class: 'input', rows: '3', maxlength: '300', placeholder: 'Ceritakan pengalamanmu (opsional)' });
  const submit = h('button', { class: 'btn btn-solid btn-block', type: 'submit' }, 'Kirim ulasan');

  const opts = [1, 2, 3, 4, 5].map((n) => {
    const input = h('input', { type: 'radio', name: 'bintang', value: String(n), id: 'bintang-' + n, class: 'sr' });
    const label = h('label', { for: 'bintang-' + n, 'aria-label': n + ' bintang' }, '★');
    input.addEventListener('change', () => {
      picked = n;
      opts.forEach((x, i) => x.label.classList.toggle('is-on', i < n));
    });
    return { input, label };
  });

  const form = h('form', { class: 'checkout review-form', novalidate: true },
    h('fieldset', { class: 'fieldset' },
      h('legend', { class: 'label' }, 'Beri bintang'),
      h('div', { class: 'star-input' }, opts.map((x) => h('span', { class: 'star-opt' }, x.input, x.label)))
    ),
    h('div', { class: 'field' }, h('label', { for: 'r-komentar', class: 'label' }, 'Komentar'), komentar),
    errEl,
    submit
  );

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (busy) return;
    errEl.textContent = '';
    if (!picked) { errEl.textContent = 'Pilih bintang 1 sampai 5.'; opts[0].input.focus(); return; }
    busy = true;
    setLoading(submit, true, 'Mengirim…');
    try {
      order = await submitReview(params.id, params.token, picked, komentar.value.trim());
      render();
    } catch (e) {
      errEl.textContent = (e && e.message) || 'Gagal mengirim ulasan.';
      setLoading(submit, false, 'Kirim ulasan');
    } finally {
      busy = false;
    }
  });

  return h('section', { class: 'panel' },
    h('h2', { class: 'panel-title' }, 'Bagaimana pesananmu?'),
    form
  );
}

function contactButton(o) {
  const nama = pengaturan.nama_toko || 'toko';
  const link = waLink(pengaturan.wa_admin,
    'Halo ' + nama + ', saya mau tanya soal pesanan #' + o.id + ' (total ' + rupiah(o.total) + ').');
  return link
    ? h('a', { class: 'btn btn-block', href: link, target: '_blank', rel: 'noopener' }, 'Hubungi admin soal pesanan ini')
    : null;
}

/* ---------- Render ---------- */
function render() {
  if (!order) return;
  const key = JSON.stringify([order, pengaturan.qris_url, pengaturan.rekening, pengaturan.wa_admin, pengaturan.alamat, pengaturan.nama_toko]);
  if (key === lastRendered) return;
  lastRendered = key;

  // Animasi masuk hanya saat tampil pertama; render ulang karena polling tidak mengulangnya.
  $('view').classList.toggle('is-enter', !shown);
  shown = true;
  document.title = 'Pesanan #' + order.id + ' | ' + (pengaturan.nama_toko || 'DL BEAUTY');
  const cancelled = order.status === 'DIBATALKAN';
  // replaceChildren(null) akan menulis teks "null"; kartu yang tidak ada dibuang dulu.
  // Saat dicetak: hanya kepala invoice, cara terima, dan ringkasan. Sisanya diberi no-print.
  const noPrint = (el) => { if (el) el.classList.add('no-print'); return el; };
  $('view').replaceChildren(...[
    h('div', { class: 'print-only invoice-head' },
      h('strong', { class: 'invoice-shop' }, pengaturan.nama_toko || 'DL BEAUTY'),
      h('span', null, 'Invoice #' + order.id)
    ),
    h('h1', { class: 'page-title' }, cancelled ? 'Pesanan dibatalkan' : 'Pesanan terkirim'),
    h('p', { class: 'success-id' }, 'Nomor pesanan #' + order.id),
    noPrint(stepper(order)),
    noPrint(statusPanel(order)),
    receiveCard(order),
    summaryCard(order),
    noPrint(reviewCard(order)),
    noPrint(contactButton(order))
  ].filter(Boolean));
}

function renderProblem(msg, retry) {
  $('view').replaceChildren(
    h('div', { class: 'state' },
      h('p', null, msg),
      retry ? h('button', { class: 'btn btn-solid', type: 'button', onclick: retry }, 'Coba lagi') : null,
      h('a', { class: 'btn', href: './' }, 'Ke beranda')
    )
  );
}

/* ---------- Polling ---------- */
async function refresh() {
  if (busy || !params) return;
  try {
    const next = await getOrder(params.id, params.token);
    if (busy) return;
    order = next;
    render();
    if (FINAL.includes(order.status)) stopPolling();
  } catch (e) {
    // Gagal sementara saat polling: biarkan data terakhir tetap tampil.
  }
}

function startPolling() {
  stopPolling();
  if (document.hidden || (order && FINAL.includes(order.status))) return;
  timer = setInterval(refresh, POLL_MS);
}

function stopPolling() {
  clearInterval(timer);
  timer = 0;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { stopPolling(); return; }
  refresh();
  startPolling();
});

/* ---------- Mulai ---------- */
async function init() {
  params = readParams();
  const cached = readCache();
  if (cached) { pengaturan = cached.pengaturan || {}; applySettings(pengaturan); }
  if (!params) { renderProblem('Link pesanan tidak lengkap atau tidak valid.'); return; }

  const load = async () => {
    $('view').replaceChildren(...skPesanan());
    const [ord, boot] = await Promise.allSettled([getOrder(params.id, params.token), fetchBootstrap()]);
    if (boot.status === 'fulfilled') { pengaturan = boot.value.pengaturan || {}; applySettings(pengaturan); }
    if (ord.status === 'rejected') {
      renderProblem((ord.reason && ord.reason.message) || 'Pesanan belum bisa dimuat.', load);
      return;
    }
    order = ord.value;
    lastRendered = '';
    render();
    startPolling();
  };
  await load();
}

init();
