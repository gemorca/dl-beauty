// Dialog riwayat pesanan di perangkat ini. Data dari localStorage (dlbeauty_orders_v1),
// ditulis oleh checkout.js. Data lama boleh tidak punya items/cara_terima.
import { h, rupiah, tanggal } from './util.js';
import { bindDialog, closeDialog } from './ui.js';

const ORDERS_KEY = 'dlbeauty_orders_v1';
let dlg = null;

function loadOrders() {
  try {
    const list = JSON.parse(localStorage.getItem(ORDERS_KEY));
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

function row(o) {
  const id = Math.floor(Number(o && o.id));
  if (!(id >= 1)) return null;
  const token = String(o.token || '');
  const href = 'pesanan.html?id=' + encodeURIComponent(id) + (token ? '&t=' + encodeURIComponent(token) : '');
  return h('a', { class: 'riwayat-row', href },
    h('span', { class: 'riwayat-info' },
      h('span', { class: 'riwayat-id' }, 'Invoice #' + id),
      h('span', { class: 'riwayat-date' }, tanggal(o.waktu))
    ),
    h('span', { class: 'riwayat-total' }, rupiah(o.total))
  );
}

export function openRiwayat() {
  if (!dlg) {
    dlg = h('dialog', { class: 'sheet', 'aria-labelledby': 'riwayatTitle' });
    document.body.append(dlg);
    bindDialog(dlg);
    dlg.addEventListener('click', (ev) => { if (ev.target === dlg) closeDialog(dlg); });
  }
  // Dibaca ulang tiap dibuka, jadi pesanan baru langsung tampil. Urutan simpan = terbaru di atas.
  const rows = loadOrders().map(row).filter(Boolean);
  dlg.replaceChildren(h('div', { class: 'sheet-inner' },
    h('div', { class: 'sheet-head' },
      h('h2', { id: 'riwayatTitle', class: 'sheet-title' }, 'Riwayat pesanan'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Tutup', onclick: () => closeDialog(dlg) }, '\u00d7')
    ),
    rows.length ? h('div', { class: 'riwayat-list' }, rows) : h('p', { class: 'empty' }, 'Belum ada pesanan.')
  ));
  if (!dlg.open) dlg.showModal();
}
