// Kompres gambar di browser sebelum dikirim ke server (batas server 700 KB, target di sini 500 KB).
// Hasil selalu JPEG. Latar putih diisi dulu supaya PNG transparan (mis. QRIS) tidak jadi hitam.

const TARGET_BYTE = 500000;
const MAKS_FILE = 15 * 1024 * 1024;

// bentuk 'fit' = kecilkan, rasio asli tetap. 'persegi' = potong tengah jadi persegi.
const JENIS = {
  produk: { maks: 1000, bentuk: 'fit', mutu: 0.86 },
  logo: { maks: 512, bentuk: 'persegi', mutu: 0.9 },
  banner: { asli: true },
  qris: { maks: 1000, bentuk: 'fit', mutu: 0.92 }
};

async function muat(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* coba cara lama */ }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Gambar tidak bisa dibaca.'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas, mutu) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Gambar gagal diproses.'))), 'image/jpeg', mutu);
  });
}

export async function kompres(file, jenis) {
  const cfg = JENIS[jenis];
  if (!cfg) throw new Error('Jenis gambar tidak dikenal.');
  if (!file || !/^image\/(jpeg|png|webp|gif|bmp)$/i.test(file.type || '')) {
    throw new Error('Pilih file gambar (JPEG, PNG, atau WebP).');
  }
  if (file.size > MAKS_FILE) throw new Error('File terlalu besar. Maksimal 15 MB.');

  if (cfg.asli) {
    const mimeAsli = String(file.type || '').toLowerCase();
    if (!/^image\/(jpeg|png|webp)$/.test(mimeAsli)) throw new Error('Banner harus JPEG, PNG, atau WebP.');
    if (file.size > 10 * 1024 * 1024) throw new Error('Banner terlalu besar. Maksimal 10 MB.');
    return { blob: file, url: URL.createObjectURL(file), mime: mimeAsli };
  }

  const src = await muat(file);
  const w = src.width;
  const hgt = src.height;
  if (!w || !hgt) throw new Error('Gambar tidak bisa dibaca.');

  // Area sumber: seluruh gambar, atau persegi di tengah untuk logo.
  let sx = 0, sy = 0, sw = w, sh = hgt;
  if (cfg.bentuk === 'persegi') {
    const side = Math.min(w, hgt);
    sx = Math.round((w - side) / 2);
    sy = Math.round((hgt - side) / 2);
    sw = side;
    sh = side;
  }

  let skala = Math.min(1, cfg.maks / Math.max(sw, sh));
  let blob = null;
  for (let putaran = 0; putaran < 6; putaran++) {
    const cw = Math.max(1, Math.round(sw * skala));
    const ch = Math.max(1, Math.round(sh * skala));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, cw, ch);

    let mutu = cfg.mutu;
    blob = await toBlob(canvas, mutu);
    while (blob.size > TARGET_BYTE && mutu > 0.5) {
      mutu -= 0.08;
      blob = await toBlob(canvas, mutu);
    }
    if (blob.size <= TARGET_BYTE) break;
    skala *= 0.8; // masih besar: perkecil ukuran lalu ulangi
  }
  if (src.close) src.close();
  if (!blob || blob.size > 650000) throw new Error('Gambar terlalu besar setelah dikompres. Pilih gambar lain.');
  return { blob, url: URL.createObjectURL(blob), mime: 'image/jpeg' };
}

export function keBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Gambar gagal dibaca.'));
    r.readAsDataURL(blob);
  });
}