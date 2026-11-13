import { CONFIG } from './config.js';
import { track } from './progress.js';
import { parseRekening } from './util.js';

const KEY = 'dlbeauty_bootstrap_v2';

export const CARA_DEFAULT = [
  { kode: 'antar', label: 'Antar ke rumah', desc: 'Dikirim ke alamatmu, bayar lewat QRIS atau transfer bank', butuh_alamat: true },
  { kode: 'ambil', label: 'Ambil di tempat', desc: '', butuh_alamat: false },
  { kode: 'cod', label: 'COD', desc: 'Ketemuan di titik yang disepakati, bayar tunai saat barang diterima', butuh_alamat: true }
];

const DEMO = {
  pengaturan: {
    nama_toko: 'DL BEAUTY',
    tagline: 'Body Booster Whitening Dosting',
    alamat: '',
    wa_admin: '08532459400',
    logo_url: '', banner_url: '', qris_url: '',
    rekening: 'BCA|1234567890|DL BEAUTY\nBRI|0987654321|DL BEAUTY' // contoh untuk mode demo
  },
  kategori: ['body booster', 'paket hemat'],
  cara_terima: CARA_DEFAULT,
  produk: [
    { id: 'D1', nama: 'Body Booster Whitening Dosting', harga: 75000, kategori: 'body booster', deskripsi: '', foto: '', habis: false },
    { id: 'D2', nama: 'Body Booster 2x Lebih Banyak', harga: 135000, kategori: 'body booster', deskripsi: '', foto: '', habis: false },
    { id: 'D3', nama: 'Body Booster Travel Size', harga: 35000, kategori: 'body booster', deskripsi: '', foto: '', habis: true },
    { id: 'D4', nama: 'Paket Duo Body Booster', harga: 140000, kategori: 'paket hemat', deskripsi: '', foto: '', habis: false }
  ],
  ulasan: { jumlah: 1, rata: 5, daftar: [{ id: 'U1', nama: 'Contoh', bintang: 5, komentar: 'Cepat meresap, tidak lengket.', waktu: '2026-11-06T10:00:00Z' }] }
};

export function readCache() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function writeCache(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* abaikan */ }
}

export async function fetchBootstrap() {
  if (!CONFIG.API_URL) return DEMO;
  const url = new URL(CONFIG.API_URL);
  url.searchParams.set('action', 'bootstrap');
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || 'Gagal memuat data');
  writeCache(json.data);
  return json.data;
}

// text/plain menghindari preflight CORS yang tidak didukung Apps Script.
async function post(action, payload, fallbackError) {
  let res;
  try {
    res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...payload, action })
    });
  } catch (e) {
    throw new Error('Koneksi bermasalah. Periksa internet lalu coba lagi.');
  }
  if (!res.ok) throw new Error('Server bermasalah (' + res.status + '). Coba lagi.');
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || fallbackError);
  return json.data;
}

/* ---------- Mode demo: pesanan disimpan di localStorage ---------- */
const DEMO_ORDERS_KEY = 'dlbeauty_demo_orders_v1';
const DEMO_BAYAR = { antar: 'QRIS', ambil: 'Bayar di tempat', cod: 'Tunai (COD)' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function demoLoad() {
  try { return JSON.parse(localStorage.getItem(DEMO_ORDERS_KEY)) || []; } catch (e) { return []; }
}
function demoSave(list) {
  try { localStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(list)); } catch (e) { /* abaikan */ }
}
function demoFind(list, b) {
  const o = list.find((x) => x.id === Number(b.id) && x.token === String(b.token || ''));
  if (!o) throw new Error('Pesanan tidak ditemukan.');
  return o;
}

// Hanya untuk uji manual di mode demo: window.__demo.setStatus(id, 'DIKEMAS')
if (!CONFIG.API_URL) {
  window.__demo = {
    setStatus(id, status) {
      const list = demoLoad();
      const o = list.find((x) => x.id === Number(id));
      if (o) { o.status = status; demoSave(list); }
    }
  };
}

async function createOrderImpl(payload) {
  if (!CONFIG.API_URL) {
    await wait(400);
    const items = payload.items.map((it) => {
      const p = DEMO.produk.find((x) => x.id === it.id);
      return { produk_id: it.id, nama: p ? p.nama : it.id, harga: p ? p.harga : 0, jumlah: it.jumlah };
    });
    const total = items.reduce((s, it) => s + it.harga * it.jumlah, 0);
    const list = demoLoad();
    const id = list.reduce((m, o) => Math.max(m, o.id), 100) + 1;
    const order = {
      id, token: 'demo' + Math.random().toString(16).slice(2, 10), waktu: new Date().toISOString(),
      nama: payload.nama, cara_terima: payload.cara_terima, cara_bayar: DEMO_BAYAR[payload.cara_terima] || '',
      alamat: payload.alamat || '', catatan: payload.catatan || '', total, status: 'DIPESAN', items, ulasan: null
    };
    list.push(order);
    demoSave(list);
    return { id, token: order.token, total, status: 'DIPESAN', cara_terima: order.cara_terima, cara_bayar: order.cara_bayar };
  }
  return post('createOrder', payload, 'Gagal membuat pesanan.');
}

// Data satu pesanan. id + token wajib cocok; server tidak mengirim pesanan lain.
export async function getOrder(id, token) {
  if (!CONFIG.API_URL) { await wait(150); return demoFind(demoLoad(), { id, token }); }
  return post('getOrder', { id, token }, 'Gagal memuat pesanan.');
}

// Pelanggan memilih cara bayar: 'QRIS' atau nama bank (DIPESAN -> PEMBAYARAN).
async function choosePaymentImpl(id, token, metode) {
  if (!CONFIG.API_URL) {
    await wait(250);
    if (metode !== 'QRIS' && !parseRekening(DEMO.pengaturan.rekening).some((r) => r.bank === metode)) {
      throw new Error('Metode bayar tidak valid.');
    }
    const list = demoLoad();
    const o = demoFind(list, { id, token });
    if (o.cara_terima !== 'antar') throw new Error('Pesanan ini dibayar langsung, tidak lewat QRIS.');
    if (o.status === 'DIPESAN') { o.status = 'PEMBAYARAN'; o.cara_bayar = metode; demoSave(list); }
    else if (o.status !== 'PEMBAYARAN') throw new Error('Status pesanan sudah ' + o.status + '. Pilihan bayar tidak bisa diubah.');
    return o;
  }
  return post('choosePayment', { id, token, metode }, 'Gagal memilih cara bayar.');
}

async function submitReviewImpl(id, token, bintang, komentar) {
  if (!CONFIG.API_URL) {
    await wait(250);
    const list = demoLoad();
    const o = demoFind(list, { id, token });
    if (o.status !== 'DIKIRIM') throw new Error('Ulasan bisa ditulis setelah pesanan selesai.');
    if (o.ulasan) throw new Error('Kamu sudah memberi ulasan untuk pesanan ini.');
    o.ulasan = { bintang, komentar: String(komentar || '').slice(0, 300) };
    demoSave(list);
    return o;
  }
  return post('submitReview', { id, token, bintang, komentar }, 'Gagal mengirim ulasan.');
}

// Tulis (create/update) tampil dengan progress bar atas layar. Baca (getOrder, bootstrap) tidak.
export const createOrder = (payload) => track(() => createOrderImpl(payload));
export const choosePayment = (id, token, metode) => track(() => choosePaymentImpl(id, token, metode));
export const submitReview = (id, token, bintang, komentar) => track(() => submitReviewImpl(id, token, bintang, komentar));
