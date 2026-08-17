/**
 * ====================================================================
 * BERAWA KITCHEN — Backend Google Apps Script
 * ====================================================================
 * Sheet ini berfungsi sebagai DATABASE sekaligus LAPORAN. Web app
 * (PWA) memanggil endpoint di file ini lewat fetch() untuk baca/tulis
 * data unit sewa & transaksi, termasuk membaca foto kwitansi/bukti
 * transfer secara otomatis (OCR) lewat Google Drive.
 *
 * CARA PAKAI — lihat SETUP_GUIDE.md di paket aplikasi. Ringkasnya:
 *   1. Tempel file ini ke Extensions > Apps Script pada Google Sheet.
 *   2. Aktifkan layanan "Drive API" (Services > + > Drive API, versi v2).
 *   3. Jalankan fungsi `setupAwal` sekali dari editor (untuk minta izin
 *      akses Sheets & Drive, dan membuat tab-tab yang dibutuhkan).
 *   4. Deploy > New deployment > Web app > Execute as "Me",
 *      Who has access "Anyone" > Deploy. Salin Web App URL-nya.
 * ====================================================================
 */

const SHEET_UNIT = "Unit";
const SHEET_TRANSAKSI = "Transaksi";
const SHEET_SETTINGS = "Pengaturan";
const BUKTI_FOLDER_NAME = "Berawa Kitchen - Bukti Transaksi";

const UNIT_HEADERS = [
  "id", "nama", "tipe", "tipeSewa", "nominalSewa", "persenBagiHasil",
  "siklusBulan", "tanggalMulai", "jatuhTempoBerikutnya", "status",
  "catatan", "dibuatPada",
];
const TX_HEADERS = [
  "id", "tanggal", "tipe", "unitId", "kategori", "deskripsi",
  "omzetDilaporkan", "jumlah", "buktiUrl", "sumber", "dicatatPada",
];
const DEFAULT_SETTINGS = {
  namaKompleks: "Berawa Kitchen",
  reminderHariSebelum: "3",
};

/* ============================== Setup ============================== */

/**
 * Jalankan fungsi ini SEKALI dari editor Apps Script (tombol ▶ di
 * toolbar, pilih fungsi "setupAwal"). Ini akan minta izin akses Sheets
 * & Drive, lalu membuat tab-tab yang diperlukan kalau belum ada.
 */
function setupAwal() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEET_UNIT, UNIT_HEADERS);
  ensureSheet_(ss, SHEET_TRANSAKSI, TX_HEADERS);
  const settingsSheet = ensureSheet_(ss, SHEET_SETTINGS, ["key", "value"]);
  const existing = settingsSheet.getDataRange().getValues();
  const keys = existing.slice(1).map((r) => r[0]);
  Object.keys(DEFAULT_SETTINGS).forEach((k) => {
    if (keys.indexOf(k) === -1) {
      settingsSheet.appendRow([k, DEFAULT_SETTINGS[k]]);
    }
  });
  getOrCreateBuktiFolder_();
  SpreadsheetApp.getUi().alert(
    "Setup selesai! Sekarang buka menu Deploy > New deployment untuk mengaktifkan Web App-nya."
  );
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Berawa Kitchen")
    .addItem("Setup Awal (jalankan sekali)", "setupAwal")
    .addItem("Isi 15 Contoh Tenant Makanan + Bar + Lainnya", "isiContohUnit")
    .addToUi();
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeader = headers.some((h, i) => firstRow[i] !== h);
  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Contoh data awal supaya owner tinggal edit, tidak input dari nol. */
