# Supabase Edge Functions + iOS Integration Guide

A complete reference for building an iOS app powered by self-hosted Supabase Edge Functions. Covers architecture, response format contracts, authentication, CI/CD, and every lesson learned so you can duplicate this setup without trial-and-error.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Infrastructure Setup](#infrastructure-setup)
3. [Edge Functions: Server & Handler Pattern](#edge-functions-server--handler-pattern)
4. [Response Format Contract](#response-format-contract)
5. [iOS App Architecture](#ios-app-architecture)
6. [Authentication Flow](#authentication-flow)
7. [The Date Format Problem](#the-date-format-problem)
8. [Decoding Resilience](#decoding-resilience)
9. [Multi-Backend Request Routing](#multi-backend-request-routing)
10. [CI/CD: GitHub Actions Build & Deploy](#cicd-github-actions-build--deploy)
11. [Edge Function Deployment](#edge-function-deployment)
12. [Schema Drift & Database Gotchas](#schema-drift--database-gotchas)
13. [Checklist: Adding a New Feature End-to-End](#checklist-adding-a-new-feature-end-to-end)
14. [Debugging Playbook](#debugging-playbook)
15. [File Reference Map](#file-reference-map)

---

## Architecture Overview

```
iOS App (Swift/SwiftUI)
    │
    │  3 routing targets based on URL path:
    │
    ├── /auth/*     →  Kong / GoTrue (api.printyx.net)      ← Supabase Auth
    ├── /api/*      →  Edge Functions (functions.printyx.net) ← Business Logic
    └── /*          →  Express.js (printyx.net)              ← Web Backend
                            │
                    Edge Functions (Deno/TypeScript)
                            │  ← server.ts: router + date normalizer + CORS
                            │
                        PostgREST (auto-generated REST from schema)
                            │
                        PostgreSQL (self-hosted Supabase, 209.145.59.219:5433)
```

**Key insight:** The iOS app never talks directly to PostgreSQL. Data flows through multiple serialization layers (Drizzle schema → PostgreSQL → PostgREST → Edge Function → JSON → iOS JSONDecoder). Each layer can transform dates, enums, and JSON structure in ways that break downstream consumers.

---

## Infrastructure Setup

### Services & URLs

| Service | URL | Purpose |
|---|---|---|
| Supabase API (Kong) | `https://api.printyx.net` | Auth, PostgREST, pg-meta |
| Edge Functions | `https://functions.printyx.net` | Business logic APIs |
| Express Backend | `https://printyx.net` | Web app backend |
| PostgreSQL | `209.145.59.219:5433` | Database (via Supabase pooler) |

### Docker Services (Coolify-managed)

| Container | Image | Port | Purpose |
|---|---|---|---|
| `supabase-db-*` | `supabase/postgres` | 5432 (internal) | PostgreSQL |
| `supabase-kong-*` | `kong` | 8000 → HTTPS | API gateway (routes to PostgREST, GoTrue, etc.) |
| `supabase-rest-*` | `postgrest/postgrest` | 3000 (internal) | Auto-generated REST API from schema |
| `supabase-auth-*` | `supabase/gotrue` | 9999 (internal) | Authentication (JWT issuance) |
| `supabase-edge-*` | Custom Dockerfile | 8000 | Edge Functions runtime |

### Environment Variables (Edge Functions)

```env
SUPABASE_URL=https://api.printyx.net
SUPABASE_ANON_KEY=<JWT with role=anon, long expiry>
SUPABASE_SERVICE_ROLE_KEY=<JWT with role=service_role, long expiry>
```

These are set in Coolify's environment config for the edge functions service. The service role key bypasses RLS and should never be exposed to clients.

---

## Edge Functions: Server & Handler Pattern

### Entry Point: `server.ts`

The edge functions run as a single Deno process. `server.ts` is the entry point that:

1. **Dynamically loads** all functions from `supabase/functions/*/index.ts`
2. **Routes requests** by path: `/tasks` → `tasks/index.ts`
3. **Handles CORS** preflight (OPTIONS) and adds headers to all responses
4. **Normalizes dates** in all JSON responses before sending to clients
5. **Provides health check** at `/health`

### Handler Pattern (each edge function)

Every edge function follows this exact pattern:

```typescript
// supabase/functions/{name}/index.ts
import { createSupabaseClient, createSupabaseServiceClient } from '../_shared/supabase.ts';
import { handleCors, createCorsResponse } from '../_shared/cors.ts';

export default async function handler(req: Request) {
  // 1. CORS preflight
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // 2. Authenticate user
    const authHeader = req.headers.get('Authorization');
    const jwt = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const supabase = createSupabaseClient(req);
    const { data: { user }, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !user) return createCorsResponse({ error: 'Unauthorized' }, 401, req);

    // 3. Extract tenant ID from JWT claims
    const tenantId = user.app_metadata?.tenant_id as string;
    if (!tenantId) return createCorsResponse({ error: 'No tenant ID found' }, 400, req);

    // 4. Create admin client (bypasses RLS)
    const admin = createSupabaseServiceClient();

    // 5. Parse path and route
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const resourceId = pathParts[1]; // e.g., /tasks/abc-123

    // 6. Handle methods
    if (req.method === 'GET' && !resourceId) {
      // LIST - always returns { data: [...], total: N }
      const { data, error, count } = await admin
        .from('table_name')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      return createCorsResponse({ data: data || [], total: count || 0 }, 200, req);
    }

    // GET single, POST, PATCH, DELETE...
  } catch (error) {
    return createCorsResponse({ error: error.message }, 500, req);
  }
}
```

### Shared Utilities

**`_shared/supabase.ts`** - Two client factories:

```typescript
// User client - respects RLS, uses request's JWT
export const createSupabaseClient = (req: Request) => {
  return createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: req.headers.get('Authorization')! } },
  });
};

// Service client - bypasses RLS, for admin operations
export const createSupabaseServiceClient = () => {
  return createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};
```

**`_shared/cors.ts`** - CORS headers:

```typescript
export function getCorsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-id, x-request-id',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

export function createCorsResponse(body: any, status: number, req: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(origin), 'Content-Type': 'application/json' },
  });
}
```

---

## Response Format Contract

**This is the #1 source of iOS bugs.** The contract between edge functions and the iOS app must be explicit.

### List Endpoints (arrays)

Edge functions return a **wrapped object**, not a raw array:

```json
{
  "data": [{ "id": "...", "title": "..." }, ...],
  "total": 42,
  "page": 1,
  "limit": 25
}
```

The iOS app uses `requestArray<T>()` which handles both wrapped and raw formats:

```swift
func requestArray<T: Decodable>(_ endpoint: APIEndpoint) async throws -> [T] {
    let data = try await executeRequest(endpoint)
    // Try wrapped { data: [...] } format first
    if let wrapped = try? decoder.decode(WrappedArrayResponse<T>.self, from: data) {
        return wrapped.data
    }
    // Fall back to raw array
    return try decoder.decode([T].self, from: data)
}

struct WrappedArrayResponse<T: Decodable>: Decodable {
    let data: [T]
    let total: Int?
    let page: Int?
    let limit: Int?
    let unread: Int?   // notifications-specific
    let hasMore: Bool?
}
```

### Single-Item Endpoints

Return the object directly (no wrapper):

```json
{ "id": "...", "title": "...", "status": "active" }
```

iOS uses `request<T>()` for these.

### Rules

| Endpoint Pattern | Edge Function Returns | iOS Method |
|---|---|---|
| `GET /resource` (list) | `{ data: [...], total: N }` | `requestArray<T>()` |
| `GET /resource/:id` (single) | `{ id, field1, field2 }` | `request<T>()` |
| `POST /resource` (create) | `{ id, field1, field2 }` | `request<T>()` |
| `PATCH /resource/:id` (update) | `{ id, field1, field2 }` | `request<T>()` |
| `DELETE /resource/:id` | `{ success: true }` | `requestVoid()` |

### Column Naming

- PostgreSQL/PostgREST: `snake_case` (`created_at`, `tenant_id`)
- Edge function responses: `snake_case` (pass-through from PostgREST)
- iOS models: `camelCase` (`createdAt`, `tenantId`)
- Conversion: Automatic via `keyDecodingStrategy = .convertFromSnakeCase`

---

## iOS App Architecture

### Project Structure

```
ios/
├── Package.swift              # SPM dependencies (supabase-swift, lottie-spm)
├── project.yml                # XcodeGen config (version, signing, build settings)
├── Printyx/
│   ├── App/
│   │   ├── PrintyxApp.swift   # @main entry, creates APIClient, injects dependencies
│   │   └── RootView.swift     # Auth state router (Login vs MainTab)
│   ├── Core/
│   │   ├── Auth/
│   │   │   ├── AuthManager.swift    # Login, logout, token refresh, session restore
│   │   │   ├── AuthModels.swift     # LoginRequest, AuthTokenResponse, JWTPayload, AppUser
│   │   │   └── KeychainManager.swift # Secure storage for tokens/tenant/user
│   │   ├── Network/
│   │   │   ├── APIClient.swift      # HTTP client (routing, decoding, token refresh)
│   │   │   ├── APIEndpoint.swift    # Type-safe endpoint definitions
│   │   │   └── APIError.swift       # Error types with user-friendly messages
│   │   ├── Storage/
│   │   │   └── AppConfig.swift      # URLs, keys, environment config
│   │   └── Theme/
│   │       └── AppTheme.swift       # Colors, spacing, typography
│   └── Features/
│       ├── Dashboard/
│       │   ├── Models/DashboardModels.swift
│       │   ├── Services/DashboardService.swift
│       │   ├── ViewModels/DashboardViewModel.swift
│       │   └── Views/DashboardView.swift
│       ├── Tasks/
│       │   ├── Models/TaskModels.swift
│       │   ├── Services/TaskService.swift
│       │   ├── ViewModels/TaskListViewModel.swift
│       │   └── Views/TaskListView.swift
│       ├── ServiceTickets/
│       ├── CRM/
│       ├── Contacts/
│       ├── Equipment/
│       ├── Invoices/
│       ├── Contracts/
│       ├── Opportunities/
│       └── Quotes/
└── Resources/
    └── Info.plist
```

### Dependency Injection

```
PrintyxApp (@main)
    @StateObject APIClient (created once, shared everywhere)
    │
    └── RootView(apiClient)
        @StateObject AuthManager(apiClient)
        │
        ├── [Not Authenticated] → LoginView(authManager)
        └── [Authenticated] → MainTabView(apiClient, authManager)
                                  │
                                  ├── DashboardView → DashboardService(apiClient)
                                  ├── TaskListView → TaskService(apiClient)
                                  ├── TicketsView → ServiceTicketService(apiClient)
                                  └── ... (each feature creates its own Service)
```

### Feature Pattern (MVVM)

For each feature:

1. **Model** - Codable structs matching the edge function JSON
2. **Service** - Thin layer calling `apiClient.request*()` with typed endpoints
3. **ViewModel** - `@MainActor ObservableObject` with `@Published` state
4. **View** - SwiftUI view observing the ViewModel

```swift
// Service (thin wrapper)
@MainActor final class TaskService {
    private let apiClient: APIClient
    func fetchTasks(...) async throws -> [PrintyxTask] {
        try await apiClient.requestArray(.tasks(...))  // ← requestArray for lists
    }
    func fetchTask(id:) async throws -> PrintyxTask {
        try await apiClient.request(.task(id: id))     // ← request for single items
    }
}

// ViewModel
@MainActor final class TaskListViewModel: ObservableObject {
    @Published var tasks: [PrintyxTask] = []
    @Published var isLoading = false
    @Published var error: String?

    func loadInitial() async {
        isLoading = true
        do {
            tasks = try await taskService.fetchTasks(...)
        } catch { self.error = error.localizedDescription }
        isLoading = false
    }
}
```

---

## Authentication Flow

### Login

```
iOS App                    Edge Function (mobile-auth)         GoTrue
   │                              │                              │
   ├── POST /api/mobile-auth/login ──►                           │
   │   { email, password }        │                              │
   │                              ├── signInWithPassword() ──────►
   │                              │                              │
   │                              ◄── { access_token, refresh_token, user }
   │                              │
   ◄── { accessToken, refreshToken, tokenType, expiresIn, user }
   │
   ├── Store in Keychain:
   │   - accessToken (JWT)
   │   - refreshToken
   │   - tenantId (from user.app_metadata.tenant_id)
   │   - userId, email, roleLevel
```

### Every Authenticated Request

```
iOS APIClient
   │
   ├── Headers:
   │   Authorization: Bearer <accessToken>
   │   apikey: <supabaseAnonKey>
   │   x-tenant-id: <tenantId>
   │   X-Client: printyx-ios
   │   X-Request-ID: <uuid>
   │
   ──► Edge Function
       │
       ├── supabase.auth.getUser(jwt) → validates token, returns user
       ├── Extract tenantId from user.app_metadata.tenant_id
       ├── Create admin client (service_role key, bypasses RLS)
       └── Query: .eq('tenant_id', tenantId) ← ALWAYS filter by tenant
```

### Token Refresh (on 401)

```
iOS APIClient detects 401
   │
   ├── POST /api/mobile-auth/refresh { refreshToken }
   │
   ├── Success:
   │   ├── Store new accessToken + refreshToken in Keychain
   │   └── Retry the original request
   │
   └── Failure:
       ├── Clear all Keychain data
       └── Set isAuthenticated = false (redirects to login)
```

### JWT Structure

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "exp": 1234567890,
  "app_metadata": {
    "tenant_id": "tenant-uuid",
    "role_id": "role-uuid",
    "role_level": 5,
    "team_id": "team-uuid",
    "is_platform_user": false
  }
}
```

### Keychain Storage

| Key | Value | Purpose |
|---|---|---|
| `accessToken` | JWT string | Auth header on every request |
| `refreshToken` | Opaque token | Get new accessToken when expired |
| `tenantId` | UUID string | Tenant context header |
| `userId` | UUID string | Current user ID |
| `userEmail` | Email string | Display and identification |
| `roleLevel` | Int string | RBAC level (1=Guest, 8=PlatformAdmin) |

Service ID: `net.printyx.ios` (tied to app bundle).

---

## The Date Format Problem

### PostgreSQL Timestamp Formats

PostgreSQL has two timestamp types that produce **different JSON** through PostgREST:

| Drizzle Schema | PostgreSQL Type | PostgREST JSON Output |
|---|---|---|
| `timestamp('col')` | `timestamp without time zone` | `"2024-01-15T10:30:00"` or `"2024-01-15T10:30:00.123456"` |
| `timestamp('col', { withTimezone: true })` | `timestamp with time zone` | `"2024-01-15T10:30:00+00:00"` or `"2024-01-15T10:30:00.123456+00:00"` |
| `date('col')` | `date` | `"2024-01-15"` |

### What iOS Can Parse

```swift
// PARSES:     "2024-01-15T10:30:00Z"
// PARSES:     "2024-01-15T10:30:00+00:00"
// FAILS:      "2024-01-15T10:30:00"           ← no timezone!
// FAILS:      "2024-01-15T10:30:00.123456"    ← fractional seconds + no timezone!
// FAILS:      "2024-01-15T10:30:00.123+00:00" ← fractional seconds!
```

### The Fix: Two-Layer Defense

**Layer 1: Server-side normalization** in `server.ts` converts ALL dates to `"2024-01-15T10:30:00Z"`:

```typescript
const PG_TIMESTAMP_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;

function normalizeDates(value: unknown): unknown {
  if (typeof value === 'string' && PG_TIMESTAMP_RE.test(value)) {
    const withTz = /[Z+\-]\d/.test(value.slice(-6)) ? value : value + 'Z';
    const d = new Date(withTz);
    if (!isNaN(d.getTime())) return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  if (Array.isArray(value)) return value.map(normalizeDates);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, normalizeDates(v)])
    );
  }
  return value;
}
```

**Layer 2: iOS decoder fallbacks** in `APIClient.swift` (10 format patterns):

```swift
decoder.dateDecodingStrategy = .custom { decoder in
    let container = try decoder.singleValueContainer()
    let dateString = try container.decode(String.self)

    // ISO8601 with fractional seconds, then standard, then 10 DateFormatter fallbacks
    // See APIClient.swift for full implementation
}
```

---

## Decoding Resilience

### Wrapped vs Raw Array Responses

Edge functions return `{ data: [...], total: N }` but `JSONDecoder` expects the exact type. Use `requestArray<T>()` which tries wrapped first, falls back to raw:

```swift
func requestArray<T: Decodable>(_ endpoint: APIEndpoint) async throws -> [T] {
    let data = try await executeRequest(endpoint)
    if let wrapped = try? decoder.decode(WrappedArrayResponse<T>.self, from: data) {
        return wrapped.data
    }
    return try decoder.decode([T].self, from: data)
}
```

**Rule: Every service method that returns an array MUST use `requestArray()`, not `request()`.**

### Detailed Decoding Errors

Swift's default decode errors are useless. Always extract the coding path:

```swift
case .typeMismatch(let type, let context):
    "Type mismatch at '\(context.codingPath)': expected \(type)"
// Produces: "Type mismatch at 'index 0.createdAt': expected Date"
```

### Enum Safety

Backend adds new values → iOS enum fails to decode → entire screen breaks.

```swift
// SAFE: Unknown fallback
enum Status: String, Codable {
    case active, inactive, archived, unknown
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Status(rawValue: raw) ?? .unknown
    }
}

// SAFER: Just use String for volatile fields
struct Record: Codable {
    let status: String  // Backend can add values freely
}
```

### Nullable Fields

Every field that might be `null` in PostgreSQL MUST be `Optional` in Swift:

```swift
struct Task: Codable {
    let id: String          // NOT NULL in DB → non-optional
    let title: String       // NOT NULL → non-optional
    let description: String? // nullable → optional
    let dueDate: Date?      // nullable → optional
    let createdAt: Date?    // even timestamps should be optional (schema drift)
}
```

---

## Multi-Backend Request Routing

### iOS APIClient Routing Logic

```swift
private func buildURLRequest(for endpoint: APIEndpoint) throws -> URLRequest {
    let baseURL: URL
    let path: String

    if endpoint.path.hasPrefix("/auth/") {
        // Auth → Kong/GoTrue at api.printyx.net
        baseURL = configuration.supabaseURL
        path = endpoint.path
    } else if endpoint.path.hasPrefix("/api/") {
        // API → Edge Functions at functions.printyx.net
        baseURL = configuration.edgeFunctionsURL
        path = String(endpoint.path.dropFirst(4)) // "/api/tasks" → "/tasks"
    } else {
        // Everything else → Express at printyx.net
        baseURL = configuration.baseURL
        path = endpoint.path
    }
    // ...
}
```

### URL Configuration

```swift
// AppConfig.swift
enum AppConfig {
    static var apiBaseURL: String {
        #if DEBUG
        "http://localhost:5000"
        #else
        "https://printyx.net"
        #endif
    }
    static var edgeFunctionsURL: String { "https://functions.printyx.net" }
    static var supabaseURL: String { "https://api.printyx.net" }
}
```

---

## CI/CD: GitHub Actions Build & Deploy

### Workflow: `ios-deploy.yml`

**Trigger:** Manual dispatch (with optional version/build inputs)

**Jobs:**

#### 1. Determine Version

```yaml
# Reads version from project.yml, auto-increments build number
CURRENT_VERSION=$(grep 'MARKETING_VERSION:' project.yml | sed 's/.*: *"\(.*\)"/\1/')
CURRENT_BUILD=$(grep 'CURRENT_PROJECT_VERSION:' project.yml | sed 's/.*: *"\(.*\)"/\1/')
BUILD=$((CURRENT_BUILD + 1))
```

#### 2. Build & Test

```yaml
steps:
  - Select Xcode (26.2)
  - Install XcodeGen (brew)
  - Inject version into project.yml (sed)
  - xcodegen generate
  - xcodebuild -resolvePackageDependencies
  - xcodebuild build-for-testing (iOS Simulator)
    # Injects SUPABASE_URL and SUPABASE_ANON_KEY as build settings
```

#### 3. Deploy to App Store Connect

```yaml
steps:
  # Code signing
  - Decode .p12 certificate from base64 secret
  - Decode provisioning profile from base64 secret
  - Create temporary keychain
  - Import certificate into keychain
  - Extract profile UUID, install to ~/Library/MobileDevice/Provisioning Profiles/
  - Inject UUID into project.yml

  # Build
  - xcodegen generate (with signing config)
  - xcodebuild archive (-destination 'generic/platform=iOS')
  - Create ExportOptions.plist (method=app-store, manual signing)
  - xcodebuild -exportArchive → IPA

  # Upload
  - Create App Store Connect API key file from base64 secret
  - xcrun altool --upload-app (IPA → App Store Connect)

  # Tag
  - git tag ios/v{version}-{build}
  - git push origin tag
```

### Required GitHub Secrets (10)

| Secret | Description | How to Get |
|---|---|---|
| `APPLE_DEVELOPER_TEAM_ID` | 10-char Team ID | developer.apple.com → Membership |
| `APP_STORE_CONNECT_API_KEY_ID` | API Key ID | appstoreconnect.apple.com → Users → Keys |
| `APP_STORE_CONNECT_ISSUER_ID` | Issuer ID | Same page as above |
| `APP_STORE_CONNECT_API_KEY_P8` | Private key (.p8), base64-encoded | `base64 -i AuthKey_XXXX.p8` |
| `IOS_CERTIFICATE_P12` | Distribution cert (.p12), base64-encoded | Export from Keychain Access |
| `IOS_CERTIFICATE_PASSWORD` | Password for .p12 | Set when exporting |
| `IOS_PROVISIONING_PROFILE` | App Store profile, base64-encoded | developer.apple.com → Profiles |
| `KEYCHAIN_PASSWORD` | Any random string | Generate: `openssl rand -hex 20` |
| `SUPABASE_URL` | `https://api.printyx.net` | Your Supabase instance |
| `SUPABASE_ANON_KEY` | Supabase anon JWT | Supabase dashboard → API |

### XcodeGen Project Config (`project.yml`)

```yaml
name: Printyx
options:
  bundleIdPrefix: net.printyx
  deploymentTarget:
    iOS: "17.0"
  xcodeVersion: "15.0"

settings:
  base:
    MARKETING_VERSION: "1.0.0"
    CURRENT_PROJECT_VERSION: "1"
    SWIFT_VERSION: "5.9"
    TARGETED_DEVICE_FAMILY: "1,2"  # iPhone + iPad

targets:
  Printyx:
    type: application
    platform: iOS
    sources: [Printyx]
    settings:
      configs:
        Release:
          CODE_SIGN_STYLE: Manual
          CODE_SIGN_IDENTITY: "Apple Distribution"
          PROVISIONING_PROFILE_SPECIFIER: "__PROVISIONING_PROFILE_UUID__"
          DEVELOPMENT_TEAM: "YOUR_TEAM_ID"
    dependencies:
      - package: supabase-swift     # Auth client
      - package: lottie-spm         # Animations

packages:
  supabase-swift:
    url: https://github.com/supabase-community/supabase-swift
    from: "2.0.0"
  lottie-spm:
    url: https://github.com/airbnb/lottie-spm
    from: "4.4.0"
```

---

## Edge Function Deployment

### Method 1: Git Push (Recommended for Production)

```bash
git add supabase/functions/
git commit -m "fix: update edge functions"
git push origin main
# Coolify detects push → rebuilds Docker container → redeploys (2-3 min)
```

### Method 2: Direct Upload (Fast for Hotfixes)

```powershell
# PowerShell script at deployment/deploy-functions-direct.ps1
# Backs up, uploads via SCP, restarts container
```

### Dockerfile (`Dockerfile.edge-functions`)

```dockerfile
FROM denoland/deno:1.38.5
WORKDIR /app
COPY supabase/functions ./functions
ENV SUPABASE_URL="" SUPABASE_ANON_KEY="" SUPABASE_SERVICE_ROLE_KEY=""
RUN deno cache --reload functions/**/*.ts
EXPOSE 8000
# Entry: deno run --allow-all /app/server.ts
```

### Verifying Deployment

```bash
# Health check
curl https://functions.printyx.net/health
# Expected: { "status": "healthy", "functions": ["tasks", "activities", ...] }

# Test a specific function
curl https://functions.printyx.net/tasks \
  -H "Authorization: Bearer <jwt>" \
  -H "apikey: <anon_key>"
```

---

## Schema Drift & Database Gotchas

These issues caused multi-hour debugging sessions. Prevent them:

### 1. Column Doesn't Exist

The Drizzle schema defines a column but the actual PostgreSQL table doesn't have it. Edge function tries to SELECT/INSERT that column → PostgREST returns an error.

**Fix:** Always verify columns exist before using them in edge functions:
```bash
curl "https://api.printyx.net/rest/v1/table_name?select=column_name&limit=1" \
  -H "apikey: <service_role_key>" -H "Authorization: Bearer <service_role_key>"
# 200 = column exists, error = it doesn't
```

**Prevention:** Run `ALTER TABLE ADD COLUMN IF NOT EXISTS` for new columns, or use `npm run db:migrate`.

### 2. Table Doesn't Exist

Edge function queries a table that was never created.

**Fix:** Handle gracefully with error code checks:
```typescript
if (error.code === '42P01' || error.code === 'PGRST205') {
  return createCorsResponse({ data: [], total: 0 }, 200, req);
}
```

### 3. PostgREST Schema Cache

PostgREST caches the database schema. After adding columns/tables:
```sql
NOTIFY pgrst, 'reload schema';
```
Or restart the PostgREST container.

### 4. Missing Default Values

`id` columns may lack `DEFAULT gen_random_uuid()`. Always provide explicit IDs in INSERTs:
```typescript
const record = { id: crypto.randomUUID(), ...data };
```

### 5. RLS Permissions

Creating a table requires BOTH:
```sql
GRANT ALL ON table_name TO authenticated;
GRANT ALL ON table_name TO service_role;
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
CREATE POLICY "..." ON table_name FOR ALL USING (...);
```

---

## Checklist: Adding a New Feature End-to-End

### Backend (Edge Function)

- [ ] Create `supabase/functions/{name}/index.ts`
- [ ] Follow the handler pattern (CORS, auth, tenant extraction, CRUD)
- [ ] List endpoints return `{ data: [...], total: N }` format
- [ ] Single item endpoints return the object directly
- [ ] All queries include `.eq('tenant_id', tenantId)`
- [ ] Order by `created_at` (not a column that might not exist)
- [ ] Handle errors with appropriate status codes
- [ ] Test with `curl` before touching iOS

### Database

- [ ] Verify table exists in PostgreSQL (not just in Drizzle schema)
- [ ] Verify all columns used in the edge function actually exist
- [ ] Grant PostgREST access (`GRANT` + RLS policies)
- [ ] Run `NOTIFY pgrst, 'reload schema'` after schema changes

### iOS Model

- [ ] Create `Features/{Name}/Models/{Name}Models.swift`
- [ ] Use `camelCase` properties (decoder converts from `snake_case`)
- [ ] All nullable DB columns → `Optional` properties
- [ ] Date fields → `Date?` (optional, in case of null)
- [ ] Enums → Use `String` or add `.unknown` fallback case
- [ ] Conform to `Identifiable, Codable`

### iOS Service

- [ ] Create `Features/{Name}/Services/{Name}Service.swift`
- [ ] `@MainActor final class` with `APIClient` dependency
- [ ] List methods → `requestArray()` (NOT `request()`)
- [ ] Single item methods → `request()`
- [ ] Delete methods → `requestVoid()`

### iOS Endpoint

- [ ] Add static functions to `APIEndpoint.swift`
- [ ] Path starts with `/api/` (routes to edge functions)
- [ ] Query parameters for filtering/pagination
- [ ] `requiresAuth: true` for protected endpoints

### iOS ViewModel & View

- [ ] `@MainActor ObservableObject` ViewModel
- [ ] `@Published` state for data, loading, error
- [ ] SwiftUI View with loading/empty/error states
- [ ] Pull-to-refresh with `.refreshable`

---

## Debugging Playbook

### "Data Error: unexpected type for X (expected Array)"

**Cause:** Edge function returns `{ data: [...] }` but service uses `request()` instead of `requestArray()`.

**Fix:** Change the service method to use `apiClient.requestArray(...)`.

### "Cannot decode date: 2024-01-15T10:30:00.123456"

**Cause:** PostgreSQL timestamp format with 6-digit fractional seconds.

**Fix:** Verify `server.ts` `normalizeDates()` is running. Check if the function is loaded by checking `/health` endpoint.

### "column X does not exist" (PGRST error)

**Cause:** Edge function references a column that doesn't exist in the actual database (schema drift).

**Fix:** Either add the column with `ALTER TABLE ADD COLUMN IF NOT EXISTS` or update the edge function to use an existing column.

### "relation X does not exist"

**Cause:** Edge function queries a table that was never created.

**Fix:** Create the table, grant permissions, enable RLS, notify PostgREST to reload schema.

### PGRST002 "Could not connect to database"

**Cause:** PostgREST can't reach PostgreSQL (Docker networking, wrong schema in config).

**Fix:** Check PostgREST logs for the specific error. Common: `db-schemas` config includes a schema that doesn't exist. Create it or remove from config.

### 401 Unauthorized (token expired)

**Cause:** JWT expired between token issuance and API call.

**Fix:** iOS `APIClient` auto-refreshes on 401. If refresh also fails, user is logged out. Check that the `mobile-auth` edge function is deployed and working.

### iOS app shows empty data but no errors

**Cause:** Edge function returning `{ data: [], total: 0 }` because of a silent error catch, wrong tenant ID, or table is empty.

**Fix:** Check edge function logs, verify tenant ID in JWT matches data in database.

---

## File Reference Map

| Purpose | File |
|---|---|
| **iOS** | |
| App entry point | `ios/Printyx/App/PrintyxApp.swift` |
| Auth state router | `ios/Printyx/App/RootView.swift` |
| HTTP client | `ios/Printyx/Core/Network/APIClient.swift` |
| Endpoint definitions | `ios/Printyx/Core/Network/APIEndpoint.swift` |
| Error types | `ios/Printyx/Core/Network/APIError.swift` |
| Token storage | `ios/Printyx/Core/Auth/KeychainManager.swift` |
| Auth manager | `ios/Printyx/Core/Auth/AuthManager.swift` |
| Auth models & JWT | `ios/Printyx/Core/Auth/AuthModels.swift` |
| URL configuration | `ios/Printyx/Core/Storage/AppConfig.swift` |
| XcodeGen config | `ios/project.yml` |
| SPM dependencies | `ios/Package.swift` |
| App manifest | `ios/Printyx/Resources/Info.plist` |
| **Edge Functions** | |
| Router / normalizer | `supabase/functions/server.ts` |
| CORS utilities | `supabase/functions/_shared/cors.ts` |
| Supabase clients | `supabase/functions/_shared/supabase.ts` |
| Handler template | `supabase/functions/{name}/index.ts` |
| Dockerfile | `Dockerfile.edge-functions` |
| Docker Compose | `docker-compose.edge-functions.yml` |
| **CI/CD** | |
| iOS deploy workflow | `.github/workflows/ios-deploy.yml` |
| Mobile CI workflow | `.github/workflows/mobile-ci.yml` |
| Fastlane metadata | `mobile/fastlane/Fastfile` |
| **Database** | |
| Drizzle schema | `shared/schema.ts` |
| Specialized schemas | `shared/*-schema.ts` |
| Migrations | `drizzle/migrations/` |
| **Documentation** | |
| This guide | `ios-docs/supabase-edge-functions-ios-integration.md` |
| Edge function deploy | `SUPABASE_EDGE_FUNCTIONS_DEPLOYMENT.md` |
| Coolify quickstart | `COOLIFY_EDGE_FUNCTIONS_QUICKSTART.md` |
