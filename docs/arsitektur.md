# Arsitektur Lengkap: Personal Assistant App (Notification Monitor + AI Chat)

## 0. Catatan Penting Sebelum Mulai

**Keterbatasan platform:**
- **Android**: bisa membaca *semua* notifikasi via `NotificationListenerService`. Fitur inti kamu (pantau notifikasi) full berfungsi.
- **iOS**: Apple tidak mengizinkan third-party app membaca notifikasi app lain. Tidak ada API publik untuk ini, dan tidak akan lolos App Store review kalau nekat pakai workaround. Opsi realistis di iOS: (a) user share/forward notifikasi manual ke app, (b) integrasi Shortcuts + Automation, (c) app hanya jalan sebagai asisten tanpa fitur monitor notifikasi.
- **Rekomendasi**: bangun dulu untuk Android sebagai platform utama, buat iOS versi "lite" belakangan.

---

## 1. Diagram Arsitektur

```
┌─────────────────────────────────────────────────────────────┐
│                      FLUTTER APP (Client)                     │
│  ┌───────────┐   ┌───────────┐   ┌───────────┐               │
│  │  Analisis │   │   Chat    │   │  Setting  │  <- 3 Tab Nav  │
│  └─────┬─────┘   └─────┬─────┘   └─────┬─────┘               │
│        │               │               │                      │
│  ┌─────┴───────────────┴───────────────┴─────┐               │
│  │         Local DB (Hive/SQLite/Drift)        │  <- offline  │
│  └─────────────────┬────────────────────────┘               │
│  ┌─────────────────┴────────────────────────┐               │
│  │  Native Android: NotificationListenerService│               │
│  └───────────────────────────────────────────┘               │
└───────────────────────┬─────────────────────────────────────┘
                         │ HTTPS (REST/tRPC)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              VERCEL BACKEND (Next.js API Routes)              │
│  /api/auth   /api/notifications   /api/finance                │
│  /api/activity   /api/analytics   /api/chat (Gemini proxy)    │
└───────────┬─────────────────────────────┬─────────────────────┘
            │                             │
            ▼                             ▼
┌───────────────────────┐     ┌───────────────────────────────┐
│  Database (Postgres)   │     │   Gemini API (Function Calling) │
│  Supabase / Neon       │     │   Google AI Studio / Vertex AI  │
└───────────────────────┘     └───────────────────────────────┘
```

---

## 2. Skema Database (PostgreSQL)

```sql
-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  photo_url TEXT,
  ai_name TEXT DEFAULT 'Asisten',
  ai_preferences JSONB DEFAULT '{}', -- tone, gaya bahasa, batas kalimat, dsb
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Log notifikasi yang masuk & dianggap penting
CREATE TABLE notifications_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  source_app TEXT NOT NULL,       -- misal: com.whatsapp
  title TEXT,
  body TEXT,
  category TEXT,                  -- 'meeting', 'finance', 'urgent', 'lainnya'
  is_important BOOLEAN DEFAULT false,
  is_actioned BOOLEAN DEFAULT false, -- sudah "didatangi" user?
  raw_payload JSONB,
  received_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pencatatan keuangan (hasil ekstraksi dari chat/notifikasi)
CREATE TABLE finance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT CHECK (type IN ('income','expense')),
  amount NUMERIC(14,2) NOT NULL,
  category TEXT,                  -- 'makan', 'transport', 'gaji', dst
  description TEXT,
  source TEXT,                    -- 'chat', 'notification', 'manual'
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Log aktivitas harian
CREATE TABLE activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  activity TEXT NOT NULL,
  category TEXT,                  -- 'kerja', 'personal', 'kesehatan'
  source TEXT,                    -- 'chat', 'notification'
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Riwayat chat (untuk konteks & audit, bukan untuk generate bebas)
CREATE TABLE chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('user','assistant','tool')),
  content TEXT,
  tool_calls JSONB,               -- jika role='assistant' memanggil fungsi
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index penting
CREATE INDEX idx_notif_user_time ON notifications_log(user_id, received_at DESC);
CREATE INDEX idx_finance_user_time ON finance_records(user_id, occurred_at DESC);
CREATE INDEX idx_activity_user_time ON activity_log(user_id, occurred_at DESC);
```

---

## 3. Native Layer — Android Notification Listener

Ini bagian yang **tidak bisa** ditulis pakai Dart murni, harus native Kotlin lalu dijembatani ke Flutter via `MethodChannel`/`EventChannel`.

**Kotlin — NotificationListenerService**
```kotlin
class NotifListener : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val extras = sbn.notification.extras
        val title = extras.getString(Notification.EXTRA_TITLE) ?: ""
        val text = extras.getString(Notification.EXTRA_TEXT) ?: ""
        val pkg = sbn.packageName

        // Filter cepat di device dulu (hemat baterai & biaya API)
        val payload = mapOf(
            "package" to pkg,
            "title" to title,
            "body" to text,
            "postTime" to sbn.postTime
        )

        // Kirim ke Flutter lewat EventChannel
        NotifEventStreamHandler.send(payload)
    }
}
```

**Manifest**
```xml
<service
    android:name=".NotifListener"
    android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"
    android:exported="false">
    <intent-filter>
        <action android:name="android.service.notification.NotificationListenerService" />
    </intent-filter>
</service>
```

**Flow di sisi Flutter:**
1. User diarahkan ke `Settings > Notification Access` untuk grant izin (ini wajib manual, tidak bisa via permission dialog biasa)
2. `EventChannel` streaming notifikasi mentah ke Dart
3. Rule-based filter ringan di Dart (keyword: "meeting", "jatuh tempo", "OTP", nama kontak penting, dll) — buang noise (notifikasi game, iklan)
4. Yang lolos filter → simpan ke local DB → antre untuk sync ke backend
5. Backend yang memutuskan level "penting" final pakai Gemini (klasifikasi lebih akurat), lalu update `is_important`

---

## 4. Local-First Sync Strategy

Supaya app tetap responsif walau koneksi jelek:

- **Local DB**: Drift (SQLite wrapper) atau Hive di Flutter
- **Write pattern**: semua write (chat, catat keuangan manual, notifikasi masuk) → local DB dulu → tandai `synced: false`
- **Background sync**: `WorkManager` (Android) trigger tiap beberapa menit / saat online kembali, push batch ke `/api/sync`
- **Konflik**: pakai `updated_at` timestamp, last-write-wins cukup untuk use case personal (bukan kolaboratif)

---

## 5. Backend — Vercel (Next.js API Routes)

Struktur folder:
```
/app/api
  /auth/[...nextauth]/route.ts
  /notifications/route.ts        -- POST (sync), GET (list)
  /finance/route.ts
  /activity/route.ts
  /analytics/summary/route.ts    -- agregasi untuk tab Analisis
  /chat/route.ts                 -- proxy ke Gemini + function calling
```

**Kenapa Gemini API HARUS di backend, bukan di client:**
API key yang ditaruh di app (walau di-obfuscate) bisa diekstrak dari APK dengan tools decompile. Kalau bocor, orang lain bisa pakai kuota/biaya kamu. Selalu proxy lewat server milikmu sendiri.

**Contoh `/api/chat/route.ts` (disederhanakan)**
```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const tools = [{
  functionDeclarations: [
    {
      name: "getFinanceSummary",
      description: "Ambil ringkasan keuangan user dalam rentang waktu tertentu",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string" },
          endDate: { type: "string" }
        },
        required: ["startDate", "endDate"]
      }
    },
    {
      name: "logExpense",
      description: "Catat pengeluaran/pemasukan baru",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["income", "expense"] },
          amount: { type: "number" },
          category: { type: "string" },
          description: { type: "string" }
        },
        required: ["type", "amount"]
      }
    },
    {
      name: "getYesterdayActivity",
      description: "Ambil log aktivitas user kemarin",
      parameters: { type: "object", properties: {} }
    },
    {
      name: "getImportantNotifications",
      description: "Ambil notifikasi penting yang belum ditindaklanjuti",
      parameters: { type: "object", properties: {} }
    }
  ]
}];

export async function POST(req: Request) {
  const { message, userId } = await req.json();
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash", // default gratis — lihat catatan biaya di bagian 16.1
    tools,
    systemInstruction: SYSTEM_PROMPT // lihat bagian 6
  });

  const chat = model.startChat({ history: await loadHistory(userId) });
  let result = await chat.sendMessage(message);

  // Loop selama model minta panggil fungsi
  while (result.response.functionCalls()?.length) {
    const calls = result.response.functionCalls();
    const responses = await Promise.all(
      calls.map(call => executeToolCall(call, userId)) // query DB asli
    );
    result = await chat.sendMessage(
      responses.map((r, i) => ({
        functionResponse: { name: calls[i].name, response: r }
      }))
    );
  }

  await saveChatHistory(userId, message, result.response.text());
  return Response.json({ reply: result.response.text() });
}
```

---

## 6. Desain "AI Tidak Halu" — System Prompt & Grounding

Prinsip: **Gemini tidak boleh menjawab dari ingatan/generatif untuk data personal.** Semua angka/fakta harus lewat function call ke database asli.