function isiContohUnit() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ensureSheet_(ss, SHEET_UNIT, UNIT_HEADERS);
  const today = new Date();
  const rows = [];
  for (let i = 1; i <= 15; i++) {
    rows.push(unitRow_({
      nama: "Tenant Makanan " + i,
      tipe: "tenant_makanan",
      tipeSewa: "tetap",
      nominalSewa: 1500000,
      persenBagiHasil: 0,
      siklusBulan: 1,
      tanggalMulai: today,
    }));
  }
  rows.push(unitRow_({ nama: "Bar Berawa", tipe: "bar", tipeSewa: "tetap_bagi_hasil", nominalSewa: 3000000, persenBagiHasil: 10, siklusBulan: 1, tanggalMulai: today }));
  rows.push(unitRow_({ nama: "Parkir", tipe: "parkir", tipeSewa: "tetap", nominalSewa: 2000000, persenBagiHasil: 0, siklusBulan: 1, tanggalMulai: today }));
  rows.push(unitRow_({ nama: "Kios ATM", tipe: "kios_atm", tipeSewa: "tetap", nominalSewa: 2500000, persenBagiHasil: 0, siklusBulan: 12, tanggalMulai: today }));
  rows.push(unitRow_({ nama: "Ruko Depan", tipe: "ruko", tipeSewa: "tetap", nominalSewa: 15000000, persenBagiHasil: 0, siklusBulan: 12, tanggalMulai: today }));
  rows.forEach((r) => sheet.appendRow(r));
  SpreadsheetApp.getUi().alert("18 unit contoh ditambahkan ke tab Unit. Silakan edit nama & nominalnya sesuai data asli.");
}
function unitRow_(u) {
  const id = Utilities.getUuid();
  const due = addMonths_(u.tanggalMulai, u.siklusBulan);
  return [id, u.nama, u.tipe, u.tipeSewa, u.nominalSewa, u.persenBagiHasil, u.siklusBulan, fmtDate_(u.tanggalMulai), fmtDate_(due), "aktif", "", new Date()];
}

/* ============================== HTTP entrypoints ============================== */

function doGet(e) {
  try {
    const action = (e.parameter.action || "").toString();
    let result;
    switch (action) {
      case "getUnits": result = getUnits_(); break;
      case "getTransactions": result = getTransactions_(e.parameter); break;
      case "getSettings": result = getSettings_(); break;
      case "getDueSoon": result = getDueSoon_(); break;
      case "ping": result = { ok: true, time: new Date().toISOString() }; break;
      default: return jsonOut_({ ok: false, error: "Aksi tidak dikenal: " + action });
    }
    return jsonOut_({ ok: true, data: result });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const action = body.action;
    let result;
    switch (action) {
      case "addUnit": result = addUnit_(body.unit); break;
      case "updateUnit": result = updateUnit_(body.unit); break;
      case "deleteUnit": result = deleteUnit_(body.id); break;
      case "addTransaction": result = addTransaction_(body.tx); break;
      case "deleteTransaction": result = deleteTransaction_(body.id); break;
      case "uploadReceipt": result = uploadReceipt_(body.filename, body.mimeType, body.base64); break;
      case "updateSettings": result = updateSettings_(body.settings); break;
      default: return jsonOut_({ ok: false, error: "Aksi tidak dikenal: " + action });
    }
    return jsonOut_({ ok: true, data: result });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  }
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================== Unit CRUD ============================== */

function getUnits_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_UNIT);
  return sheetToObjects_(sheet);
}

function addUnit_(u) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_UNIT);
  const id = Utilities.getUuid();
  const start = u.tanggalMulai ? new Date(u.tanggalMulai) : new Date();
  const due = addMonths_(start, Number(u.siklusBulan) || 1);
  sheet.appendRow([
    id, u.nama, u.tipe, u.tipeSewa, Number(u.nominalSewa) || 0, Number(u.persenBagiHasil) || 0,
    Number(u.siklusBulan) || 1, fmtDate_(start), fmtDate_(due), u.status || "aktif", u.catatan || "", new Date(),
  ]);
  return { id };
}

