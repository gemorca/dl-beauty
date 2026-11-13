import { fetchBootstrap, readCache } from './api.js';
import { h, rupiah, waLink, slug, stars, tanggal, fotoUrl, shimmerOnLoad } from './util.js';
import { cart, MAX_QTY } from './cart.js';
import { initCheckout, setCheckoutData, openCheckout } from './checkout.js';
import { initAudio, playSfx } from './suara.js';
import { toast as showToast, bindDialog, closeDialog } from './ui.js';

const $ = (id) => document.getElementById(id);
let observer = null;
let lastRendered = '';
let query = '';
let tabEntries = [];
let searchUi = null;

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
  const img = src ? h('img', { src, alt: '', loading: 'lazy', decoding: 'async' }) : null;
  const media = h('button', {
    class: 'card-media card-open', type: 'button', 'aria-label': 'Lihat detail ' + p.nama,
    onclick: () => openDetail(p)
  },
    img || h('span', { class: 'card-ph', 'aria-hidden': 'true' }, 'DL'),
    p.habis ? h('span', { class: 'badge-sold' }, 'HABIS') : null
  );
  if (img) shimmerOnLoad(media, img);
  const btn = h('button', {
    class: 'btn', type: 'button', disabled: p.habis,
    onclick: (ev) => addToCart(p, ev.currentTarget)
  }, p.habis ? 'Habis' : 'Tambah');

  return h('article', {
    class: 'card' + (p.habis ? ' is-sold' : ''),
    'data-q': normQ([p.nama, p.kategori, p.deskripsi].join(' '))
  },
    media,
    h('h3', { class: 'card-name' }, h('button', { class: 'card-name-btn', type: 'button', onclick: () => openDetail(p) }, p.nama)),
    h('p', { class: 'card-price' }, rupiah(p.harga)),
    btn
  );
}

/* ---------- Detail produk ---------- */
let detailDlg = null;

function openDetail(p) {
  if (!detailDlg) {
    detailDlg = h('dialog', { class: 'sheet', 'aria-labelledby': 'detailTitle' });
    document.body.append(detailDlg);
    bindDialog(detailDlg);
    detailDlg.addEventListener('click', (ev) => { if (ev.target === detailDlg) closeDialog(detailDlg); });
  }
  const src = fotoUrl(p.foto, 900);
  const add = h('button', {
    class: 'btn btn-solid btn-block detail-add', type: 'button', disabled: p.habis,
    onclick: (ev) => { closeDialog(detailDlg); addToCart(p, ev.currentTarget); }
  }, p.habis ? 'Habis' : 'Tambah');
  const desc = String(p.deskripsi || '').trim();

  detailDlg.replaceChildren(h('div', { class: 'sheet-inner' },
    h('div', { class: 'sheet-head' },
      h('h2', { id: 'detailTitle', class: 'sheet-title' }, p.nama),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Tutup', onclick: () => closeDialog(detailDlg) }, '\u00d7')),
    h('div', { class: 'detail-media' },
      src ? h('img', { src, alt: p.nama, decoding: 'async' }) : h('span', { class: 'card-ph', 'aria-hidden': 'true' }, 'DL')),
    h('p', { class: 'detail-price' }, rupiah(p.harga)),
    h('div', { class: 'ocard-tags' },
      p.kategori ? h('span', { class: 'tag' }, p.kategori) : null,
      p.habis ? h('span', { class: 'tag tag-dibatalkan' }, 'Habis') : null),
    // textContent lewat h(): deskripsi tidak pernah dibaca sebagai HTML; baris baru lewat CSS pre-line.
    desc ? h('p', { class: 'detail-desc' }, desc) : null,
    add
  ));
  detailDlg.showModal();
}

function productSection(id, title, items) {
  return h('section', { class: 'section', id, 'data-kat': '1' },
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
  tabEntries = entries;
  $('tabs').replaceChildren(...entries.map((e) =>
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
}

// Observer hanya untuk section yang tampil; dibangun ulang tiap filter berubah.
function observeVisible() {
  if (observer) observer.disconnect();
  observer = new IntersectionObserver((list) => {
    list.forEach((en) => { if (en.isIntersecting) setActive(en.target.id); });
  }, { rootMargin: '-25% 0px -65% 0px' });
  const visible = tabEntries.filter((e) => { const el = $(e.id); return el && !el.hidden; });
  visible.forEach((e) => observer.observe($(e.id)));
  const cur = document.querySelector('.tab.is-active');
  if (visible.length && (!cur || cur.hidden)) setActive(visible[0].id);
}

/* ---------- Pencarian ---------- */
const normQ = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

function applyFilter() {
  const q = normQ(query);
  let total = 0;
  document.querySelectorAll('#content [data-kat]').forEach((sec) => {
    let n = 0;
    sec.querySelectorAll('.card').forEach((c) => {
      const ok = !q || c.dataset.q.includes(q);
      c.hidden = !ok; // hidden, bukan dibangun ulang: animasi tidak berulang
      if (ok) n += 1;
    });
    sec.hidden = n === 0;
    total += n;
  });
  const rev = $('ulasan');
  if (rev) rev.hidden = Boolean(q);
  document.querySelectorAll('.tab').forEach((t) => {
    const el = $(t.dataset.target);
    t.hidden = !el || el.hidden;
  });
  const none = $('noResult');
  if (none) none.hidden = !(q && total === 0);
  if (searchUi) {
    searchUi.clear.hidden = !query;
    searchUi.info.textContent = q ? (total ? total + ' produk ditemukan' : 'Produk tidak ditemukan') : '';
  }
  observeVisible();
}

function initSearch() {
  const input = h('input', {
    id: 'search', class: 'input search-input', type: 'search', placeholder: 'Cari produk\u2026',
    'aria-label': 'Cari produk', autocomplete: 'off', enterkeyhint: 'search', 'aria-describedby': 'searchInfo'
  });
  const clear = h('button', { class: 'icon-btn search-clear', type: 'button', 'aria-label': 'Hapus kata kunci', hidden: true });
  const info = h('p', { id: 'searchInfo', class: 'muted search-info', 'aria-live': 'polite' });
  searchUi = { input, clear, info };
  let t = 0;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(() => { query = input.value; applyFilter(); }, 150);
  });
  clear.addEventListener('click', () => {
    clearTimeout(t);
    input.value = '';
    query = '';
    applyFilter();
    input.focus();
  });
  clear.textContent = '\u00d7';
  document.querySelector('nav.tabs').before(
    h('div', { class: 'container search' }, h('div', { class: 'search-box' }, input, clear), info));
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
  nodes.push(h('p', { class: 'state', id: 'noResult', hidden: true }, 'Produk tidak ditemukan'));
  nodes.push(reviewSection(data.ulasan));
  content.replaceChildren(...nodes);

  buildTabs(entries);
  applyFilter();
  if (location.hash) {
    const target = $(location.hash.slice(1));
    if (target) target.scrollIntoView({ block: 'start' });
  }
}

function renderError(err, hasData) {
  if (hasData) { toast('Gagal memperbarui data'); return; }
  $('tabs').replaceChildren(); // buang pill skeleton
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
  initSearch();
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