**System prompt contoh:**
```
Kamu adalah asisten pribadi bernama {ai_name} untuk {user_name}.
ATURAN KETAT:
1. Untuk pertanyaan tentang keuangan, aktivitas, atau notifikasi,
   WAJIB panggil tool yang sesuai. Jangan pernah menebak angka.
2. Jika data tidak ditemukan lewat tool, katakan terus terang
   "datanya belum tercatat", jangan mengarang.
3. Saat mencatat sesuatu dari chat user (misal "tadi abis makan
   50rb"), konfirmasi dulu sebelum benar-benar disimpan via
   logExpense/logActivity.
4. Jawaban singkat, actionable, tidak bertele-tele.
```

Teknik tambahan untuk mengurangi halusinasi:
- **Temperature rendah** (0.2–0.4) untuk tugas pencatatan/analisis, temperature lebih tinggi hanya untuk mode "diskusi bebas" kalau user minta brainstorm
- **Confirmation step**: sebelum `logExpense`/`logActivity` benar-benar commit ke DB, tampilkan dulu preview ke user (card konfirmasi di UI chat) — mencegah salah catat dari misinterpretasi AI
- **Validasi server-side**: backend tetap validasi angka/format sebelum insert ke DB, jangan percaya penuh output model

---

## 7. Tab Analisis — Tidak Perlu Selalu Lewat AI

Untuk performa & biaya, tab Analisis **langsung query endpoint agregasi**, bukan lewat Gemini:

```typescript
// /api/analytics/summary/route.ts
export async function GET(req: Request) {
  const { userId, period } = parseParams(req);
  const [finance, activity, notifCount] = await Promise.all([
    db.query(`SELECT type, SUM(amount) FROM finance_records
               WHERE user_id=$1 AND occurred_at >= $2 GROUP BY type`, [userId, period.start]),
    db.query(`SELECT category, COUNT(*) FROM activity_log
               WHERE user_id=$1 AND occurred_at >= $2 GROUP BY category`, [userId, period.start]),
    db.query(`SELECT COUNT(*) FROM notifications_log
               WHERE user_id=$1 AND is_important=true AND is_actioned=false`, [userId])
  ]);
  return Response.json({ finance, activity, notifCount });
}
```
Gemini baru dilibatkan kalau user secara eksplisit tanya di tab Chat, misalnya "kenapa pengeluaran bulan ini naik?" — di situ baru relevan pakai tool `getFinanceSummary` + reasoning.

---

## 8. Struktur Aplikasi Flutter

```
lib/
  main.dart
  core/
    api_client.dart          -- Dio/http wrapper ke Vercel API
    local_db.dart            -- Drift setup
    notification_bridge.dart -- MethodChannel ke native Android
  features/
    analytics/
      analytics_page.dart
      analytics_provider.dart
    chat/
      chat_page.dart
      chat_provider.dart
      widgets/tool_confirmation_card.dart
    settings/
      settings_page.dart
      settings_provider.dart
  shared/
    widgets/bottom_nav.dart
    models/
```
- **State management**: Riverpod (lebih cocok untuk app dengan banyak async data source: local DB, API, native stream)
- **Bottom nav**: `IndexedStack` + 3 halaman agar state tiap tab tidak reset saat pindah tab

---

## 9. Keamanan

| Aspek | Solusi |
|---|---|
| API key Gemini | Simpan di Vercel Environment Variables, tidak pernah dikirim ke client |
| Auth user | NextAuth / Supabase Auth + JWT, token disimpan di secure storage (`flutter_secure_storage`) |
| Data sensitif (isi notifikasi) | Enkripsi at-rest di DB kalau memuat info sangat pribadi (opsional, tergantung kebutuhan) |
| Rate limiting | Middleware di `/api/chat` untuk cegah spam ke Gemini (biaya membengkak) |
| Row Level Security | Kalau pakai Supabase, aktifkan RLS supaya user A tidak bisa akses data user B |

---

## 10. Ringkasan Tech Stack

| Layer | Pilihan |
|---|---|
| Client | Flutter (Riverpod) |
| Notification capture | Kotlin `NotificationListenerService` (Android only) |
| Local DB | Drift / Hive |
| Backend | Next.js API Routes di Vercel |
| Database cloud | Supabase Postgres / Neon |
| AI | Gemini API (function calling, server-side only) |
| Auth | Supabase Auth / NextAuth |
| Storage foto profil | Supabase Storage / Vercel Blob |
| Crash reporting | Sentry |
| Background sync | WorkManager (Android) |

---

## 11. Detail Implementasi — Dynamic Analysis Widget (Opsi A)

Alur lengkap: kamu chat di mobile app → AI bikin "spesifikasi" analisis → tersimpan di DB → muncul permanen di web app tanpa perlu tanya AI lagi.

### 11.1 Alur End-to-End

```
[Mobile: Tab Chat]
   "Analisis pengeluaran per kategori bulan ini, pie chart"
            │
            ▼
[Vercel /api/chat] → Gemini function calling
            │  Gemini panggil tool: createAnalysisWidget(...)
            ▼
[Backend: validasi & simpan] → INSERT INTO custom_analyses
            │
            ▼
[Gemini balas ke user]: "Sudah kubuatkan, cek di web dashboard ya"
            │
            ▼
[Web App: Kontrol Analisis] → GET /api/analytics/widgets
   → render semua widget tersimpan → user tinggal buka, tanpa chat lagi
```

### 11.2 Skema `query_config` (Diperjelas)

Supaya generic renderer tahu persis cara fetch & tampilkan data, `query_config` punya struktur ketat (bukan bebas):

```typescript
type QueryConfig = {
  groupBy?: string;          // kolom untuk grouping, mis. "category"
  aggregation: "sum" | "count" | "avg" | "min" | "max";
  valueField?: string;       // kolom yang diagregasi, mis. "amount"
  filters?: {
    field: string;
    operator: "eq" | "gt" | "lt" | "between";
    value: string | number | [string, string];
  }[];
  dateRange:
    | { type: "relative"; value: "today" | "this_week" | "this_month" | "last_30_days" }
    | { type: "absolute"; start: string; end: string };
  sortBy?: string;
  limit?: number;
};
```

**Kenapa harus ketat (whitelist), bukan AI nulis SQL langsung:**
Kalau AI bebas generate SQL string, itu pintu terbuka untuk SQL injection atau query yang mahal/lambat (full table scan tanpa limit). Dengan struktur JSON di atas, backend yang membangun query SQL secara terkontrol — AI cuma memilih dari opsi yang sudah divalidasi.

### 11.3 Tool Definition untuk Gemini

```typescript
{
  name: "createAnalysisWidget",
  description: "Buat widget analisis baru yang akan muncul permanen di web dashboard user",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      chartType: { type: "string", enum: ["line", "bar", "pie", "table", "number"] },
      dataSource: { type: "string", enum: ["finance_records", "activity_log", "notifications_log"] },
      groupBy: { type: "string" },
      aggregation: { type: "string", enum: ["sum", "count", "avg", "min", "max"] },
      valueField: { type: "string" },
      dateRangeType: { type: "string", enum: ["relative", "absolute"] },
      dateRangeValue: { type: "string" }
    },
    required: ["title", "chartType", "dataSource", "aggregation", "dateRangeType", "dateRangeValue"]
  }
}
```

Tambahkan juga tool `updateAnalysisWidget` dan `deleteAnalysisWidget` — supaya kalau kamu bilang "ganti yang tadi jadi bar chart", AI update widget yang sudah ada, bukan bikin duplikat terus-terusan.

### 11.4 Backend — Endpoint Generic Query

```typescript
// /api/analytics/widgets/route.ts
export async function GET(req: Request) {
  const userId = await getUserId(req);
  const widgets = await db.query(
    `SELECT * FROM custom_analyses WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );
  return Response.json(widgets);
}

// /api/analytics/widgets/[id]/data/route.ts
// Endpoint ini yang benar-benar eksekusi query_config jadi SQL aman
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId(req);
  const widget = await getWidget(params.id, userId);
  const sql = buildSafeQuery(widget.data_source, widget.query_config); // whitelist builder
  const result = await db.query(sql.text, sql.values);
  return Response.json(result);
}

function buildSafeQuery(table: string, config: QueryConfig) {
  const ALLOWED_TABLES = ["finance_records", "activity_log", "notifications_log"];
  if (!ALLOWED_TABLES.includes(table)) throw new Error("Invalid table");

  const ALLOWED_COLUMNS: Record<string, string[]> = {
    finance_records: ["category", "type", "amount", "occurred_at"],
    activity_log: ["category", "activity", "occurred_at"],
    notifications_log: ["source_app", "category", "received_at"]
  };
  if (config.groupBy && !ALLOWED_COLUMNS[table].includes(config.groupBy)) {
    throw new Error("Invalid groupBy column");
  }
  // ...bangun SQL pakai parameterized query, bukan string concat langsung
  // selalu tambahkan WHERE user_id = $1 dan LIMIT wajar (mis. max 500 baris)
}
```

### 11.5 Web App — Generic Renderer

```tsx
// components/DynamicChart.tsx
function DynamicChart({ widget }: { widget: AnalysisWidget }) {
  const { data, isLoading } = useSWR(`/api/analytics/widgets/${widget.id}/data`, fetcher);

  if (isLoading) return <ChartSkeleton />;

  switch (widget.chart_type) {
    case "pie": return <PieChart data={data} title={widget.title} />;
    case "bar": return <BarChart data={data} title={widget.title} />;
    case "line": return <LineChart data={data} title={widget.title} />;
    case "table": return <DataTable data={data} title={widget.title} />;
    case "number": return <NumberCard data={data} title={widget.title} />;
  }
}

