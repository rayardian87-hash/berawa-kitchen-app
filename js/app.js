import {
  isConfigured, getWebAppUrl, setWebAppUrl, pingApi,
  fetchUnits, addUnit, updateUnit, deleteUnitApi,
  fetchTransactions, addTransactionApi, deleteTransactionApi,
  uploadReceiptApi, fileToBase64,
  fetchSettings, updateSettingsApi,
} from "./api.js";
import { UNIT_TYPES, RENT_TYPES, CYCLE_OPTIONS, RENT_CATEGORY, OTHER_INCOME_CATEGORY, EXPENSE_CATEGORIES, cycleLabel } from "./constants.js";

/* ============================== State ============================== */
let allUnits = [];
let allTx = [];
let currentType = "masuk";
let currentPage = "dashboard";
let pendingBuktiUrl = "";
let reminderThreshold = Number(localStorage.getItem("bk_reminder_days") || 3);
let trendChart = null, categoryChart = null, sourceChart = null;

/* ============================== Palette ============================== */
/* Pendapatan/pengeluaran diturunkan dari brand guideline Berawa Kitchen
   (olive & terracotta), sudah divalidasi lolos kontras + buta warna
   lewat skill dataviz — nilai sama untuk light & dark (sudah dicek
   terhadap surface cream #F4F1EC & espresso #241C1B). Breakdown
   kategori/unit pakai palet kategorikal referensi dataviz (8 slot,
   sudah tervalidasi) supaya tetap terbaca walau slot bertambah. */
const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
const PAL = {
  in: "#3F7D4A",
  out: "#B8502C",
  categorical: isDark
    ? ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"]
    : ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"],
  grid: isDark ? "#4a3b3a" : "#e7dfd4",
  ink: isDark ? "#d2c4b8" : "#7a6c64",
};
const TIPE_ORDER = ["tenant_makanan", "bar", "parkir", "kios_atm", "ruko"];
const TIPE_COLOR = Object.fromEntries(TIPE_ORDER.map((t, i) => [t, PAL.categorical[i]]));

/* ============================== Helpers ============================== */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function formatRupiah(n) {
  return "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
}
function parseDigits(str) {
  return String(str || "").replace(/[^\d]/g, "");
}
function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function monthKeyOf(iso) {
  return (iso || "").slice(0, 7);
}
function thisMonthKey() {
  return todayISO().slice(0, 7);
}
function thisYearKey() {
  return todayISO().slice(0, 4);
}
function showToast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("show"), 2400);
}
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function formatDateShort(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
function daysBetween(fromISO, toISO) {
  const a = new Date(fromISO + "T00:00:00");
  const b = new Date(toISO + "T00:00:00");
  return Math.round((b - a) / 86400000);
}
function unitById(id) {
  return allUnits.find((u) => u.id === id);
}

/* ============================== Setup screen ============================== */
function initSetupScreen() {
  if (isConfigured()) {
    $("#screen-setup").classList.add("hidden");
    $("#app").classList.remove("hidden");
    navigateTo("dashboard");
    boot();
    return;
  }
  $("#screen-setup").classList.remove("hidden");
  $("#app").classList.add("hidden");
}
$("#btn-save-webapp-url").addEventListener("click", async () => {
  const url = $("#input-webapp-url").value.trim();
  if (!url) return;
  setWebAppUrl(url);
  $("#setup-status").textContent = "Menyambungkan…";
  const ok = await pingApi();
  $("#setup-status").textContent = ok ? "Tersambung ✓" : "Belum bisa tersambung. Cek lagi Web App URL & pastikan sudah di-deploy sebagai 'Anyone'.";
  if (ok) {
    $("#screen-setup").classList.add("hidden");
    $("#app").classList.remove("hidden");
    navigateTo("dashboard");
    boot();
  }
});
$("#btn-skip-setup").addEventListener("click", () => {
  $("#screen-setup").classList.add("hidden");
  $("#app").classList.remove("hidden");
  navigateTo("dashboard");
  boot();
});

/* ============================== Navigation ============================== */
function navigateTo(page) {
  currentPage = page;
  $$(".page").forEach((p) => p.classList.remove("active"));
  const target = $(`#page-${page}`);
  if (target) target.classList.add("active");
  $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.nav === page));
  const titles = {
    dashboard: "Sewa & Keuangan",
    unit: "Unit Sewa",
    catat: "Catat Transaksi",
    laporan: "Laporan Keuangan",
    pengaturan: "Pengaturan",
  };
  $("#topbar-subtitle").textContent = titles[page] || "";
  if (page === "catat") resetTransaksiForm();
  window.scrollTo(0, 0);
}
$$("[data-nav]").forEach((el) => el.addEventListener("click", () => navigateTo(el.dataset.nav)));

