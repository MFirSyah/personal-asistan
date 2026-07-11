# Rule: Skema Dinamis & Smart Backfill (DDL vs DML)

Aturan ini menjawab kebutuhan spesifik: kolom data yang mudah ditambah/dihapus seperti Notion, dan pengisian data lama secara bertahap — tanpa membuka celah AI mengarang data personal. Detail lengkap ada di `docs/arsitektur.md` bagian 22.

## Prinsip Dasar

- **DML (insert/update/hapus baris)**: AI/tool BOLEH eksekusi langsung — ini yang sudah didesain sejak awal (`logExpense`, dst).
- **DDL (`ALTER TABLE`, tambah/hapus kolom asli)**: AI TIDAK BOLEH eksekusi langsung, dalam kondisi apapun, walau diminta user secara langsung di chat AI end-user. Perubahan struktur database hanya boleh lewat migration file yang direview manusia (kamu atau saya sebagai developer).

## Kolom Fleksibel Ala Notion (Default untuk Field Baru)

Untuk field yang user minta tambah/hapus lewat UI "Kontrol Data" (bukan lewat AI chat):
- Field baru **default** masuk ke `custom_fields JSONB` + didaftarkan di tabel `custom_field_definitions`, BUKAN `ALTER TABLE`.
- Hapus field = hapus baris di `custom_field_definitions`, JANGAN `ALTER TABLE DROP COLUMN` dan jangan hapus data lama di dalam JSONB (biarkan tersimpan, tidak ditampilkan).
- Endpoint CRUD field: `POST/DELETE /api/data/custom-fields` — ini murni operasi DML ke tabel metadata, aman untuk diimplementasikan seperti CRUD biasa.

## Kalau Memang Perlu Kolom Asli (Bukan JSONB)

Kasus ini jarang — biasanya karena field itu perlu masuk whitelist chart di widget analisis (bagian 11). Alurnya:
1. AI/tool cuma boleh INSERT ke tabel `schema_change_requests` (mengajukan, bukan eksekusi).
2. Implementasi ALTER TABLE sungguhan dilakukan lewat Plan Mode yang di-review manual — treat seperti perubahan skema database biasa (lihat `.claude/rules/architecture.md`).
3. Setelah kolom dibuat, tentukan strategi pengisian data lama SEBELUM dianggap selesai (lihat bawah) — jangan biarkan kolom baru penuh `NULL` tanpa keputusan eksplisit.

## Strategi Backfill Data Lama — Wajib Dipilih Salah Satu

| Jenis data baru | Strategi |
|---|---|
| Ada nilai default yang jelas benar untuk semua baris lama | `DEFAULT` di level SQL saat `ALTER TABLE` |
| Bisa dihitung dari kolom lain yang sudah ada | Migration script sekali jalan |
| Bisa disimpulkan dari konteks baris (deskripsi, kategori terkait) tapi butuh reasoning | Tool `suggestFieldValues` → tulis ke `ai_suggestions` JSONB (BUKAN langsung ke kolom asli) → user review & approve manual di web app |
| Tidak mungkin diketahui dari data yang ada (butuh ingatan personal user) | JANGAN dipaksa isi. Biarkan `NULL`, render sebagai "tidak tercatat" di UI |

## Larangan Eksplisit

- AI TIDAK BOLEH menulis nilai backfill langsung ke kolom asli tanpa approval user — selalu lewat staging `ai_suggestions` dulu.
- AI TIDAK BOLEH infer nilai dari "pengetahuan umum" atau asumsi di luar data baris itu sendiri (misal menebak "biasanya orang belanja di sini pakai kartu debit" tanpa ada sinyal apapun di baris tersebut) — ini persis kategori halusinasi yang dilarang di `security-and-grounding.md`.
- Kalau ragu apakah sebuah field "inferable" atau tidak, defaultkan ke TIDAK inferable (aman) dan tanyakan ke saya dulu.
