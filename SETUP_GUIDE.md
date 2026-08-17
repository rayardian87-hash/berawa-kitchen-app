# Panduan Setup — Berawa Kitchen (Sewa & Keuangan)

Aplikasi ini adalah **PWA** (Progressive Web App) khusus untuk owner: bisa
di-install ke home screen HP, tanpa layar login. Datanya tersimpan di
**Google Sheets milik kamu sendiri**, dan foto kwitansi/bukti transfer bisa
dibaca otomatis (OCR) lewat Google Drive.

Ada 3 bagian yang perlu disiapkan sekali di awal:

1. **Google Sheet + Apps Script** — ini "otak" aplikasi (database + OCR).
2. **Web App (PWA)** — tampilan yang kamu buka & install di HP.
3. Menyambungkan keduanya.

Tidak perlu bisa coding — tinggal ikuti & copy-paste.

---

## Bagian 1 — Setup Google Sheet & Apps Script (backend)

### 1.1 Buat Google Sheet

1. Buka **https://sheets.google.com** → buat spreadsheet baru → beri nama
   misalnya **"Berawa Kitchen - Data"**.

### 1.2 Tempel kode Apps Script

1. Di spreadsheet tadi, buka menu **Extensions/Ekstensi → Apps Script**.
2. Hapus semua kode default (`function myFunction() {}`), lalu buka file
   `apps-script/Code.gs` dari paket aplikasi ini, salin **seluruh isinya**,
   dan tempel ke editor Apps Script.
3. Simpan (ikon disket / Ctrl+S), beri nama project misalnya "Berawa
   Kitchen Backend".

### 1.3 Aktifkan layanan Drive API (untuk OCR)

1. Di editor Apps Script, klik ikon **"+"** di sebelah **Services**
   (menu kiri).
2. Cari **Drive API**, pilih, lalu klik **Add**. Pastikan versinya
   **v2** (biasanya sudah default).

### 1.4 Jalankan setup awal (izin akses)

1. Di dropdown fungsi (dekat tombol ▶ Run), pilih **`setupAwal`**.
2. Klik **Run** (▶). Akan muncul jendela minta izin — klik **Review
   permissions**, pilih akun Google kamu, klik **Advanced/Lanjutan** →
   **Go to Berawa Kitchen Backend (unsafe)** → **Allow/Izinkan**.
   (Ini normal untuk script buatan sendiri yang belum diverifikasi Google —
   aman karena kamu sendiri yang menulis & menjalankannya.)
3. Setelah selesai akan muncul pesan "Setup selesai!". Cek juga di
   spreadsheet — sekarang ada 3 tab baru: **Unit**, **Transaksi**,
   **Pengaturan**.
4. *(Opsional)* Di dropdown fungsi, pilih **`isiContohUnit`** → Run. Ini
   mengisi 15 tenant makanan + bar + parkir + kios ATM + ruko sebagai
   contoh, supaya kamu tinggal edit nama & nominalnya di tab **Unit**
   daripada input dari nol.

### 1.5 Deploy sebagai Web App

1. Klik tombol **Deploy → New deployment**.
2. Klik ikon gerigi ⚙ di samping "Select type" → pilih **Web app**.
3. Isi:
   - **Execute as**: `Me (email kamu)`
   - **Who has access**: `Anyone`
4. Klik **Deploy**. Kalau diminta otorisasi lagi, ulangi seperti langkah
   1.4.
5. Setelah deploy selesai, **salin "Web App URL"** yang muncul (bentuknya
   `https://script.google.com/macros/s/xxxxx/exec`). Simpan dulu, dipakai
   di Bagian 3.

> Catatan keamanan: "Anyone" di sini artinya siapapun yang PUNYA link
> tersebut bisa memanggil API-nya (supaya kamu sebagai owner tidak perlu
> login berulang kali). Jangan sebar Web App URL ini ke orang lain,
> perlakukan seperti kata sandi.

---

## Bagian 2 — Publish tampilan aplikasi (PWA)

Aplikasi ini **sudah di-hosting otomatis di GitHub Pages** dan siap dibuka
langsung di HP:

**https://rayardian87-hash.github.io/berawa-kitchen-app/**

Tidak perlu drag & drop ke Netlify lagi — tinggal buka link di atas.
(Kalau nanti mau update tampilannya sendiri, cukup edit file di repo GitHub
`rayardian87-hash/berawa-kitchen-app`, GitHub Pages otomatis re-deploy.)