/* ============================== Boot & data load ============================== */
async function boot() {
  populateUnitSelect();
  populateKategori();
  loadReminderSettingsUI();
  updateConnectionStatusUI();
  await refreshAll();
  registerServiceWorker();
  setInterval(checkDueReminders, 60000);
}

async function refreshAll() {
  try {
    const [units, tx] = await Promise.all([fetchUnits(), fetchTransactions()]);
    allUnits = units || [];
    allTx = (tx || []).sort((a, b) => new Date(b.tanggal) - new Date(a.tanggal));
  } catch (err) {
    console.error(err);
  }
  populateUnitSelect();
  renderDashboard();
  renderUnitList();
  renderLaporan();
}

/* ============================== Dashboard ============================== */
function renderDashboard() {
  const mKey = thisMonthKey();
  const txMonth = allTx.filter((t) => monthKeyOf(t.tanggal) === mKey);
  const inMonth = txMonth.filter((t) => t.tipe === "masuk").reduce((s, t) => s + Number(t.jumlah), 0);
  const outMonth = txMonth.filter((t) => t.tipe === "keluar").reduce((s, t) => s + Number(t.jumlah), 0);
  $("#stat-in-month").textContent = formatRupiah(inMonth);
  $("#stat-out-month").textContent = formatRupiah(outMonth);
  const net = inMonth - outMonth;
  $("#balance-value").textContent = (net >= 0 ? "" : "-") + formatRupiah(Math.abs(net));
  $("#balance-sub").textContent = txMonth.length ? `${txMonth.length} transaksi bulan ini` : "Belum ada transaksi bulan ini";

  renderDueBanner();
  renderSourceChart(txMonth);

  const recent = $("#recent-list");
  recent.innerHTML = "";
  if (!allTx.length) {
    recent.innerHTML = `<div class="empty-state">Belum ada transaksi. Tekan tombol + untuk mulai mencatat.</div>`;
  } else {
    allTx.slice(0, 6).forEach((tx) => recent.appendChild(renderTxItem(tx)));
  }
}

