// Panel admin Tahap 7: Keuangan dan Ulasan.
// Dimuat oleh admin.js. Setiap kali tab dibuka, data diminta ulang dari server (data
// lama tetap tampil selagi memuat), supaya angka selalu sama dengan sheet.
import { h, rupiah, stars, tanggal } from './util.js';
import { adminFinance, adminAddExpense, adminReviews, adminDeleteReview } from './admin-api.js';
import { setLoading, closeDialog } from './ui.js';
import { skKeuangan, skUlasan } from './skeleton.js';

const CARA_LABEL = { antar: 'Antar', ambil: 'Ambil', cod: 'COD' };

// Uang bisa negatif (laba rugi): tanda minus di depan "Rp".
const uang = (n) => (n < 0 ? '-' + rupiah(-n) : rupiah(n));

function dayLabel(key) {
  return new Date(key + 'T00:00:00Z').toLocaleDateString('id-ID',
    { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

function jam(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function newReqId() {
  return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
}

// ctx: { panels:{keuangan, ulasan}, formDialog, toast, confirmDialog, handleAuth }
export function mountKeuangan(ctx) {
  const { panels, formDialog, toast, confirmDialog, handleAuth } = ctx;
  let fin = null;
  let rev = null;
  let loadingFin = false;
  let loadingRev = false;
  let alive = true;
  let busy = false;

  /* ---------- Keuangan ---------- */
  function statCard(label, val, neg) {
    return h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label),
      h('strong', { class: 'stat-val' + (neg ? ' is-neg' : '') }, val));
  }

  function hariSection(g, hariIni) {
    const rows = [];
    g.pesanan.forEach((p) => rows.push(h('div', { class: 'trow' },
      h('span', { class: 'trow-main' }, '#' + p.id + ' ' + p.nama),
      h('span', { class: 'trow-meta' }, (CARA_LABEL[p.cara_terima] || p.cara_terima) + (p.cara_bayar ? ' \u00b7 ' + p.cara_bayar : '')),
      h('span', { class: 'tag tag-masuk' }, 'Masuk'),
      h('span', { class: 'trow-total' }, '+ ' + rupiah(p.total)))));
    g.pengeluaran.forEach((x) => rows.push(h('div', { class: 'trow' },
      h('span', { class: 'trow-main' }, x.keterangan),
      h('span', { class: 'trow-meta' }, jam(x.waktu)),
      h('span', { class: 'tag tag-keluar' }, 'Keluar'),
      h('span', { class: 'trow-total is-out' }, '- ' + rupiah(x.jumlah)))));

    return h('section', { class: 'day' },
      h('h3', { class: 'day-head' },
        h('span', null, dayLabel(g.hari) + (g.hari === hariIni ? ' (hari ini)' : '')),
        h('span', { class: 'day-sum' },
          'Masuk ' + rupiah(g.masuk) + ' \u00b7 Keluar ' + rupiah(g.keluar) + ' \u00b7 ',
          h('span', { class: g.laba < 0 ? 'is-neg' : '' }, (g.laba < 0 ? 'Rugi ' : 'Laba ') + rupiah(Math.abs(g.laba))))),
      rows.length ? rows : h('p', { class: 'empty' }, 'Tidak ada uang masuk atau keluar.'));
  }

  function renderKeuangan() {
    const r = fin.ringkasan;
    panels.keuangan.replaceChildren(
      h('div', { class: 'toolbar' },
        h('h2', { class: 'section-title' }, 'Keuangan ' + fin.hari.length + ' hari terakhir'),
        h('button', { class: 'btn btn-solid', type: 'button', onclick: openPengeluaran }, 'Catat uang keluar')),
      h('div', { class: 'stats' },
        statCard('Uang masuk', rupiah(r.masuk)),
        statCard('Uang keluar', rupiah(r.keluar)),
        statCard(r.laba < 0 ? 'Rugi' : 'Laba', uang(r.laba), r.laba < 0),
        statCard('Pesanan terbayar', String(r.n_masuk))),
      h('p', { class: 'muted fin-note' },
        'Uang masuk: pesanan antar yang pembayaran QRIS-nya sudah diterima, serta pesanan ambil/COD yang sudah diserahkan (tunai diterima). ' +
        'Pesanan dibatalkan tidak dihitung. Dikelompokkan menurut hari pesanan dibuat. Pengembalian uang ke pelanggan dicatat sebagai uang keluar.'),
      h('h2', { class: 'section-title fin-sub' }, 'Rincian per hari'),
      ...fin.hari.map((g) => hariSection(g, fin.hari_ini)));
  }

  async function loadFin() {
    if (loadingFin) return;
    loadingFin = true;
    if (!fin) panels.keuangan.replaceChildren(...skKeuangan());
    try {
      const res = await adminFinance();
      if (!alive) return;
      fin = res;
      renderKeuangan();
    } catch (e) {
      if (!alive || handleAuth(e)) return;
      if (!fin) {
        panels.keuangan.replaceChildren(h('div', { class: 'state' },
          h('p', null, (e && e.message) || 'Data belum bisa dimuat.'),
          h('button', { class: 'btn btn-solid', type: 'button', onclick: loadFin }, 'Coba lagi')));
      }
    } finally {
      loadingFin = false;
    }
  }

  function openPengeluaran() {
    let saving = false;
    let reqId = newReqId();
    const err = h('p', { class: 'form-error', role: 'alert' });
    const jumlah = h('input', { id: 'ex-jumlah', class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-describedby': 'ex-jumlah-info' });
    const info = h('p', { id: 'ex-jumlah-info', class: 'muted field-hint', 'aria-live': 'polite' });
    const paint = () => {
      const n = Number(jumlah.value.replace(/\D/g, ''));
      info.textContent = n >= 1 ? rupiah(n) : 'Isi angka saja, tanpa titik.';
    };
    jumlah.addEventListener('input', () => { jumlah.value = jumlah.value.replace(/\D/g, '').slice(0, 10); paint(); });
    paint();
    const ket = h('input', { id: 'ex-ket', class: 'input', type: 'text', maxlength: '120', autocomplete: 'off', placeholder: 'mis. beli botol, ongkir, iklan' });
    const batal = h('button', { class: 'btn', type: 'button', onclick: () => closeDialog(formDialog) }, 'Batal');
    const simpan = h('button', { class: 'btn btn-solid', type: 'submit' }, 'Simpan');

    const form = h('form', { novalidate: true },
      h('label', { for: 'ex-jumlah', class: 'label' }, 'Jumlah (Rp)'), jumlah, info,
      h('label', { for: 'ex-ket', class: 'label' }, 'Untuk apa'), ket,
      err,
      h('div', { class: 'confirm-actions' }, batal, simpan));

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (saving) return;
      err.textContent = '';
      const n = Number(jumlah.value.replace(/\D/g, ''));
      const k = ket.value.replace(/\s+/g, ' ').trim();
      if (!(n >= 1)) { err.textContent = 'Jumlah wajib diisi.'; jumlah.focus(); return; }
      if (k.length < 2) { err.textContent = 'Tulis untuk apa uang ini keluar.'; ket.focus(); return; }
      saving = true;
      setLoading(simpan, true, 'Menyimpan\u2026');
      try {
        const res = await adminAddExpense(n, k, reqId);
        if (!alive) return;
        fin = res;
        reqId = newReqId();
        closeDialog(formDialog);
        renderKeuangan();
        toast('Uang keluar dicatat: ' + rupiah(n));
      } catch (e) {
        if (e && e.code === 'AUTH') { if (formDialog.open) formDialog.close(); handleAuth(e); return; }
        err.textContent = (e && e.message) || 'Gagal menyimpan.';
      } finally {
        saving = false;
        setLoading(simpan, false, 'Simpan');
      }
    });

    formDialog.replaceChildren(h('div', { class: 'sheet-inner' },
      h('div', { class: 'sheet-head' },
        h('h2', { id: 'formTitle', class: 'sheet-title' }, 'Catat uang keluar'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Tutup', onclick: () => closeDialog(formDialog) }, '\u00d7')),
      form));
    formDialog.showModal();
    jumlah.focus();
  }

  /* ---------- Ulasan ---------- */
  function ulasanCard(u) {
    return h('article', { class: 'rcard' },
      h('div', { class: 'ocard-head' },
        h('strong', null, u.nama || 'Pelanggan'),
        h('span', { class: 'ocard-time' }, tanggal(u.waktu))),
      h('p', { class: 'rcard-stars', role: 'img', 'aria-label': u.bintang + ' dari 5 bintang' }, stars(u.bintang)),
      u.komentar ? h('p', { class: 'rcard-text' }, u.komentar) : h('p', { class: 'muted' }, 'Tanpa komentar.'),
      h('div', { class: 'rcard-foot' },
        h('span', { class: 'tag' }, u.pesanan_id ? 'Pesanan #' + u.pesanan_id : 'Tanpa nomor pesanan'),
        h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: (ev) => hapusUlasan(u, ev.currentTarget) }, 'Hapus')));
  }

  function renderUlasan() {
    const dipotong = rev.jumlah > rev.daftar.length;
    const bagian = [
      h('h2', { class: 'section-title' }, 'Ulasan'),
      h('div', { class: 'stats stats-2' },
        statCard('Jumlah ulasan', String(rev.jumlah)),
        statCard('Rata-rata', rev.jumlah ? rev.rata.toLocaleString('id-ID') + ' / 5' : '\u2013')),
      rev.daftar.length
        ? h('div', { class: 'rlist' }, rev.daftar.map(ulasanCard))
        : h('p', { class: 'empty' }, 'Belum ada ulasan. Pelanggan bisa menulis ulasan dari halaman pesanan setelah pesanannya selesai.'),
      dipotong ? h('p', { class: 'muted' }, 'Menampilkan ' + rev.daftar.length + ' ulasan terbaru dari ' + rev.jumlah + '.') : null
    ];
    // replaceChildren() asli menulis "null" sebagai teks, jadi buang yang kosong dulu.
    panels.ulasan.replaceChildren(...bagian.filter(Boolean));
  }

  async function loadRev() {
    if (loadingRev) return;
    loadingRev = true;
    if (!rev) panels.ulasan.replaceChildren(...skUlasan());
    try {
      const res = await adminReviews();
      if (!alive) return;
      rev = res;
      renderUlasan();
    } catch (e) {
      if (!alive || handleAuth(e)) return;
      if (!rev) {
        panels.ulasan.replaceChildren(h('div', { class: 'state' },
          h('p', null, (e && e.message) || 'Data belum bisa dimuat.'),
          h('button', { class: 'btn btn-solid', type: 'button', onclick: loadRev }, 'Coba lagi')));
      }
    } finally {
      loadingRev = false;
    }
  }

  async function hapusUlasan(u, btn) {
    if (busy) return;
    const yes = await confirmDialog('Hapus ulasan ini?',
      'Ulasan dari ' + (u.nama || 'pelanggan') + (u.pesanan_id ? ' (pesanan #' + u.pesanan_id + ')' : '') +
      ' akan hilang dari toko. Pelanggan itu bisa menulis ulasan lagi dari halaman pesanannya.', 'Ya, hapus');
    if (!yes) return;
    busy = true;
    setLoading(btn, true);
    try {
      const res = await adminDeleteReview(u.id);
      if (!alive) return;
      rev = res;
      renderUlasan();
      toast('Ulasan dihapus');
    } catch (e) {
      if (!alive || handleAuth(e)) return;
      toast((e && e.message) || 'Gagal menghapus.');
    } finally {
      busy = false;
      setLoading(btn, false);
    }
  }

  return {
    // Dipanggil tiap tab Keuangan / Ulasan dipilih (dan tiap polling saat tab Keuangan terbuka).
    show(id) {
      if (id === 'keuangan') loadFin();
      else if (id === 'ulasan') loadRev();
    },
    reset() { alive = false; }
  };
}
