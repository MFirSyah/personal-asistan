# Rule: Gaya Kode

- **Flutter**: satu fitur = satu folder di `lib/features/<nama_fitur>/`, pisahkan Riverpod provider dari UI widget. Ikuti struktur di `docs/arsitektur.md` bagian 8.
- **Next.js**: satu route API = satu folder di `app/api/<nama>/route.ts`, validasi setiap input POST/PATCH pakai Zod sebelum diproses.
- Semua fungsi async wajib pakai try-catch dengan pesan error yang jelas (bukan generic "error occurred").
- Tulis komentar singkat dalam Bahasa Indonesia untuk logic yang tidak jelas dari nama variabel/fungsi saja — saya pemula dan belajar dari membaca kode ini.
- Nama file, folder, dan variabel tetap pakai Bahasa Inggris (konvensi standar), komentar penjelasan boleh Bahasa Indonesia.
- Hindari file lebih dari ~300 baris — pecah jadi beberapa file/komponen kalau sudah terlalu panjang.