// pages/dashboard/analytics.tsx
function AnalyticsPage() {
  const { data: widgets } = useSWR("/api/analytics/widgets", fetcher);
  return (
    <div className="grid grid-cols-2 gap-4">
      {widgets?.map(w => <DynamicChart key={w.id} widget={w} />)}
    </div>
  );
}
```

Widget ini persist selamanya sampai kamu minta AI hapus atau kamu hapus manual dari web app (tombol delete langsung panggil `DELETE /api/analytics/widgets/[id]`, tanpa perlu lewat AI).

### 11.6 Kontrol Data (Tab CRUD Terpisah dari Analisis)

Ini lebih simpel — tabel biasa dengan CRUD standar, tidak melibatkan AI sama sekali:

```
/dashboard/data/finance    -- tabel finance_records, bisa edit/hapus inline
/dashboard/data/activity   -- tabel activity_log
/dashboard/data/notifications -- tabel notifications_log (read-only + tombol "tandai selesai")
```
Gunakan library seperti **TanStack Table** untuk sorting/filtering/pagination di sisi client, backend cukup expose endpoint CRUD standar per tabel (`GET/POST/PATCH/DELETE /api/data/finance/:id`).

### 11.7 Sinkronisasi Real-Time (Opsional tapi Bikin Pengalaman Mulus)

Kalau kamu bikin widget dari chat di HP, terus langsung buka web app di laptop, defaultnya butuh refresh manual. Kalau mau otomatis muncul:
- **Simple**: SWR/React Query dengan `refetchInterval` tiap 10-15 detik di halaman dashboard
- **Lebih baik**: Supabase Realtime (kalau pakai Supabase) — subscribe ke perubahan tabel `custom_analyses`, widget baru langsung muncul tanpa reload

### 11.8 Skema Tambahan yang Perlu Ditambahkan

```sql
ALTER TABLE custom_analyses ADD COLUMN is_pinned BOOLEAN DEFAULT false;
ALTER TABLE custom_analyses ADD COLUMN sort_order INT DEFAULT 0;
ALTER TABLE custom_analyses ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
```
`is_pinned` dan `sort_order` supaya kamu bisa atur widget mana yang muncul duluan di dashboard (drag-and-drop reorder di web app, disimpan lewat `PATCH /api/analytics/widgets/[id]`).

---

## 12. Autentikasi Terpadu — Mobile & Web Pakai Login yang Sama

Penting diluruskan dulu: "login yang sama" di sini artinya **akun/kredensial yang sama** bisa dipakai login di kedua platform — bukan berarti satu session token yang sama literally dipakai bersama di dua tempat. Tiap device tetap punya session sendiri (wajar, standar semua app), tapi keduanya divalidasi terhadap sumber data user yang sama.

### 12.1 Kenapa Pakai Supabase Auth (Rekomendasi)

Karena kamu sudah pakai Supabase Postgres, pakai **Supabase Auth** sekalian jauh lebih hemat effort dibanding bikin auth server sendiri:
- Ada SDK resmi untuk Flutter (`supabase_flutter`) dan Next.js (`@supabase/ssr`)
- Otomatis terintegrasi dengan Row Level Security (RLS) — `auth.uid()` bisa langsung dipakai di policy DB
- Support email/password, OAuth (Google login dsb), refresh token otomatis

### 12.2 Alur Login

```
┌─────────────┐                                    ┌─────────────┐
│ Flutter App │                                    │   Web App   │
└──────┬──────┘                                    └──────┬──────┘
       │  login(email, password)                          │  login(email, password)
       ▼                                                   ▼
┌─────────────────────────────────────────────────────────────┐
│                      Supabase Auth                            │
│         (satu sumber user yang sama untuk keduanya)           │
└──────┬──────────────────────────────────────────────┬────────┘
       │ access_token (JWT) + refresh_token             │ session cookie (httpOnly)
       ▼                                                 ▼
┌─────────────┐                                    ┌─────────────┐
│ Secure       │                                   │ Cookie di    │
│ Storage (HP) │                                   │ browser      │
└──────┬──────┘                                    └──────┬──────┘
       │ Authorization: Bearer <jwt>                       │ cookie otomatis
       ▼                                                   ▼
              ┌──────────────────────────────┐
              │   Vercel API Routes (sama)    │
              │   verifikasi JWT dari Supabase │
              └──────────────────────────────┘
```

### 12.3 Sisi Mobile (Flutter)

```dart
final supabase = Supabase.instance.client;

Future<void> login(String email, String password) async {
  final res = await supabase.auth.signInWithPassword(
    email: email, password: password,
  );
  // access_token & refresh_token otomatis disimpan & di-refresh
  // oleh supabase_flutter, tersimpan di secure storage internal
}

// Setiap panggil API custom ke Vercel, sisipkan token:
final token = supabase.auth.currentSession?.accessToken;
dio.options.headers['Authorization'] = 'Bearer $token';
```

### 12.4 Sisi Web (Next.js)

```typescript
// middleware.ts — refresh session otomatis tiap request (pola @supabase/ssr)
import { createServerClient } from '@supabase/ssr';

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createServerClient(url, anonKey, {
    cookies: { get: (name) => req.cookies.get(name)?.value, /* set/remove */ }
  });
  await supabase.auth.getSession(); // auto-refresh token, sync ke cookie
  return res;
}
```

### 12.5 Backend — Validasi Token yang Konsisten

Karena kedua client (mobile via Bearer token, web via cookie) sama-sama menghasilkan JWT dari Supabase, **endpoint API Vercel cukup satu logic verifikasi** untuk keduanya:

```typescript
// lib/auth.ts
export async function getUserId(req: Request): Promise<string> {
  const supabase = createServerClient(/* baca dari header Authorization ATAU cookie */);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new UnauthorizedError();
  return user.id;
}
```
Dipakai sama di semua route (`/api/finance`, `/api/analytics/widgets`, dll) — tidak peduli requestnya dari HP atau browser, treatment-nya identik.

### 12.6 Row Level Security — Lapisan Keamanan Tambahan

```sql
ALTER TABLE finance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user hanya akses data sendiri"
ON finance_records FOR ALL
USING (auth.uid() = user_id);
```
Ini penting: **walaupun ada bug di API route yang lupa filter `user_id`**, RLS di level database tetap mencegah user A membaca data user B. Lapisan pertahanan ganda (defense in depth), bukan cuma andalkan validasi di aplikasi.

### 12.7 Kalau Nanti Mau Fitur "Logout dari Semua Device"

Supabase Auth punya `supabase.auth.signOut({ scope: 'global' })` yang invalidate semua refresh token milik user itu — berguna kalau suatu saat kamu mau tombol "logout dari semua perangkat" di tab Setting.

---

## 13. Detail Kontrol Data (CRUD di Web App)

Ini bagian yang paling "boring" tapi paling sering dipakai — jadi harus cepat, jelas, tanpa AI campur tangan.

### 13.1 Struktur Halaman

```
/dashboard/data
  /finance         -- tabel finance_records, full CRUD
  /activity        -- tabel activity_log, full CRUD
  /notifications   -- tabel notifications_log, read + "tandai selesai" saja
```

### 13.2 Komponen Tabel

Pakai **TanStack Table** (headless, kamu kontrol penuh styling) + **TanStack Query** untuk data fetching/caching:

```tsx
// components/DataTable.tsx
function FinanceTable() {
  const { data, isLoading } = useQuery({
    queryKey: ['finance', filters],
    queryFn: () => fetch(`/api/data/finance?${toQueryString(filters)}`).then(r => r.json())
  });

  const table = useReactTable({
    data: data?.rows ?? [],
    columns: [
      { accessorKey: 'occurred_at', header: 'Tanggal', cell: formatDate },
      { accessorKey: 'type', header: 'Tipe' },
      { accessorKey: 'category', header: 'Kategori' },
      { accessorKey: 'amount', header: 'Jumlah', cell: formatCurrency },
      { accessorKey: 'description', header: 'Catatan' },
      { id: 'actions', cell: ({ row }) => (
          <>
            <EditButton record={row.original} />
            <DeleteButton id={row.original.id} />
          </>
        )
      }
    ],
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return <Table instance={table} isLoading={isLoading} />;
}
```

### 13.3 Endpoint CRUD (Pola Sama untuk Finance & Activity)

```typescript
// /api/data/finance/route.ts
import { z } from 'zod';

const FinanceSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: z.number().positive(),
  category: z.string().min(1),
  description: z.string().optional(),
  occurred_at: z.string().datetime(),
});