---

## Bagian 3 — Sambungkan aplikasi ke Web App URL

1. Buka link GitHub Pages di atas di HP kamu.
2. Di layar pertama, tempel **Web App URL** dari langkah 1.5 → tombol
   **Sambungkan**.
3. Kalau berhasil, langsung masuk ke Dashboard. Data unit sewa (kalau
   sudah isi contoh di langkah 1.4) akan langsung muncul.
4. *(Opsional)* Buka menu **Pengaturan**, isi juga **Link Google Sheet**
   (URL spreadsheet di langkah 1.1) supaya ada tombol pintasan "Buka
   Laporan Lengkap di Google Sheets" di halaman Laporan.

---

## Bagian 4 — Install ke Home Screen

**Android (Chrome):** buka link aplikasi → menu titik tiga (⋮) →
**"Tambahkan ke layar Utama" / "Install app"**.

**iPhone (Safari):** buka link aplikasi → ikon **Share/Bagikan** → **"Tambah
ke Layar Utama"**.

---

## Cara Pakai Sehari-hari

- **Unit Sewa**: tambah/edit/hapus tenant, bar, parkir, kios ATM, ruko.
  Untuk Bar, pilih Tipe Sewa **"Tetap + Bagi Hasil"** dan isi persentase
  bagi hasilnya.
- **Catat Transaksi**: pilih Pendapatan/Pengeluaran. Untuk pendapatan sewa,
  pilih unit-nya — nominal terisi otomatis (untuk Bar, isi dulu "Omzet
  Dilaporkan" supaya bagi hasilnya terhitung). Setiap kali pendapatan sewa
  tercatat, **tanggal jatuh tempo unit itu otomatis maju** ke periode
  berikutnya.
- **Upload kwitansi/bukti transfer**: tekan area upload, ambil foto atau
  pilih dari galeri. Sistem coba baca nominal & tanggal otomatis lewat OCR
  — **selalu cek ulang** hasilnya sebelum menekan Simpan (OCR tidak selalu
  100% akurat, terutama untuk foto yang buram/miring).
- **Dashboard**: ada banner "Jatuh Tempo Terdekat" untuk unit yang mau/
  sudah lewat jatuh tempo — tekan salah satu untuk langsung buka form
  pencatatan pembayarannya.
- **Laporan**: ringkasan per bulan/tahun/semua, grafik tren, breakdown
  pengeluaran per kategori, ekspor CSV, atau buka langsung Google Sheets
  untuk analisis lebih lanjut.

---

## Tentang Notifikasi Jatuh Tempo

- Ketuk ikon lonceng di pojok kanan atas untuk mengizinkan notifikasi,
  lalu nyalakan **"Notifikasi Jatuh Tempo"** di menu Pengaturan dan atur
  berapa hari sebelumnya mau diingatkan.
- Notifikasi dicek otomatis selama aplikasi terbuka/berjalan di
  background. Catatan jujur: notifikasi saat aplikasi **benar-benar
  tertutup total** tergantung dukungan browser/HP (paling stabil di
  Android + Chrome dengan aplikasi ter-install) — ini keterbatasan
  teknologi web, bukan bug aplikasi. Kalau butuh jaminan 100% tidak
  kelewat, cek juga kolom "Jatuh Tempo Berikutnya" di tab **Unit** pada
  Google Sheets sesekali.

---

## Kalau Ada Masalah

- **"Belum bisa tersambung" saat isi Web App URL**: pastikan sudah Deploy
  (bukan cuma Save) di Apps Script, dan "Who has access" = Anyone. Coba
  deploy ulang dengan **"New deployment"** kalau sudah pernah edit
  Code.gs setelah deploy pertama (edit tidak otomatis update deployment
  lama, versinya perlu di-manage lewat "Manage deployments" → edit → New
  version).
- **OCR tidak jalan / selalu gagal baca**: cek Drive API sudah ditambahkan
  di Services (langkah 1.3). Foto tetap tersimpan sebagai bukti walau OCR
  gagal — tinggal isi manual.
- **Data tidak update setelah edit Code.gs**: di Apps Script, `Deploy →
  Manage deployments → ✏️ (edit) → Version: New version → Deploy`. URL
  Web App-nya tetap sama, tidak perlu ganti di aplikasi.
- **Ingin reset koneksi**: buka Pengaturan di app, ganti/kosongkan Web App
  URL, simpan lagi.
