# Prompt Google Stitch — Glassmorphism, Light/Dark/System

# Prompt Google Stitch — Glassmorphism, Light/Dark/System

## Penting: Mobile dan Web Itu Dua Project Terpisah

Stitch mewajibkan kamu memilih platform (**App/Mobile** atau **Web**) saat membuat project baru — canvas dan ukuran komponennya langsung menyesuaikan pilihan itu, dan tidak bisa diganti di tengah jalan dalam satu project yang sama. Jadi kamu akan buat **2 project terpisah**:

- **Project 1 — Mobile**: Prompt A, B, C (Chat, Analisis, Setting)
- **Project 2 — Web**: Prompt D, E (Kontrol Data, Kontrol Analisis)

Supaya kedua project tetap konsisten secara visual (bukan dua gaya glassmorphism yang beda), pakai salah satu cara ini:

1. **Cara termudah**: setelah Project 1 (Mobile) selesai dan kamu puas dengan hasilnya, ekspor **DESIGN.md** dari project itu (menu export di Stitch), lalu saat membuat Project 2 (Web), impor DESIGN.md itu sebagai konteks awal sebelum kasih Prompt D. Stitch akan otomatis mengikuti token warna/blur/radius yang sama.
2. **Cara manual (fallback, lebih pasti)**: salin persis blok "Visual direction" dari Prompt A ke Prompt D dan E (sudah saya siapkan di bawah, jadi kamu tidak perlu copy manual) — supaya walau tidak pakai fitur DESIGN.md, kedua project tetap deskripsi visualnya identik.

Di dalam **satu project yang sama** (misal ketiga layar mobile: Chat → Analisis → Setting), Stitch memang mempertahankan konteks antar prompt lanjutan — jadi Prompt B dan C boleh tetap "melanjutkan" dari Prompt A di project Mobile yang sama. Yang tidak bisa dilanjutkan adalah lintas platform (Mobile → Web).

Setelah kedua project jadi, catat token warna/blur/radius final ke `DESIGN.md` — file itu yang nanti dibaca Claude Code, jadi ini tetap jadi sumber kebenaran tunggal terlepas dari project Stitch mana asalnya.

---

## PROJECT 1 — MOBILE APP

### Prompt A — Fondasi Desain (generate pertama kali, layar Chat)

**Platform**: pilih **App/Mobile** saat membuat project baru.

```
Context: I'm designing a personal AI assistant mobile app that monitors phone
notifications, tracks personal finance and daily activity, and lets the user
chat with an AI to manage everything. Target user: an individual professional
who wants a calm, premium, focused tool — not a busy consumer app.

Goal of this screen: The AI chat home screen, the app's primary screen.

Screen type: Mobile chat interface, portrait, iOS-style, with bottom tab
navigation.

Layout & hierarchy:
- Top: minimal header with AI avatar, AI name, and current date
- Middle: scrollable chat conversation — user messages right-aligned in a
  solid-tinted glass bubble, AI messages left-aligned in a lighter glass
  bubble
- Bottom: floating glass input bar with text field, attachment icon, and
  send button
- Bottom navigation: 3 tabs — "Analisis", "Chat" (center, active, slightly
  elevated), "Setting"

Components: chat bubbles, floating input bar, bottom tab bar with 3 icons,
circular AI avatar, subtle typing-indicator dots

Visual direction — glassmorphism:
- Translucent frosted-glass panels: backdrop blur around 20-24px, background
  opacity roughly 15-25%
- Thin 1px semi-transparent border on every glass panel (white-ish in light
  mode, light-gray in dark mode)
- Soft layered shadows for depth, rounded corners 20-24px on cards and
  bubbles, 16px on smaller elements
- Background: soft gradient mesh so the glass blur is visible — pale blue
  into lavender for light mode, deep navy into charcoal-purple for dark mode
- Typography: clean modern sans-serif, strong contrast against the glass for
  readability despite transparency
- One single vibrant accent color (soft indigo/violet), used sparingly for
  the active tab, send button, and badges — not spread across the whole UI

Constraints:
- Generate BOTH a light mode and a dark mode version of this exact screen
- Keep the hierarchy calm and uncluttered — no heavy decorative gradients
  beyond the background, no unnecessary icons
- Optimize for one-hand mobile use, accessible text size and spacing

Output expectation: A structured, high-fidelity mobile UI screen (light and
dark variant) that establishes the core glassmorphism design system I will
reuse for the rest of the app.
```

### Prompt B — Tab Analisis (lanjutan di project Mobile yang sama)