function updateUnit_(u) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_UNIT);
  const rowIndex = findRowById_(sheet, u.id);
  if (rowIndex === -1) throw new Error("Unit tidak ditemukan");
  const current = rowToObject_(sheet, rowIndex);
  const merged = Object.assign({}, current, u);
  sheet.getRange(rowIndex, 1, 1, UNIT_HEADERS.length).setValues([[
    merged.id, merged.nama, merged.tipe, merged.tipeSewa, Number(merged.nominalSewa) || 0,
    Number(merged.persenBagiHasil) || 0, Number(merged.siklusBulan) || 1, merged.tanggalMulai,
    merged.jatuhTempoBerikutnya, merged.status, merged.catatan || "", merged.dibuatPada,
  ]]);
  return { ok: true };
}

function deleteUnit_(id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_UNIT);
  const rowIndex = findRowById_(sheet, id);
  if (rowIndex === -1) throw new Error("Unit tidak ditemukan");
  sheet.deleteRow(rowIndex);
  return { ok: true };
}

/* ============================== Transaksi CRUD ============================== */

function getTransactions_(params) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRANSAKSI);
  let list = sheetToObjects_(sheet);
  list.sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
  if (params && params.limit) list = list.slice(0, Number(params.limit));
  return list;
}

function addTransaction_(t) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRANSAKSI);
  const id = Utilities.getUuid();
  sheet.appendRow([
    id, t.tanggal, t.tipe, t.unitId || "", t.kategori || "", t.deskripsi || "",
    t.omzetDilaporkan != null ? Number(t.omzetDilaporkan) : "", Number(t.jumlah) || 0,
    t.buktiUrl || "", t.sumber || "manual", new Date(),
  ]);

  // Kalau ini pembayaran sewa (terhubung ke sebuah unit) & tipe masuk,
  // majukan tanggal jatuh tempo unit tsb ke periode berikutnya.
  if (t.tipe === "masuk" && t.unitId) {
    advanceDueDate_(t.unitId, t.tanggal);
  }
  return { id };
}

function deleteTransaction_(id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRANSAKSI);
  const rowIndex = findRowById_(sheet, id);
  if (rowIndex === -1) throw new Error("Transaksi tidak ditemukan");
  sheet.deleteRow(rowIndex);
  return { ok: true };
}

function advanceDueDate_(unitId, tanggalBayar) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_UNIT);
  const rowIndex = findRowById_(sheet, unitId);
  if (rowIndex === -1) return;
  const unit = rowToObject_(sheet, rowIndex);
  const currentDue = unit.jatuhTempoBerikutnya ? new Date(unit.jatuhTempoBerikutnya) : new Date(tanggalBayar);
  const bayar = new Date(tanggalBayar);
  const base = bayar > currentDue ? bayar : currentDue;
  const nextDue = addMonths_(base, Number(unit.siklusBulan) || 1);
  sheet.getRange(rowIndex, UNIT_HEADERS.indexOf("jatuhTempoBerikutnya") + 1).setValue(fmtDate_(nextDue));
}

/* ============================== Jatuh tempo ============================== */

function getDueSoon_() {
  const units = getUnits_().filter((u) => u.status === "aktif");
  const settings = getSettings_();
  const threshold = Number(settings.reminderHariSebelum || 3);
  const today = stripTime_(new Date());
  return units
    .map((u) => {
      const due = stripTime_(new Date(u.jatuhTempoBerikutnya));
      const daysLeft = Math.round((due - today) / 86400000);
      return Object.assign({}, u, { daysLeft });
    })
    .filter((u) => u.daysLeft <= threshold)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/* ============================== Pengaturan ============================== */

function getSettings_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETTINGS);
  const rows = sheet.getDataRange().getValues().slice(1);
  const obj = {};
  rows.forEach((r) => { if (r[0]) obj[r[0]] = r[1]; });
  return obj;
}

function updateSettings_(settings) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_SETTINGS);
  const rows = sheet.getDataRange().getValues();
  Object.keys(settings || {}).forEach((key) => {
    let found = false;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(settings[key]);
        found = true;
        break;
      }
    }
    if (!found) sheet.appendRow([key, settings[key]]);
  });
  return { ok: true };
}