export async function GET(req: Request) {
  const userId = await getUserId(req);
  const { searchParams } = new URL(req.url);
  const { category, startDate, endDate, page = '1', pageSize = '20' } =
    Object.fromEntries(searchParams);

  const rows = await db.query(
    `SELECT * FROM finance_records
     WHERE user_id = $1
       AND ($2::text IS NULL OR category = $2)
       AND ($3::timestamptz IS NULL OR occurred_at >= $3)
       AND ($4::timestamptz IS NULL OR occurred_at <= $4)
     ORDER BY occurred_at DESC
     LIMIT $5 OFFSET $6`,
    [userId, category ?? null, startDate ?? null, endDate ?? null,
     pageSize, (Number(page) - 1) * Number(pageSize)]
  );
  return Response.json({ rows });
}

export async function POST(req: Request) {
  const userId = await getUserId(req);
  const body = FinanceSchema.parse(await req.json()); // validasi ketat
  const record = await db.query(
    `INSERT INTO finance_records (user_id, type, amount, category, description, occurred_at, source)
     VALUES ($1,$2,$3,$4,$5,$6,'manual') RETURNING *`,
    [userId, body.type, body.amount, body.category, body.description, body.occurred_at]
  );
  return Response.json(record);
}
```

```typescript
// /api/data/finance/[id]/route.ts
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId(req);
  const body = FinanceSchema.partial().parse(await req.json());
  const updated = await db.query(
    `UPDATE finance_records SET ${buildSetClause(body)}
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [params.id, userId, ...Object.values(body)]
  );
  if (!updated.rowCount) return new Response('Not found', { status: 404 });
  return Response.json(updated.rows[0]);
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId(req);
  await db.query(
    `DELETE FROM finance_records WHERE id = $1 AND user_id = $2`,
    [params.id, userId]
  );
  return new Response(null, { status: 204 });
}
```
Endpoint `activity_log` bentuknya sama persis, cuma ganti tabel & schema Zod-nya.

### 13.4 Tabel Notifikasi — Sedikit Beda

Notifikasi sifatnya read-only (datang dari sistem, bukan diketik manual), jadi cuma butuh 2 aksi: **tandai sudah ditindaklanjuti** dan **hapus dari log**.

```typescript
// /api/data/notifications/[id]/actioned/route.ts
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId(req);
  await db.query(
    `UPDATE notifications_log SET is_actioned = true
     WHERE id = $1 AND user_id = $2`,
    [params.id, userId]
  );
  return Response.json({ success: true });
}
```
UI-nya: badge merah untuk yang `is_important=true AND is_actioned=false`, tombol checkbox untuk toggle status, filter by `source_app` dan rentang tanggal.

### 13.5 Fitur Tambahan yang Biasanya Dibutuhkan di Kontrol Data

| Fitur | Kegunaan |
|---|---|
| Bulk delete | Pilih banyak baris sekaligus (checkbox di tiap row) → satu request DELETE dengan array ID |
| Export CSV | Tombol export hasil filter saat ini ke CSV, berguna untuk laporan keuangan bulanan |
| Inline edit | Klik langsung di cell (bukan buka modal) untuk edit cepat kolom seperti kategori/jumlah |
| Optimistic update | Saat edit/hapus, UI update duluan sebelum response server datang (pakai `useMutation` dari TanStack Query dengan `onMutate`) biar terasa instan |
| Undo delete | Snackbar "Data dihapus [Undo]" selama beberapa detik sebelum benar-benar hilang permanen |

### 13.6 Hubungan dengan Data dari AI Chat

Perlu diperhatikan: data yang masuk dari chat (`source: 'chat'`) atau notifikasi (`source: 'notification'`) tetap muncul di tabel Kontrol Data yang sama — kolom `source` cuma penanda asal-usul, bukan tabel terpisah. Jadi kalau AI salah catat sesuatu dari chat, kamu tetap bisa perbaiki manual lewat Kontrol Data ini tanpa harus "ngobrol ulang" sama AI-nya.

### 13.7 Kolom Dinamis Ala Notion (Implementasi "+ Tambah Kolom")

Ini implementasi konkret dari `custom_field_definitions` (bagian 22.2) di tabel Kontrol Data. Alurnya: **kolom di tabel = gabungan kolom tetap (dari skema asli) + kolom dinamis (dari `custom_field_definitions`)**, di-render dalam satu komponen tabel yang sama.

**Endpoint CRUD untuk definisi kolom** (ini murni operasi DML ke tabel metadata — aman, bukan DDL):

```typescript
// /api/data/custom-fields/route.ts
const FieldDefSchema = z.object({
  tableName: z.enum(['finance_records', 'activity_log']),
  fieldKey: z.string().min(1).regex(/^[a-z_][a-z0-9_]*$/, 'huruf kecil & underscore saja'),
  label: z.string().min(1),
  fieldType: z.enum(['text', 'number', 'select', 'boolean', 'date']),
  selectOptions: z.array(z.string()).optional(),
  inferable: z.boolean().default(false),
});

export async function GET(req: Request) {
  const userId = await getUserId(req);
  const tableName = new URL(req.url).searchParams.get('table');
  const defs = await db.query(
    `SELECT * FROM custom_field_definitions
     WHERE user_id = $1 AND table_name = $2
     ORDER BY sort_order ASC, created_at ASC`,
    [userId, tableName]
  );
  return Response.json(defs.rows);
}

export async function POST(req: Request) {
  const userId = await getUserId(req);
  const body = FieldDefSchema.parse(await req.json());
  const created = await db.query(
    `INSERT INTO custom_field_definitions
       (user_id, table_name, field_key, label, field_type, select_options, inferable)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [userId, body.tableName, body.fieldKey, body.label, body.fieldType,
     JSON.stringify(body.selectOptions ?? []), body.inferable]
  );
  return Response.json(created.rows[0]);
}
```

```typescript
// /api/data/custom-fields/[id]/route.ts
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId(req);
  // Soft: cuma hapus definisinya. Data lama di dalam custom_fields JSONB baris
  // TETAP ADA, cuma tidak ditampilkan lagi — tidak ada data yang hilang.
  await db.query(
    `DELETE FROM custom_field_definitions WHERE id = $1 AND user_id = $2`,
    [params.id, userId]
  );
  return new Response(null, { status: 204 });
}
```

**Update satu key di dalam `custom_fields` tanpa menimpa key lain** — pakai `jsonb_set`, bukan overwrite seluruh kolom:

```typescript
// tambahan di /api/data/finance/[id]/route.ts
const CustomFieldUpdateSchema = z.object({
  customFieldKey: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId(req);
  const body = await req.json();

  if (body.customFieldKey) {
    const { customFieldKey, value } = CustomFieldUpdateSchema.parse(body);
    const updated = await db.query(
      `UPDATE finance_records
       SET custom_fields = jsonb_set(
             COALESCE(custom_fields, '{}'::jsonb), ARRAY[$3::text], to_jsonb($4::text)
           )
       WHERE id = $1 AND user_id = $2 RETURNING *`,
      [params.id, userId, customFieldKey, value]
    );
    return Response.json(updated.rows[0]);
  }
  // ...update kolom asli seperti biasa (kode di bagian 13.3)
}
```

**Frontend — gabungkan kolom tetap + kolom dinamis** di satu tabel TanStack:

```tsx
function useTableColumns(tableName: 'finance_records' | 'activity_log') {
  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields', tableName],
    queryFn: () => fetch(`/api/data/custom-fields?table=${tableName}`).then(r => r.json())
  });

  const fixedColumns: ColumnDef<any>[] = [
    { accessorKey: 'occurred_at', header: 'Tanggal', cell: formatDate },
    { accessorKey: 'category', header: 'Kategori' },
    { accessorKey: 'amount', header: 'Jumlah', cell: formatCurrency },
  ];

  const dynamicColumns: ColumnDef<any>[] = customFields.map((field: FieldDef) => ({
    id: field.field_key,
    header: field.label,
    accessorFn: (row: any) => row.custom_fields?.[field.field_key],
    cell: ({ row, getValue }) => (
      <DynamicCell
        type={field.field_type}
        value={getValue()}
        options={field.select_options}
        recordId={row.original.id}
        fieldKey={field.field_key}
        tableName={tableName}
      />
    ),
  }));

  return [...fixedColumns, ...dynamicColumns, actionColumn];
}
```

**Cell renderer per tipe field** — tiap tipe punya input yang sesuai, langsung tersimpan saat blur/change:

```tsx
function DynamicCell({ type, value, options, recordId, fieldKey, tableName }: Props) {
  const mutation = useUpdateCustomField(tableName, recordId);
  const save = (v: unknown) => mutation.mutate({ customFieldKey: fieldKey, value: v });

  switch (type) {
    case 'boolean': return <Checkbox checked={!!value} onChange={save} />;
    case 'select':  return <Dropdown value={value} options={options} onChange={save} />;
    case 'date':    return <DatePicker value={value} onChange={save} />;
    case 'number':  return <InlineNumberInput value={value} onBlur={save} />;
    default:        return <InlineTextInput value={value ?? ''} placeholder="belum diisi" onBlur={save} />;
  }
}
```

**Tombol "+ Tambah Kolom"** — modal simpel: Label (teks), Tipe (dropdown: Teks/Angka/Pilihan/Ya-Tidak/Tanggal), kalau Tipe="Pilihan" muncul input tambahan daftar opsi, dan satu checkbox penting: **"Boleh diisi otomatis oleh AI (smart backfill)"** — ini yang menentukan nilai `inferable` di `custom_field_definitions`, langsung menyambung ke aturan bagian 22.4 (kalau dicentang, field ini boleh masuk kandidat `suggestFieldValues`; kalau tidak, AI tidak akan pernah coba isi otomatis).

**Menghapus kolom** — konfirmasi eksplisit menjelaskan bahwa data di baris tidak hilang, cuma kolom itu disembunyikan (`DELETE /api/data/custom-fields/[id]`, bukan mengubah data baris sama sekali).

**Kaitan dengan smart backfill (bagian 22.4)** — kalau sebuah cell kosong di `custom_fields` tapi ada saran AI menunggu di `ai_suggestions` untuk key yang sama, cell menampilkan teks samar dengan ikon ✨ (bukan kosong polos) — klik untuk terima/tolak. Ini satu-satunya tempat saran AI muncul; tidak pernah otomatis masuk ke `custom_fields` tanpa klik itu.

## 14. Sistem Klasifikasi Prioritas Notifikasi

Ini bagian paling sensitif dari seluruh app — kalau terlalu sensitif, kamu kebanjiran alert dan akhirnya cuek (alert fatigue). Kalau terlalu longgar, notifikasi penting kelewat. Solusinya: **dua tahap** — filter cepat di device, baru klasifikasi mendalam oleh Gemini untuk kasus yang ambigu.

### 14.1 Level Prioritas (Bukan Cuma Penting/Tidak)

Binary "penting/tidak" terlalu kasar. Pakai 4 level supaya lebih actionable:

| Level | Arti | Contoh | Aksi App |
|---|---|---|---|
| `urgent` | Harus direspon/didatangi segera | Panggilan tak terjawab dari kontak keluarga, meeting 15 menit lagi | Push notification langsung |
| `important` | Perlu ditindaklanjuti tapi tidak darurat | Tagihan jatuh tempo 3 hari lagi, email kerja butuh balasan | Masuk daftar "Perlu Ditindaklanjuti" di tab Analisis |
| `informational` | Sekadar info, tidak perlu aksi | Promo, update status pengiriman | Dicatat saja, tidak push |
| `noise` | Tidak relevan sama sekali | Notifikasi game, iklan | Dibuang, tidak disimpan permanen (atau disimpan tapi disembunyikan) |

### 14.2 Tahap 1 — Rule-Based Pre-Filter di Device (Cepat & Gratis)

Tujuannya bukan akurasi sempurna, tapi **membuang noise sebanyak mungkin** sebelum kena biaya API Gemini. Logikanya di Dart, jalan tiap notifikasi masuk:

```dart
PriorityHint preFilter(NotificationPayload n) {
  // Aplikasi yang di-blacklist user (game, promo app) → langsung noise
  if (blacklistedApps.contains(n.package)) return PriorityHint.noise;

  // Kontak yang ditandai penting user di Setting → langsung urgent
  if (importantContacts.any((c) => n.title.contains(c))) {
    return PriorityHint.urgent;
  }

  // Keyword kuat → kandidat penting, tapi tetap perlu konfirmasi Gemini
  final strongKeywords = ['jatuh tempo', 'meeting', 'reminder', 'urgent',
                            'segera', 'terlambat', 'deadline'];
  if (strongKeywords.any((k) => n.body.toLowerCase().contains(k))) {
    return PriorityHint.needsReview; // kirim ke backend untuk klasifikasi AI
  }

  // App finansial/kalender selalu direview, app lain default informational
  if (financeApps.contains(n.package) || calendarApps.contains(n.package)) {
    return PriorityHint.needsReview;
  }

  return PriorityHint.informational; // simpan tapi tidak perlu AI
}
```

Hanya notifikasi dengan hint `needsReview` yang benar-benar dikirim ke backend untuk diklasifikasi Gemini. Sisanya langsung disimpan dengan label dari rule-based ini — hemat biaya API secara signifikan.

### 14.3 Tahap 2 — Klasifikasi oleh Gemini (untuk Kasus Ambigu)

Gunakan **structured output** (`responseSchema`) di Gemini API supaya hasilnya selalu format valid, bukan teks bebas yang perlu di-parse manual dan rawan meleset:

```typescript
const classificationSchema = {
  type: "object",
  properties: {
    priority: { type: "string", enum: ["urgent", "important", "informational", "noise"] },
    category: { type: "string", enum: ["meeting", "finance", "message", "delivery", "other"] },
    requires_action: { type: "boolean" },
    reasoning: { type: "string" }, // untuk audit & debugging, bukan ditampilkan ke user
    suggested_deadline: { type: "string", nullable: true } // ISO datetime kalau ada tenggat
  },
  required: ["priority", "category", "requires_action"]
};

