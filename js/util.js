export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (v == null || v === false) return;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  });
  kids.flat().forEach((c) => { if (c != null && c !== false) el.append(c); });
  return el;
}

export function rupiah(n) {
  return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
}

export function waLink(number, text) {
  let d = String(number || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('0')) d = '62' + d.slice(1);
  return 'https://wa.me/' + d + (text ? '?text=' + encodeURIComponent(text) : '');
}

export function parseRekening(teks) {
  return String(teks || '').split(/\r?\n/)
    .map((baris) => baris.split('|').map((s) => s.trim()))
    .filter((p) => p.length === 3 && p[0] && p[1] && p[2])
    .map((p) => ({ bank: p[0], nomor: p[1], atas_nama: p[2] }));
}

export function slug(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lain';
}

export function stars(n) {
  const v = Math.max(0, Math.min(5, Math.round(n)));
  return '\u2605'.repeat(v) + '\u2606'.repeat(5 - v);
}

export function itemsEl(items) {
  const txt = (Array.isArray(items) ? items : [])
    .filter((it) => it && it.nama)
    .map((it) => it.nama + (it.jumlah > 1 ? ' \u00d7' + it.jumlah : ''))
    .join(', ');
  return txt ? h('p', { class: 'review-items' }, 'Membeli: ' + txt) : null;
}

export function tanggal(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function fotoUrl(url, lebar) {
  const s = String(url || '').trim();
  if (!s) return '';
  const m = s.match(/drive\.google\.com\/file\/d\/([\w-]+)/) || s.match(/drive\.google\.com\/(?:uc|open)\?[^#]*id=([\w-]+)/);
  return m ? 'https://lh3.googleusercontent.com/d/' + m[1] + '=w' + (lebar || 600) : s;
}

export function shimmerOnLoad(box, img) {
  box.classList.add('is-loading');
  const done = () => box.classList.remove('is-loading');
  img.addEventListener('load', done, { once: true });
  img.addEventListener('error', done, { once: true });
  if (img.complete && img.naturalWidth) done();
}
export const LOGO_DEFAULT = 'assets/logo.jpeg';
export const BANNER_DEFAULT = 'assets/banner.jpeg';
export function setImg(img, src) {
  if (!img || !src) return;
  if (img.getAttribute('src') === src) return;
  img.classList.add('is-loading');
  const done = () => img.classList.remove('is-loading');
  img.addEventListener('load', done, { once: true });
  img.addEventListener('error', done, { once: true });
  img.setAttribute('src', src);
  if (img.complete && img.naturalWidth) done();
}