function computeDueSoon() {
  const today = todayISO();
  return allUnits
    .filter((u) => u.status === "aktif" && u.jatuhTempoBerikutnya)
    .map((u) => ({ ...u, daysLeft: daysBetween(today, u.jatuhTempoBerikutnya) }))
    .filter((u) => u.daysLeft <= reminderThreshold)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

function renderDueBanner() {
  const due = computeDueSoon();
  const banner = $("#due-banner");
  if (!due.length) {
    banner.classList.add("hidden");
    return;
  }
  banner.classList.remove("hidden");
  const list = $("#due-banner-list");
  list.innerHTML = "";
  due.slice(0, 5).forEach((u) => {
    const div = document.createElement("div");
    div.className = "due-item";
    const label = u.daysLeft < 0 ? `Telat ${Math.abs(u.daysLeft)} hari` : u.daysLeft === 0 ? "Jatuh tempo hari ini" : `${u.daysLeft} hari lagi`;
    const cls = u.daysLeft < 0 ? "overdue" : "soon";
    div.innerHTML = `<span class="due-name">${escapeHtml(u.nama)}</span><span class="due-days ${cls}">${label}</span>`;
    div.addEventListener("click", () => {
      navigateTo("catat");
      $("#input-unit").value = u.id;
      $("#input-unit").dispatchEvent(new Event("change"));
    });
    list.appendChild(div);
  });
}

function renderSourceChart(txMonth) {
  const bySource = {};
  txMonth.filter((t) => t.tipe === "masuk").forEach((t) => {
    const unit = t.unitId ? unitById(t.unitId) : null;
    const tipe = unit ? unit.tipe : "lainnya";
    bySource[tipe] = (bySource[tipe] || 0) + Number(t.jumlah);
  });
  const labels = [];
  const data = [];
  const colors = [];
  TIPE_ORDER.forEach((tipe) => {
    if (bySource[tipe]) {
      labels.push(UNIT_TYPES[tipe]);
      data.push(bySource[tipe]);
      colors.push(TIPE_COLOR[tipe]);
    }
  });
  if (bySource.lainnya) {
    labels.push("Lainnya");
    data.push(bySource.lainnya);
    colors.push(PAL.ink);
  }
  const ctx = $("#chart-source").getContext("2d");
  const cfg = {
    type: "doughnut",
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: "var(--card)" }] },
    options: {
      responsive: true,
      cutout: "62%",
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.label}: ${formatRupiah(c.parsed)}` } } },
    },
  };
  if (sourceChart) { sourceChart.data = cfg.data; sourceChart.update(); } else { sourceChart = new Chart(ctx, cfg); }
  $("#legend-source").innerHTML = labels.length
    ? labels.map((l, i) => `<span class="legend-item"><span class="legend-dot" style="background:${colors[i]}"></span>${l}</span>`).join("")
    : `<div class="empty-state">Belum ada pendapatan bulan ini.</div>`;
}

/* ============================== Transaction item render ============================== */
function renderTxItem(tx) {
  const div = document.createElement("div");
  div.className = "tx-item";
  const unit = tx.unitId ? unitById(tx.unitId) : null;
  const initial = tx.tipe === "masuk" ? "↓" : "↑";
  const kategoriLabel = unit ? unit.nama : tx.kategori;
  div.innerHTML = `
    <div class="tx-icon ${tx.tipe}">${initial}</div>
    <div class="tx-main">
      <div class="tx-category">${escapeHtml(kategoriLabel)}</div>
      <div class="tx-meta">${escapeHtml(tx.deskripsi || tx.kategori || "")} · ${formatDateShort(tx.tanggal)}${tx.buktiUrl ? " · 📎 bukti" : ""}</div>
    </div>
    <div class="tx-amount ${tx.tipe}">${tx.tipe === "masuk" ? "+" : "-"}${formatRupiah(tx.jumlah)}</div>
    <button class="tx-delete" data-id="${tx.id}" aria-label="Hapus">✕</button>
  `;
  div.querySelector(".tx-delete").addEventListener("click", async (e) => {
    e.stopPropagation();
    if (confirm("Hapus transaksi ini?")) {
      try {
        await deleteTransactionApi(tx.id);
        showToast("Transaksi dihapus");
        await refreshAll();
      } catch (err) {
        showToast("Gagal menghapus: " + err.message);
      }
    }
  });
  return div;
}

/* ============================== Unit Sewa: list ============================== */
function renderUnitList() {
  const typeFilter = $("#filter-unit-type").value;
  const statusFilter = $("#filter-unit-status").value;
  let list = allUnits;
  if (typeFilter !== "semua") list = list.filter((u) => u.tipe === typeFilter);
  if (statusFilter !== "semua") list = list.filter((u) => u.status === statusFilter);

  const container = $("#unit-list");
  container.innerHTML = "";
  $("#unit-empty").classList.toggle("hidden", list.length > 0);

  const today = todayISO();
  list.forEach((u) => {
    const card = document.createElement("div");
    card.className = "unit-card";
    const daysLeft = u.jatuhTempoBerikutnya ? daysBetween(today, u.jatuhTempoBerikutnya) : null;
    let dueClass = "";
    let dueText = u.jatuhTempoBerikutnya ? formatDateShort(u.jatuhTempoBerikutnya) : "-";
    if (daysLeft !== null) {
      if (daysLeft < 0) { dueClass = "overdue"; dueText += ` (telat ${Math.abs(daysLeft)} hari)`; }
      else if (daysLeft <= reminderThreshold) { dueClass = "soon"; dueText += ` (${daysLeft} hari lagi)`; }
    }
    const sewaText = u.tipeSewa === "tetap_bagi_hasil"
      ? `${formatRupiah(u.nominalSewa)} + ${u.persenBagiHasil}% bagi hasil`
      : formatRupiah(u.nominalSewa);
    card.innerHTML = `
      <div class="unit-card-top">
        <div class="unit-name">${escapeHtml(u.nama)}</div>
        <span class="unit-badge ${u.status === "nonaktif" ? "nonaktif" : ""}">${UNIT_TYPES[u.tipe] || u.tipe}</span>
      </div>
      <div class="unit-meta-row"><span>Sewa / ${cycleLabel(u.siklusBulan)}</span><strong>${sewaText}</strong></div>
      <div class="unit-due ${dueClass}"><span>Jatuh tempo berikutnya</span><span>${dueText}</span></div>
    `;
    card.addEventListener("click", () => openUnitModal(u));
    container.appendChild(card);
  });
}
$("#filter-unit-type").addEventListener("change", renderUnitList);
$("#filter-unit-status").addEventListener("change", renderUnitList);

/* ============================== Unit Sewa: modal form ============================== */
function openUnitModal(unit) {
  const modal = $("#unit-modal");
  $("#unit-modal-title").textContent = unit ? "Edit Unit" : "Tambah Unit";
  $("#unit-id").value = unit ? unit.id : "";
  $("#unit-nama").value = unit ? unit.nama : "";
  $("#unit-tipe").value = unit ? unit.tipe : "tenant_makanan";
  $("#unit-tipe-sewa").value = unit ? unit.tipeSewa : "tetap";
  $("#unit-nominal").value = unit ? Number(unit.nominalSewa).toLocaleString("id-ID") : "";
  $("#unit-persen").value = unit ? unit.persenBagiHasil : "";
  $("#unit-siklus").value = unit ? String(unit.siklusBulan) : "1";
  $("#unit-tanggal-mulai").value = unit ? unit.tanggalMulai : todayISO();
  $("#unit-status").value = unit ? unit.status : "aktif";
  $("#unit-catatan").value = unit ? unit.catatan || "" : "";
  $("#btn-delete-unit").classList.toggle("hidden", !unit);
  toggleUnitPersenField();
  modal.classList.remove("hidden");
}
function closeUnitModal() {
  $("#unit-modal").classList.add("hidden");
}
$("#btn-add-unit").addEventListener("click", () => openUnitModal(null));
$("#btn-close-unit-modal").addEventListener("click", closeUnitModal);
$("#unit-modal").addEventListener("click", (e) => { if (e.target.id === "unit-modal") closeUnitModal(); });

function toggleUnitPersenField() {
  $("#unit-field-persen").classList.toggle("hidden", $("#unit-tipe-sewa").value !== "tetap_bagi_hasil");
}
$("#unit-tipe-sewa").addEventListener("change", toggleUnitPersenField);
$("#unit-nominal").addEventListener("input", (e) => {
  const digits = parseDigits(e.target.value);
  e.target.value = digits ? Number(digits).toLocaleString("id-ID") : "";
});

$("#form-unit").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("#unit-id").value;
  const unit = {
    nama: $("#unit-nama").value.trim(),
    tipe: $("#unit-tipe").value,
    tipeSewa: $("#unit-tipe-sewa").value,
    nominalSewa: Number(parseDigits($("#unit-nominal").value)),
    persenBagiHasil: Number($("#unit-persen").value) || 0,
    siklusBulan: Number($("#unit-siklus").value),
    tanggalMulai: $("#unit-tanggal-mulai").value,
    status: $("#unit-status").value,
    catatan: $("#unit-catatan").value.trim(),
  };
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    if (id) {
      unit.id = id;
      await updateUnit(unit);
      showToast("Unit diperbarui");
    } else {
      await addUnit(unit);
      showToast("Unit ditambahkan");
    }
    closeUnitModal();
    await refreshAll();
  } catch (err) {
    showToast("Gagal menyimpan: " + err.message);
  } finally {
    btn.disabled = false;
  }
});
$("#btn-delete-unit").addEventListener("click", async () => {
  const id = $("#unit-id").value;
  if (!id || !confirm("Hapus unit ini? Riwayat transaksinya tidak ikut terhapus.")) return;
  try {
    await deleteUnitApi(id);
    showToast("Unit dihapus");
    closeUnitModal();
    await refreshAll();
  } catch (err) {
    showToast("Gagal menghapus: " + err.message);
  }
});

/* ============================== Catat Transaksi ============================== */
function populateUnitSelect() {
  const sel = $("#input-unit");
  const current = sel.value;
  sel.innerHTML = '<option value="">— Tidak terkait unit (pendapatan lain) —</option>';
  allUnits.filter((u) => u.status === "aktif").forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = `${u.nama} (${UNIT_TYPES[u.tipe]})`;
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}
function populateKategori() {
  const sel = $("#input-kategori");
  sel.innerHTML = "";
  const cats = currentType === "keluar" ? EXPENSE_CATEGORIES : [OTHER_INCOME_CATEGORY];
  cats.forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
}
function resetTransaksiForm() {
  $("#form-transaksi").reset();
  $("#input-tanggal").value = todayISO();
  $("#input-unit").value = "";
  pendingBuktiUrl = "";
  $("#upload-preview").classList.add("hidden");
  $("#upload-placeholder").classList.remove("hidden");
  $("#ocr-status").classList.add("hidden");
  updateFieldVisibility();
}

$$(".type-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    currentType = btn.dataset.type;
    $$(".type-btn").forEach((b) => b.classList.toggle("active", b === btn));
    populateKategori();
    updateFieldVisibility();
  });
});

function updateFieldVisibility() {
  const isMasuk = currentType === "masuk";
  $("#field-unit").classList.toggle("hidden", !isMasuk);
  const unitId = $("#input-unit").value;
  const unit = unitId ? unitById(unitId) : null;
  const isBagiHasil = unit && unit.tipeSewa === "tetap_bagi_hasil";
  $("#field-omzet").classList.toggle("hidden", !(isMasuk && isBagiHasil));
  $("#field-kategori").classList.toggle("hidden", isMasuk && !!unitId);
  if (isMasuk && unitId) {
    $("#omzet-hint").textContent = unit ? `Sewa tetap ${formatRupiah(unit.nominalSewa)} + ${unit.persenBagiHasil}% dari omzet` : "";
  }
}
$("#input-unit").addEventListener("change", () => {
  updateFieldVisibility();
  const unit = unitById($("#input-unit").value);
  if (unit && currentType === "masuk") {
    if (unit.tipeSewa === "tetap") {
      $("#input-jumlah").value = Number(unit.nominalSewa).toLocaleString("id-ID");
    } else {
      recomputeBagiHasil();
    }
  }
});
$("#input-omzet").addEventListener("input", (e) => {
  const digits = parseDigits(e.target.value);
  e.target.value = digits ? Number(digits).toLocaleString("id-ID") : "";
  recomputeBagiHasil();
});
function recomputeBagiHasil() {
  const unit = unitById($("#input-unit").value);
  if (!unit) return;
  const omzet = Number(parseDigits($("#input-omzet").value)) || 0;
  const bagiHasil = Math.round((omzet * Number(unit.persenBagiHasil)) / 100);
  const total = Number(unit.nominalSewa) + bagiHasil;
  $("#input-jumlah").value = total.toLocaleString("id-ID");
}
$("#input-jumlah").addEventListener("input", (e) => {
  const digits = parseDigits(e.target.value);
  e.target.value = digits ? Number(digits).toLocaleString("id-ID") : "";
});

/* ---- Upload & OCR ---- */
$("#upload-zone").addEventListener("click", (e) => {
  if (e.target.tagName !== "INPUT") $("#input-file-bukti").click();
});
$("#input-file-bukti").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    $("#upload-preview").src = reader.result;
    $("#upload-preview").classList.remove("hidden");
    $("#upload-placeholder").classList.add("hidden");
  };
  reader.readAsDataURL(file);

  const statusEl = $("#ocr-status");
  statusEl.classList.remove("hidden", "success", "error");
  statusEl.classList.add("loading");
  statusEl.textContent = "Membaca kwitansi… (butuh beberapa detik)";

  try {
    const base64 = await fileToBase64(file);
    const result = await uploadReceiptApi(file.name, file.type, base64);
    pendingBuktiUrl = result.buktiUrl || "";
    statusEl.classList.remove("loading");
    if (result.guessedAmount || result.guessedDate) {
      if (result.guessedAmount) $("#input-jumlah").value = Number(result.guessedAmount).toLocaleString("id-ID");
      if (result.guessedDate) $("#input-tanggal").value = result.guessedDate;
      statusEl.classList.add("success");
      statusEl.textContent = `Terbaca otomatis${result.guessedAmount ? ": " + formatRupiah(result.guessedAmount) : ""}${result.guessedDate ? ", " + formatDateShort(result.guessedDate) : ""} — cek lagi sebelum simpan.`;
    } else {
      statusEl.classList.add("error");
      statusEl.textContent = "Foto tersimpan sebagai bukti, tapi tidak bisa dibaca otomatis. Isi nominal & tanggal manual ya.";
    }
  } catch (err) {
    statusEl.classList.remove("loading");
    statusEl.classList.add("error");
    statusEl.textContent = "Gagal upload: " + err.message;
  }
});

$("#form-transaksi").addEventListener("submit", async (e) => {
  e.preventDefault();
  const jumlah = Number(parseDigits($("#input-jumlah").value));
  if (!jumlah) { showToast("Isi jumlah dulu ya"); return; }
  const unitId = currentType === "masuk" ? $("#input-unit").value : "";
  const unit = unitId ? unitById(unitId) : null;
  const kategori = unitId ? RENT_CATEGORY : $("#input-kategori").value;

  const tx = {
    tanggal: $("#input-tanggal").value || todayISO(),
    tipe: currentType,
    unitId: unitId || "",
    kategori,
    deskripsi: $("#input-deskripsi").value.trim(),
    jumlah,
    buktiUrl: pendingBuktiUrl,
    sumber: pendingBuktiUrl ? "ocr" : "manual",
  };
  if (unit && unit.tipeSewa === "tetap_bagi_hasil") {
    tx.omzetDilaporkan = Number(parseDigits($("#input-omzet").value)) || 0;
  }

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  btn.textContent = "Menyimpan…";
  try {
    await addTransactionApi(tx);
    showToast(currentType === "masuk" ? "Pendapatan tercatat ✓" : "Pengeluaran tercatat ✓");
    resetTransaksiForm();
    await refreshAll();
    navigateTo("dashboard");
  } catch (err) {
    showToast("Gagal menyimpan: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Simpan Transaksi";
  }
});

/* ============================== Laporan ============================== */
let laporanPeriod = "month";
$$(".seg-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    laporanPeriod = btn.dataset.period;
    $$(".seg-btn").forEach((b) => b.classList.toggle("active", b === btn));
    renderLaporan();
  });
});
function filterByPeriod(list) {
  if (laporanPeriod === "month") return list.filter((t) => monthKeyOf(t.tanggal) === thisMonthKey());
  if (laporanPeriod === "year") return list.filter((t) => (t.tanggal || "").slice(0, 4) === thisYearKey());
  return list;
}
function renderLaporan() {
  const list = filterByPeriod(allTx);
  const totalIn = list.filter((t) => t.tipe === "masuk").reduce((s, t) => s + Number(t.jumlah), 0);
  const totalOut = list.filter((t) => t.tipe === "keluar").reduce((s, t) => s + Number(t.jumlah), 0);
  $("#report-total-in").textContent = formatRupiah(totalIn);
  $("#report-total-out").textContent = formatRupiah(totalOut);
  const net = totalIn - totalOut;
  const netEl = $("#report-net");
  netEl.textContent = (net >= 0 ? "+" : "-") + formatRupiah(Math.abs(net));
  netEl.style.color = net >= 0 ? "var(--money-net-good)" : "var(--money-net-bad)";

  renderTrendChart();

  const byCat = {};
  list.filter((t) => t.tipe === "keluar").forEach((t) => {
    byCat[t.kategori] = (byCat[t.kategori] || 0) + Number(t.jumlah);
  });
  const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const ctx = $("#chart-category").getContext("2d");
  const colors = entries.map((_, i) => PAL.categorical[i % PAL.categorical.length]);
  const cfg = {
    type: "bar",
    data: { labels: entries.map((e) => e[0]), datasets: [{ data: entries.map((e) => e[1]), backgroundColor: colors, borderRadius: 4, maxBarThickness: 28 }] },
    options: {
      indexAxis: "y",
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => formatRupiah(c.parsed.x) } } },
      scales: {
        x: { grid: { color: PAL.grid }, ticks: { color: PAL.ink, font: { size: 10 }, callback: (v) => (v >= 1000 ? v / 1000 + "rb" : v) } },
        y: { grid: { display: false }, ticks: { color: PAL.ink, font: { size: 11 } } },
      },
    },
  };
  if (categoryChart) { categoryChart.data = cfg.data; categoryChart.update(); } else { categoryChart = new Chart(ctx, cfg); }
  $("#legend-category").innerHTML = entries.length ? "" : `<div class="empty-state">Belum ada pengeluaran pada periode ini.</div>`;

  const sheetLink = localStorage.getItem("bk_sheet_link");
  const sheetBtn = $("#btn-open-sheet");
  if (sheetLink) { sheetBtn.href = sheetLink; sheetBtn.classList.remove("hidden"); } else { sheetBtn.classList.add("hidden"); }
}

function renderTrendChart() {
  const labels = [];
  const inData = [];
  const outData = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    labels.push(d.toLocaleDateString("id-ID", { month: "short" }));
    inData.push(allTx.filter((t) => t.tipe === "masuk" && monthKeyOf(t.tanggal) === key).reduce((s, t) => s + Number(t.jumlah), 0));
    outData.push(allTx.filter((t) => t.tipe === "keluar" && monthKeyOf(t.tanggal) === key).reduce((s, t) => s + Number(t.jumlah), 0));
  }
  const ctx = $("#chart-trend").getContext("2d");
  const cfg = {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Pendapatan", data: inData, backgroundColor: PAL.in, borderRadius: 4, maxBarThickness: 22 },
        { label: "Pengeluaran", data: outData, backgroundColor: PAL.out, borderRadius: 4, maxBarThickness: 22 },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${formatRupiah(c.parsed.y)}` } } },
      scales: {
        x: { grid: { display: false }, ticks: { color: PAL.ink, font: { size: 11 } } },
        y: { grid: { color: PAL.grid }, ticks: { color: PAL.ink, font: { size: 10 }, callback: (v) => (v >= 1000 ? v / 1000 + "rb" : v) } },
      },
    },
  };
  if (trendChart) { trendChart.data = cfg.data; trendChart.update(); } else { trendChart = new Chart(ctx, cfg); }
  $("#legend-trend").innerHTML = `
    <span class="legend-item"><span class="legend-dot" style="background:${PAL.in}"></span>Pendapatan</span>
    <span class="legend-item"><span class="legend-dot" style="background:${PAL.out}"></span>Pengeluaran</span>
  `;
}

