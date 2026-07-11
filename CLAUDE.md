# CLAUDE.md

Ini file yang otomatis dibaca Claude Code di setiap sesi (project root). Isinya meng-import `AGENTS.md` supaya kontennya tetap satu sumber (tidak dobel-tulis) dan tetap kompatibel kalau kamu suatu saat pakai tool AI lain juga.

@AGENTS.md

## Catatan Khusus Claude Code

- **Plan Mode aktif secara default** lewat `.claude/settings.json` (`defaultMode: plan`). Ini artinya Claude akan selalu membaca & merencanakan dulu, menampilkan plan-nya, dan menunggu kamu approve sebelum benar-benar mengedit file atau menjalankan command — sesuai permintaanmu untuk tetap bisa cek manual. Kalau suatu saat plan mode terasa tidak aktif, tekan `Shift+Tab` dua kali atau ketik `/plan` untuk masuk manual.
- Custom slash command tersedia: ketik `/new-feature <nama fitur>` untuk memulai task baru mengikuti alur review yang benar, atau `/verify-and-screenshot <halaman>` untuk minta verifikasi visual setelah perubahan UI.
- File di `.claude/rules/*.md` dibaca otomatis tanpa perlu kamu sebut manual — berisi aturan arsitektur, gaya kode, keamanan/anti-halusinasi, dan kolom dinamis/backfill.
- File di `.claude/skills/design-system/SKILL.md` otomatis aktif kalau task-nya menyangkut UI, dan akan mengarahkan Claude membaca `DESIGN.md` di root untuk token visual — jangan biarkan Claude menebak warna/style sendiri.
- Kalau Claude minta kamu paste API key langsung di chat, TOLAK — API key harus masuk `.env.local` manual olehmu, bukan lewat percakapan (supaya tidak ikut ke riwayat chat/log).