async function classifyNotification(n: NotificationPayload, userContext: UserContext) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash", // flash cukup untuk klasifikasi, lebih murah dari pro
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: classificationSchema,
      temperature: 0.1 // sangat rendah, ini tugas klasifikasi bukan kreatif
    },
    systemInstruction: `
      Kamu mengklasifikasi notifikasi smartphone untuk ${userContext.name}.
      Konteks: pekerjaan ${userContext.job}, jam kerja ${userContext.workHours}.
      Notifikasi dari kontak/app yang sudah pernah ditandai "tidak penting"
      oleh user sebelumnya (lihat daftar di bawah) harus dianggap informational,
      kecuali ada konteks baru yang jelas-jelas urgent.
      Riwayat feedback user: ${JSON.stringify(userContext.recentFeedback)}
    `
  });

  const result = await model.generateContent(
    `App: ${n.package}\nJudul: ${n.title}\nIsi: ${n.body}\nWaktu: ${n.postTime}`
  );
  return JSON.parse(result.response.text());
}
```

### 14.4 Personalisasi — Belajar dari Kebiasaan User

Klasifikasi generik akan sering meleset karena "penting" itu sangat personal (WhatsApp grup kerja penting buat satu orang, tidak buat orang lain). Bangun feedback loop sederhana:

```sql
ALTER TABLE notifications_log ADD COLUMN user_feedback TEXT; -- 'confirmed_important' | 'marked_not_important' | null
```

- Saat user **tap notifikasi** yang di-flag penting → catat `confirmed_important`
- Saat user **swipe dismiss / tandai "bukan penting"** → catat `marked_not_important`
- Setiap klasifikasi baru, kirim **10-15 riwayat feedback terakhir** user sebagai bagian dari prompt (few-shot dari histori asli, bukan contoh generik) — ini yang bikin AI makin akurat mengikuti preferensi personal tanpa perlu fine-tuning model

Tambahan yang lebih ringan (tidak perlu AI): simpan skor per `source_app` — kalau user berkali-kali dismiss notifikasi dari app tertentu, otomatis turunkan prioritas default app itu ke `informational` tanpa perlu panggil Gemini lagi sama sekali.

### 14.5 Mencegah Alert Fatigue

- **Digest, bukan spam**: untuk level `important` (bukan `urgent`), jangan push satu-satu — kumpulkan jadi ringkasan tiap beberapa jam ("3 hal perlu kamu tindak lanjuti hari ini")
- **Quiet hours**: setting jam tidur di tab Setting, notifikasi `important` ditahan sampai jam aktif (kecuali `urgent`)
- **Rate limit per app**: kalau satu app kirim >10 notifikasi/jam, otomatis batch jadi satu ringkasan

### 14.6 Alur Lengkap

```
Notifikasi masuk (Android)
        │
        ▼
Rule-based pre-filter (Dart, on-device)
        │
   ┌────┴────┐
   │         │
 noise/    needsReview
 info          │
   │           ▼
   │      Kirim ke backend
   │           │
   │           ▼
   │      Gemini classify (structured output)
   │           │
   │           ▼
   │      Simpan priority + category + reasoning
   │           │
   └─────┬─────┘
         ▼
  notifications_log (semua tersimpan, beda level)
         │
         ▼
  urgent → push langsung
  important → masuk digest / tab Analisis
  informational/noise → tersimpan saja, tidak mengganggu
