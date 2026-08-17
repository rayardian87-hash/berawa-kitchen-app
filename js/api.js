// ================================================================
// api.js — jembatan ke backend Google Apps Script (Web App URL).
//
// Owner mengisi Web App URL sekali lewat halaman Pengaturan (disimpan
// di localStorage HP-nya). Semua baca/tulis data (unit sewa, transaksi,
// upload+OCR kwitansi) lewat sini.
//
// Data juga di-cache di localStorage supaya dashboard tetap bisa
// dibuka (mode baca saja) walau sedang offline / API belum diisi.
// ================================================================

const CONFIG_KEY = "bk_webapp_url";
const CACHE_UNITS = "bk_cache_units";
const CACHE_TX = "bk_cache_tx";

export function getWebAppUrl() {
  return (localStorage.getItem(CONFIG_KEY) || "").trim();
}
export function setWebAppUrl(url) {
  localStorage.setItem(CONFIG_KEY, url.trim());
}
export function isConfigured() {
  return getWebAppUrl().length > 0;
}

class ApiError extends Error {}

async function apiGet(action, params = {}) {
  const base = getWebAppUrl();
  if (!base) throw new ApiError("Web App URL belum diisi. Buka Pengaturan untuk mengisinya.");
  const qs = new URLSearchParams({ action, ...params }).toString();
  const res = await fetch(`${base}?${qs}`, { method: "GET" });
  const json = await res.json();
  if (!json.ok) throw new ApiError(json.error || "Gagal mengambil data");
  return json.data;
}

async function apiPost(action, payload = {}) {
  const base = getWebAppUrl();
  if (!base) throw new ApiError("Web App URL belum diisi. Buka Pengaturan untuk mengisinya.");
  const res = await fetch(base, {
    method: "POST",
    // text/plain menghindari CORS preflight yang sering gagal di Apps Script.
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload }),
  });
  const json = await res.json();
  if (!json.ok) throw new ApiError(json.error || "Gagal menyimpan data");
  return json.data;
}

/* ============================== Units ============================== */

export async function fetchUnits() {
  try {
    const units = await apiGet("getUnits");
    localStorage.setItem(CACHE_UNITS, JSON.stringify(units));
    return units;
  } catch (err) {
    const cached = localStorage.getItem(CACHE_UNITS);
    if (cached) return JSON.parse(cached);
    throw err;
  }
}
export function addUnit(unit) {
  return apiPost("addUnit", { unit });
}
export function updateUnit(unit) {
  return apiPost("updateUnit", { unit });
}
export function deleteUnitApi(id) {
  return apiPost("deleteUnit", { id });
}

/* ============================== Transaksi ============================== */

export async function fetchTransactions(limit) {
  try {
    const tx = await apiGet("getTransactions", limit ? { limit } : {});
    localStorage.setItem(CACHE_TX, JSON.stringify(tx));
    return tx;
  } catch (err) {
    const cached = localStorage.getItem(CACHE_TX);
    if (cached) return JSON.parse(cached);
    throw err;
  }
}
export function addTransactionApi(tx) {
  return apiPost("addTransaction", { tx });
}
export function deleteTransactionApi(id) {
  return apiPost("deleteTransaction", { id });
}

/* ============================== Kwitansi / OCR ============================== */

export function uploadReceiptApi(filename, mimeType, base64) {
  return apiPost("uploadReceipt", { filename, mimeType, base64 });
}

/* ============================== Pengaturan & jatuh tempo ============================== */

export function fetchSettings() {
  return apiGet("getSettings");
}
export function updateSettingsApi(settings) {
  return apiPost("updateSettings", { settings });
}
export function fetchDueSoon() {
  return apiGet("getDueSoon");
}
export async function pingApi() {
  try {
    await apiGet("ping");
    return true;
  } catch {
    return false;
  }
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
