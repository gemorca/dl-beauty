// Progress bar untuk proses tulis (create/update). Hapus dan pembacaan data tidak memakainya.
//
// - track(fn): jalankan fn (fungsi async) dan tampilkan bar tipis di atas layar selama prosesnya.
//   fetch tidak punya progress unggah, jadi bar naik pelan sampai ±90% lalu penuh saat selesai.
//   Permintaan beruntun (mis. unggah gambar lalu simpan) memakai satu bar yang sama:
//   bar baru dianggap selesai bila tidak ada permintaan baru dalam FINISH_DELAY ms.
// - createStepbar(): bar kecil di dalam form untuk proses bertahap (mis. "Mengunggah banner 2/3").
//   Langkah selesai juga menaikkan batas bawah bar atas.
//
// Bar atas memakai Popover API (top layer) supaya tetap terlihat di atas <dialog> modal.
// Browser tanpa Popover API tetap jalan; bar hanya bisa tertutup dialog, sementara spinner
// di tombol dan bar kecil di form tetap tampil.
import { h } from './util.js';

const TRICKLE_MS = 220;
const CAP = 0.9;
const START = 0.08;
const FINISH_DELAY = 160;
const HOLD_OK_MS = 250;
const HOLD_ERR_MS = 650;
const FADE_MS = 300;

let el = null;
let bar = null;
let active = 0;       // jumlah permintaan yang sedang berjalan
let running = false;  // satu sesi bar (bisa mencakup beberapa permintaan)
let value = 0;
let floor = 0;
let failed = false;
let trickleTimer = 0;
let finishTimer = 0;
let hideTimer = 0;

function ensure() {
  if (el) return;
  bar = h('div', { class: 'top-progress-bar' });
  el = h('div', { class: 'top-progress', 'aria-hidden': 'true', popover: 'manual' }, bar);
  document.body.append(el);
}

function paint() {
  bar.style.transform = 'scaleX(' + value + ')';
}

function openLayer() {
  try { if (el.showPopover && !el.matches(':popover-open')) el.showPopover(); } catch (e) { /* abaikan */ }
}

function closeLayer() {
  try { if (el.hidePopover && el.matches(':popover-open')) el.hidePopover(); } catch (e) { /* abaikan */ }
}

function tick() {
  value = Math.max(value, floor);
  value += (CAP - value) * 0.07;
  paint();
}

function begin() {
  active += 1;
  if (finishTimer) { clearTimeout(finishTimer); finishTimer = 0; } // sambung sesi yang menunggu selesai
  if (running) return;
  ensure();
  clearTimeout(hideTimer);
  running = true;
  failed = false;
  floor = 0;
  el.classList.remove('is-error');
  value = 0;
  bar.style.transition = 'none';
  paint();
  void bar.offsetWidth; // terapkan posisi awal tanpa transisi
  bar.style.transition = '';
  openLayer();
  el.classList.add('is-active');
  value = START;
  paint();
  trickleTimer = setInterval(tick, TRICKLE_MS);
}

function finish() {
  finishTimer = 0;
  running = false;
  clearInterval(trickleTimer);
  el.classList.toggle('is-error', failed);
  value = 1;
  paint();
  hideTimer = setTimeout(() => {
    el.classList.remove('is-active');
    hideTimer = setTimeout(closeLayer, FADE_MS);
  }, failed ? HOLD_ERR_MS : HOLD_OK_MS);
}

function end(ok) {
  active = Math.max(0, active - 1);
  if (!ok) failed = true;
  if (active === 0 && running) finishTimer = setTimeout(finish, FINISH_DELAY);
}

// Naikkan batas bawah bar (0..1 dari proses bertahap). Tidak pernah menurunkan.
export function setFloor(frac) {
  floor = Math.max(floor, Math.min(1, Math.max(0, frac)) * CAP);
  if (running) { value = Math.max(value, floor); paint(); }
}

export async function track(fn) {
  begin();
  let ok = false;
  try {
    const result = await fn();
    ok = true;
    return result;
  } finally {
    end(ok);
  }
}

export function createStepbar() {
  const fill = h('div', { class: 'stepbar-fill' });
  const trackEl = h('div', {
    class: 'stepbar-track', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100',
    'aria-valuenow': '0', 'aria-label': 'Kemajuan penyimpanan'
  }, fill);
  const text = h('p', { class: 'stepbar-text', 'aria-live': 'polite' });
  const box = h('div', { class: 'stepbar', hidden: true }, trackEl, text);
  return {
    el: box,
    update(done, total, label) {
      const pct = Math.round((done / total) * 100);
      box.hidden = false;
      fill.style.width = Math.max(8, pct) + '%';
      trackEl.setAttribute('aria-valuenow', String(pct));
      text.textContent = label || '';
      setFloor(done / total);
    },
    hide() {
      box.hidden = true;
      fill.style.width = '0%';
      text.textContent = '';
    }
  };
}