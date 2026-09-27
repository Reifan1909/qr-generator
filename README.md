# Antigravity QR Code Generator

Aplikasi generator QR Code modern, dinamis, dan gratis yang dilengkapi dengan kustomisasi visual tingkat tinggi (bentuk titik, sudut, logo di tengah, gradien warna, bingkai/frame CTA), **Fitur Analitik Scan Real-Time**, serta sistem **Hybrid Auth (Mode Tamu & Akun Google)**.

---

## 🚀 Fitur Utama

### 1. Mode Tamu (Guest) & Akun Google
- **Mode Tamu (Tanpa Simpan):** Pengguna dapat langsung membuat, mengkustomisasi, dan mengunduh kode QR beresolusi tinggi secara gratis tanpa perlu login atau menyimpan data lokal yang membebani memori.
- **Popup Login Saat Simpan Proyek:** Ketika pengguna mengklik **"Simpan Proyek"** atau **"Proyek Saya"**, muncul popup ramah yang menawarkan login dengan Akun Google (atau Mode Demo langsung).
- **Penyimpanan Cloud (Google Firestore):** Proyek QR yang tersimpan disinkronkan ke akun Google pengguna sehingga dapat diakses dan diedit dari perangkat mana saja.
- **Edit Desain Tanpa Cetak Ulang:** Jika Anda memperbarui warna, logo, atau link tujuan di menu Proyek Saya, QR fisik yang sudah dicetak pada brosur, kartu nama, atau banner tetap aktif tanpa perlu dicetak ulang!

### 2. Fitur Analitik Scan (Pelacakan Pemindaian)
- **Pelacakan Otomatis Setiap Scan:** Setiap kali seseorang memindai QR Code, sistem secara otomatis mencatat pemindaian secara real-time.
- **Metrik Analitik Lengkap (KPI Cards):**
  - Total Pemindaian (Scan Count)
  - Waktu Pemindaian Terakhir (Timestamp akurat)
  - Rasio Pengguna Smartphone vs Desktop
  - Browser Terbanyak (Chrome, Safari, Firefox, Edge)
- **Distribusi Perangkat (Visual Progress Bar):** Menampilkan perbandingan persentase antara Smartphone (Mobile), Laptop/Komputer (Desktop), dan Tablet (iPad).
- **Riwayat Log 10 Pemindaian Terakhir:** Feed riwayat yang memperlihatkan tanggal/jam, ikon perangkat, sistem operasi (Android, iOS, Windows, macOS), browser, dan status pemindaian.
- **Tombol Uji / Simulasi Scan (+1):** Memungkinkan pemilik proyek menguji pencatatan analitik secara instan langsung dari dasbor.
- **Tombol Reset Analitik:** Reset hitungan scan ke angka 0 saat memulai kampanye promosi baru.

### 3. Multi-Format Konten
- **Tautan / URL Web:** Dilengkapi saklar **Dynamic QR & Pelacak Scan** untuk merekam pemindaian dan memperbarui URL tujuan kapan saja.
- **Foto & Galeri Gambar:** Dynamic Landing Page Viewer dengan badge jumlah scan real-time.
- **Video:** Pemutar interaktif untuk YouTube embed, TikTok, dan video direct MP4.
- **WhatsApp:** Direct chat dengan nomor tujuan dan template pesan otomatis.
- **WiFi:** Format SSID, enkripsi WPA/WEP/Open, dan opsi hidden network.
- **Kontak / vCard 3.0:** Kartu nama digital dengan nama, telepon, email, organisasi, jabatan, website.
- **Teks Bebas & Email:** Pesan catatan atau surat elektronik otomatis.

### 4. Kustomisasi Desain Tanpa Batas
- **Bentuk Titik (Dots):** Rounded, Dots, Classy, Classy-Rounded, Extra-Rounded, Square.
- **Bingkai Sudut (Corner Square):** Bulat Halus (Extra-rounded), Lingkaran (Dot), Kotak (Square).
- **Titik Tengah Sudut (Corner Dot):** Bulat (Dot) dan Kotak (Square).
- **Logo di Tengah:** Preset ikon (WhatsApp, Instagram, YouTube, TikTok, WiFi, Globe, Maps, Phone, Email) dalam format Data URI aman tanpa error CORS, serta opsi upload logo kustom sendiri (PNG/SVG/JPG).
- **Pewarnaan Fleksibel:** Solid color atau Linear Gradient dua warna dengan pengaturan sudut kemiringan (0° - 360°), background color transparan atau kustom, dan palet warna favorit.
- **Bingkai & Label CTA:** Frame Banner Bawah ("SCAN ME"), Frame Atas, dan Kartu Badge Premium dengan teks ajakan yang dapat dikustomisasi.
- **Level Koreksi Kerusakan:** L (7%), M (15%), Q (25%), H (30%) agar QR tetap terbaca dengan baik.