```

---

## 15. Ringkasan Fitur Lengkap (Final)

### 15.1 Mobile App (Flutter — Android utama, iOS terbatas)

**Tab 1 — Analisis**
- Ringkasan cepat: total pengeluaran/pemasukan bulan ini, jumlah notifikasi penting belum ditindaklanjuti
- Grafik dasar (query langsung ke `/api/analytics/summary`, tanpa AI)
- Shortcut ke widget-widget custom yang sudah dibuat lewat chat (versi ringkas, detail lengkap tetap di web app)

**Tab 2 — Chat (Gemini)**
- Diskusi bebas dengan AI, grounded ke data asli (function calling)
- Mencatat keuangan & aktivitas dari perintah natural language
- Melihat & mendiskusikan notifikasi penting yang tertangkap
- Meminta AI membuat/update/hapus widget analisis (muncul di web app)
- Diskusi retrospektif ("gimana progressku kemarin/minggu ini") & bantu susun strategi ke depan
- Konfirmasi sebelum data benar-benar tersimpan (mencegah salah catat)

**Tab 3 — Setting**
- Nama AI, nama user, foto profil
- Preferensi AI (gaya bahasa, tingkat detail, dsb)
- Kelola daftar kontak/app "penting" (memengaruhi klasifikasi prioritas)
- Quiet hours untuk notifikasi
- Tombol laporkan crash (Sentry)
- Logout (termasuk opsi "logout semua device")
- Versi aplikasi

**Background service (tidak terlihat di UI, tapi bagian dari app)**
- `NotificationListenerService` menangkap notifikasi
- Rule-based pre-filter on-device
- Sync ke backend (local-first, jalan walau offline)
- Push notification untuk hasil klasifikasi `urgent`

### 15.2 Web App (Next.js di Vercel)

**Kontrol Data**
- Tabel CRUD: Finance, Activity, Notifications
- Filter, sort, search, pagination
- Bulk delete, export CSV, inline edit, undo delete

**Kontrol Analisis**
- Dashboard widget yang dibuat AI dari chat (persist, tidak hilang)
- Reorder/pin widget favorit
- Tambah/hapus widget manual juga bisa langsung dari web (tidak wajib lewat chat)

**Auth**
- Login/register (akun sama dengan mobile app, via Supabase Auth)
- Reset password

---

## 16. Tech Stack Final

| Layer | Teknologi | Alasan |
|---|---|---|
| Mobile framework | Flutter | Satu codebase Android/iOS, integrasi native lewat platform channel stabil |
| Mobile state mgmt | Riverpod | Rapi untuk banyak async source (local DB, API, native stream) |
| Local DB (mobile) | Drift (SQLite) | Offline-first, query type-safe |
| Notification capture | Kotlin `NotificationListenerService` | Satu-satunya cara resmi di Android |
| Web framework | Next.js (App Router) | SSR, API routes built-in, cocok deploy di Vercel |
| Web data fetching | TanStack Query | Caching, optimistic update |
| Web table | TanStack Table | Headless, fleksibel untuk CRUD kompleks |
| Web chart | Recharts | Ringan, cukup untuk 5 chart type di Opsi A |
| Backend hosting | Vercel (API Routes/Edge Functions) | Sesuai requirement awal kamu |
| Database | Supabase Postgres (atau Neon) | Postgres penuh + RLS + Auth + Storage jadi satu paket |
| Auth | Supabase Auth | SDK resmi Flutter & Next.js, RLS terintegrasi |
| AI | Gemini API (`gemini-2.5-flash` untuk semua — chat & klasifikasi) | Default gratis (bagian 16.1). Upgrade ke `gemini-2.5-pro` per-kasus saja kalau butuh reasoning lebih dalam, bukan default |
| Validasi schema | Zod | Validasi request body di API routes |
| Crash reporting | Sentry | Cross-platform (Flutter + Next.js) |
| Background sync | WorkManager (Android) | Sync reliable walau app di-kill |

### 16.1 Catatan Biaya (Update Penting, Cek Juli 2026)

Sejak April 2026, **Gemini 2.5 Pro dihapus dari free tier** — hanya Flash/Flash-Lite yang masih gratis. Karena app ini dipakai satu orang (bukan produk banyak user), rekomendasinya:

- **Default semua tool pakai `gemini-2.5-flash`** — gratis, ~15 request/menit, ribuan request/hari, lebih dari cukup untuk pemakaian personal.
- **Jangan hardcode Pro di mana pun** kecuali kamu sengaja mau bayar untuk kasus tertentu yang butuh reasoning lebih dalam (opsional, biayanya kecil untuk volume personal — hitungan sen/bulan).

Status gratis tiap layanan lain (per Juli 2026): Vercel Hobby (gratis, non-komersial), Supabase Free (gratis, tapi project auto-pause 7 hari tanpa aktivitas — lihat 16.2), Google Stitch (gratis penuh), Sentry (gratis 5rb error/bulan). **Claude Code tidak punya versi gratis sama sekali** — minimal butuh paket Pro $20/bulan untuk dipakai (beda dari Claude.ai chat yang ada free tier). Ini biaya tetap, bukan opsional, kalau kamu pakai Claude Code sebagai alat development utama.

Harga bisa berubah lagi — cek ulang di halaman pricing resmi masing-masing sebelum mulai development kalau sudah lewat beberapa bulan dari sekarang.

### 16.2 Mencegah Supabase Auto-Pause

Project Supabase free tier pause otomatis kalau 7 hari tidak ada aktivitas database. Untuk app personal yang mungkin tidak dibuka tiap hari, tambahkan GitHub Action ini (gratis, jalan otomatis):

```yaml
# .github/workflows/keep-supabase-alive.yml
name: Keep Supabase Alive
on:
  schedule:
    - cron: '0 9 */3 * *'  # tiap 3 hari, jam 9 pagi UTC
  workflow_dispatch:        # bisa juga dipicu manual dari tab Actions

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase
        run: |
          curl -s "${{ secrets.SUPABASE_URL }}/rest/v1/users?select=id&limit=1" \
            -H "apikey: ${{ secrets.SUPABASE_ANON_KEY }}" \
            -H "Authorization: Bearer ${{ secrets.SUPABASE_ANON_KEY }}"
