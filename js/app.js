import { fetchBootstrap, readCache } from './api.js';
import { h, rupiah, waLink, slug, stars, tanggal, fotoUrl } from './util.js';
import { cart, MAX_QTY } from './cart.js';
import { initCheckout, setCheckoutData, openCheckout } from './checkout.js';
import { initAudio, playSfx } from './suara.js';
import { toast as showToast } from './ui.js';

const $ = (id) => document.getElementById(id);
let observer = null;
let lastRendered = '';

/* ---------- Toast ---------- */
const toast = (msg, action) => showToast(msg, action ? 3500 : 2200, action);

/* ---------- Header, banner, footer ---------- */
function applySettings(p) {
  const nama = p.nama_toko || 'DL BEAUTY';
  document.title = nama;
  $('brandName').textContent = nama;
  if (p.logo_url) $('brandLogo').src = fotoUrl(p.logo_url);
  if (p.banner_url) $('banner').src = fotoUrl(p.banner_url);
  $('banner').alt = 'Banner ' + nama;

  const chat = $('chatAdmin');
  const link = waLink(p.wa_admin, 'Halo ' + nama + ', saya mau tanya produk.');
  chat.hidden = !link;
  if (link) chat.href = link;

  const float = $('waFloat');
  float.hidden = !link;
  if (link) float.href = link;

  $('footerText').textContent = [p.tagline, p.alamat].filter(Boolean).join(' \u00b7 ');
}

/* ---------- Produk ---------- */
function productCard(p) {
  const src = fotoUrl(p.foto);
  const media = h('div', { class: 'card-media' },
    src
      ? h('img', { src, alt: p.nama, loading: 'lazy', decoding: 'async' })
      : h('span', { class: 'card-ph', 'aria-hidden': 'true' }, 'DL'),
    p.habis ? h('span', { class: 'badge-sold' }, 'HABIS') : null
  );
  const btn = h('button', {
    class: 'btn', type: 'button', disabled: p.habis,
    onclick: (ev) => addToCart(p, ev.currentTarget)
  }, p.habis ? 'Habis' : 'Tambah');

  return h('article', { class: 'card' + (p.habis ? ' is-sold' : '') },
    media,
    h('h3', { class: 'card-name' }, p.nama),
    h('p', { class: 'card-price' }, rupiah(p.harga)),
    btn
  );
}

function productSection(id, title, items) {
  return h('section', { class: 'section', id },
    h('h2', { class: 'section-title' }, title),
    h('div', { class: 'grid' }, items.map(productCard))
  );
}

/* ---------- Ulasan ---------- */
function reviewSection(u) {
  const wrap = h('section', { class: 'section', id: 'ulasan' }, h('h2', { class: 'section-title' }, 'Ulasan pelanggan'));
  if (!u || !u.jumlah) {
    wrap.append(h('p', { class: 'empty' }, 'Belum ada ulasan.'));
    return wrap;
  }
  wrap.append(
    h('div', { class: 'rating' },
      h('span', { class: 'rating-score' }, u.rata.toFixed(1)),
      h('div', null,
        h('div', { class: 'stars', role: 'img', 'aria-label': 'Rata-rata ' + u.rata + ' dari 5' }, stars(u.rata)),
        h('p', { class: 'rating-count' }, 'dari ' + u.jumlah + ' ulasan')
      )
    ),
    h('div', { class: 'reviews' }, u.daftar.map((r) =>
      h('article', { class: 'review' },
        h('div', { class: 'review-head' },
          h('span', null, r.nama || 'Pelanggan'),
          h('span', { class: 'stars', role: 'img', 'aria-label': r.bintang + ' bintang' }, stars(r.bintang))
        ),
        h('p', { class: 'review-date' }, tanggal(r.waktu)),
        r.komentar ? h('p', { class: 'review-text' }, r.komentar) : null
      )
    ))
  );
  return wrap;
}

