# Rule: Ikuti Arsitektur yang Sudah Disetujui

- Skema database mengikuti `docs/arsitektur.md` bagian 2 persis. Kalau perlu menambah kolom/tabel baru untuk menyelesaikan task, tulis alasannya di Implementation Plan dan minta persetujuan dulu — jangan langsung eksekusi perubahan skema.
- Endpoint API mengikuti pola REST yang sudah dicontohkan di dokumen arsitektur (parameterized query, validasi Zod, selalu cek `user_id` dari token, bukan dari body request).
- Fitur AI Chat WAJIB pakai Gemini function calling untuk data personal (lihat `docs/arsitektur.md` bagian 6 & 14 dan `docs/system-prompt-chat-ai.md`) — bukan jawaban generatif bebas.
- Widget analisis dinamis di web app WAJIB pakai pendekatan "Opsi A": AI membuat spesifikasi JSON (`query_config`) yang divalidasi whitelist, backend yang merakit jadi SQL aman. AI TIDAK BOLEH generate SQL atau kode React bebas untuk analisis.
- Notification listener hanya untuk Android (`NotificationListenerService`). Jangan coba implementasi background notification reading di iOS — itu tidak didukung platform.
- Kalau ragu apakah sesuatu sudah diatur di dokumen arsitektur atau belum, cek dulu ke `docs/arsitektur.md` sebelum bertanya ke saya.
