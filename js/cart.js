const KEY = 'dlbeauty_cart_v1';
export const MAX_QTY = 20;

let items = load();
const listeners = new Set();

function valid(it) {
  return it && typeof it.id === 'string' && typeof it.nama === 'string' &&
    Number.isFinite(it.harga) && Number.isInteger(it.jumlah) && it.jumlah >= 1;
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(raw) ? raw.filter(valid).map((it) => ({ ...it, jumlah: Math.min(it.jumlah, MAX_QTY) })) : [];
  } catch (e) {
    return [];
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* abaikan */ }
  listeners.forEach((fn) => fn(items));
}

export const cart = {
  get items() { return items; },
  count() { return items.reduce((s, it) => s + it.jumlah, 0); },
  total() { return items.reduce((s, it) => s + it.harga * it.jumlah, 0); },

  add(p) {
    const found = items.find((it) => it.id === p.id);
    if (found) found.jumlah = Math.min(MAX_QTY, found.jumlah + 1);
    else items = [...items, { id: p.id, nama: p.nama, harga: p.harga, jumlah: 1 }];
    save();
  },

  setQty(id, qty) {
    const q = Math.floor(qty);
    items = q < 1
      ? items.filter((it) => it.id !== id)
      : items.map((it) => (it.id === id ? { ...it, jumlah: Math.min(q, MAX_QTY) } : it));
    save();
  },

  clear() { items = []; save(); },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  // Samakan keranjang dengan data terbaru. Mengembalikan nama produk yang dibuang.
  sync(produk) {
    const byId = new Map(produk.map((p) => [p.id, p]));
    const removed = [];
    let changed = false;
    const next = [];
    items.forEach((it) => {
      const p = byId.get(it.id);
      if (!p || p.habis) { removed.push(it.nama); changed = true; return; }
      if (p.harga !== it.harga || p.nama !== it.nama) {
        changed = true;
        next.push({ ...it, harga: p.harga, nama: p.nama });
      } else {
        next.push(it);
      }
    });
    if (changed) { items = next; save(); }
    return removed;
  }
};
