import { cart, MAX_QTY } from './cart.js';
import { createOrder, CARA_DEFAULT } from './api.js';
import { h, rupiah } from './util.js';

const PROFILE_KEY = 'dlbeauty_profile_v1';
const ORDERS_KEY = 'dlbeauty_orders_v1';
const ALAMAT_LABEL = { antar: 'Alamat pengiriman', cod: 'Titik pertemuan COD' };

let data = { pengaturan: {}, cara_terima: CARA_DEFAULT };
let dlg = null;
let unsub = null;
let busy = false;
let leaving = false;

export function initCheckout() {
  dlg = document.getElementById('cartDialog');
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => { if (unsub) { unsub(); unsub = null; } });
  // Kembali lewat tombol Back (bfcache): status kirim dari halaman sebelumnya harus dibuang.
  window.addEventListener('pageshow', (e) => { if (e.persisted) { leaving = false; busy = false; } });
}

export function setCheckoutData(d) {
  data = {
    pengaturan: d.pengaturan || {},
    cara_terima: d.cara_terima && d.cara_terima.length ? d.cara_terima : CARA_DEFAULT
  };
}

export function openCheckout() {
  renderForm();
  if (!dlg.open) dlg.showModal();
}

/* ---------- Penyimpanan lokal ---------- */
function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (e) { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* abaikan */ }
}

