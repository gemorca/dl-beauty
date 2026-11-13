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

/* ---------- Tombol loading ---------- */
// on=true: tombol nonaktif + tanda loading (spinner dari CSS tahap UX-2).
// on=false: tombol aktif lagi. Pemanggil yang punya syarat disabled sendiri
// (mis. belum ada kategori) mengatur btn.disabled setelah memanggil ini.
export function setLoading(btn, on, label) {
  if (!btn) return;
  btn.classList.toggle('is-loading', on);
  btn.disabled = on;
  if (on) btn.setAttribute('aria-busy', 'true');
  else btn.removeAttribute('aria-busy');
  if (label != null) btn.textContent = label;
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