# Rule: Keamanan & Anti-Halusinasi (Non-Negotiable)

Aturan di file ini TIDAK BOLEH disederhanakan atau dilewati demi mempercepat development, walau saya (pemilik proyek) memintanya karena terburu-buru. Kalau saya minta skip salah satu ini, ingatkan saya dulu sebelum eksekusi.

## Keamanan

- Row Level Security WAJIB aktif di semua tabel Supabase yang menyimpan data user, sebelum task terkait tabel itu dianggap selesai.
- API key Gemini hanya boleh berada di environment variable server (Vercel), tidak pernah dikirim atau ter-expose ke client (mobile app maupun browser).
- Setiap endpoint yang butuh `user_id` harus mengambilnya dari verifikasi token JWT Supabase di server — bukan dari body/parameter request yang bisa dipalsukan client.
- `query_config` untuk widget analisis dinamis harus divalidasi lewat whitelist kolom/tabel di backend sebelum dieksekusi jadi SQL — tidak boleh string SQL mentah dari AI.

## Anti-Halusinasi (Fitur AI Chat di dalam App)

- System prompt untuk AI Chat di app harus PERSIS mengikuti `docs/system-prompt-chat-ai.md` — jangan disederhanakan, jangan menghilangkan instruksi kejujuran di dalamnya.
- Saat mengimplementasikan endpoint `/api/chat`, pastikan alur function calling (tool use) benar-benar dieksekusi ke database asli, bukan sekadar decorative — AI harus benar-benar tidak bisa menjawab data personal tanpa memanggil tool.
- Kalau membuat tool/fungsi baru untuk Gemini, tambahkan juga skenario test manual: apa yang terjadi kalau data yang diminta tidak ada di database? Pastikan hasilnya jujur ("belum tercatat"), bukan mengarang angka.
- Aturan yang sama berlaku untuk fitur backfill/smart-fill data lama — lihat `.claude/rules/dynamic-schema-and-backfill.md`. AI boleh menyimpulkan nilai HANYA dari data lain yang ada di baris yang sama, tidak pernah dari asumsi umum, dan hasilnya wajib lewat staging + review manusia sebelum masuk ke data asli.