/* ---------- Kerangka sheet ---------- */
function shell(title, ...body) {
  return [
    h('div', { class: 'sheet-head' },
      h('h2', { id: 'cartTitle', class: 'sheet-title' }, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Tutup', onclick: () => dlg.close() }, '\u00d7')
    ),
    ...body
  ];
}

function setDialog(nodes) {
  dlg.replaceChildren(h('div', { class: 'sheet-inner' }, nodes));
}

/* ---------- Form keranjang ---------- */
function renderForm() {
  if (unsub) { unsub(); unsub = null; }

  const caraList = data.cara_terima;
  const profile = loadJSON(PROFILE_KEY, {});
  const alamatToko = data.pengaturan.alamat || '';

  const itemsBox = h('div', { class: 'cart-items' });
  const empty = h('p', { class: 'empty' }, 'Keranjang masih kosong.');
  const totalEl = h('strong', { class: 'total-val' });
  const errEl = h('p', { class: 'form-error', role: 'alert' });

  const radios = caraList.map((c, i) => {
    const input = h('input', { type: 'radio', name: 'cara', value: c.kode, id: 'cara-' + c.kode });
    const desc = c.desc || (c.kode === 'ambil' ? (alamatToko || 'Ambil langsung di toko.') : '');
    const label = h('label', { class: 'opt', for: 'cara-' + c.kode },
      input,
      h('span', { class: 'opt-body' },
        h('span', { class: 'opt-title' }, c.label),
        desc ? h('span', { class: 'opt-desc' }, desc) : null
      )
    );
    return { c, input, label, first: i === 0 };
  });
  const preset = radios.find((r) => r.c.kode === profile.cara) || radios[0];
  preset.input.checked = true;

  const nama = h('input', { id: 'f-nama', class: 'input', type: 'text', autocomplete: 'name', maxlength: '60', value: profile.nama || '' });
  const wa = h('input', { id: 'f-wa', class: 'input', type: 'tel', inputmode: 'tel', autocomplete: 'tel', placeholder: '08xxxxxxxxxx', maxlength: '20', value: profile.wa || '' });
  const alamat = h('textarea', { id: 'f-alamat', class: 'input', rows: '3', maxlength: '300', autocomplete: 'street-address' });
  alamat.value = profile.alamat || '';
  const catatan = h('input', { id: 'f-catatan', class: 'input', type: 'text', maxlength: '200', placeholder: 'Contoh: tolong dibungkus kado' });
  const hp = h('input', { type: 'text', name: 'website', class: 'hp', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
  const alamatLabel = h('label', { for: 'f-alamat', class: 'label' });
  const alamatWrap = h('div', { class: 'field' }, alamatLabel, alamat);

  const submit = h('button', { class: 'btn btn-solid btn-block', type: 'submit' }, 'Kirim pesanan');

  const form = h('form', { class: 'checkout', novalidate: true },
    h('fieldset', { class: 'fieldset' },
      h('legend', { class: 'label' }, 'Cara terima pesanan'),
      radios.map((r) => r.label)
    ),
    h('div', { class: 'field' }, h('label', { for: 'f-nama', class: 'label' }, 'Nama penerima'), nama),
    h('div', { class: 'field' }, h('label', { for: 'f-wa', class: 'label' }, 'Nomor WhatsApp'), wa),
    alamatWrap,
    h('div', { class: 'field' }, h('label', { for: 'f-catatan', class: 'label' }, 'Catatan (opsional)'), catatan),
    hp,
    h('div', { class: 'total' }, h('span', null, 'Total'), totalEl),
    errEl,
    submit
  );

  function current() {
    const r = radios.find((x) => x.input.checked) || radios[0];
    return r.c;
  }

  function syncCara() {
    radios.forEach((r) => r.label.classList.toggle('is-on', r.input.checked));
    const c = current();
    alamatWrap.hidden = !c.butuh_alamat;
    alamatLabel.textContent = ALAMAT_LABEL[c.kode] || 'Alamat';
  }
  radios.forEach((r) => r.input.addEventListener('change', syncCara));
  syncCara();

  function row(it) {
    return h('div', { class: 'cart-row' },
      h('div', { class: 'cart-info' },
        h('p', { class: 'cart-name' }, it.nama),
        h('p', { class: 'cart-price' }, rupiah(it.harga))
      ),
      h('div', { class: 'stepper' },
        h('button', { type: 'button', 'aria-label': 'Kurangi ' + it.nama, onclick: () => cart.setQty(it.id, it.jumlah - 1) }, '\u2212'),
        h('span', { 'aria-live': 'polite' }, String(it.jumlah)),
        h('button', { type: 'button', 'aria-label': 'Tambah ' + it.nama, disabled: it.jumlah >= MAX_QTY, onclick: () => cart.setQty(it.id, it.jumlah + 1) }, '+')
      )
    );
  }

  function refresh() {
    const has = cart.items.length > 0;
    itemsBox.replaceChildren(...cart.items.map(row));
    totalEl.textContent = rupiah(cart.total());
    empty.hidden = has;
    form.hidden = !has;
  }
  unsub = cart.subscribe(refresh);
  refresh();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (busy) return;
    errEl.textContent = '';
    const c = current();
    const v = {
      nama: nama.value.trim(),
      wa: wa.value.trim(),
      alamat: alamat.value.trim(),
      catatan: catatan.value.trim()
    };
    const waDigits = v.wa.replace(/\D/g, '');
    let bad = null;
    if (v.nama.length < 2) bad = [nama, 'Nama penerima wajib diisi.'];
    else if (waDigits.length < 9 || waDigits.length > 15) bad = [wa, 'Nomor WhatsApp tidak valid.'];
    else if (c.butuh_alamat && v.alamat.length < 5) bad = [alamat, (ALAMAT_LABEL[c.kode] || 'Alamat') + ' wajib diisi.'];
    if (bad) { errEl.textContent = bad[1]; bad[0].focus(); return; }

    const snapshot = cart.items.map((it) => ({ ...it }));
    const payload = {
      req_id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).slice(0, 36),
      cara_terima: c.kode,
      nama: v.nama,
      wa: waDigits,
      alamat: c.butuh_alamat ? v.alamat : '',
      catatan: v.catatan,
      website: hp.value,
      items: snapshot.map((it) => ({ id: it.id, jumlah: it.jumlah }))
    };

    busy = true;
    submit.disabled = true;
    submit.textContent = 'Mengirim\u2026';
    try {
      const res = await createOrder(payload);
      saveJSON(PROFILE_KEY, { nama: v.nama, wa: v.wa, alamat: v.alamat, cara: c.kode });
      const orders = loadJSON(ORDERS_KEY, []);
      orders.unshift({ id: res.id, token: res.token, waktu: Date.now(), total: res.total });
      saveJSON(ORDERS_KEY, orders.slice(0, 10));
      cart.clear();
      // Tombol dibiarkan nonaktif sampai halaman berpindah, supaya tidak terkirim dua kali.
      leaving = true;
      location.assign('pesanan.html?id=' + encodeURIComponent(res.id) + '&t=' + encodeURIComponent(res.token));
    } catch (e) {
      errEl.textContent = (e && e.message) || 'Gagal mengirim pesanan. Coba lagi.';
    } finally {
      if (!leaving) {
        busy = false;
        submit.disabled = false;
        submit.textContent = 'Kirim pesanan';
      }
    }
  });

  setDialog(shell('Keranjang kamu', itemsBox, empty, form));
}