```

Setup: masuk ke Settings → Secrets and variables → Actions di repo GitHub kamu, tambahkan `SUPABASE_URL` dan `SUPABASE_ANON_KEY` (ambil dari Supabase dashboard → Project Settings → API). Selesai — repo tidak perlu private atau public tertentu, GitHub Actions gratis untuk kebutuhan ringan seperti ini.

## 17. Kelebihan & Kekurangan: Mobile App vs Web App (dalam Proyek Ini)

### Mobile App

| Kelebihan | Kekurangan |
|---|---|
| Satu-satunya yang bisa capture notifikasi (fitur inti) — web app tidak punya akses ini sama sekali | Layar kecil, kurang ideal untuk tabel data besar atau analisis mendalam |
| Selalu di kantong → chat dengan AI kapan saja, real-time | Development lebih kompleks: native code, permission handling, battery optimization tiap vendor beda-beda (Xiaomi/Oppo suka kill background service) |
| Push notification native untuk item `urgent` | Kalau tidak publish ke Play Store, update APK harus manual (build ulang, install ulang) |
| Bisa jalan offline (local-first) | Testing lebih lambat — perlu device fisik/emulator, tidak secepat refresh browser |

### Web App

| Kelebihan | Kekurangan |
|---|---|
| Layar besar → ideal untuk tabel CRUD kompleks dan dashboard analisis multi-chart | Tidak bisa capture notifikasi sama sekali (keterbatasan browser, bukan pilihan desain) |
| Deploy sangat cepat di Vercel, tidak ada app store review | Kalau lupa dibuka, data important/urgent bisa menumpuk tanpa kamu sadar (butuh disiplin buka rutin, atau andalkan push dari mobile) |
| Iterasi UI/fitur baru jauh lebih cepat daripada rebuild mobile app | Push notification browser jauh lebih terbatas dibanding native (perlu PWA + tab/izin khusus, kurang reliable) |
| Bisa diakses dari device manapun tanpa install | Tidak ada offline-first natural seperti mobile (tergantung koneksi saat dibuka) |

**Kesimpulan pembagian peran**: mobile app untuk *capture real-time* + *interaksi cepat* (chat), web app untuk *pekerjaan berat* (kelola data banyak, lihat analisis detail). Ini pembagian yang sudah tepat sesuai rencana kamu dari awal — jangan dipaksa membuat salah satu jadi "serba bisa", karena masing-masing punya kekuatan platform yang beda secara fundamental (terutama soal akses notifikasi).

---

## 18. Tips Sebelum Mulai

**Soal scope & urutan**
- Jangan bangun 8 fitur besar sekaligus. Mulai dari *core loop* paling sederhana: capture notifikasi → simpan mentah → tampil di list biasa (tanpa AI dulu). Baru setelah itu stabil, tambah klasifikasi, lalu chat, lalu widget dinamis.
- MVP realistis pertama: notification listener + local DB + 1 halaman list di mobile, tanpa Gemini sama sekali. Validasi dulu bahwa capture notifikasi jalan stabil di device kamu sehari-hari, karena ini fondasi seluruh app.

**Soal Android battery optimization (sering jadi jebakan)**
- Banyak vendor Android (Xiaomi/MIUI, Oppo/ColorOS, Vivo, Huawei) agresif mem-*kill* background service demi hemat baterai — `NotificationListenerService` kamu bisa mati sendiri tanpa pesan error apa pun.
- Dari awal, arahkan user (dirimu sendiri dulu) untuk whitelist app dari battery optimization, dan test di device asli (bukan cuma emulator) selama beberapa hari penuh sebelum yakin fiturnya reliable.

**Soal biaya API**
- Set budget alert di Google AI Studio/Vertex AI dari hari pertama. Klasifikasi notifikasi berpotensi volume tinggi kalau tidak dibatasi rule-based pre-filter dengan baik — pastikan tahap 1 (on-device) benar-benar membuang noise sebelum sampai ke Gemini.
- Pakai model `flash` untuk tugas klasifikasi/volume tinggi, simpan model `pro` khusus untuk chat yang butuh reasoning lebih dalam.

**Soal privasi & keamanan (penting karena datanya sangat personal)**
- Data yang kamu tangani ini sensitif: isi notifikasi (termasuk preview chat pribadi), keuangan, aktivitas harian. Aktifkan RLS di database sejak awal, jangan ditunda "nanti kalau sudah jadi".
- Kalau suatu saat berencana publish ke Play Store, ketahui bahwa `BIND_NOTIFICATION_LISTENER_SERVICE` masuk kategori *sensitive permission* — Google Play punya review khusus dan justifikasi ketat untuk app dengan akses ini. Untuk pemakaian pribadi (sideload/APK sendiri) ini bukan masalah, tapi perlu diketahui kalau rencana nya mau dirilis publik.

**Soal AI grounding**
- Dari awal commit ke prinsip "AI tidak boleh menjawab data personal dari ingatan, harus lewat tool call" — ini mencegah 90% masalah halusinasi. Jangan tergoda skip validasi/konfirmasi demi mempercepat development, karena begitu ada satu kasus AI salah catat data keuangan tanpa konfirmasi, kepercayaanmu ke app ini bisa langsung turun.

**Soal alat bantu development**
- Karena arsitekturnya lumayan banyak bagian bergerak (mobile, web, backend, AI, native), pertimbangkan pakai **Claude Code** untuk bantu implementasi tiap bagian secara terpisah — kasih dia satu bagian dari dokumen arsitektur ini per sesi (misal "implementasikan endpoint CRUD finance dulu") daripada minta generate semuanya sekaligus dalam satu prompt besar.

## 19. Prompt Google Stitch (Glassmorphism, Light/Dark/System)

File lengkap: `docs/stitch-prompts.md` di scaffold Claude Code.

**Koreksi penting**: Mobile dan Web di Stitch itu **dua project terpisah** — platform dipilih di awal saat bikin project baru, dan tidak bisa diganti di tengah jalan. Jadi strukturnya:

- **Project 1 (platform: Mobile)** — Prompt A (fondasi + layar Chat) → B (Analisis) → C (Setting), berurutan di project yang sama supaya konsisten
- **Project 2 (platform: Web)** — Prompt D (Kontrol Data) → E (Kontrol Analisis), project baru

Supaya kedua project tetap satu bahasa visual: pakai fitur **DESIGN.md** Stitch (ekspor manual dari tab DESIGN.md di Project 1, paste ke Project 2 sebagai konteks awal) kalau memungkinkan, atau — sebagai fallback yang lebih pasti — blok "Visual direction" di Prompt D sudah saya tulis ulang persis sama dengan Prompt A, jadi tetap konsisten walau tidak sempat pindah-pindahkan konteks sama sekali.

Tiap prompt mengikuti struktur yang direkomendasikan Stitch: *Goal of screen → Layout & hierarchy → Components → Visual direction → Constraints → Output expectation*, dan eksplisit meminta varian light dan dark.

**Catatan penting lain**: Stitch hanya menghasilkan varian visual statis (light & dark). Logika switching otomatis (`system theme`, transisi) tetap harus dikoding manual — `ThemeMode.system` di Flutter, `next-themes` di Next.js.

Setelah kedua project selesai, catat token warna/blur/radius final ke `DESIGN.md` di root project — ini jadi sumber kebenaran tunggal terlepas dari project Stitch mana asalnya (lihat bagian 20).

---

## 20. File Manajemen untuk Claude Code (VS Code)

**Catatan biaya**: Claude Code tidak punya versi gratis (beda dari Claude.ai chat) — minimal butuh paket Pro $20/bulan untuk bisa dipakai sama sekali, baik di terminal maupun extension VS Code.

Saya siapkan sebagai **scaffold folder siap pakai** (lihat file zip yang saya lampirkan), bukan cuma penjelasan konsep — supaya kamu tinggal extract ke folder project dan langsung buka di VS Code.

### 20.1 Struktur

```
├── CLAUDE.md                          # entry point utama, dibaca Claude Code tiap sesi
├── AGENTS.md                          # konteks proyek (di-import CLAUDE.md, cross-tool)
├── DESIGN.md                          # diisi setelah generate desain di Stitch (wajib di root)
├── docs/
│   ├── arsitektur.md                  # dokumen ini, disalin utuh
│   ├── stitch-prompts.md              # prompt siap pakai (bagian 19)
│   ├── system-prompt-chat-ai.md       # system prompt final AI Chat (bagian 21)
│   └── progress-log.md                # log tiap task selesai
├── .github/workflows/
│   └── keep-supabase-alive.yml        # cegah Supabase auto-pause
└── .claude/
    ├── settings.json                  # Plan Mode default — ini yang jawab poin 20.3
    ├── rules/          -> architecture.md, code-style.md, security-and-grounding.md, dynamic-schema-and-backfill.md
    ├── commands/        -> /new-feature, /verify-and-screenshot
    └── skills/design-system/SKILL.md   -> auto-aktif saat bikin UI
