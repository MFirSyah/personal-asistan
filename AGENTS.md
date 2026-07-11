# AGENTS.md — Konteks Proyek untuk AI Agent

File ini dibaca otomatis oleh Claude Code (lewat CLAUDE.md yang meng-import file ini) dan tool AI lain yang kompatibel, di awal setiap sesi. Isinya adalah "konstitusi" proyek — instruksi yang harus selalu diikuti tanpa perlu diulang manual tiap kali chat.

## Tentang Proyek

Aplikasi personal assistant cross-platform:
- **Mobile app** (Flutter) — 3 tab: Analisis, Chat (AI Gemini), Setting. Fitur inti: memantau notifikasi smartphone dan mencatat keuangan/aktivitas.
- **Web app** (Next.js di Vercel) — Kontrol Data (CRUD) dan Kontrol Analisis (dashboard widget dinamis).
- Backend: Vercel API Routes, Database: Supabase Postgres, AI: Gemini API.

## WAJIB DIBACA SEBELUM MENGERJAKAN APAPUN

1. **`docs/arsitektur.md`** — spesifikasi arsitektur lengkap yang SUDAH DISETUJUI (skema database, desain API, alur autentikasi, dll). Semua keputusan teknis harus mengikuti dokumen ini. Jangan improvisasi arsitektur sendiri.
2. **`DESIGN.md`** — token desain (warna, efek glass, radius, spacing) hasil generate dari Google Stitch. Semua UI WAJIB memakai token ini persis, jangan menebak warna/style sendiri.
3. **`docs/system-prompt-chat-ai.md`** — system prompt resmi untuk fitur AI Chat di dalam aplikasi (BUKAN untuk Claude Code sendiri, ini untuk AI yang dipakai end-user di tab Chat). Implementasikan persis seperti yang tertulis di file itu saat membuat endpoint `/api/chat`.

## Konteks Penting Tentang Saya (Pemilik Proyek)

Saya **pemula dalam coding**. Karena itu:
- Jelaskan rencana besar dengan bahasa sederhana sebelum eksekusi.
- Saya akan memeriksa hasil kerja secara manual — jangan asumsikan saya otomatis setuju. Selalu tunggu approval eksplisit untuk perubahan besar (skema database, endpoint baru, alur autentikasi, biaya API).
- Kalau ada istilah teknis penting, beri penjelasan singkat, bukan cuma istilahnya saja.

## Tech Stack (ringkas — detail lengkap ada di docs/arsitektur.md)

| Bagian | Teknologi |
|---|---|
| Mobile | Flutter + Riverpod + Drift (local DB) |
| Web | Next.js (App Router) + TanStack Query/Table |
| Database | Supabase Postgres (Row Level Security WAJIB aktif) |
| Auth | Supabase Auth (dipakai bersama mobile & web) |
| AI Chat (dalam app) | Gemini API — **`gemini-2.5-flash` untuk SEMUA fitur** (chat & klasifikasi) sebagai default, karena Gemini 2.5 Pro sudah tidak gratis sejak April 2026. Selalu lewat backend, TIDAK PERNAH API key di client. Lihat `docs/arsitektur.md` bagian 16.1 sebelum mengubah model ke Pro di mana pun. |

## Struktur Folder

```
apps/mobile/   -> Flutter app
apps/web/      -> Next.js app
docs/          -> dokumentasi (arsitektur, design system, system prompt, progress log)
.claude/        -> rules, commands, skills, settings untuk Claude Code
```

## Aturan Non-Negotiable

- Jangan taruh API key apapun di kode client (mobile/web frontend). Semua panggilan Gemini lewat backend.
- Aktifkan Row Level Security di setiap tabel baru sebelum dianggap selesai.
- Fitur AI Chat di dalam app TIDAK BOLEH menjawab data personal (keuangan/aktivitas/notifikasi) dari "ingatan"/generatif — wajib pakai function calling ke data asli, dan wajib jujur bilang "tidak tahu/tidak ada tool untuk itu" kalau memang tidak bisa. Lihat `docs/system-prompt-chat-ai.md`.
- Widget analisis dinamis di web app WAJIB pakai pendekatan "spesifikasi JSON + whitelist kolom" (Opsi A di docs/arsitektur.md bagian 11) — AI TIDAK BOLEH generate SQL/kode bebas.
- AI TIDAK BOLEH eksekusi `ALTER TABLE` atau perubahan struktur database apapun secara langsung — field baru dari user default pakai kolom `custom_fields` (JSONB), bukan kolom asli. Lihat `.claude/rules/dynamic-schema-and-backfill.md` untuk detail lengkap termasuk strategi pengisian data lama (backfill) yang aman dari halusinasi.
- Development dilakukan bertahap sesuai urutan di `docs/arsitektur.md` bagian 23 — jangan loncat-loncat fitur besar sekaligus.
- Setiap selesai satu task, tambahkan ringkasan singkat ke `docs/progress-log.md`.