```
Now generate the "Analisis" tab, keeping the exact same glassmorphism style,
color palette, blur amount, and border-radius established in the previous
screen — light and dark variant.

Goal of this screen: Give a quick overview of finance, activity, and
important notifications without needing to ask the AI.

Layout & hierarchy:
- Top: header "Analisis" + current month selector
- A large glass card showing total spending/income this month
- A horizontal scrollable row of smaller glass cards for spending categories
- A section listing custom analysis widgets the user has created via chat
  (small chart previews — bar, pie, line — inside glass cards, 2-column grid)
- A badge/counter for unread important notifications
- Same bottom navigation as before, "Analisis" tab active

Constraints: same visual language as Prompt A, no new colors introduced.

Output expectation: light and dark variant of this screen.
```

### Prompt C — Tab Setting (lanjutan di project Mobile yang sama)

```
Now generate the "Setting" tab, same glassmorphism style as before — light
and dark variant.

Layout & hierarchy:
- Top: profile glass card — circular profile photo, user name, AI name
  subtitle
- A grouped list of settings rows inside a glass panel: "Nama AI", "Nama
  User", "Foto Profil", "Preferensi AI", "Kontak Penting", "Quiet Hours"
- A theme selector row with 3 segmented options: Light / Dark / System
- Lower section, visually separated: "Laporkan Crash", "Logout" (red/warning
  tint), and app version text at the very bottom

Constraints: same visual language as before, theme selector should look like
a glass segmented control with the active option highlighted using the
accent color.

Output expectation: light and dark variant of this screen.
```

---

## PROJECT 2 — WEB APP

Buat project baru, pilih platform **Web** saat membuat. Kalau kamu sudah punya DESIGN.md dari Project 1, import dulu sebelum kirim Prompt D. Kalau tidak, blok "Visual direction" di bawah sudah ditulis ulang persis sama dengan Project 1 supaya hasilnya tetap konsisten tanpa fitur import.

### Prompt D — Kontrol Data (generate pertama kali di project Web ini)

```
Context: I'm designing the web dashboard companion to a personal AI
assistant mobile app (finance/activity tracking + notification monitoring).
This web app is used for heavier data management that doesn't fit well on a
small mobile screen.

Goal of this screen: Let the user manage raw data (finance, activity,
notifications) in a table with full CRUD.

Screen type: Desktop web app, left sidebar navigation + main content area.

Layout & hierarchy:
- Left sidebar (glass panel, full height): app logo, nav items "Kontrol
  Data" (active) and "Kontrol Analisis", user avatar at bottom
- Top bar: page title "Kontrol Data", tabs for Finance / Activity /
  Notifications, a search field and filter button (glass pill style)
- Main area: a data table inside a glass container — rows have subtle
  dividers, hover state highlights the row, each row has edit/delete icon
  buttons, pagination at the bottom

Visual direction — glassmorphism (must match the design system below
exactly):
- Translucent frosted-glass panels: backdrop blur around 20-24px, background
  opacity roughly 15-25%
- Thin 1px semi-transparent border on every glass panel (white-ish in light
  mode, light-gray in dark mode)
- Soft layered shadows for depth, rounded corners 20-24px on cards, 16px on
  smaller elements
- Background: soft gradient mesh — pale blue into lavender for light mode,
  deep navy into charcoal-purple for dark mode
- Typography: clean modern sans-serif, strong contrast against the glass
- One single vibrant accent color (soft indigo/violet) used sparingly

Constraints:
- Generate BOTH a light mode and a dark mode version of this exact screen
- Desktop information-dense layout without losing the glass aesthetic

Output expectation: A structured, high-fidelity desktop web UI screen
(light and dark variant) that establishes the design system for this web
app, matching the companion mobile app's glassmorphism style described
above.
```

### Prompt E — Kontrol Analisis (lanjutan di project Web yang sama)

```
Now generate the "Kontrol Analisis" page for the same web app, same sidebar
and visual language as the previous screen.

Layout & hierarchy:
- Same left sidebar, "Kontrol Analisis" active
- Top bar: page title, a button "+ Tambah Widget" (glass button, accent
  color)
- Main area: a responsive grid of glass widget cards (2-3 columns), each
  card contains a chart (mix of bar/pie/line/number-card placeholders), a
  small title, and a drag handle + pin icon in the corner

Constraints: same visual language as before, charts should look legible
against the glass background (use solid enough chart colors, not
translucent).

Output expectation: light and dark variant of this screen.
```

