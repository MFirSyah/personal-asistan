---
name: design-system
description: When creating or modifying any UI screen or component in the mobile (Flutter) or web (Next.js) app, this skill provides the exact glassmorphism design tokens (colors, blur, radius, spacing, light/dark variants) that must be used instead of inventing new values.
---

# Design System — Glassmorphism (Light / Dark / System)

Baca `DESIGN.md` di root project untuk daftar token lengkap SEBELUM membuat komponen UI apapun. Token itu diambil langsung dari hasil desain Google Stitch yang sudah disetujui.

## Aturan Inti

- Semua card/panel/bubble/nav bar memakai efek glass: `backdrop-filter: blur(...)`, background semi-transparan, border tipis semi-transparan, rounded corner — nilai persisnya ambil dari `DESIGN.md`, jangan menebak.
- Setiap komponen harus punya varian **light** DAN **dark** yang eksplisit sesuai token — bukan sekadar invert warna otomatis.
- Theme switching harus mendukung 3 opsi: Light, Dark, System (ikuti setting OS). Implementasi:
  - Flutter: `ThemeMode.system` + `ThemeData` terpisah untuk light & dark, keduanya memakai token dari `DESIGN.md`.
  - Next.js: library `next-themes` dengan `attribute="class"`, styling dark memakai Tailwind `dark:` variant.
- Kalau ada kebutuhan visual yang tidak ada di `DESIGN.md` (misal warna kategori baru untuk chart), tanyakan dulu ke saya sebelum menciptakan nilai sendiri, supaya tetap konsisten dengan desain asli dari Stitch.