$("#btn-export").addEventListener("click", () => {
  const list = filterByPeriod(allTx);
  if (!list.length) { showToast("Tidak ada data untuk diekspor"); return; }
  const header = "Tanggal,Tipe,Unit,Kategori,Keterangan,Jumlah,Omzet Dilaporkan,Sumber\n";
  const rows = list.map((t) => {
    const unit = t.unitId ? unitById(t.unitId) : null;
    return [t.tanggal, t.tipe === "masuk" ? "Pendapatan" : "Pengeluaran", unit ? unit.nama : "", t.kategori, (t.deskripsi || "").replace(/,/g, ";"), t.jumlah, t.omzetDilaporkan || "", t.sumber || ""].join(",");
  }).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `berawa-kitchen-laporan-${todayISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

/* ============================== Pengaturan ============================== */
function updateConnectionStatusUI() {
  $("#settings-status").textContent = isConfigured() ? "Tersambung" : "Belum disambungkan";
  $("#input-settings-webapp").value = getWebAppUrl();
  $("#input-settings-sheet").value = localStorage.getItem("bk_sheet_link") || "";
}
$("#btn-save-connection").addEventListener("click", async () => {
  setWebAppUrl($("#input-settings-webapp").value.trim());
  localStorage.setItem("bk_sheet_link", $("#input-settings-sheet").value.trim());
  $("#settings-status").textContent = "Menguji koneksi…";
  const ok = await pingApi();
  $("#settings-status").textContent = ok ? "Tersambung ✓" : "Gagal tersambung — cek Web App URL";
  if (ok) {
    showToast("Tersambung! Memuat data…");
    await refreshAll();
  }
});

function loadReminderSettingsUI() {
  $("#toggle-reminder").checked = localStorage.getItem("bk_reminder_on") === "1";
  $("#input-reminder-days").value = reminderThreshold;
  fetchSettings().then((s) => {
    if (s && s.reminderHariSebelum != null) {
      reminderThreshold = Number(s.reminderHariSebelum);
      $("#input-reminder-days").value = reminderThreshold;
    }
  }).catch(() => {});
}
async function requestNotifPermission() {
  if (!("Notification" in window)) { showToast("Perangkat tidak mendukung notifikasi"); return false; }
  if (Notification.permission === "granted") return true;
  return (await Notification.requestPermission()) === "granted";
}
$("#btn-notif").addEventListener("click", async () => {
  const ok = await requestNotifPermission();
  showToast(ok ? "Notifikasi diaktifkan" : "Izin notifikasi ditolak");
  if (ok) { $("#toggle-reminder").checked = true; saveReminderPrefs(); }
});
$("#toggle-reminder").addEventListener("change", async () => {
  if ($("#toggle-reminder").checked) {
    const ok = await requestNotifPermission();
    if (!ok) { $("#toggle-reminder").checked = false; showToast("Aktifkan izin notifikasi dulu di pengaturan browser"); }
  }
  saveReminderPrefs();
});
$("#input-reminder-days").addEventListener("change", saveReminderPrefs);
function saveReminderPrefs() {
  localStorage.setItem("bk_reminder_on", $("#toggle-reminder").checked ? "1" : "0");
  reminderThreshold = Number($("#input-reminder-days").value) || 3;
  localStorage.setItem("bk_reminder_days", reminderThreshold);
  updateSettingsApi({ reminderHariSebelum: reminderThreshold }).catch(() => {});
  renderDueBanner();
  renderUnitList();
}

function checkDueReminders() {
  if (localStorage.getItem("bk_reminder_on") !== "1") return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const today = todayISO();
  computeDueSoon().forEach((u) => {
    const key = `bk_notified_${u.id}_${today}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    const body = u.daysLeft < 0
      ? `Sudah telat ${Math.abs(u.daysLeft)} hari — ${formatRupiah(u.nominalSewa)}`
      : u.daysLeft === 0
      ? `Jatuh tempo hari ini — ${formatRupiah(u.nominalSewa)}`
      : `${u.daysLeft} hari lagi — ${formatRupiah(u.nominalSewa)}`;
    fireNotification(`Sewa ${u.nama} jatuh tempo`, body);
  });
}
function fireNotification(title, body) {
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((reg) => reg.showNotification(title, { body, icon: "icons/icon-192.png", badge: "icons/icon-192.png" }));
  } else if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "icons/icon-192.png" });
  }
}

/* ============================== PWA ============================== */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("service-worker.js");
      if ("periodicSync" in reg) {
        try {
          const status = await navigator.permissions.query({ name: "periodic-background-sync" });
          if (status.state === "granted") {
            await reg.periodicSync.register("berawa-kitchen-reminder", { minInterval: 20 * 60 * 60 * 1000 });
          }
        } catch { /* not supported everywhere — in-app interval still covers it */ }
      }
    } catch (err) {
      console.error("SW register failed:", err);
    }
  });
}
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstallPrompt = e; });

/* ============================== Init ============================== */
updateFieldVisibility();
initSetupScreen();