### 5. Ekspor Kualitas Tinggi
- **PNG (Resolusi Kustom):** 512px, 1024px HD, 2048px 2K, hingga 4000px 4K Super Res.
- **SVG (Vector):** Kualitas tanpa batas untuk percetakan spanduk, banner, atau kartu nama tanpa pecah.
- **WebP & Copy ke Clipboard.**

### 6. QR Code Scanner Terintegrasi
- Pindai kode QR langsung melalui kamera perangkat atau unggah file gambar QR code dari galeri/komputer.

---

## 📁 Struktur Folder Proyek

```text
QR Generator/
│
├── index.html              # Antarmuka utama aplikasi (Generator, Live Preview & Modal Dasbor)
├── README.md               # Dokumentasi lengkap proyek
│
├── assets/
│   ├── css/
│   │   ├── variables.css   # Token warna (dark & light mode, typography, tokens)
│   │   ├── style.css       # Layout dasar, ambient glow, header, responsive grid
│   │   └── components.css  # Komponen UI (tabs, accordion, modal auth, modal analitik, dsb)
│   │
│   ├── js/
│   │   ├── firebase-config.js # Konfigurasi Firebase Auth & Firestore
│   │   ├── auth.js         # Pengelola login Google & fallback mode demo
│   │   ├── storage.js      # Manajemen data cloud & pelacakan analitik scan
│   │   ├── app.js          # Controller utama UI & dashboard analitik
│   │   ├── qr-engine.js    # Abstraksi generator QRCodeStyling & frame canvas
│   │   ├── icons-data.js   # Koleksi SVG Data URI logo tengah aman CORS
│   │   ├── templates.js    # Data preset tema & template 1-klik
│   │   ├── exporter.js     # Fungsi download PNG, SVG, WebP, dan Clipboard copy
│   │   └── scanner.js      # Fitur scanner kamera & upload file gambar QR
│   │
│   └── icons/              # File aset ikon SVG
│
└── viewer/                 # Landing Page Pemindai & Dynamic Redirect
    ├── index.html          # Template landing page media & splash redirect dinamis
    └── viewer.js           # Perekam analitik scan & pengarah link otomatis
```

---

## 🛠️ Cara Menjalankan & Hosting

Aplikasi ini dibangun menggunakan arsitektur web client-side murni (*Vanilla JavaScript, HTML5, CSS3*) sehingga dapat di-hosting secara **100% gratis** di **GitHub Pages**:

1. **Jalankan Secara Lokal:**
   - Cukup buka file `index.html` langsung di peramban (Google Chrome, Microsoft Edge, Mozilla Firefox, Safari).
   - Atau gunakan local server:
     ```bash
     npx serve .
     # atau
     python -m http.server 8080
     ```

2. **Deploy ke GitHub Pages (Gratis Selamanya):**
   - Buat repositori baru di GitHub.
   - Unggah semua file proyek ini ke repositori tersebut.
   - Buka **Settings** -> **Pages** -> pilih branch `main` (folder root `/`) -> **Save**.
   - Website QR Generator Anda langsung aktif secara publik dengan URL `https://username.github.io/nama-repo/`!

3. **Mengaktifkan Login Google Firebase (Opsional & Gratis):**
   - Buka [Firebase Console](https://console.firebase.google.com/) & buat proyek gratis (Spark Plan).
   - Aktifkan **Authentication** (Metode Google) dan **Firestore Database** (Test Mode).
   - Salin kunci konfigurasi web app ke file `assets/js/firebase-config.js`.
   - Di tab *Authorized Domains* pada Firebase Authentication, tambahkan domain Anda (misal `localhost` atau `username.github.io`).
