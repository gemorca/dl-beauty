import { CONFIG } from './config.js';

const TOKEN_KEY = 'dlbeauty_admin_token_v1';

export const session = {
  get() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } },
  set(t) { try { sessionStorage.setItem(TOKEN_KEY, t); } catch (e) { } },
  clear() { try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { } }
};

async function call(action, payload, withToken) {
  if (!CONFIG.API_URL) throw new Error('API_URL di js/config.js belum diisi.');
  const body = { ...payload, action };
  if (withToken) body.token = session.get();

  let res;
  try {
    res = await fetch(CONFIG.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body)
    });
  } catch (e) {
    throw new Error('Koneksi bermasalah. Periksa internet lalu coba lagi.');
  }
  if (!res.ok) throw new Error('Server bermasalah (' + res.status + '). Coba lagi.');

  let json;
  try { json = await res.json(); } catch (e) { throw new Error('Balasan server tidak terbaca.'); }
  if (!json.ok) {
    const err = new Error(json.error || 'Permintaan gagal.');
    if (json.code) err.code = json.code;
    throw err;
  }
  return json.data;
}

export function adminLogin(password) { return call('adminLogin', { password }, false); }
export function adminLogout() { return call('adminLogout', {}, true); }
export function adminOrders() { return call('adminOrders', {}, true); }
export function adminSetStatus(id, dari, ke) { return call('adminSetStatus', { id, dari, ke }, true); }

export function adminCatalog() { return call('adminCatalog', {}, true); }
export function adminSaveProduct(p) { return call('adminSaveProduct', p, true); }
export function adminSetSold(id, habis) { return call('adminSetSold', { id, habis }, true); }
export function adminDeleteProduct(id) { return call('adminDeleteProduct', { id }, true); }
export function adminSaveCategories(kategori) { return call('adminSaveCategories', { kategori }, true); }
export function adminSaveSettings(p) { return call('adminSaveSettings', p, true); }
export function adminUploadImage(jenis, mime, data) { return call('adminUploadImage', { jenis, mime, data }, true); }

export function adminFinance() { return call('adminFinance', {}, true); }
export function adminAddExpense(jumlah, keterangan, reqId) { return call('adminAddExpense', { jumlah, keterangan, req_id: reqId }, true); }
export function adminReviews() { return call('adminReviews', {}, true); }
export function adminDeleteReview(id) { return call('adminDeleteReview', { id }, true); }
