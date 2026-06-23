# Panduan Desain & Estetika UI — Sobat AI

Dokumen ini mendeskripsikan sistem desain, pilihan estetika, skema warna, tipografi, serta animasi mikro yang digunakan pada aplikasi web **Sobat AI (Asisten Pribadi Kognitif)**. Sistem desain ini dibuat untuk memberikan kesan premium, modern, futuristik (*space-tech vibe*), dan interaktif (*alive*).

---

## 1. Filosofi & Konsep Desain

Aplikasi Sobat AI mengadopsi estetika **Premium Dark Mode** yang dipadukan dengan **Glassmorphism** dan **Neon Glow Accents**. Konsep utama dari desain ini adalah:
* **Fokus & Ketenangan (Kognitif):** Warna latar belakang gelap mengurangi ketegangan mata dan membantu pengguna tetap fokus pada metrik analitik penting.
* **Kedalaman Visual (Visual Depth):** Efek blur kaca (*frosted glass*) menciptakan ilusi lapisan visual bertingkat yang rapi.
* **Responsif & Hidup (Dynamic Feel):** Elemen interaktif merespons tindakan pengguna melalui hover glow, pergeseran halus, dan animasi berdenyut (*pulse*).

---

## 2. Palet Warna & Token Desain

Aplikasi ini menggunakan warna-warna HSL terkurasi yang selaras untuk menyajikan antarmuka premium tanpa warna mentah (seperti merah/biru murni):

| Token | Nilai Warna / CSS | Kegunaan | Deskripsi Visual |
| :--- | :--- | :--- | :--- |
| `--bg-main` | `#0b0f19` | Latar Belakang Utama | Midnight Blue gelap yang sangat pekat |
| `--bg-card` | `rgba(17, 24, 39, 0.6)` | Latar Belakang Kartu | Abu-abu gelap transparan untuk efek kaca |
| `--border-glass` | `rgba(255, 255, 255, 0.07)` | Garis Tepi Kaca | Garis tipis transparan putih untuk memisahkan kartu |
| `--color-primary` | `#3b82f6` | Warna Utama (Biru Neon) | Aksen utama untuk tombol, indikator aktif, dan judul |
| `--color-success` | `#10b981` | Status Sukses (Hijau Emerald)| Pemasukan keuangan, tugas selesai, skor konsistensi tinggi |
| `--color-warning` | `#f59e0b` | Status Peringatan (Amber) | Indikator demo, status tertunda, info batas runway |
| `--color-danger` | `#ef4444` | Status Bahaya (Merah Coral) | Pengeluaran, kebocoran keuangan, tombol hapus/batal |
| `--color-purple` | `#8b5cf6` | Warna Pelengkap (Ungu Neon)| Aksen gradien cetak/ekspor PDF, ornamen estetika |

### Cahaya Latar Belakang (Ambient Background Glow)
Latar belakang tidak polos, melainkan disinari oleh 3 titik gradien radial redup untuk memberikan kesan kedalaman luar angkasa:
* **Top-Left Glow:** `rgba(59, 130, 246, 0.05)` (Biru)
* **Top-Right Glow:** `rgba(139, 92, 246, 0.05)` (Ungu)
* **Bottom-Center Glow:** `rgba(16, 185, 129, 0.03)` (Hijau)

---

## 3. Tipografi

Sistem tipografi menggunakan Google Fonts modern untuk memisahkan hirarki visual secara tegas:
1. **Judul & Tampilan Utama (`--font-title`):** **`'Outfit', sans-serif`**
   * Karakteristik: Geometris, modern, tegas, dengan ketebalan (font-weight) 700–800.
   * Digunakan untuk: Judul dasbor, header kartu analitik, dan teks nama asisten AI.
2. **Isi & Metrik (`--font-body`):** **`'Inter', sans-serif`**
   * Karakteristik: Sangat bersih, jarak antar huruf yang optimal, keterbacaan tinggi pada teks ukuran kecil.
   * Digunakan untuk: Teks deskripsi analisis, angka nominal rupiah, status tugas, dan formulir input.

---

## 4. Elemen Desain Unggulan (Key UI Elements)

### A. Glassmorphic Cards
Setiap kartu analitik memiliki properti CSS kaca transparan premium:
```css
background: rgba(17, 24, 39, 0.6);
backdrop-filter: blur(20px);
border: 1px solid rgba(255, 255, 255, 0.07);
box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
```
Kartu memiliki transisi hover yang halus (`transform: translateY(-2px)` dan pendaran tepi `border-color: rgba(59, 130, 246, 0.2)`).

### B. Locked Cognitive Overlay (Kunci Kartu Kognitif)
Ketika data nyata user di database masih kurang (belum memenuhi syarat hari penggunaan atau jumlah transaksi), kartu akan diredupkan ke tingkat opasitas **22%** dan ditutupi oleh sebuah panel kaca buram (`.locked-overlay`):
* **Ikon Mengambang:** Menggunakan emoji jam pasir `⏳` dengan animasi melayang naik-turun lambat (*floating animation*).
* **Pemberitahuan Informatif:** Menampilkan teks dinamis yang memberitahu berapa sisa hari atau sisa transaksi yang harus dimasukkan pengguna untuk membuka analitik tersebut secara riil.

### C. Pola Gradien Teks (Text Gradient)
Judul utama menggunakan teknik kliping latar belakang gradien untuk memberikan efek teks berkilau perak ke biru:
```css
background: linear-gradient(135deg, #ffffff 30%, #3b82f6 100%);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```

---

## 5. Animasi & Interaktivitas

Semua transisi dalam aplikasi diatur menggunakan kurva akselerasi kustom untuk pergerakan alami yang halus:
* **Kurva Transisi:** `cubic-bezier(0.4, 0, 0.2, 1)` (durasi `0.3s`)
* **Avatar Pulse:** Indikator dot hijau di samping nama profil berdenyut perlahan (efek membesar dan memudar) untuk menunjukkan status koneksi data realtime.
* **Scale-Up Wizard:** Ketika melangkah dari slide onboarding ke form login/registrasi, kartu onboarding muncul dengan efek membesar pegas elastis (*elastic scale up*).
* **Floating Hourglass:** Animasi naik turun perlahan (`translateY`) pada kunci kartu untuk menarik perhatian tanpa mengganggu fokus membaca dasbor.

---
*Dokumentasi ini ditulis sebagai panduan acuan pengembangan gaya UI Sobat AI.*
