Fitur/task yang dikerjakan: $ARGUMENTS

Langkah wajib untuk task ini:

1. Baca ulang bagian relevan di `docs/arsitektur.md` untuk fitur di atas — jangan asumsi, cek dulu apakah sudah ada spesifikasinya di sana.
2. Masuk ke Plan Mode (kamu seharusnya sudah di Plan Mode secara default — kalau belum, berhenti dan minta saya konfirmasi dulu). Jelaskan rencana: file apa saja yang akan dibuat/diubah, apakah ada perubahan skema database.
3. Tampilkan plan itu ke saya dalam bahasa sederhana dan **tunggu saya approve** sebelum keluar dari Plan Mode dan mulai eksekusi.
4. Setelah kode ditulis, jalankan test/lint yang relevan kalau ada.
5. Untuk perubahan yang menyentuh UI, jalankan aplikasinya dan verifikasi hasilnya secara visual sebelum bilang selesai.
6. Tambahkan ringkasan singkat ke `docs/progress-log.md` (task apa, file yang berubah, status).

Ikuti semua rule di `.claude/rules/` — terutama jangan pernah eksekusi ALTER TABLE langsung (lihat `dynamic-schema-and-backfill.md`) dan jangan taruh API key di kode client (lihat `security-and-grounding.md`).