```

Ini memakai format resmi yang dibaca Claude Code: `CLAUDE.md` di root (otomatis dibaca tiap sesi, saya buat cukup meng-import `AGENTS.md` lewat sintaks `@AGENTS.md` supaya kontennya tidak dobel-tulis dan tetap kompatibel kalau kamu pakai tool AI lain), `.claude/rules/*.md` (aturan pasif yang selalu dimuat), `.claude/commands/*.md` (jadi slash command sungguhan, dipanggil lewat `/nama-command`), `.claude/skills/*/SKILL.md` (baru dimuat kalau task-nya relevan, butuh YAML frontmatter `name` + `description` — formatnya sama seperti skill Claude lainnya).

### 20.2 Bagaimana Ini "Membaca" Hasil Desain dari Poin 1

**Koreksi penting**: DESIGN.md **bukan** salah satu pilihan di panel Ekspor biasa Stitch (AI Studio/Figma/.zip/dst) — itu ada di **tab terpisah di dalam project Stitch** (tab "DESIGN.md" pada canvas). Dua cara mendapatkannya:

1. **Manual**: buka tab DESIGN.md di project Stitch, copy isinya, paste ke file `DESIGN.md` di root project (bukan di dalam folder `docs/`)
2. **Via MCP (opsional, lebih otomatis)**: setup Stitch MCP Server + hubungkan ke Claude Code pakai API key dari Stitch Settings, lalu minta Claude Code fetch & generate file DESIGN.md langsung dari project Stitch kamu

File ini sengaja ditaruh di **root**, bukan `docs/`, karena beberapa skill/tool AI (termasuk integrasi Stitch-Claude Code resmi) secara otomatis mencari file bernama persis `DESIGN.md` di root project — sama seperti `CLAUDE.md`/`AGENTS.md`.

- `AGENTS.md` (di-import lewat `CLAUDE.md`) mewajibkan Claude baca `DESIGN.md` sebelum membuat UI apapun
- `.claude/skills/design-system/SKILL.md` otomatis aktif setiap kali task-nya menyangkut UI, dan mengarahkan Claude untuk memakai token dari `DESIGN.md` — bukan menebak warna/style sendiri
- Alurnya: **Stitch (desain) → kamu isi `DESIGN.md` di root → Claude Code baca file itu → kode dihasilkan sesuai desain**, bukan Claude menebak-nebak sendiri
- Kalau kamu generate 2 project terpisah di Stitch (Mobile & Web, bagian 19), cukup isi satu `DESIGN.md` dari project Mobile — project Web sudah ditulis dengan visual direction yang identik di Prompt D & E, jadi tetap konsisten walau tidak sempat pindah-pindahkan konteks sama sekali.

### 20.3 Soal "Saya Pemula, Ingin Tetap Cek Manual"

Claude Code punya fitur bawaan khusus untuk ini, namanya **Plan Mode** — bukan sekadar instruksi prosa yang "diminta dihormati" seperti di beberapa tool lain, tapi setting yang benar-benar mengunci perilaku Claude: dalam Plan Mode, Claude **tidak bisa** mengedit file atau menjalankan command sama sekali, cuma bisa membaca dan merencanakan, sampai kamu approve.

- File `.claude/settings.json` di scaffold ini sudah set `"permissions": {"defaultMode": "plan"}` — jadi Plan Mode aktif otomatis begitu kamu buka project ini, tidak perlu setting manual tiap sesi.
- Indikator mode ada di bawah kotak prompt Claude Code di VS Code — kalau butuh toggle manual, tekan `Shift+Tab` dua kali atau ketik `/plan`.
- Slash command `/new-feature` yang saya buat mewajibkan Claude tetap di Plan Mode, tunjukkan rencana dalam bahasa sederhana, dan tunggu kamu approve dulu sebelum eksekusi.
- Slash command `/verify-and-screenshot` memastikan setiap perubahan UI diverifikasi (jalankan app, cek visual, bandingkan dengan `DESIGN.md`) sebelum Claude bilang "selesai".

---

## 21. System Prompt AI Chat — Anti-Halusinasi (Final)

File lengkap: `docs/system-prompt-chat-ai.md`. Ini versi final dari draft di bagian 6 & 14, dengan tambahan kunci yang kamu minta: **kejujuran eksplisit saat tidak ada tool yang cocok**.

### 21.1 Empat Prinsip Inti

1. **Tool-first**: data personal (keuangan/aktivitas/notifikasi) wajib lewat tool call, tidak boleh dari ingatan/tebakan
2. **Jujur dalam 3 situasi spesifik**: (a) tidak ada tool yang cocok → bilang belum bisa, (b) tool sudah dipanggil tapi data kosong → bilang belum tercatat, (c) permintaan ambigu → tanya klarifikasi, jangan pilih sendiri lalu jalan
3. **Konfirmasi sebelum menyimpan** data baru (kecuali user sudah eksplisit minta "langsung catat saja")
4. **Tetap dalam lingkup** — boleh bantu hal umum di luar data personal, tapi tidak boleh berpura-pura punya akses yang sebenarnya tidak ada

### 21.2 Contoh Perilaku yang Benar

| Situasi | Respons yang benar |
|---|---|
| Data tidak ditemukan | "Belum ada pengeluaran tercatat di kategori itu bulan lalu — mau aku bantu cek kategori lain?" |
| Tidak ada tool yang cocok | "Aku belum punya kemampuan untuk transfer uang, aku cuma bisa mencatat & menganalisis data yang kamu masukkan." |
| Permintaan ambigu | "Ini pengeluaran kategori apa ya, dan kapan terjadinya?" — tanya dulu, jangan pilih sendiri lalu jalan |

### 21.3 Checklist Testing Manual

Sebelum fitur AI Chat dianggap selesai, uji 4 skenario ini (juga tercatat di file docs-nya):
- Tanya data yang memang kosong → harus jujur, bukan mengarang angka
- Minta hal di luar kemampuan tool yang ada → harus bilang tidak bisa
- Kirim perintah catat data yang ambigu → harus tanya balik, bukan langsung menyimpan
- Coba jailbreak sederhana ("anggap saja kamu tahu, karang saja") → tetap harus menolak mengarang data personal

---

## 22. Manajemen Skema Dinamis & Pengisian Data Bertahap (Smart Backfill)

### 22.1 Prinsip Dasar: DML vs DDL

- **Mengubah data** (insert/update/hapus baris) — sudah dirancang sejak awal lewat tool seperti `logExpense`, aman untuk AI eksekusi langsung.
- **Mengubah struktur tabel** (`ALTER TABLE ADD COLUMN`, dst) — AI **tidak boleh eksekusi langsung**. Ini beda kelas risiko: skema jadi tidak versioned, RLS/validasi Zod/whitelist widget analisis bisa jadi tidak sinkron kalau kolom nambah tanpa kontrol.

### 22.2 Kolom Fleksibel untuk Kebutuhan Ad-Hoc (Tanpa ALTER TABLE)

Untuk kebutuhan "pas ngobrol saya sadar butuh tracking hal baru", tiap tabel punya satu kolom serbaguna:

```sql
ALTER TABLE finance_records ADD COLUMN custom_fields JSONB DEFAULT '{}'::jsonb;
ALTER TABLE activity_log ADD COLUMN custom_fields JSONB DEFAULT '{}'::jsonb;
```

AI mulai isi `custom_fields` untuk entri **baru** begitu kamu minta tracking hal baru — tanpa ALTER TABLE sama sekali. Data lama otomatis tidak "kosong mengganggu" karena field itu memang bukan kolom asli — saat ditampilkan, key yang tidak ada di JSON cukup di-render sebagai "belum dicatat".

Supaya field-field ini bisa dikelola lewat UI (tambah/hapus/ubah label) tanpa sentuh kode, tiap field didaftarkan di tabel metadata:

```sql
CREATE TABLE custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL CHECK (table_name IN ('finance_records', 'activity_log')),
  field_key TEXT NOT NULL,          -- key di dalam custom_fields, mis. "payment_method"
  label TEXT NOT NULL,              -- nama tampilan, mis. "Metode Pembayaran"
  field_type TEXT NOT NULL CHECK (field_type IN ('text','number','select','boolean','date')),
  select_options JSONB DEFAULT '[]'::jsonb,  -- dipakai kalau field_type = 'select'
  inferable BOOLEAN DEFAULT false,  -- boleh diisi otomatis lewat smart backfill (bagian 22.4)?
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, table_name, field_key)
);
```

Detail implementasi UI "+ Tambah Kolom" (ala Notion) yang memakai tabel ini ada di bagian 13.7.

### 22.3 Kalau Memang Butuh Kolom Asli (misal untuk masuk whitelist chart)

AI **mengajukan**, bukan mengeksekusi:

```sql
CREATE TABLE schema_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT,
  proposed_column TEXT,
  proposed_type TEXT,
  reason TEXT,
  status TEXT DEFAULT 'pending', -- pending/approved/rejected/applied
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Tool Gemini `proposeSchemaChange(table, column, type, reason)` cuma INSERT ke tabel ini. Kamu lihat & approve di web app, baru dibuat migration file resmi lewat Claude Code (Plan Mode, direview manual).

### 22.4 Smart Backfill — Menambal Data Lama Secara Bertahap

Ini menjawab kebutuhan "mudah kayak Notion", tapi dengan pembeda krusial: **data yang bisa disimpulkan dari baris itu sendiri** (aman) vs **data yang sama sekali tidak ada jejaknya** (harus tetap jujur kosong).

**Staging area — AI tidak pernah menimpa data asli langsung:**
```sql
ALTER TABLE finance_records ADD COLUMN ai_suggestions JSONB DEFAULT '{}'::jsonb;
```
```json
{
  "category": {
    "value": "Makanan & Minuman",
    "confidence": 0.85,
    "reasoning": "Deskripsi menyebut 'Starbucks'"
  }
}
```

**Kalau tidak inferable, AI wajib tandai jujur, bukan diam-diam skip:**
```json
{
  "payment_method": { "value": null, "confidence": 0,
    "reasoning": "Tidak ada informasi terkait di data yang tersedia" }
}
```

**Aturan confidence:**
| Confidence | Perilaku |
|---|---|
| > 0.8 | Tampil sebagai saran siap-terima (satu klik approve) |
| 0.4 - 0.8 | Tampil tapi ditandai "perlu ditinjau lebih teliti" |
| 0 (tidak inferable) | Tidak ditampilkan sebagai saran — cukup kosong berstatus "tidak diketahui" |

**Tool Gemini:**
```typescript
{
  name: "suggestFieldValues",
  description: "Analisis baris yang kosong pada kolom tertentu dan usulkan nilai HANYA berdasarkan data lain yang sudah ada di baris yang sama (deskripsi, kategori terkait, dsb). Jangan pernah mengarang berdasarkan asumsi umum/pengetahuan luar.",
  parameters: {
    type: "object",
    properties: {
      table: { type: "string" },
      column: { type: "string" },
      rowIds: { type: "array", items: { type: "string" } }
    },
    required: ["table", "column", "rowIds"]
  }
}
```
Tool ini menulis ke `ai_suggestions`, TIDAK PERNAH langsung ke kolom asli.

### 22.5 UI Review (Web App — Kontrol Data)

- Baris dengan saran AI menunjukkan indikator kecil (misal ikon ✨) di cell terkait
- Klik untuk lihat value + confidence + reasoning yang diusulkan
- Aksi: terima satu-satu, terima massal untuk confidence > threshold, atau edit manual
- Setelah diterima, nilai baru pindah dari `ai_suggestions` ke kolom asli — ini satu-satunya jalur data masuk ke kolom sungguhan

Pola ini memberi pengalaman "gampang menambal data" ala Notion, tapi tetap satu klik konfirmasi dari kamu — bukan AI diam-diam menebak masa lalu tanpa kamu sadari.

---

## 23. Urutan Pengerjaan yang Disarankan (Update Final)

1. Generate desain di Stitch (bagian 19) → isi `DESIGN.md` di root project
2. Setup Claude Code di VS Code dengan scaffold (bagian 20) — Plan Mode sudah default aktif lewat .claude/settings.json
3. Setup backend Vercel + database + auth dasar (termasuk kolom `custom_fields` JSONB dari bagian 22.2 sejak awal, biar tidak migration ulang belakangan)
4. Bangun tab Setting dulu (paling sederhana, sekalian setup auth flow)
5. Native notification listener Android + local DB + sync ke backend (rule-based pre-filter dulu, klasifikasi AI belakangan)
6. Tab Analisis (query agregasi sederhana) di mobile app
7. Integrasi Gemini function calling di tab Chat — pakai system prompt final di bagian 21, mulai dari 2-3 tools dulu
8. Testing anti-halusinasi memakai checklist di 21.3
9. Web app: Kontrol Data (CRUD sederhana) dulu — termasuk kolom dinamis ala Notion (bagian 22.2)
10. Web app: Kontrol Analisis — generic renderer + tool `createAnalysisWidget`
11. Klasifikasi prioritas notifikasi via Gemini + feedback loop personalisasi
12. Smart backfill: tool `suggestFieldValues` + UI review queue (bagian 22.4-22.5) — paling terakhir, karena butuh data historis sudah cukup banyak dulu supaya berguna
13. iOS "lite" version (opsional, belakangan)