/* ============================== Upload & OCR kwitansi ============================== */

function uploadReceipt_(filename, mimeType, base64) {
  const folder = getOrCreateBuktiFolder_();
  const bytes = Utilities.base64Decode(base64);
  const blob = Utilities.newBlob(bytes, mimeType, filename || "bukti.jpg");

  // 1) Simpan foto asli sebagai bukti permanen.
  const savedFile = folder.createFile(blob);
  savedFile.setName((filename || "bukti") + "-" + new Date().getTime());

  // 2) OCR: konversi sementara ke Google Doc supaya teksnya terbaca,
  //    lalu hapus dokumen konversinya (foto aslinya tetap tersimpan).
  let ocrText = "";
  try {
    const tempDocResource = Drive.Files.insert(
      { title: "OCR-temp-" + new Date().getTime(), mimeType: MimeType.GOOGLE_DOCS },
      blob,
      { ocr: true, ocrLanguage: "id" }
    );
    ocrText = DocumentApp.openById(tempDocResource.id).getBody().getText();
    Drive.Files.remove(tempDocResource.id);
  } catch (ocrErr) {
    ocrText = ""; // OCR gagal/servis belum aktif — owner tetap bisa isi manual.
  }

  const guess = parseReceiptText_(ocrText);
  return {
    buktiUrl: savedFile.getUrl(),
    ocrText: ocrText,
    guessedAmount: guess.amount,
    guessedDate: guess.date,
  };
}

function getOrCreateBuktiFolder_() {
  const it = DriveApp.getFoldersByName(BUKTI_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(BUKTI_FOLDER_NAME);
}

/** Heuristik sederhana: cari nominal Rupiah & tanggal terbesar/paling masuk akal di teks OCR. */
function parseReceiptText_(text) {
  const result = { amount: null, date: null };
  if (!text) return result;

  // --- Nominal ---
  const amountMatches = text.match(/(?:Rp\.?\s?)?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?/g) || [];
  let best = 0;
  amountMatches.forEach((m) => {
    const digits = m.replace(/[^\d]/g, "");
    const num = Number(digits);
    // Abaikan angka yang kemungkinan besar nomor telepon/rekening (>12 digit)
    if (digits.length <= 12 && num > best) best = num;
  });
  if (best > 0) result.amount = best;

  // --- Tanggal ---
  const bulanIndo = {
    januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
    juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
  };
  let m1 = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m1) {
    let [, d, mo, y] = m1;
    if (y.length === 2) y = "20" + y;
    const dt = new Date(Number(y), Number(mo) - 1, Number(d));
    if (!isNaN(dt.getTime())) result.date = fmtDate_(dt);
  } else {
    const m2 = text.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (m2) {
      const bulan = bulanIndo[m2[2].toLowerCase()];
      if (bulan) {
        const dt = new Date(Number(m2[3]), bulan - 1, Number(m2[1]));
        if (!isNaN(dt.getTime())) result.date = fmtDate_(dt);
      }
    }
  }
  return result;
}

/* ============================== Util ============================== */

function sheetToObjects_(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  return values.slice(1).filter((r) => r[0]).map((row) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = formatCell_(row[i]); });
    return obj;
  });
}
function rowToObject_(sheet, rowIndex) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  const obj = {};
  headers.forEach((h, i) => { obj[h] = formatCell_(row[i]); });
  return obj;
}
function formatCell_(v) {
  if (v instanceof Date) return fmtDate_(v);
  return v;
}
function findRowById_(sheet, id) {
  const values = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) return i + 1;
  }
  return -1;
}
function fmtDate_(d) {
  return Utilities.formatDate(new Date(d), Session.getScriptTimeZone() || "Asia/Makassar", "yyyy-MM-dd");
}
function stripTime_(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function addMonths_(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Number(months || 1));
  return d;
}
