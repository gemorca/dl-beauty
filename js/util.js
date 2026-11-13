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

// Teks rekening (satu baris per bank: BANK|NOMOR|ATAS NAMA) -> [{bank, nomor, atas_nama}].
// Sama dengan parseRekening_ di server; baris yang formatnya rusak dilewati.
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

export function tanggal(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Terima link Drive (file/d/ID atau uc?id=ID) dan ubah ke URL gambar langsung.
// Lebar opsional (default 600); QRIS memakai lebih besar agar tetap tajam saat dipindai.
export function fotoUrl(url, lebar) {
  const s = String(url || '').trim();
  if (!s) return '';
  const m = s.match(/drive\.google\.com\/file\/d\/([\w-]+)/) || s.match(/drive\.google\.com\/(?:uc|open)\?[^#]*id=([\w-]+)/);
  return m ? 'https://lh3.googleusercontent.com/d/' + m[1] + '=w' + (lebar || 600) : s;
}

// Shimmer di kotak gambar sampai gambarnya selesai dimuat (atau gagal).
export function shimmerOnLoad(box, img) {
  box.classList.add('is-loading');
  const done = () => box.classList.remove('is-loading');
  img.addEventListener('load', done, { once: true });
  img.addEventListener('error', done, { once: true });
  if (img.complete && img.naturalWidth) done();
}