/* ---------- Tab ---------- */
function setActive(id) {
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.target === id;
    t.classList.toggle('is-active', on);
    if (on) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current');
  });
  const active = document.querySelector('.tab.is-active');
  if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function buildTabs(entries) {
  const nav = $('tabs');
  nav.replaceChildren(...entries.map((e) =>
    h('a', {
      class: 'tab', href: '#' + e.id, 'data-target': e.id,
      onclick: (ev) => {
        ev.preventDefault();
        const el = $(e.id);
        if (!el) return;
        const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
        history.replaceState(null, '', '#' + e.id);
        setActive(e.id);
      }
    }, e.label)
  ));

  if (observer) observer.disconnect();
  observer = new IntersectionObserver((list) => {
    list.forEach((en) => { if (en.isIntersecting) setActive(en.target.id); });
  }, { rootMargin: '-25% 0px -65% 0px' });
  entries.forEach((e) => { const el = $(e.id); if (el) observer.observe(el); });
  if (entries.length) setActive(entries[0].id);
}

/* ---------- Render ---------- */
function render(data) {
  const key = JSON.stringify(data);
  if (key === lastRendered) return;
  lastRendered = key;

  applySettings(data.pengaturan || {});
  setCheckoutData(data);
  const removed = cart.sync(data.produk || []);
  if (removed.length) toast('Dihapus dari keranjang (habis/tidak tersedia): ' + removed.join(', '));

  const produk = data.produk || [];
  const kategori = data.kategori || [];
  const known = new Set(kategori);
  const groups = kategori.map((k) => ({ nama: k, items: produk.filter((p) => p.kategori === k) }));
  const lain = produk.filter((p) => !known.has(p.kategori));
  if (lain.length) groups.push({ nama: 'lainnya', items: lain });

  const shown = groups.filter((g) => g.items.length);
  const entries = shown.map((g) => ({ id: 'kat-' + slug(g.nama), label: g.nama }));
  entries.push({ id: 'ulasan', label: 'Ulasan' });

  const content = $('content');
  const nodes = shown.map((g, i) => productSection(entries[i].id, g.nama, g.items));
  if (!shown.length) nodes.push(h('p', { class: 'state' }, 'Produk belum tersedia.'));
  nodes.push(reviewSection(data.ulasan));
  content.replaceChildren(...nodes);

  buildTabs(entries);
  if (location.hash) {
    const target = $(location.hash.slice(1));
    if (target) target.scrollIntoView({ block: 'start' });
  }
}

function renderError(err, hasData) {
  if (hasData) { toast('Gagal memperbarui data'); return; }
  $('content').replaceChildren(
    h('div', { class: 'state' },
      h('p', null, 'Data toko belum bisa dimuat.'),
      h('p', null, String((err && err.message) || err)),
      h('button', { class: 'btn btn-solid', type: 'button', onclick: () => location.reload() }, 'Coba lagi')
    )
  );
}

/* ---------- Mulai ---------- */
// Tombol "Tambah" memberi umpan balik sendiri; keranjang tidak lagi terbuka otomatis.
const addTimers = new WeakMap();

function flashAdded(btn) {
  clearTimeout(addTimers.get(btn));
  btn.classList.add('is-added');
  btn.textContent = '\u2713 Ditambahkan';
  addTimers.set(btn, setTimeout(() => {
    btn.classList.remove('is-added');
    btn.textContent = 'Tambah';
  }, 1000));
}

function addToCart(p, btn) {
  if (!cart.add(p)) { toast('Maksimal ' + MAX_QTY + ' per produk'); return; }
  playSfx('tambah');
  flashAdded(btn);
  toast('Ditambahkan ke keranjang', { label: 'Lihat', onClick: openCheckout });
}

let prevCount = cart.count();

function updateBadge() {
  const n = cart.count();
  const badge = $('cartBadge');
  badge.textContent = String(n);
  badge.hidden = n === 0;
  if (n > prevCount) {
    badge.classList.remove('is-bump');
    void badge.offsetWidth; // ulang animasi bila ditambah beruntun
    badge.classList.add('is-bump');
  }
  prevCount = n;
  $('cartBtn').setAttribute('aria-label', n ? 'Buka keranjang, ' + n + ' item' : 'Buka keranjang');
}

async function init() {
  initCheckout();
  initAudio({ sound: $('soundBtn'), music: $('musicBtn') }, toast);
  cart.subscribe(updateBadge);
  updateBadge();
  $('cartBtn').addEventListener('click', openCheckout);
  const cached = readCache();
  if (cached) render(cached);
  try {
    render(await fetchBootstrap());
  } catch (err) {
    renderError(err, Boolean(cached));
  }
}

init();