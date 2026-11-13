// Pembantu UI bersama untuk halaman publik dan admin.
// Dipakai oleh: toast (semua halaman). setLoading, closeDialog, bindDialog, createSeen
// dipakai tahap UX-2 sampai UX-6 (tombol loading, animasi dialog, animasi item baru).

export function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* ---------- Toast ---------- */
// Elemen #toast sudah ada di tiap halaman. Dibuat tampil lewat class .is-show
// (bukan hanya atribut hidden) supaya bisa dianimasikan.
// action (opsional): { label, onClick } menambah tombol di dalam toast.
let toastTimer = 0;
let toastHide = 0;
const TOAST_FADE_MS = 220;

function hideToast() {
  const el = document.getElementById('toast');
  if (!el) return;
  clearTimeout(toastTimer);
  clearTimeout(toastHide);
  el.classList.remove('is-show');
  toastHide = setTimeout(() => { el.hidden = true; }, TOAST_FADE_MS);
}

export function toast(msg, ms = 2600, action = null) {
  const el = document.getElementById('toast');
  if (!el) return;
  clearTimeout(toastTimer);
  clearTimeout(toastHide);
  el.classList.toggle('has-action', Boolean(action));
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = action.label;
    btn.addEventListener('click', () => { hideToast(); action.onClick(); });
    el.replaceChildren(document.createTextNode(msg), btn);
  } else {
    el.textContent = msg;
  }
  el.hidden = false;
  void el.offsetWidth; // paksa reflow: transisi mulai dari keadaan tersembunyi
  el.classList.add('is-show');
  toastTimer = setTimeout(hideToast, ms);
}

/* ---------- Tombol loading (spinner) ---------- */
// Dipakai untuk HAPUS dan aksi sekilas: tombol nonaktif + spinner + teks (mis. "Memproses…").
// Teks asli disimpan, lalu dipulihkan saat on=false (kecuali label diberikan).
export function setLoading(btn, on, label) {
  if (!btn) return;
  if (on && btn.dataset.orig === undefined) btn.dataset.orig = btn.textContent;
  btn.classList.toggle('is-loading', on);
  btn.disabled = on;
  if (on) btn.setAttribute('aria-busy', 'true');
  else btn.removeAttribute('aria-busy');
  if (label != null) btn.textContent = label;
  else if (!on && btn.dataset.orig !== undefined) btn.textContent = btn.dataset.orig;
  if (!on) delete btn.dataset.orig;
}

/* ---------- Progress bar di bawah tombol ---------- */
// Dipakai untuk TAMBAH / UBAH (create/update). Alur:
//   setBar(btn, true, 'Menyimpan…')  -> tombol nonaktif, bar muncul di bawahnya dan naik pelan sampai ±90%
//   await barFull(btn)               -> setelah server membalas: bar penuh 100% sebentar
//   setBar(btn, false)               -> bar hilang, tombol aktif lagi, teks asli dipulihkan (taruh di finally)
// barFloor(btn, 0..1) menaikkan batas bawah untuk proses bertahap (mis. unggah gambar lalu simpan).
const bars = new WeakMap();
const BAR_CAP = 0.9;

export function setBar(btn, on, label) {
  if (!btn) return;
  const old = bars.get(btn);
  if (old) clearInterval(old.timer);
  if (on) {
    if (btn.dataset.orig === undefined) btn.dataset.orig = btn.textContent;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.classList.add('is-progress');
    if (label != null) btn.textContent = label;
    const st = { timer: 0, floor: 0, p: 0.08 };
    const paint = () => btn.style.setProperty('--p', String(st.p));
    st.timer = setInterval(() => {
      st.p = Math.max(st.p, st.floor);
      st.p += (BAR_CAP - st.p) * 0.07;
      paint();
    }, 200);
    bars.set(btn, st);
    paint();
  } else {
    bars.delete(btn);
    btn.classList.remove('is-progress');
    btn.style.removeProperty('--p');
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
    if (label != null) btn.textContent = label;
    else if (btn.dataset.orig !== undefined) btn.textContent = btn.dataset.orig;
    delete btn.dataset.orig;
  }
}

export function barFloor(btn, frac) {
  const st = bars.get(btn);
  if (!st) return;
  st.floor = Math.max(st.floor, Math.min(1, Math.max(0, frac)) * BAR_CAP);
  st.p = Math.max(st.p, st.floor);
  btn.style.setProperty('--p', String(st.p));
}

export async function barFull(btn) {
  const st = bars.get(btn);
  if (!st) return;
  clearInterval(st.timer);
  btn.style.setProperty('--p', '1');
  await new Promise((r) => setTimeout(r, 300)); // beri waktu bar terlihat penuh
}

/* ---------- Dialog ---------- */
// Tutup <dialog> setelah animasi keluar selesai. Bila CSS belum mendefinisikan animasi
// untuk .is-closing, atau pengguna memilih reduced motion, dialog langsung ditutup.
export function closeDialog(dlg) {
  if (!dlg || !dlg.open || dlg.classList.contains('is-closing')) return;
  dlg.classList.add('is-closing');

  let finished = false;
  let fallback = 0;
  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(fallback);
    dlg.removeEventListener('animationend', onEnd);
    dlg.classList.remove('is-closing');
    if (dlg.open) dlg.close();
  }
  function onEnd(ev) { if (ev.target === dlg) finish(); }

  const name = getComputedStyle(dlg).animationName;
  if (reducedMotion() || !name || name === 'none') { finish(); return; }
  dlg.addEventListener('animationend', onEnd);
  fallback = setTimeout(finish, 500); // jaga-jaga bila animationend tidak datang
}

// Tombol Esc memanggil closeDialog supaya animasi keluar tetap jalan.
export function bindDialog(dlg) {
  dlg.addEventListener('cancel', (ev) => { ev.preventDefault(); closeDialog(dlg); });
}

/* ---------- Deteksi item baru ---------- */
// Untuk animasi "hanya yang baru": update(keys) mengembalikan { first, added }.
// first = panggilan pertama sejak dibuat/reset. added = kunci yang belum pernah terlihat.
export function createSeen() {
  const seen = new Set();
  let first = true;
  return {
    update(keys) {
      const added = new Set();
      keys.forEach((k) => { if (!seen.has(k)) { seen.add(k); added.add(k); } });
      const res = { first, added };
      first = false;
      return res;
    },
    reset() { seen.clear(); first = true; }
  };
}
