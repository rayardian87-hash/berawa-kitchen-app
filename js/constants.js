export const UNIT_TYPES = {
  tenant_makanan: "Tenant Makanan",
  bar: "Bar",
  parkir: "Parkir",
  kios_atm: "Kios ATM",
  ruko: "Ruko",
};

export const RENT_TYPES = {
  tetap: "Sewa Tetap",
  tetap_bagi_hasil: "Tetap + Bagi Hasil",
};

export const CYCLE_OPTIONS = [
  { value: 1, label: "Bulanan" },
  { value: 3, label: "Triwulan (3 bulan)" },
  { value: 6, label: "Semester (6 bulan)" },
  { value: 12, label: "Tahunan" },
];

export const RENT_CATEGORY = "Pembayaran Sewa";
export const OTHER_INCOME_CATEGORY = "Pendapatan Lain-lain";

export const EXPENSE_CATEGORIES = [
  "Gaji & Upah Staff Kompleks",
  "Listrik & Air Area Umum",
  "Kebersihan & Sampah",
  "Keamanan",
  "Perawatan & Perbaikan",
  "Pajak & Retribusi",
  "Marketing & Promosi Kompleks",
  "Lain-lain",
];

export function cycleLabel(months) {
  const found = CYCLE_OPTIONS.find((c) => c.value === Number(months));
  return found ? found.label : `${months} bulan`;
}
