// Panel admin Tahap 6: Produk, Kategori, Tampilan.
// Dimuat oleh admin.js. Data katalog dimuat sekali saat salah satu tab ini dibuka;
// setiap perubahan ke server membalas katalog terbaru, jadi layar selalu sama dengan sheet.
import { h, rupiah, fotoUrl } from './util.js';
import {
  adminCatalog, adminSaveProduct, adminSetSold, adminDeleteProduct,
  adminSaveCategories, adminSaveSettings, adminUploadImage
} from './admin-api.js';
import { kompres, keBase64 } from './admin-gambar.js';
import { setLoading } from './ui.js';

// ctx: { panels:{produk,kategori,tampilan}, formDialog, toast, confirmDialog, handleAuth, onSettings }
export function mountKatalog(ctx) {
  const { panels, formDialog, toast, confirmDialog, handleAuth, onSettings } = ctx;
  let cat = null;
  let loading = false;
  let alive = true;
  let busy = false;

  /* ---------- Muat data ---------- */
  function setAll(...nodes) {
    Object.values(panels).forEach((p) => p.replaceChildren(...nodes.map((n) => (typeof n === 'function' ? n() : n))));
  }

  async function load() {
    if (loading) return;
    loading = true;
    setAll(() => h('p', { class: 'state' }, 'Memuat…'));
    try {
      const res = await adminCatalog();
      if (!alive) return;
      cat = res;
      renderProduk();
      renderKategori();
      renderTampilan();
    } catch (e) {
      if (!alive || handleAuth(e)) return;
      setAll(() => h('div', { class: 'state' },
        h('p', null, (e && e.message) || 'Data belum bisa dimuat.'),
        h('button', { class: 'btn btn-solid', type: 'button', onclick: load }, 'Coba lagi')));
    } finally {
      loading = false;
    }
  }

  function show() {
    if (!cat && !loading) load();
  }

  // Galat dari server di dalam dialog/formulir: sesi habis menutup dialog dan membuka login.
  function fail(e, errEl) {
    if (e && e.code === 'AUTH') {
      if (formDialog.open) formDialog.close();
      handleAuth(e);
      return;
    }
    errEl.textContent = (e && e.message) || 'Gagal menyimpan.';
  }

  // Aksi cepat dari daftar (tanpa formulir): hasilnya toast.
  async function aksi(fn, pesan, btn) {
    if (busy) return false;
    busy = true;
    setLoading(btn, true);
    try {
      const res = await fn();
      if (!alive) return false;
      cat = res;
      renderProduk();
      renderKategori();
      if (pesan) toast(pesan);
      return true;
    } catch (e) {
      if (!alive || handleAuth(e)) return false;
      toast((e && e.message) || 'Gagal menyimpan.');
      return false;
    } finally {
      busy = false;
      setLoading(btn, false);
    }
  }

  const jumlahProduk = (nama) => cat.produk.filter((p) => p.kategori === nama).length;

  /* ---------- Produk ---------- */
  function produkCard(p) {
    const src = fotoUrl(p.foto, 300);
    const terdaftar = cat.kategori.includes(p.kategori);
    return h('article', { class: 'pcard' + (p.habis ? ' is-sold' : '') },
      h('div', { class: 'pthumb' },
        src ? h('img', { src, alt: '', loading: 'lazy', decoding: 'async' }) : h('span', { class: 'card-ph', 'aria-hidden': 'true' }, 'DL')),
      h('div', { class: 'pbody' },
        h('strong', { class: 'pname' }, p.nama),
        h('span', { class: 'pprice' }, rupiah(p.harga)),
        h('div', { class: 'ocard-tags' },
          h('span', { class: 'tag' }, p.kategori || 'tanpa kategori'),
          p.habis ? h('span', { class: 'tag tag-dibatalkan' }, 'Habis') : h('span', { class: 'tag tag-dikemas' }, 'Tersedia'),
          terdaftar ? null : h('span', { class: 'tag tag-dipesan' }, 'Muncul di "lainnya"')),
        h('div', { class: 'ocard-actions' },
          h('button', { class: 'btn btn-sm', type: 'button', onclick: () => openProduk(p) }, 'Edit'),
          h('button', {
            class: 'btn btn-sm', type: 'button',
            onclick: (ev) => aksi(() => adminSetSold(p.id, !p.habis), p.habis ? p.nama + ' tersedia lagi' : p.nama + ' ditandai habis', ev.currentTarget)
          }, p.habis ? 'Tandai tersedia' : 'Tandai habis'),
          h('button', { class: 'btn btn-sm btn-danger', type: 'button', onclick: (ev) => hapusProduk(p, ev.currentTarget) }, 'Hapus'))
      )
    );
  }

  function renderProduk() {
    const list = cat.produk;
    panels.produk.replaceChildren(
      h('div', { class: 'toolbar' },
        h('h2', { class: 'section-title' }, 'Produk (' + list.length + ')'),
        h('button', { class: 'btn btn-solid', type: 'button', onclick: () => openProduk(null) }, 'Tambah produk')),
      list.length
        ? h('div', { class: 'plist' }, list.map(produkCard))
        : h('p', { class: 'empty' }, 'Belum ada produk. Tekan "Tambah produk".')
    );
  }

  async function hapusProduk(p, btn) {
    const yes = await confirmDialog('Hapus produk ini?',
      '"' + p.nama + '" akan dihapus dari toko. Riwayat pesanan yang lama tidak terpengaruh.', 'Ya, hapus');
    if (!yes) return;
    await aksi(() => adminDeleteProduct(p.id), 'Produk dihapus', btn);
  }

  // Satu gambar yang menunggu diunggah. url diisi setelah berhasil, supaya percobaan ulang
  // (mis. simpan gagal setelah unggah berhasil) tidak mengunggah file yang sama dua kali.
  async function pastikanUnggah(jenis, s) {
    if (!s.pending) return s.url;
    if (!s.pending.url) {
      const res = await adminUploadImage(jenis, s.pending.mime, await keBase64(s.pending.blob));
      s.pending.url = res.url;
    }
    return s.pending.url;
  }

  function lepasPending(s) {
    if (s.pending && s.pending.preview) URL.revokeObjectURL(s.pending.preview);
    s.pending = null;
  }

  function openProduk(p) {
    const edit = Boolean(p);
    const foto = { url: p ? p.foto : '', pending: null };
    let saving = false;

    const err = h('p', { class: 'form-error', role: 'alert' });
    const nama = h('input', { id: 'pf-nama', class: 'input', type: 'text', maxlength: '80', autocomplete: 'off', value: p ? p.nama : '' });
    const harga = h('input', { id: 'pf-harga', class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-describedby': 'pf-harga-info', value: p ? String(p.harga) : '' });
    const hargaInfo = h('p', { id: 'pf-harga-info', class: 'muted field-hint', 'aria-live': 'polite' });
    const paintHarga = () => {
      const n = Number(harga.value.replace(/\D/g, ''));
      hargaInfo.textContent = n >= 1 ? rupiah(n) : 'Isi angka saja, tanpa titik.';
    };
    harga.addEventListener('input', () => { harga.value = harga.value.replace(/\D/g, '').slice(0, 9); paintHarga(); });
    paintHarga();

    const adaKategori = cat.kategori.length > 0;
    const kat = h('select', { id: 'pf-kat', class: 'input', disabled: !adaKategori },
      h('option', { value: '' }, adaKategori ? 'Pilih kategori' : 'Belum ada kategori'),
      cat.kategori.map((k) => h('option', { value: k, selected: p && p.kategori === k }, k)));
    const desc = h('textarea', { id: 'pf-desc', class: 'input', maxlength: '500', rows: '4' }, p ? p.deskripsi : '');
    const habis = h('input', { id: 'pf-habis', type: 'checkbox', checked: Boolean(p && p.habis) });

    // Foto
    const prev = h('div', { class: 'pthumb pthumb-lg' });
    const info = h('p', { class: 'muted field-hint', 'aria-live': 'polite' });
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-label': 'Pilih foto produk' });
    const pick = h('button', { class: 'btn btn-sm', type: 'button', onclick: () => file.click() }, 'Pilih foto');
    const del = h('button', {
      class: 'btn btn-sm btn-danger', type: 'button',
      onclick: () => { lepasPending(foto); foto.url = ''; info.textContent = 'Foto akan dihapus saat disimpan.'; paintFoto(); }
    }, 'Hapus foto');
    function paintFoto() {
      const src = foto.pending ? foto.pending.preview : fotoUrl(foto.url, 400);
      prev.replaceChildren(src ? h('img', { src, alt: 'Pratinjau foto produk' }) : h('span', { class: 'card-ph', 'aria-hidden': 'true' }, 'DL'));
      del.hidden = !src;
      pick.textContent = src ? 'Ganti foto' : 'Pilih foto';
    }
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      err.textContent = '';
      info.textContent = 'Memproses gambar…';
      try {
        const k = await kompres(f, 'produk');
        lepasPending(foto);
        foto.pending = { blob: k.blob, preview: k.url, mime: k.mime, url: '' };
        info.textContent = 'Foto siap (' + Math.round(k.blob.size / 1024) + ' KB). Akan diunggah saat disimpan.';
        paintFoto();
      } catch (e) {
        info.textContent = '';
        err.textContent = (e && e.message) || 'Gambar gagal diproses.';
      }
    });
    paintFoto();

    const batal = h('button', { class: 'btn', type: 'button', onclick: () => formDialog.close() }, 'Batal');
    const simpan = h('button', { class: 'btn btn-solid', type: 'submit', disabled: !adaKategori }, 'Simpan');

    const form = h('form', { novalidate: true },
      h('label', { for: 'pf-nama', class: 'label' }, 'Nama produk'), nama,
      h('label', { for: 'pf-harga', class: 'label' }, 'Harga (Rp)'), harga, hargaInfo,
      h('label', { for: 'pf-kat', class: 'label' }, 'Kategori'), kat,
      adaKategori ? null : h('p', { class: 'muted field-hint' }, 'Tambah kategori dulu di tab Kategori.'),
      h('label', { for: 'pf-desc', class: 'label' }, 'Deskripsi'), desc,
      h('span', { class: 'label', id: 'pf-foto-label' }, 'Foto'),
      h('div', { class: 'foto-row', role: 'group', 'aria-labelledby': 'pf-foto-label' },
        prev,
        h('div', { class: 'foto-side' }, h('div', { class: 'ocard-actions' }, pick, del), file, info)),
      h('label', { class: 'check', for: 'pf-habis' }, habis, h('span', null, 'Tandai habis (tidak bisa dipesan)')),
      err,
      h('div', { class: 'confirm-actions' }, batal, simpan)
    );

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (saving) return;
      err.textContent = '';
      const nm = nama.value.trim();
      const hg = Number(harga.value.replace(/\D/g, ''));
      if (nm.length < 2) { err.textContent = 'Nama produk wajib diisi.'; nama.focus(); return; }
      if (!(hg >= 1)) { err.textContent = 'Harga wajib diisi.'; harga.focus(); return; }
      if (!kat.value) { err.textContent = 'Pilih kategori.'; kat.focus(); return; }
      saving = true;
      setLoading(simpan, true);
      simpan.textContent = foto.pending && !foto.pending.url ? 'Mengunggah foto…' : 'Menyimpan…';
      try {
        const url = await pastikanUnggah('produk', foto);
        simpan.textContent = 'Menyimpan…';
        const res = await adminSaveProduct({
          id: p ? p.id : '', nama: nm, harga: hg, kategori: kat.value,
          deskripsi: desc.value, foto: url, habis: habis.checked
        });
        if (!alive) return;
        cat = res;
        formDialog.close();
        renderProduk();
        renderKategori();
        toast(edit ? 'Produk disimpan' : 'Produk ditambahkan');
      } catch (e) {
        fail(e, err);
      } finally {
        saving = false;
        setLoading(simpan, false, 'Simpan');
        simpan.disabled = !adaKategori;
      }
    });

    formDialog.replaceChildren(h('div', { class: 'sheet-inner' },
      h('div', { class: 'sheet-head' },
        h('h2', { id: 'formTitle', class: 'sheet-title' }, edit ? 'Edit produk' : 'Tambah produk'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Tutup', onclick: () => formDialog.close() }, '\u00d7')),
      form));
    formDialog.addEventListener('close', () => lepasPending(foto), { once: true });
    formDialog.showModal();
    nama.focus();
  }

  /* ---------- Kategori ---------- */
  function renderKategori() {
    const list = cat.kategori;
    const err = h('p', { class: 'form-error', role: 'alert' });
    const input = h('input', { id: 'kf-nama', class: 'input', type: 'text', maxlength: '40', autocomplete: 'off', placeholder: 'mis. paket hemat' });
    const tambah = h('button', { class: 'btn btn-solid', type: 'submit' }, 'Tambah');

    const form = h('form', { class: 'kform', novalidate: true },
      h('label', { for: 'kf-nama', class: 'label' }, 'Kategori baru'),
      h('div', { class: 'krow-add' }, input, tambah),
      err);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      err.textContent = '';
      const v = input.value.replace(/\s+/g, ' ').trim();
      if (!v) { err.textContent = 'Isi nama kategori.'; input.focus(); return; }
      if (list.some((k) => k.toLowerCase() === v.toLowerCase())) { err.textContent = 'Kategori itu sudah ada.'; input.focus(); return; }
      setLoading(tambah, true);
      try {
        const ok = await aksi(() => adminSaveCategories([...list, v]), 'Kategori ditambahkan');
        if (ok) { const baru = document.getElementById('kf-nama'); if (baru) baru.focus(); }
      } finally {
        setLoading(tambah, false);
      }
    });

    const pindah = (i, arah, btn) => {
      const next = list.slice();
      const j = i + arah;
      [next[i], next[j]] = [next[j], next[i]];
      return aksi(() => adminSaveCategories(next), 'Urutan disimpan', btn);
    };

    const rows = list.map((k, i) => {
      const n = jumlahProduk(k);
      return h('li', { class: 'krow' },
        h('div', { class: 'krow-main' },
          h('strong', null, k),
          h('span', { class: 'muted' }, n ? n + ' produk' : 'Belum ada produk')),
        h('div', { class: 'krow-actions' },
          h('button', { class: 'btn btn-sm icon-sq', type: 'button', 'aria-label': 'Naikkan ' + k, disabled: i === 0, onclick: (ev) => pindah(i, -1, ev.currentTarget) }, '\u2191'),
          h('button', { class: 'btn btn-sm icon-sq', type: 'button', 'aria-label': 'Turunkan ' + k, disabled: i === list.length - 1, onclick: (ev) => pindah(i, 1, ev.currentTarget) }, '\u2193'),
          h('button', {
            class: 'btn btn-sm btn-danger', type: 'button', 'aria-label': 'Hapus kategori ' + k, disabled: n > 0,
            title: n ? 'Pindahkan produknya dulu' : null,
            onclick: async (ev) => {
              const btn = ev.currentTarget;
              const yes = await confirmDialog('Hapus kategori?', 'Kategori "' + k + '" akan dihapus.', 'Ya, hapus');
              if (yes) aksi(() => adminSaveCategories(list.filter((x) => x !== k)), 'Kategori dihapus', btn);
            }
          }, 'Hapus'))
      );
    });

    panels.kategori.replaceChildren(
      h('h2', { class: 'section-title' }, 'Kategori (' + list.length + ')'),
      h('p', { class: 'muted field-hint' }, 'Urutan di sini sama dengan urutan tab di halaman toko. Kategori yang masih punya produk tidak bisa dihapus.'),
      list.length ? h('ul', { class: 'klist' }, rows) : h('p', { class: 'empty' }, 'Belum ada kategori.'),
      form
    );
  }

  /* ---------- Tampilan ---------- */
  function renderTampilan() {
    const p = cat.pengaturan;
    const st = {
      logo: { url: p.logo_url || '', pending: null },
      banner: { url: p.banner_url || '', pending: null },
      qris: { url: p.qris_url || '', pending: null }
    };
    let saving = false;

    const err = h('p', { class: 'form-error', role: 'alert' });
    const nama = h('input', { id: 'tf-nama', class: 'input', type: 'text', maxlength: '40', autocomplete: 'off', value: p.nama_toko || '' });
    const tagline = h('input', { id: 'tf-tag', class: 'input', type: 'text', maxlength: '120', autocomplete: 'off', value: p.tagline || '' });
    const alamat = h('textarea', { id: 'tf-alamat', class: 'input', maxlength: '200', rows: '3' }, p.alamat || '');
    const wa = h('input', { id: 'tf-wa', class: 'input', type: 'tel', inputmode: 'tel', maxlength: '20', autocomplete: 'off', value: p.wa_admin || '' });

    const strip = {
      logo: h('img', { class: 'brand-logo', alt: '' }),
      nama: h('span', { class: 'brand-name' }),
      tag: h('span', { class: 'muted' })
    };
    const paintStrip = () => {
      strip.nama.textContent = nama.value.trim() || 'Nama toko';
      strip.tag.textContent = tagline.value.trim();
    };
    nama.addEventListener('input', paintStrip);
    tagline.addEventListener('input', paintStrip);

    const blocks = {};
    function imgBlock(key, title, hint, lebar, bawaan) {
      const s = st[key];
      const box = h('div', { class: 'imgprev imgprev-' + key });
      const info = h('p', { class: 'muted field-hint', 'aria-live': 'polite' });
      const file = h('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-label': 'Pilih gambar ' + title });
      const pick = h('button', { class: 'btn btn-sm', type: 'button', onclick: () => file.click() }, 'Pilih gambar');
      const del = h('button', {
        class: 'btn btn-sm btn-danger', type: 'button',
        onclick: () => { lepasPending(s); s.url = ''; info.textContent = 'Akan dihapus saat disimpan.'; paint(); }
      }, 'Hapus');
      const srcNow = () => (s.pending ? s.pending.preview : fotoUrl(s.url, lebar) || bawaan || '');
      function paint() {
        const src = srcNow();
        box.replaceChildren(src
          ? h('img', { src, alt: 'Pratinjau ' + title })
          : h('span', { class: 'muted' }, 'Belum ada gambar'));
        del.hidden = !(s.pending || s.url);
        pick.textContent = s.pending || s.url ? 'Ganti gambar' : 'Pilih gambar';
        if (key === 'logo') strip.logo.src = src || 'assets/logo.jpeg';
      }
      file.addEventListener('change', async () => {
        const f = file.files && file.files[0];
        file.value = '';
        if (!f) return;
        err.textContent = '';
        info.textContent = 'Memproses gambar…';
        try {
          const k = await kompres(f, key);
          lepasPending(s);
          s.pending = { blob: k.blob, preview: k.url, mime: k.mime, url: '' };
          info.textContent = 'Siap (' + Math.round(k.blob.size / 1024) + ' KB). Akan diunggah saat disimpan.';
          paint();
        } catch (e) {
          info.textContent = '';
          err.textContent = (e && e.message) || 'Gambar gagal diproses.';
        }
      });
      paint();
      blocks[key] = paint;
      return h('section', { class: 'panel imgblock' },
        h('h3', { class: 'panel-title' }, title),
        box,
        h('p', { class: 'muted field-hint' }, hint),
        h('div', { class: 'ocard-actions' }, pick, del), file, info);
    }

    const simpan = h('button', { class: 'btn btn-solid btn-block', type: 'submit' }, 'Simpan tampilan');

    const form = h('form', { novalidate: true },
      h('h2', { class: 'section-title' }, 'Tampilan toko'),
      h('div', { class: 'panel tstrip', 'aria-label': 'Pratinjau header' },
        h('div', { class: 'brand' }, strip.logo, strip.nama), strip.tag),
      h('label', { for: 'tf-nama', class: 'label' }, 'Nama toko'), nama,
      h('label', { for: 'tf-tag', class: 'label' }, 'Kalimat banner (tagline)'), tagline,
      h('label', { for: 'tf-alamat', class: 'label' }, 'Alamat'), alamat,
      h('label', { for: 'tf-wa', class: 'label' }, 'Nomor WhatsApp admin'), wa,
      h('p', { class: 'muted field-hint' }, 'Contoh: 08532459400. Dipakai untuk tombol Chat Admin di toko.'),
      imgBlock('logo', 'Logo', 'Dipotong jadi persegi di tengah. Kosong = memakai logo bawaan.', 200, 'assets/logo.jpeg'),
      imgBlock('banner', 'Banner', 'Gambar lebar di atas halaman toko. Kosong = memakai banner bawaan.', 1200, 'assets/banner.jpeg'),
      imgBlock('qris', 'Gambar QRIS', 'Ditampilkan ke pelanggan saat bayar. Pastikan kodenya jelas dan tidak terpotong. Kosong = pelanggan belum bisa membayar lewat QRIS.', 800, ''),
      err, simpan);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (saving) return;
      err.textContent = '';
      if (nama.value.trim().length < 2) { err.textContent = 'Nama toko wajib diisi.'; nama.focus(); return; }
      if (wa.value.replace(/\D/g, '').length < 9) { err.textContent = 'Nomor WhatsApp admin tidak valid.'; wa.focus(); return; }
      saving = true;
      setLoading(simpan, true);
      try {
        const urls = {};
        for (const key of ['logo', 'banner', 'qris']) {
          if (st[key].pending && !st[key].pending.url) simpan.textContent = 'Mengunggah ' + key + '…';
          urls[key] = await pastikanUnggah(key, st[key]);
        }
        simpan.textContent = 'Menyimpan…';
        const res = await adminSaveSettings({
          nama_toko: nama.value, tagline: tagline.value, alamat: alamat.value, wa_admin: wa.value,
          logo_url: urls.logo, banner_url: urls.banner, qris_url: urls.qris
        });
        if (!alive) return;
        cat = res;
        ['logo', 'banner', 'qris'].forEach((k) => { lepasPending(st[k]); st[k].url = res.pengaturan[k + '_url'] || ''; blocks[k](); });
        wa.value = res.pengaturan.wa_admin || wa.value;
        if (onSettings) onSettings(res.pengaturan);
        toast('Tampilan disimpan');
      } catch (e) {
        fail(e, err);
      } finally {
        saving = false;
        setLoading(simpan, false, 'Simpan tampilan');
      }
    });

    paintStrip();
    panels.tampilan.replaceChildren(form);
  }

  return {
    show,
    reset() { alive = false; cat = null; }
  };
}