# FotoFácil — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Fase 1 of FotoFácil, a mobile-first web app with three sides:
- **Photographer:** registers clients with wristbands, confirms payments manually and uploads photos and videos.
- **Client:** finds her own media by face, using AWS Rekognition.
- **Admin:** manages photographers, retention and commission settlements.

Asaas PIX automation is Fase 2 and out of scope.

**Architecture:**
- One Next.js 15 (App Router) app on Vercel.
- **Supabase:**
  - Postgres, where RLS and plpgsql functions own every money and state rule.
  - Auth for the admin and photographers.
  - Storage: a private `media` bucket and a public `public-assets` bucket.
- **Upload pipeline:** the photographer's browser compresses photos, reads EXIF and extracts video frames, then uploads straight to Storage through signed URLs. A server route indexes faces through a `FaceProvider` interface (Rekognition in production, a deterministic fake for dev and E2E).
- **Client access:** clients never log in. After the 4-digit check they get an HMAC-signed httpOnly cookie. Every client route runs server-side with the Supabase secret key.

**Tech Stack:**

| Area | Libraries |
|---|---|
| Runtime and framework | Node 22, Next.js 15.5.27, React 19, TypeScript, Tailwind CSS 4 |
| Supabase | `@supabase/supabase-js` 2, `@supabase/ssr` 0.12 |
| Face recognition | `@aws-sdk/client-rekognition` 3 |
| Validation and data | zod 4, libphonenumber-js |
| Media and files | exifr, client-zip, qrcode, image-size 2 |
| Tests | Vitest 3.2, `pg` 8 (DB tests), Playwright 1.56.1 |

**Spec:** `docs/superpowers/specs/2026-10-13-fotofacil-design.md`

**Out of scope for this plan (Fase 2):** Asaas PIX charges, split and webhooks (spec §7); the `payments` table; spec rule 7 (a duplicate payment through the other method, which can only happen once PIX exists) and its dashboard alert; the "Pagar com PIX" button on the payment notice. Fase 1 ships the manual flow end to end, and every Fase 1 table already carries `payment_method = 'pix'` so Fase 2 plugs in without schema changes to settlements.

## Global Constraints

**Language**
- UI copy is Brazilian Portuguese.
- Code identifiers, DB columns and commit messages are English.

**Money and dates**
- Money is stored as integer cents (`*_cents`).
- Percent commission is stored in basis points (`1500` = 15%).
- Commission is frozen on payment: percent → `round(price × bp / 10000)`; fixed → `min(value, price)`.
- Business dates use `America/Sao_Paulo`. `date` columns are `'YYYY-MM-DD'`.
- An event is available while `status = 'active'` and `expires_at >= today (São Paulo)`, where `expires_at = end_date + retention_days`.

**Identity**
- Client identity is the phone, normalized to E.164 and UNIQUE.
- The client name list shows `"Primeiro S."`.

**Media**
- Photos are compressed in the browser to max side 3000px, JPEG quality 0.85. Thumbnails: max side 400px, quality 0.75.
- Video frames: 1280px max side, 1 per second, at most 120 per video (spread evenly when the video is longer than 120 s).
- The `media` bucket is private. Signed download URLs live 600 s. The selfie is never persisted.

**Limits**
- 5 failed 4-digit attempts per 15 minutes, per registration and per IP.
- `settings.daily_search_limit` searches per registration per São Paulo day.
- A photographer's `retention_days` must be ≤ `settings.max_retention_days`.

**Undo rule:** a photographer may undo a **manual** confirmation only when `first_access_at IS NULL` and `settlement_id IS NULL`. The admin may undo unless the registration sits in a **paid** settlement.

**Secrets and errors**
- These are read only in server code: `SUPABASE_SECRET_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `CLIENT_SESSION_SECRET` (≥ 32 chars), `CRON_SECRET` (≥ 16 chars).
- `FACE_PROVIDER` must be `rekognition` or `fake`. Anything else throws.
- Postgres functions raise these error codes as the exception message: `not_authorized`, `not_found`, `already_registered`, `event_not_active`, `terms_required`, `invalid_state`, `undo_locked`, `no_sales`, `retention_exceeds_max`.

## Review Focus

These are the five inputs most likely to bite real users that no other task's tests exercise. Each one is pinned by a test in the owning task:

1. **Phone typed in any common format.** `"71 99123-4567"`, `"(71)991234567"`, `"+55 71 9 9123 4567"` and `"071991234567"` must resolve to the same client (`+5571991234567`). Test: **Task 2** `phone.test.ts`.
2. **Two clients with the same short name in one event.** Two "Ana S." must both be listed, sorted, and never merged. Test: **Task 2** `names.test.ts` (`buildNameList`).
3. **Double-tap on "Entregar pulseira" or "Confirmar pagamento".** It must yield one registration and one log row, and the second call must fail cleanly. Test: **Task 5** `registration.test.ts`.
4. **A selfie that is not usable.** No face, several faces, too dark, or an event with no indexed photos yet: each gives a specific message and none of them locks the undo rule. Tests: **Task 5** (an empty `record_face_search` keeps `first_access_at` null), **Task 16** (`search.test.ts`, `luminance.test.ts`).
5. **A photo without EXIF, or a video the browser cannot decode.** The photo falls back to today's date. The video is stored with `face_indexing = 'unsupported'`, is marked ready without indexing, and the photographer is told. Tests: **Task 12** (`processing.test.ts`, unsupported video) and **Task 14** (`media-math.test.ts`, `takenOnFrom`).

---

## File Structure

```
.env.example                       env var template (committed)
next.config.ts                     server action body limit 5mb
vitest.config.ts                   projects: unit, db
playwright.config.ts               E2E against next start, FACE_PROVIDER=fake
scripts/create-admin.ts            creates the first admin user
supabase/migrations/
  20261013000100_schema.sql        tables, constraints, buckets, grants, RLS on
  20261013000200_rls.sql           helper fns, policies, guard triggers
  20261013000300_registration_rpc.sql  wristband/payment/search functions
  20261013000400_settlements.sql   settlement functions
supabase/cron.sql                  pg_cron + pg_net jobs (run once per environment)
src/components/
  ui.tsx                           Button, Input, Select, Field, Card, ErrorText, PageTitle, buttonClass
  action-form.tsx                  generic useActionState form
  submit-button.tsx                pending-aware submit
src/lib/
  action-state.ts                  ActionState type
  async.ts                         mapLimit, withRetry
  cron.ts                          isCronAuthorized
  errors.ts                        DB error code → pt-BR message
  http.ts                          clientIp
  legal.ts                         terms/consent/privacy texts
  validation.ts                    zod schemas + parseForm
  domain/                          pure functions, all unit tested
    phone.ts names.ts money.ts commission.ts whatsapp.ts slug.ts dates.ts
    events.ts registrations.ts access.ts media-math.ts luminance.ts
    client-view.ts gallery.ts dashboard.ts
  supabase/ server.ts admin.ts browser.ts middleware.ts
  auth/ session.ts guards.ts
  client-session/ token.ts cookie.ts
  faces/ provider.ts rekognition.ts fake.ts index.ts
  media/ paths.ts upload-request.ts processing.ts processing-repo.ts
         deletion.ts deletion-repo.ts signed-urls.ts
  search/ search.ts search-repo.ts messages.ts
  public/ queries.ts               event/registration lookups for client pages
  gallery/ queries.ts              client media listing
  photographers/ photo.ts          avatar upload + public URL
  upload/ prepare-image.ts prepare-video.ts   (browser only)
src/middleware.ts
src/app/                           routes (see each task)
tests/empty-module.ts              stub for `server-only` in Vitest
tests/unit/**                      Vitest unit tests
tests/db/**                        Vitest + real Postgres (shim of Supabase auth/storage)
tests/e2e/**                       Playwright
```

---

### Task 1: Project scaffold and tooling

**Files:**
- Create (generated): the Next.js app at the repo root via `create-next-app`
- Create: `next.config.ts`, `vitest.config.ts`, `tests/empty-module.ts`, `.env.example`, `eslint.config.mjs`, `src/components/ui.tsx`, `src/components/submit-button.tsx`, `src/components/action-form.tsx`, `src/lib/action-state.ts`
- Modify: `package.json` (scripts), `.gitignore`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

**Interfaces:**
- Produces:
  - `ActionState = { error: string | null; ok?: boolean }` and `initialActionState`
  - `<ActionForm action submitLabel className? pendingText?>`
  - `<SubmitButton>`
  - UI primitives: `Button`, `Input`, `Select`, `Field`, `Card`, `ErrorText`, `PageTitle` and `buttonClass(variant)`

- [ ] **Step 1: Generate the app**

```bash
cd /home/user/FotoFacil
npx --yes create-next-app@15.5.27 . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack --yes
```
Expected: the project files are created next to the existing `docs/` folder. If the CLI asks about `docs/`, keep it.

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js@^2.117.0 @supabase/ssr@^0.12.0 @aws-sdk/client-rekognition@^3 libphonenumber-js@^1.13.0 exifr@^7.1.3 client-zip@^2.5.1 zod@^4 qrcode@^1.5.4 image-size@^2.0.4 server-only
npm install -D vitest@3.2.7 @playwright/test@1.56.1 pg@^8 @types/pg@^8 @types/qrcode tsx@^4
```

- [ ] **Step 3: Write configuration files**

`next.config.ts`:
```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: '5mb' } },
}

export default nextConfig
```

`vitest.config.ts`:
```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const src = fileURLToPath(new URL('./src', import.meta.url))
const emptyModule = fileURLToPath(new URL('./tests/empty-module.ts', import.meta.url))

export default defineConfig({
  resolve: { alias: { '@': src, 'server-only': emptyModule } },
  test: {
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' } },
      {
        extends: true,
        test: {
          name: 'db',
          include: ['tests/db/**/*.test.ts'],
          globalSetup: ['tests/db/global-setup.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
})
```

`tests/empty-module.ts`:
```ts
export {}
```

`eslint.config.mjs` (replace the generated file):
```js
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

const __dirname = dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  { rules: { '@next/next/no-img-element': 'off' } },
  { ignores: ['node_modules/**', '.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**'] },
]

export default eslintConfig
```

`.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SECRET_KEY=sb_secret_xxx
NEXT_PUBLIC_SITE_URL=http://localhost:3000
# 32+ random characters (openssl rand -hex 32)
CLIENT_SESSION_SECRET=
# 16+ random characters, also used in supabase/cron.sql
CRON_SECRET=
# rekognition | fake
FACE_PROVIDER=fake
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

Append to `.gitignore`:
```
!.env.example
/playwright-report
/test-results
/tests/e2e/.state.json
```

In `package.json`, set `"scripts"` to:
```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run --project unit",
  "test:db": "vitest run --project db",
  "test:e2e": "playwright test",
  "create-admin": "tsx --env-file=.env.local scripts/create-admin.ts"
}
```

- [ ] **Step 4: Write the shared UI primitives and form helpers**

`src/app/globals.css` (replace):
```css
@import "tailwindcss";
```

`src/lib/action-state.ts`:
```ts
export interface ActionState {
  error: string | null
  ok?: boolean
}

export const initialActionState: ActionState = { error: null }
```

`src/components/ui.tsx`:
```tsx
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

const variants = {
  primary: 'bg-pink-600 text-white hover:bg-pink-700',
  secondary: 'bg-white text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
} as const

export type ButtonVariant = keyof typeof variants

export function buttonClass(variant: ButtonVariant = 'primary'): string {
  return `inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${variants[variant]}`
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={`${buttonClass(variant)} ${className}`} {...props} />
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-base ${className}`} {...props} />
}

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-base ${className}`} {...props} />
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-gray-500">{hint}</span> : null}
    </label>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl bg-white p-4 shadow-sm ring-1 ring-gray-200 ${className}`}>{children}</div>
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="text-sm text-red-600">
      {children}
    </p>
  )
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="text-xl font-semibold text-gray-900">{children}</h1>
}
```

`src/components/submit-button.tsx`:
```tsx
'use client'

import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { Button, type ButtonVariant } from './ui'

export function SubmitButton({
  children,
  pendingText = 'Salvando…',
  variant = 'primary',
}: {
  children: ReactNode
  pendingText?: string
  variant?: ButtonVariant
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} variant={variant}>
      {pending ? pendingText : children}
    </Button>
  )
}
```

`src/components/action-form.tsx`:
```tsx
'use client'

import { useActionState, type ReactNode } from 'react'
import { initialActionState, type ActionState } from '@/lib/action-state'
import { SubmitButton } from './submit-button'
import { ErrorText } from './ui'

export function ActionForm({
  action,
  submitLabel,
  pendingText,
  className = 'space-y-3',
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  submitLabel: string
  pendingText?: string
  className?: string
  children: ReactNode
}) {
  const [state, formAction] = useActionState(action, initialActionState)
  return (
    <form action={formAction} className={className}>
      {children}
      <ErrorText>{state.error}</ErrorText>
      {state.ok ? <p className="text-sm text-green-700">Salvo!</p> : null}
      <SubmitButton pendingText={pendingText}>{submitLabel}</SubmitButton>
    </form>
  )
}
```

`src/app/layout.tsx` (replace):
```tsx
import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'FotoFácil',
  description: 'Encontre suas fotos do evento pelo rosto.',
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      </body>
    </html>
  )
}
```

`src/app/page.tsx` (replace; Task 15 rewrites it):
```tsx
export default function Home() {
  return <h1 className="text-2xl font-semibold">FotoFácil</h1>
}
```

Delete the generated assets that are no longer referenced: `rm -f src/app/favicon.ico public/*.svg`.

- [ ] **Step 5: Verify the scaffold**

Run: `npm run lint && npm run typecheck && npm run build`
Expected: all three succeed. The build lists the route `/`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with Tailwind, Vitest and shared UI primitives"
```

---

### Task 2: Domain utilities (phone, names, money, commission, WhatsApp, slug, dates)

**Files:**
- Create: `src/lib/domain/phone.ts`, `names.ts`, `money.ts`, `commission.ts`, `whatsapp.ts`, `slug.ts`, `dates.ts`
- Test: `tests/unit/domain/phone.test.ts`, `names.test.ts`, `money.test.ts`, `text.test.ts`, `dates.test.ts`

**Interfaces:**
- Produces:
  - **Phone:** `normalizePhone(input: string): string | null`, `maskPhone(e164: string): string`, `phoneLast4(e164: string): string`
  - **Names:** `displayName(fullName: string): string`, `buildNameList(rows: { registrationId: string; fullName: string }[]): { registrationId: string; label: string }[]`, `matchesNameFilter(label: string, filter: string): boolean`
  - **Money:** `formatBRL(cents: number): string`, `parseBRLToCents(input: string): number | null`
  - **Commission:** `type CommissionType = 'percent' | 'fixed'`, `describeCommission(type: CommissionType, value: number): string`, `parsePercentToBasisPoints(input: string): number | null`, `formatCommissionInput(type: CommissionType, value: number): string`
  - **WhatsApp:** `whatsappLink(e164: string, message: string): string`, `paymentRequestMessage(clientFullName: string, eventName: string): string`
  - **Slug:** `slugify(input: string): string`, `eventSlug(name: string, suffix?: string): string`
  - **Dates:** `todayInSaoPaulo(now?: Date): string`, `startOfTodaySaoPauloISO(now?: Date): string`, `formatDayMonth(iso: string): string`, `formatDate(iso: string): string`, `addDays(iso: string, days: number): string`, `daysUntil(fromIso: string, toIso: string): number`, `localDateOf(date: Date): string`

- [ ] **Step 1: Write the failing tests**

`tests/unit/domain/phone.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { maskPhone, normalizePhone, phoneLast4 } from '@/lib/domain/phone'

describe('normalizePhone', () => {
  it.each(['71 99123-4567', '(71)991234567', '+55 71 9 9123 4567', '071991234567', '5571991234567'])(
    'normalizes %s to E.164',
    input => {
      expect(normalizePhone(input)).toBe('+5571991234567')
    },
  )

  it('rejects invalid numbers', () => {
    expect(normalizePhone('123')).toBeNull()
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('abc')).toBeNull()
  })
})

describe('maskPhone', () => {
  it('masks Brazilian numbers keeping DDD, first digit and last 4', () => {
    expect(maskPhone('+5571991234567')).toBe('(71) 9****-4567')
  })

  it('masks foreign numbers keeping country code and last 4', () => {
    expect(maskPhone('+14155552671')).toBe('+14 ****-2671')
  })
})

describe('phoneLast4', () => {
  it('returns the last four digits', () => {
    expect(phoneLast4('+5571991234567')).toBe('4567')
  })
})
```

`tests/unit/domain/names.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { buildNameList, displayName, matchesNameFilter } from '@/lib/domain/names'

describe('displayName', () => {
  it('shows first name and last-name initial', () => {
    expect(displayName('ana maria SOUZA')).toBe('Ana S.')
  })

  it('handles a single name and extra spaces', () => {
    expect(displayName('  bia  ')).toBe('Bia')
  })

  it('handles accented names', () => {
    expect(displayName('Ágata Érica Ávila')).toBe('Ágata Á.')
  })
})

describe('buildNameList', () => {
  it('keeps clients with the same short name separate and sorts by label', () => {
    const list = buildNameList([
      { registrationId: 'r3', fullName: 'Carla Lima' },
      { registrationId: 'r1', fullName: 'Ana Souza' },
      { registrationId: 'r2', fullName: 'Ana Santos' },
    ])
    expect(list.map(i => i.label)).toEqual(['Ana S.', 'Ana S.', 'Carla L.'])
    expect(new Set(list.map(i => i.registrationId)).size).toBe(3)
  })
})

describe('matchesNameFilter', () => {
  it('ignores case and accents', () => {
    expect(matchesNameFilter('Ágata Á.', 'aga')).toBe(true)
    expect(matchesNameFilter('Ana S.', 'bia')).toBe(false)
    expect(matchesNameFilter('Ana S.', '  ')).toBe(true)
  })
})
```

`tests/unit/domain/money.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { centsToInput, formatBRL, parseBRLToCents } from '@/lib/domain/money'
import { describeCommission, formatCommissionInput, parsePercentToBasisPoints } from '@/lib/domain/commission'

describe('formatBRL', () => {
  it('formats cents as reais', () => {
    expect(formatBRL(5000)).toBe('R$ 50,00')
    expect(formatBRL(123456)).toBe('R$ 1.234,56')
  })
})

describe('centsToInput', () => {
  it('formats cents for a form input', () => {
    expect(centsToInput(5000)).toBe('50,00')
    expect(centsToInput(123456)).toBe('1234,56')
  })
})

describe('parseBRLToCents', () => {
  it.each([
    ['50', 5000],
    ['50,5', 5050],
    ['50,00', 5000],
    ['1.234,56', 123456],
    ['R$ 50,00', 5000],
    ['0', 0],
  ])('parses %s', (input, cents) => {
    expect(parseBRLToCents(input)).toBe(cents)
  })

  it.each(['abc', '50.00', '', '-5', '1,234'])('rejects %s', input => {
    expect(parseBRLToCents(input)).toBeNull()
  })
})

describe('commission helpers', () => {
  it('parses percentages into basis points', () => {
    expect(parsePercentToBasisPoints('15')).toBe(1500)
    expect(parsePercentToBasisPoints('15,5%')).toBe(1550)
    expect(parsePercentToBasisPoints('100')).toBe(10000)
    expect(parsePercentToBasisPoints('101')).toBeNull()
    expect(parsePercentToBasisPoints('x')).toBeNull()
  })

  it('describes commissions', () => {
    expect(describeCommission('percent', 1550)).toBe('15,5%')
    expect(describeCommission('fixed', 500)).toBe('R$ 5,00')
  })

  it('formats commission values for form inputs', () => {
    expect(formatCommissionInput('percent', 1550)).toBe('15,5')
    expect(formatCommissionInput('fixed', 500)).toBe('5,00')
  })
})
```

`tests/unit/domain/text.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { paymentRequestMessage, whatsappLink } from '@/lib/domain/whatsapp'
import { eventSlug, slugify } from '@/lib/domain/slug'

describe('whatsappLink', () => {
  it('builds a wa.me link with an encoded message', () => {
    expect(whatsappLink('+5571991234567', 'Oi, tudo bem?')).toBe('https://wa.me/5571991234567?text=Oi%2C%20tudo%20bem%3F')
  })

  it('writes the payment request message', () => {
    expect(paymentRequestMessage('Ana Souza', 'Carnaval 2027')).toBe(
      'Oi! Sou Ana Souza, do evento Carnaval 2027. Quero confirmar o pagamento das minhas fotos.',
    )
  })
})

describe('slug', () => {
  it('slugifies names without accents', () => {
    expect(slugify('  Festa de São João 2027! ')).toBe('festa-de-sao-joao-2027')
  })

  it('appends the suffix', () => {
    expect(eventSlug('Carnaval', 'ab12')).toBe('carnaval-ab12')
    expect(eventSlug('!!!', 'ab12')).toBe('evento-ab12')
  })

  it('generates a 4-character random suffix by default', () => {
    expect(eventSlug('Carnaval')).toMatch(/^carnaval-[a-z2-9]{4}$/)
  })
})
```

`tests/unit/domain/dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysUntil,
  formatDate,
  formatDayMonth,
  localDateOf,
  startOfTodaySaoPauloISO,
  todayInSaoPaulo,
} from '@/lib/domain/dates'

describe('dates', () => {
  it('computes today in São Paulo (UTC-3)', () => {
    expect(todayInSaoPaulo(new Date('2026-10-13T02:30:00Z'))).toBe('2026-10-12')
    expect(todayInSaoPaulo(new Date('2026-10-13T03:30:00Z'))).toBe('2026-10-13')
  })

  it('gives the start of the São Paulo day as ISO', () => {
    expect(startOfTodaySaoPauloISO(new Date('2026-10-13T02:30:00Z'))).toBe('2026-10-12T00:00:00-03:00')
  })

  it('formats dates', () => {
    expect(formatDayMonth('2026-10-05')).toBe('05/10')
    expect(formatDate('2026-10-05')).toBe('05/10/2026')
  })

  it('adds days across months', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02')
  })

  it('counts days between dates', () => {
    expect(daysUntil('2026-10-13', '2026-10-16')).toBe(3)
    expect(daysUntil('2026-10-13', '2026-10-13')).toBe(0)
  })

  it('reads the local calendar date of a Date', () => {
    expect(localDateOf(new Date(2026, 9, 12, 23, 30))).toBe('2026-10-12')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/domain`
Expected: FAIL. The imports cannot be resolved, because the modules don't exist yet.

- [ ] **Step 3: Implement the modules**

`src/lib/domain/phone.ts`:
```ts
import { parsePhoneNumberFromString } from 'libphonenumber-js'

export function normalizePhone(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  let candidate = trimmed.replace(/^0+(?=\d)/, '')
  const digits = candidate.replace(/\D/g, '')
  if (!candidate.startsWith('+') && digits.startsWith('55') && digits.length >= 12) candidate = `+${digits}`
  const parsed = parsePhoneNumberFromString(candidate, 'BR')
  if (!parsed || !parsed.isValid()) return null
  return parsed.number
}

export function maskPhone(e164: string): string {
  const last4 = e164.slice(-4)
  if (e164.startsWith('+55') && e164.length >= 12) {
    return `(${e164.slice(3, 5)}) ${e164.slice(5, 6)}****-${last4}`
  }
  return `${e164.slice(0, 3)} ****-${last4}`
}

export function phoneLast4(e164: string): string {
  return e164.slice(-4)
}
```

`src/lib/domain/names.ts`:
```ts
function capitalize(word: string): string {
  return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1).toLocaleLowerCase('pt-BR')
}

export function displayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  const first = capitalize(parts[0])
  if (parts.length === 1) return first
  const last = parts[parts.length - 1]
  return `${first} ${last.charAt(0).toLocaleUpperCase('pt-BR')}.`
}

export interface NameListRow {
  registrationId: string
  fullName: string
}

export interface NameListItem {
  registrationId: string
  label: string
}

export function buildNameList(rows: NameListRow[]): NameListItem[] {
  return rows
    .map(row => ({ registrationId: row.registrationId, label: displayName(row.fullName) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
}

function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export function matchesNameFilter(label: string, filter: string): boolean {
  return fold(label).includes(fold(filter.trim()))
}
```

`src/lib/domain/money.ts`:
```ts
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatBRL(cents: number): string {
  return brl.format(cents / 100)
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

const GROUPED = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/
const PLAIN = /^\d+(,\d{1,2})?$/

export function parseBRLToCents(input: string): number | null {
  const value = input.replace(/R\$\s?/i, '').trim()
  if (!GROUPED.test(value) && !PLAIN.test(value)) return null
  const [intPart, decPart = ''] = value.replace(/\./g, '').split(',')
  return Number(intPart) * 100 + Number(decPart.padEnd(2, '0'))
}
```

`src/lib/domain/commission.ts`:
```ts
import { centsToInput, formatBRL } from './money'

export type CommissionType = 'percent' | 'fixed'

function percentText(basisPoints: number): string {
  return (basisPoints / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

export function describeCommission(type: CommissionType, value: number): string {
  return type === 'percent' ? `${percentText(value)}%` : formatBRL(value)
}

export function parsePercentToBasisPoints(input: string): number | null {
  const value = input.replace('%', '').trim().replace(',', '.')
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value)) return null
  const basisPoints = Math.round(Number(value) * 100)
  return basisPoints <= 10000 ? basisPoints : null
}

export function formatCommissionInput(type: CommissionType, value: number): string {
  return type === 'percent' ? percentText(value) : centsToInput(value)
}
```

`src/lib/domain/whatsapp.ts`:
```ts
export function whatsappLink(e164: string, message: string): string {
  return `https://wa.me/${e164.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
}

export function paymentRequestMessage(clientFullName: string, eventName: string): string {
  return `Oi! Sou ${clientFullName}, do evento ${eventName}. Quero confirmar o pagamento das minhas fotos.`
}
```

`src/lib/domain/slug.ts`:
```ts
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
}

function randomSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('')
}

export function eventSlug(name: string, suffix: string = randomSuffix()): string {
  return `${slugify(name) || 'evento'}-${suffix}`
}
```

`src/lib/domain/dates.ts`:
```ts
const SP_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function todayInSaoPaulo(now: Date = new Date()): string {
  return SP_DATE.format(now)
}

// Brazil has no daylight saving time since 2019, so São Paulo is always UTC-3.
export function startOfTodaySaoPauloISO(now: Date = new Date()): string {
  return `${todayInSaoPaulo(now)}T00:00:00-03:00`
}

export function formatDayMonth(isoDate: string): string {
  const [, month, day] = isoDate.split('-')
  return `${day}/${month}`
}

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function daysUntil(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 86_400_000)
}

export function localDateOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/unit/domain`
Expected: PASS (all tests in the 5 files).

If `normalizePhone('071991234567')` fails, print `parsePhoneNumberFromString('71991234567', 'BR')` to check what the library parses. The leading-zero strip must leave `71991234567`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain tests/unit/domain
git commit -m "feat: add domain helpers for phone, names, money, commission, slug and dates"
```

---

### Task 3: Database schema and DB test harness

**Files:**
- Create: `supabase/migrations/20261013000100_schema.sql`
- Create: `tests/db/shim.sql`, `tests/db/global-setup.ts`, `tests/db/helpers.ts`
- Test: `tests/db/schema.test.ts`

**Interfaces:**
- Produces:
  - **Tables:** `settings`, `profiles`, `photographers`, `clients`, `events`, `settlements`, `registrations`, `registration_log`, `media`, `media_faces`, `client_matches`, `search_log`, `access_attempts`. Columns exactly as in the migration below.
  - **Function:** `public.today_sp()`.
  - **Buckets:** `media` (private) and `public-assets` (public).
  - **Test helpers:** `pool`, `closePool()`, `asUser(userId | null, fn)`, `uniquePhone()`, `createUser(role)`, `createAdmin()`, `createPhotographer(opts?)`, `createClientRow(fullName?)`, `createEvent(photographerId, opts?)`, `insertRegistration(eventId, clientId, priceCents?)`.

- [ ] **Step 1: Start a local Postgres for DB tests**

The DB tests need any Postgres 15+ reachable as a superuser. Each test run creates a throwaway database and drops it at the end.

On this container (Ubuntu, Postgres 16 installed):
```bash
pg_ctlcluster 16 main start
su postgres -c "psql -c \"alter user postgres password 'postgres'\""
export TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres
```
With the Supabase CLI instead: `npx supabase start`, then `export TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54322/postgres`.

- [ ] **Step 2: Write the harness**

`tests/db/shim.sql` stands in for the parts of Supabase that a plain Postgres lacks. On a Supabase database it is a harmless no-op.
```sql
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false
);
```

`tests/db/global-setup.ts`:
```ts
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    dbUrl: string
  }
}

const here = path.dirname(fileURLToPath(import.meta.url))
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/postgres'

export default async function setup(project: TestProject) {
  const dbName = `fotofacil_test_${process.pid}_${Date.now()}`
  const admin = new Client({ connectionString: ADMIN_URL })
  await admin.connect()
  await admin.query(`create database ${dbName}`)
  await admin.end()

  const url = new URL(ADMIN_URL)
  url.pathname = `/${dbName}`
  const db = new Client({ connectionString: url.toString() })
  await db.connect()
  await db.query(readFileSync(path.join(here, 'shim.sql'), 'utf8'))
  const migrationsDir = path.resolve(here, '../../supabase/migrations')
  for (const file of readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()) {
    await db.query(readFileSync(path.join(migrationsDir, file), 'utf8'))
  }
  await db.end()

  project.provide('dbUrl', url.toString())

  return async () => {
    const cleanup = new Client({ connectionString: ADMIN_URL })
    await cleanup.connect()
    await cleanup.query(`drop database if exists ${dbName} with (force)`)
    await cleanup.end()
  }
}
```

`tests/db/helpers.ts`:
```ts
import { randomInt, randomUUID } from 'node:crypto'
import { Pool, type PoolClient } from 'pg'
import { inject } from 'vitest'

export const pool = new Pool({ connectionString: inject('dbUrl'), max: 4 })

export async function closePool(): Promise<void> {
  await pool.end()
}

/** Runs `fn` inside a transaction as a Supabase API user (`authenticated`), or as `anon` when userId is null. */
export async function asUser<T>(userId: string | null, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(userId ? 'set local role authenticated' : 'set local role anon')
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(userId ? { sub: userId, role: 'authenticated' } : { role: 'anon' }),
    ])
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export function uniquePhone(): string {
  return `+55719${String(randomInt(0, 100_000_000)).padStart(8, '0')}`
}

export async function createUser(role: 'admin' | 'photographer'): Promise<string> {
  const { rows } = await pool.query("insert into auth.users (email) values (gen_random_uuid()::text || '@test.local') returning id")
  await pool.query('insert into public.profiles (id, role) values ($1, $2)', [rows[0].id, role])
  return rows[0].id
}

export async function createAdmin(): Promise<string> {
  return createUser('admin')
}

export interface PhotographerOpts {
  commissionType?: 'percent' | 'fixed'
  commissionValue?: number
  priceCents?: number
}

export async function createPhotographer(opts: PhotographerOpts = {}): Promise<{ userId: string; photographerId: string }> {
  const userId = await createUser('photographer')
  const { rows } = await pool.query(
    `insert into public.photographers (profile_id, name, whatsapp, default_price_cents, commission_type, commission_value)
     values ($1, 'Foto Teste', '+5571999990000', $2, $3, $4) returning id`,
    [userId, opts.priceCents ?? 5000, opts.commissionType ?? 'percent', opts.commissionValue ?? 1500],
  )
  return { userId, photographerId: rows[0].id }
}

export async function createClientRow(fullName = 'Ana Souza'): Promise<string> {
  const { rows } = await pool.query('insert into public.clients (full_name, phone_e164) values ($1, $2) returning id', [
    fullName,
    uniquePhone(),
  ])
  return rows[0].id
}

export interface EventOpts {
  priceCents?: number
  startDate?: string
  endDate?: string
  retentionDays?: number
  status?: 'active' | 'expired'
}

export async function createEvent(photographerId: string, opts: EventOpts = {}): Promise<string> {
  const { rows: today } = await pool.query("select to_char(public.today_sp(), 'YYYY-MM-DD') as d")
  const { rows } = await pool.query(
    `insert into public.events (photographer_id, name, slug, start_date, end_date, price_cents, retention_days, status)
     values ($1, 'Festa Teste', $2, $3, $4, $5, $6, $7) returning id`,
    [
      photographerId,
      `festa-${randomUUID().slice(0, 8)}`,
      opts.startDate ?? today[0].d,
      opts.endDate ?? today[0].d,
      opts.priceCents ?? 5000,
      opts.retentionDays ?? 30,
      opts.status ?? 'active',
    ],
  )
  return rows[0].id
}

export async function insertRegistration(eventId: string, clientId: string, priceCents = 5000): Promise<string> {
  const { rows } = await pool.query(
    `insert into public.registrations (event_id, client_id, terms_accepted_at, price_cents)
     values ($1, $2, now(), $3) returning id`,
    [eventId, clientId, priceCents],
  )
  return rows[0].id
}
```

- [ ] **Step 3: Write the failing schema test**

`tests/db/schema.test.ts`:
```ts
import { afterAll, describe, expect, it } from 'vitest'
import {
  closePool,
  createClientRow,
  createEvent,
  createPhotographer,
  insertRegistration,
  pool,
  uniquePhone,
} from './helpers'

afterAll(closePool)

describe('schema', () => {
  it('computes expires_at as end_date + retention_days', async () => {
    const { photographerId } = await createPhotographer()
    const id = await createEvent(photographerId, { startDate: '2026-10-10', endDate: '2026-10-12', retentionDays: 30 })
    const { rows } = await pool.query("select to_char(expires_at, 'YYYY-MM-DD') as d from public.events where id = $1", [id])
    expect(rows[0].d).toBe('2026-11-11')
  })

  it('rejects retention above settings.max_retention_days', async () => {
    const { photographerId } = await createPhotographer()
    await expect(createEvent(photographerId, { retentionDays: 91 })).rejects.toThrow('retention_exceeds_max')
  })

  it('rejects an end date before the start date', async () => {
    const { photographerId } = await createPhotographer()
    await expect(createEvent(photographerId, { startDate: '2026-10-12', endDate: '2026-10-10' })).rejects.toThrow(
      'violates check constraint',
    )
  })

  it('rejects a duplicate phone', async () => {
    const phone = uniquePhone()
    await pool.query("insert into public.clients (full_name, phone_e164) values ('Ana Souza', $1)", [phone])
    await expect(
      pool.query("insert into public.clients (full_name, phone_e164) values ('Bia Lima', $1)", [phone]),
    ).rejects.toThrow('duplicate key')
  })

  it('rejects a duplicate wristband for the same client and event', async () => {
    const { photographerId } = await createPhotographer()
    const eventId = await createEvent(photographerId)
    const clientId = await createClientRow()
    await insertRegistration(eventId, clientId)
    await expect(insertRegistration(eventId, clientId)).rejects.toThrow('duplicate key')
  })

  it('rejects a paid registration without payment data', async () => {
    const { photographerId } = await createPhotographer()
    const eventId = await createEvent(photographerId)
    const clientId = await createClientRow()
    await expect(
      pool.query(
        `insert into public.registrations (event_id, client_id, terms_accepted_at, price_cents, status)
         values ($1, $2, now(), 5000, 'paid')`,
        [eventId, clientId],
      ),
    ).rejects.toThrow('violates check constraint')
  })

  it('creates the storage buckets', async () => {
    const { rows } = await pool.query('select id, public from storage.buckets order by id')
    expect(rows).toEqual([
      { id: 'media', public: false },
      { id: 'public-assets', public: true },
    ])
  })
})
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npm run test:db -- tests/db/schema.test.ts`
Expected: FAIL. The global setup throws `ENOENT ... supabase/migrations`, because the folder doesn't exist yet.

- [ ] **Step 5: Write the migration**

`supabase/migrations/20261013000100_schema.sql`:
```sql
-- FotoFácil core schema
create table public.settings (
  id int primary key default 1 check (id = 1),
  default_retention_days int not null default 30 check (default_retention_days between 1 and 365),
  max_retention_days int not null default 90 check (max_retention_days between 1 and 365),
  default_commission_type text not null default 'percent' check (default_commission_type in ('percent', 'fixed')),
  default_commission_value int not null default 1000 check (default_commission_value >= 0),
  face_match_threshold int not null default 90 check (face_match_threshold between 50 and 99),
  daily_search_limit int not null default 10 check (daily_search_limit between 1 and 100),
  updated_at timestamptz not null default now(),
  check (default_retention_days <= max_retention_days),
  check (default_commission_type <> 'percent' or default_commission_value <= 10000)
);
insert into public.settings (id) values (1);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'photographer')),
  created_at timestamptz not null default now()
);

create table public.photographers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  photo_path text,
  whatsapp text not null check (whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  default_price_cents int not null check (default_price_cents > 0),
  commission_type text not null check (commission_type in ('percent', 'fixed')),
  commission_value int not null check (commission_value >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (commission_type <> 'percent' or commission_value <= 10000)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) >= 3),
  phone_e164 text not null unique check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index clients_name_idx on public.clients (lower(full_name));

create table public.events (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers (id),
  name text not null check (length(trim(name)) >= 2),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  start_date date not null,
  end_date date not null,
  price_cents int not null check (price_cents > 0),
  retention_days int not null check (retention_days >= 1),
  expires_at date generated always as (end_date + retention_days) stored,
  status text not null default 'active' check (status in ('active', 'expired')),
  rekognition_collection_id text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index events_photographer_idx on public.events (photographer_id, start_date desc);
create index events_active_idx on public.events (expires_at) where status = 'active';

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  photographer_id uuid not null references public.photographers (id),
  period_type text not null check (period_type in ('event', 'month')),
  event_id uuid references public.events (id),
  month date,
  sales_count int not null default 0,
  total_sales_cents bigint not null default 0,
  commission_pix_cents bigint not null default 0,
  commission_manual_cents bigint not null default 0,
  status text not null default 'open' check (status in ('open', 'paid')),
  paid_at timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  check (
    (period_type = 'event' and event_id is not null and month is null)
    or (period_type = 'month' and month is not null and event_id is null)
  )
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  client_id uuid not null references public.clients (id),
  delivered_by uuid references public.profiles (id),
  delivered_at timestamptz not null default now(),
  terms_accepted_at timestamptz not null,
  price_cents int not null check (price_cents > 0),
  status text not null default 'wristband' check (status in ('wristband', 'paid')),
  payment_method text check (payment_method in ('manual', 'pix')),
  paid_at timestamptz,
  confirmed_by uuid references public.profiles (id),
  commission_cents int check (commission_cents >= 0),
  face_consent_at timestamptz,
  first_access_at timestamptz,
  last_search_at timestamptz,
  settlement_id uuid references public.settlements (id),
  unique (event_id, client_id),
  check (
    (status = 'wristband' and payment_method is null and paid_at is null and commission_cents is null and settlement_id is null)
    or (status = 'paid' and payment_method is not null and paid_at is not null and commission_cents is not null)
  )
);
create index registrations_paid_idx on public.registrations (paid_at) where status = 'paid';
create index registrations_settlement_idx on public.registrations (settlement_id);

create table public.registration_log (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  action text not null check (action in ('delivered', 'confirmed_manual', 'undone', 'admin_undo', 'paid_pix', 'refunded')),
  actor_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index registration_log_created_idx on public.registration_log (created_at);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id),
  type text not null check (type in ('photo', 'video')),
  original_name text not null,
  storage_path text not null,
  thumb_path text not null,
  taken_on date not null,
  width int,
  height int,
  duration_s numeric(8, 2),
  frame_count int not null default 0 check (frame_count between 0 and 120),
  face_indexing text not null default 'enabled' check (face_indexing in ('enabled', 'unsupported')),
  status text not null default 'uploading' check (status in ('uploading', 'processing', 'ready', 'error')),
  attempts int not null default 0,
  error_msg text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index media_event_idx on public.media (event_id, taken_on) where deleted_at is null;
create index media_retry_idx on public.media (status, created_at) where deleted_at is null and status <> 'ready';

create table public.media_faces (
  face_id text primary key,
  media_id uuid not null references public.media (id) on delete cascade,
  event_id uuid not null references public.events (id)
);
create index media_faces_media_idx on public.media_faces (media_id);

create table public.client_matches (
  registration_id uuid not null references public.registrations (id) on delete cascade,
  media_id uuid not null references public.media (id) on delete cascade,
  hidden boolean not null default false,
  matched_at timestamptz not null default now(),
  primary key (registration_id, media_id)
);

create table public.search_log (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index search_log_idx on public.search_log (registration_id, created_at);

create table public.access_attempts (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations (id) on delete cascade,
  ip text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index access_attempts_reg_idx on public.access_attempts (registration_id, created_at);
create index access_attempts_ip_idx on public.access_attempts (ip, created_at);

-- Business "today" is always São Paulo's calendar day.
create function public.today_sp() returns date language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create function public.events_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  max_days int;
begin
  if tg_op = 'INSERT' or new.retention_days is distinct from old.retention_days then
    select max_retention_days into max_days from public.settings where id = 1;
    if new.retention_days > max_days then
      raise exception 'retention_exceeds_max' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger events_before_write before insert or update on public.events
  for each row execute function public.events_before_write();

insert into storage.buckets (id, name, public)
values ('media', 'media', false), ('public-assets', 'public-assets', true)
on conflict (id) do nothing;

alter table public.settings enable row level security;
alter table public.profiles enable row level security;
alter table public.photographers enable row level security;
alter table public.clients enable row level security;
alter table public.events enable row level security;
alter table public.settlements enable row level security;
alter table public.registrations enable row level security;
alter table public.registration_log enable row level security;
alter table public.media enable row level security;
alter table public.media_faces enable row level security;
alter table public.client_matches enable row level security;
alter table public.search_log enable row level security;
alter table public.access_attempts enable row level security;

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated, service_role;
revoke execute on function public.today_sp() from public, anon;
revoke execute on function public.events_before_write() from public, anon, authenticated;
grant execute on function public.today_sp() to authenticated, service_role;
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:db -- tests/db/schema.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations tests/db
git commit -m "feat: add core database schema and Postgres test harness"
```

---

### Task 4: Row Level Security, helper functions and guard triggers

**Files:**
- Create: `supabase/migrations/20261013000200_rls.sql`
- Test: `tests/db/rls.test.ts`

**Interfaces:**
- Consumes: the Task 3 schema and test helpers.
- Produces:
  - **SQL functions:** `public.is_admin(): boolean`, `public.current_photographer_id(): uuid`, `public.can_access_event(uuid): boolean`.
  - **Policies:** the admin reads and writes everything. A photographer reads and writes his own events and media, reads his own registrations and logs, and reads clients registered in his events.
  - **Guards:** the trigger guards raise `not_authorized` when a non-admin changes commission, active or ownership fields, or an event's status or collection.

- [ ] **Step 1: Write the failing test**

`tests/db/rls.test.ts`:
```ts
import { afterAll, describe, expect, it } from 'vitest'
import {
  asUser,
  closePool,
  createAdmin,
  createClientRow,
  createEvent,
  createPhotographer,
  insertRegistration,
} from './helpers'

afterAll(closePool)

describe('row level security', () => {
  it('a photographer sees only his own events', async () => {
    const a = await createPhotographer()
    const b = await createPhotographer()
    const eventA = await createEvent(a.photographerId)
    const eventB = await createEvent(b.photographerId)
    const ids = await asUser(a.userId, async c => (await c.query('select id from public.events')).rows.map(r => r.id))
    expect(ids).toContain(eventA)
    expect(ids).not.toContain(eventB)
  })

  it('the admin sees every event', async () => {
    const adminId = await createAdmin()
    const a = await createPhotographer()
    const eventA = await createEvent(a.photographerId)
    const ids = await asUser(adminId, async c => (await c.query('select id from public.events')).rows.map(r => r.id))
    expect(ids).toContain(eventA)
  })

  it('anon cannot read events', async () => {
    await expect(asUser(null, c => c.query('select id from public.events'))).rejects.toThrow('permission denied')
  })

  it('a photographer cannot create an event for another photographer', async () => {
    const a = await createPhotographer()
    const b = await createPhotographer()
    await expect(
      asUser(a.userId, c =>
        c.query(
          `insert into public.events (photographer_id, name, slug, start_date, end_date, price_cents, retention_days)
           values ($1, 'X', 'x-rls-test', current_date, current_date, 5000, 30)`,
          [b.photographerId],
        ),
      ),
    ).rejects.toThrow('row-level security')
  })

  it('a photographer cannot change his commission but can change his WhatsApp', async () => {
    const a = await createPhotographer()
    await expect(
      asUser(a.userId, c => c.query('update public.photographers set commission_value = 0 where profile_id = $1', [a.userId])),
    ).rejects.toThrow('not_authorized')
    const result = await asUser(a.userId, c =>
      c.query("update public.photographers set whatsapp = '+5571988887777' where profile_id = $1", [a.userId]),
    )
    expect(result.rowCount).toBe(1)
  })

  it('a photographer cannot change event status', async () => {
    const a = await createPhotographer()
    const eventA = await createEvent(a.photographerId)
    await expect(
      asUser(a.userId, c => c.query("update public.events set status = 'expired' where id = $1", [eventA])),
    ).rejects.toThrow('not_authorized')
  })

  it('a photographer reads only clients registered in his events', async () => {
    const a = await createPhotographer()
    const b = await createPhotographer()
    const eventA = await createEvent(a.photographerId)
    const eventB = await createEvent(b.photographerId)
    const mine = await createClientRow('Ana Souza')
    const theirs = await createClientRow('Bia Lima')
    await insertRegistration(eventA, mine)
    await insertRegistration(eventB, theirs)
    const ids = await asUser(a.userId, async c => (await c.query('select id from public.clients')).rows.map(r => r.id))
    expect(ids).toContain(mine)
    expect(ids).not.toContain(theirs)
  })

  it('a photographer cannot read registrations of other events', async () => {
    const a = await createPhotographer()
    const b = await createPhotographer()
    const eventB = await createEvent(b.photographerId)
    const regB = await insertRegistration(eventB, await createClientRow())
    const ids = await asUser(a.userId, async c => (await c.query('select id from public.registrations')).rows.map(r => r.id))
    expect(ids).not.toContain(regB)
  })

  it('a photographer cannot update settings', async () => {
    const a = await createPhotographer()
    const result = await asUser(a.userId, c => c.query('update public.settings set daily_search_limit = 99'))
    expect(result.rowCount).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:db -- tests/db/rls.test.ts`
Expected: FAIL. The authenticated selects return no rows, because no policies exist yet.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261013000200_rls.sql`:
```sql
create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

create function public.current_photographer_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.photographers where profile_id = auth.uid() and active
$$;

create function public.can_access_event(p_event_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or exists (select 1 from public.events e where e.id = p_event_id and e.photographer_id = public.current_photographer_id())
$$;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.current_photographer_id() from public, anon;
revoke execute on function public.can_access_event(uuid) from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.current_photographer_id() to authenticated, service_role;
grant execute on function public.can_access_event(uuid) to authenticated, service_role;

-- settings
create policy settings_read on public.settings for select to authenticated using (true);
create policy settings_admin_update on public.settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profiles
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

-- photographers
create policy photographers_read on public.photographers for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());
create policy photographers_update on public.photographers for update to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());
create policy photographers_admin_insert on public.photographers for insert to authenticated
  with check (public.is_admin());

-- clients
create policy clients_read on public.clients for select to authenticated using (
  public.is_admin()
  or exists (select 1 from public.registrations r where r.client_id = clients.id and public.can_access_event(r.event_id))
);
create policy clients_admin_insert on public.clients for insert to authenticated with check (public.is_admin());
create policy clients_admin_update on public.clients for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- events
create policy events_read on public.events for select to authenticated
  using (photographer_id = public.current_photographer_id() or public.is_admin());
create policy events_insert on public.events for insert to authenticated
  with check (photographer_id = public.current_photographer_id() or public.is_admin());
create policy events_update on public.events for update to authenticated
  using (photographer_id = public.current_photographer_id() or public.is_admin())
  with check (photographer_id = public.current_photographer_id() or public.is_admin());

-- registrations and their log (writes happen only through security definer functions)
create policy registrations_read on public.registrations for select to authenticated
  using (public.can_access_event(event_id));
create policy registration_log_read on public.registration_log for select to authenticated using (
  exists (select 1 from public.registrations r where r.id = registration_log.registration_id and public.can_access_event(r.event_id))
);

-- media
create policy media_read on public.media for select to authenticated using (public.can_access_event(event_id));
create policy media_insert on public.media for insert to authenticated with check (public.can_access_event(event_id));
create policy media_update on public.media for update to authenticated
  using (public.can_access_event(event_id)) with check (public.can_access_event(event_id));

-- settlements
create policy settlements_read on public.settlements for select to authenticated
  using (public.is_admin() or photographer_id = public.current_photographer_id());

-- media_faces, client_matches, search_log, access_attempts: no policies (service key only)

create function public.photographers_guard() returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if new.commission_type is distinct from old.commission_type
      or new.commission_value is distinct from old.commission_value
      or new.active is distinct from old.active
      or new.profile_id is distinct from old.profile_id then
      raise exception 'not_authorized' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger photographers_guard before update on public.photographers
  for each row execute function public.photographers_guard();

create function public.events_guard() returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated' and not public.is_admin() then
    if new.photographer_id is distinct from old.photographer_id
      or new.status is distinct from old.status
      or new.rekognition_collection_id is distinct from old.rekognition_collection_id then
      raise exception 'not_authorized' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
create trigger events_guard before update on public.events
  for each row execute function public.events_guard();

revoke execute on function public.photographers_guard() from public, anon, authenticated;
revoke execute on function public.events_guard() from public, anon, authenticated;
```

- [ ] **Step 4: Run all DB tests to verify they pass**

Run: `npm run test:db`
Expected: PASS (schema + rls).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013000200_rls.sql tests/db/rls.test.ts
git commit -m "feat: add row level security policies and guard triggers"
```

---
### Task 5: Wristband, payment and face-search functions

**Files:**
- Create: `supabase/migrations/20261013000300_registration_rpc.sql`
- Modify: `tests/db/helpers.ts` (append `deliver`, `confirmManual`, `createMedia`)
- Test: `tests/db/registration.test.ts`

**Interfaces:**
- Consumes: `is_admin()`, `current_photographer_id()` and the Task 3 tables.
- Produces these SQL functions. Callers reach them through `supabase.rpc(name, { p_... })`:

| Function | Who can call it | Raises |
|---|---|---|
| `compute_commission(p_price_cents int, p_type text, p_value int) → int` | authenticated, service_role | — |
| `find_or_create_client(p_full_name text, p_phone_e164 text) → uuid` | authenticated | `not_authorized` |
| `deliver_wristband(p_event_id uuid, p_client_id uuid, p_terms_accepted boolean) → uuid` | authenticated | `not_found`, `not_authorized`, `terms_required`, `event_not_active`, `already_registered` |
| `confirm_manual_payment(p_registration_id uuid) → void` | authenticated | `not_found`, `not_authorized`, `invalid_state` |
| `undo_manual_payment(p_registration_id uuid) → void` | authenticated | `not_found`, `not_authorized`, `invalid_state`, `undo_locked` |
| `recompute_settlement(p_settlement_id uuid) → void` | internal only | — |
| `record_face_search(p_registration_id uuid, p_media_ids uuid[]) → void` | service_role only | — |

`record_face_search` sets `first_access_at` only when it receives at least one media id.

- [ ] **Step 1: Append the helpers**

Append to `tests/db/helpers.ts`:
```ts
export async function deliver(userId: string, eventId: string, clientId: string): Promise<string> {
  return asUser(userId, async c => (await c.query('select public.deliver_wristband($1, $2, true) as id', [eventId, clientId])).rows[0].id)
}

export async function confirmManual(userId: string, registrationId: string): Promise<void> {
  await asUser(userId, c => c.query('select public.confirm_manual_payment($1)', [registrationId]))
}

export async function createMedia(eventId: string): Promise<string> {
  const { rows } = await pool.query(
    `insert into public.media (event_id, type, original_name, storage_path, thumb_path, taken_on, status)
     values ($1, 'photo', 'a.jpg', 'x/full.jpg', 'x/thumb.jpg', current_date, 'ready') returning id`,
    [eventId],
  )
  return rows[0].id
}
```

- [ ] **Step 2: Write the failing test**

`tests/db/registration.test.ts`:
```ts
import { afterAll, describe, expect, it } from 'vitest'
import {
  asUser,
  closePool,
  confirmManual,
  createAdmin,
  createClientRow,
  createEvent,
  createMedia,
  createPhotographer,
  deliver,
  pool,
  uniquePhone,
} from './helpers'

afterAll(closePool)

async function logActions(registrationId: string): Promise<string[]> {
  const { rows } = await pool.query(
    'select action from public.registration_log where registration_id = $1 order by created_at',
    [registrationId],
  )
  return rows.map(r => r.action)
}

describe('compute_commission', () => {
  it.each([
    [5000, 'percent', 1500, 750],
    [4990, 'percent', 1550, 773],
    [5000, 'fixed', 500, 500],
    [5000, 'fixed', 6000, 5000],
  ])('price %i, %s %i → %i', async (price, type, value, expected) => {
    const { rows } = await pool.query('select public.compute_commission($1, $2, $3) as c', [price, type, value])
    expect(rows[0].c).toBe(expected)
  })
})

describe('find_or_create_client', () => {
  it('returns the existing client for the same phone without renaming it', async () => {
    const { userId } = await createPhotographer()
    const phone = uniquePhone()
    const call = (name: string) =>
      asUser(userId, async c => (await c.query('select public.find_or_create_client($1, $2) as id', [name, phone])).rows[0].id)
    const first = await call('Ana   Souza')
    const second = await call('Outra Pessoa')
    expect(second).toBe(first)
    const { rows } = await pool.query('select full_name from public.clients where id = $1', [first])
    expect(rows[0].full_name).toBe('Ana Souza')
  })

  it('is not callable by anon', async () => {
    await expect(
      asUser(null, c => c.query("select public.find_or_create_client('Ana Souza', '+5571991230000')")),
    ).rejects.toThrow('permission denied')
  })
})

describe('deliver_wristband', () => {
  it('creates a registration with the event price frozen', async () => {
    const { userId, photographerId } = await createPhotographer()
    const eventId = await createEvent(photographerId, { priceCents: 6000 })
    const regId = await deliver(userId, eventId, await createClientRow())
    await pool.query('update public.events set price_cents = 9000 where id = $1', [eventId])
    const { rows } = await pool.query('select status, price_cents from public.registrations where id = $1', [regId])
    expect(rows[0]).toEqual({ status: 'wristband', price_cents: 6000 })
    expect(await logActions(regId)).toEqual(['delivered'])
  })

  it('fails cleanly on a double delivery and keeps a single registration', async () => {
    const { userId, photographerId } = await createPhotographer()
    const eventId = await createEvent(photographerId)
    const clientId = await createClientRow()
    const regId = await deliver(userId, eventId, clientId)
    await expect(deliver(userId, eventId, clientId)).rejects.toThrow('already_registered')
    const { rows } = await pool.query('select count(*)::int as n from public.registrations where event_id = $1', [eventId])
    expect(rows[0].n).toBe(1)
    expect(await logActions(regId)).toEqual(['delivered'])
  })

  it('requires terms acceptance', async () => {
    const { userId, photographerId } = await createPhotographer()
    const eventId = await createEvent(photographerId)
    const clientId = await createClientRow()
    await expect(
      asUser(userId, c => c.query('select public.deliver_wristband($1, $2, false)', [eventId, clientId])),
    ).rejects.toThrow('terms_required')
  })

  it('blocks other photographers', async () => {
    const a = await createPhotographer()
    const b = await createPhotographer()
    const eventId = await createEvent(a.photographerId)
    await expect(deliver(b.userId, eventId, await createClientRow())).rejects.toThrow('not_authorized')
  })

  it('blocks expired events', async () => {
    const { userId, photographerId } = await createPhotographer()
    const eventId = await createEvent(photographerId, { status: 'expired' })
    await expect(deliver(userId, eventId, await createClientRow())).rejects.toThrow('event_not_active')
  })
})

describe('confirm_manual_payment', () => {
  it('freezes the commission from the photographer settings at payment time', async () => {
    const { userId, photographerId } = await createPhotographer({ commissionType: 'percent', commissionValue: 1500 })
    const eventId = await createEvent(photographerId, { priceCents: 5000 })
    const regId = await deliver(userId, eventId, await createClientRow())
    await confirmManual(userId, regId)
    await pool.query('update public.photographers set commission_value = 3000 where id = $1', [photographerId])
    const { rows } = await pool.query(
      'select status, payment_method, commission_cents, confirmed_by from public.registrations where id = $1',
      [regId],
    )
    expect(rows[0]).toEqual({ status: 'paid', payment_method: 'manual', commission_cents: 750, confirmed_by: userId })
  })

  it('rejects a second confirmation and logs once', async () => {
    const { userId, photographerId } = await createPhotographer()
    const eventId = await createEvent(photographerId)
    const regId = await deliver(userId, eventId, await createClientRow())
    await confirmManual(userId, regId)
    await expect(confirmManual(userId, regId)).rejects.toThrow('invalid_state')
    expect(await logActions(regId)).toEqual(['delivered', 'confirmed_manual'])
  })
})

describe('undo_manual_payment', () => {
  async function paidRegistration() {
    const photographer = await createPhotographer()
    const eventId = await createEvent(photographer.photographerId)
    const regId = await deliver(photographer.userId, eventId, await createClientRow())
    await confirmManual(photographer.userId, regId)
    return { ...photographer, eventId, regId }
  }

  it('lets the photographer undo while the client has not seen any photo', async () => {
    const { userId, regId } = await paidRegistration()
    await pool.query('select public.record_face_search($1, $2::uuid[])', [regId, []])
    await asUser(userId, c => c.query('select public.undo_manual_payment($1)', [regId]))
    const { rows } = await pool.query(
      'select status, payment_method, commission_cents, first_access_at, last_search_at is not null as searched from public.registrations where id = $1',
      [regId],
    )
    expect(rows[0]).toEqual({ status: 'wristband', payment_method: null, commission_cents: null, first_access_at: null, searched: true })
    expect(await logActions(regId)).toEqual(['delivered', 'confirmed_manual', 'undone'])
  })

  it('locks the photographer out once the client found photos', async () => {
    const { userId, eventId, regId } = await paidRegistration()
    const mediaId = await createMedia(eventId)
    await pool.query('select public.record_face_search($1, $2::uuid[])', [regId, [mediaId]])
    await expect(asUser(userId, c => c.query('select public.undo_manual_payment($1)', [regId]))).rejects.toThrow(
      'undo_locked',
    )
  })

  it('lets the admin undo after access and logs admin_undo', async () => {
    const adminId = await createAdmin()
    const { eventId, regId } = await paidRegistration()
    const mediaId = await createMedia(eventId)
    await pool.query('select public.record_face_search($1, $2::uuid[])', [regId, [mediaId]])
    await asUser(adminId, c => c.query('select public.undo_manual_payment($1)', [regId]))
    expect(await logActions(regId)).toEqual(['delivered', 'confirmed_manual', 'admin_undo'])
  })
})

describe('record_face_search', () => {
  it('stores matches once and is not callable by photographers', async () => {
    const { userId, photographerId } = await createPhotographer()
    const eventId = await createEvent(photographerId)
    const regId = await deliver(userId, eventId, await createClientRow())
    const mediaId = await createMedia(eventId)
    await pool.query('select public.record_face_search($1, $2::uuid[])', [regId, [mediaId]])
    await pool.query('select public.record_face_search($1, $2::uuid[])', [regId, [mediaId]])
    const { rows } = await pool.query('select count(*)::int as n from public.client_matches where registration_id = $1', [regId])
    expect(rows[0].n).toBe(1)
    await expect(
      asUser(userId, c => c.query('select public.record_face_search($1, $2::uuid[])', [regId, [mediaId]])),
    ).rejects.toThrow('permission denied')
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:db -- tests/db/registration.test.ts`
Expected: FAIL with `function public.compute_commission(...) does not exist` (and similar).

- [ ] **Step 4: Write the migration**

`supabase/migrations/20261013000300_registration_rpc.sql`:
```sql
create function public.compute_commission(p_price_cents int, p_type text, p_value int) returns int
language sql immutable as $$
  select case p_type
    when 'percent' then round(p_price_cents::numeric * p_value / 10000)::int
    when 'fixed' then least(p_value, p_price_cents)
  end
$$;

create function public.assert_event_access(p_event_id uuid) returns public.events
language plpgsql stable security definer set search_path = public as $$
declare
  ev public.events;
begin
  select * into ev from public.events where id = p_event_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not public.is_admin() and ev.photographer_id is distinct from public.current_photographer_id() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  return ev;
end $$;

create function public.find_or_create_client(p_full_name text, p_phone_e164 text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
begin
  if not public.is_admin() and public.current_photographer_id() is null then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  insert into public.clients (full_name, phone_e164, created_by)
  values (regexp_replace(trim(p_full_name), '\s+', ' ', 'g'), p_phone_e164, auth.uid())
  on conflict (phone_e164) do nothing
  returning id into cid;
  if cid is null then
    select id into cid from public.clients where phone_e164 = p_phone_e164;
  end if;
  return cid;
end $$;

create function public.deliver_wristband(p_event_id uuid, p_client_id uuid, p_terms_accepted boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  ev public.events;
  rid uuid;
begin
  ev := public.assert_event_access(p_event_id);
  if not coalesce(p_terms_accepted, false) then
    raise exception 'terms_required' using errcode = 'P0001';
  end if;
  if ev.status <> 'active' or ev.expires_at < public.today_sp() then
    raise exception 'event_not_active' using errcode = 'P0001';
  end if;
  insert into public.registrations (event_id, client_id, delivered_by, terms_accepted_at, price_cents)
  values (p_event_id, p_client_id, auth.uid(), now(), ev.price_cents)
  on conflict (event_id, client_id) do nothing
  returning id into rid;
  if rid is null then
    raise exception 'already_registered' using errcode = 'P0001';
  end if;
  insert into public.registration_log (registration_id, action, actor_id) values (rid, 'delivered', auth.uid());
  return rid;
end $$;

create function public.confirm_manual_payment(p_registration_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  reg public.registrations;
  ev public.events;
  ph public.photographers;
begin
  select * into reg from public.registrations where id = p_registration_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  ev := public.assert_event_access(reg.event_id);
  if reg.status <> 'wristband' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  select * into ph from public.photographers where id = ev.photographer_id;
  update public.registrations
  set status = 'paid',
      payment_method = 'manual',
      paid_at = now(),
      confirmed_by = auth.uid(),
      commission_cents = public.compute_commission(reg.price_cents, ph.commission_type, ph.commission_value)
  where id = p_registration_id;
  insert into public.registration_log (registration_id, action, actor_id)
  values (p_registration_id, 'confirmed_manual', auth.uid());
end $$;

create function public.recompute_settlement(p_settlement_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.settlements s
  set sales_count = agg.n,
      total_sales_cents = agg.total,
      commission_pix_cents = agg.pix,
      commission_manual_cents = agg.manual
  from (
    select count(*)::int as n,
           coalesce(sum(price_cents), 0)::bigint as total,
           coalesce(sum(commission_cents) filter (where payment_method = 'pix'), 0)::bigint as pix,
           coalesce(sum(commission_cents) filter (where payment_method = 'manual'), 0)::bigint as manual
    from public.registrations
    where settlement_id = p_settlement_id
  ) agg
  where s.id = p_settlement_id
$$;

create function public.undo_manual_payment(p_registration_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  reg public.registrations;
  admin boolean := public.is_admin();
  settlement_status text;
begin
  select * into reg from public.registrations where id = p_registration_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform public.assert_event_access(reg.event_id);
  if reg.status <> 'paid' or reg.payment_method <> 'manual' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if reg.settlement_id is not null then
    select status into settlement_status from public.settlements where id = reg.settlement_id;
    if not admin or settlement_status = 'paid' then
      raise exception 'undo_locked' using errcode = 'P0001';
    end if;
  end if;
  if not admin and reg.first_access_at is not null then
    raise exception 'undo_locked' using errcode = 'P0001';
  end if;
  update public.registrations
  set status = 'wristband', payment_method = null, paid_at = null, confirmed_by = null,
      commission_cents = null, settlement_id = null
  where id = p_registration_id;
  if reg.settlement_id is not null then
    perform public.recompute_settlement(reg.settlement_id);
  end if;
  insert into public.registration_log (registration_id, action, actor_id)
  values (p_registration_id, case when admin then 'admin_undo' else 'undone' end, auth.uid());
end $$;

create function public.record_face_search(p_registration_id uuid, p_media_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.client_matches (registration_id, media_id)
  select p_registration_id, m from unnest(p_media_ids) as m
  on conflict do nothing;
  update public.registrations
  set last_search_at = now(),
      first_access_at = case
        when cardinality(p_media_ids) > 0 then coalesce(first_access_at, now())
        else first_access_at
      end
  where id = p_registration_id;
end $$;

revoke execute on function public.compute_commission(int, text, int) from public, anon;
revoke execute on function public.assert_event_access(uuid) from public, anon, authenticated;
revoke execute on function public.find_or_create_client(text, text) from public, anon;
revoke execute on function public.deliver_wristband(uuid, uuid, boolean) from public, anon;
revoke execute on function public.confirm_manual_payment(uuid) from public, anon;
revoke execute on function public.undo_manual_payment(uuid) from public, anon;
revoke execute on function public.recompute_settlement(uuid) from public, anon, authenticated;
revoke execute on function public.record_face_search(uuid, uuid[]) from public, anon, authenticated;

grant execute on function public.compute_commission(int, text, int) to authenticated, service_role;
grant execute on function public.find_or_create_client(text, text) to authenticated, service_role;
grant execute on function public.deliver_wristband(uuid, uuid, boolean) to authenticated, service_role;
grant execute on function public.confirm_manual_payment(uuid) to authenticated, service_role;
grant execute on function public.undo_manual_payment(uuid) to authenticated, service_role;
grant execute on function public.record_face_search(uuid, uuid[]) to service_role;
```

- [ ] **Step 5: Run all DB tests to verify they pass**

Run: `npm run test:db`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261013000300_registration_rpc.sql tests/db
git commit -m "feat: add wristband, manual payment, undo and face-search database functions"
```

---

### Task 6: Settlement functions

**Files:**
- Create: `supabase/migrations/20261013000400_settlements.sql`
- Test: `tests/db/settlements.test.ts`

**Interfaces:**
- Consumes: `recompute_settlement`, `undo_manual_payment`, `compute_commission` (Task 5).
- Produces these SQL functions:

| Function | Who can call it | Raises |
|---|---|---|
| `settlement_preview(p_photographer_id uuid, p_period_type text, p_event_id uuid, p_month date)` | admin only | `not_authorized` |
| `create_settlement(p_photographer_id uuid, p_period_type text, p_event_id uuid, p_month date) → uuid` | admin only | `not_authorized`, `no_sales` |
| `mark_settlement_paid(p_settlement_id uuid) → void` | admin only | `not_authorized`, `invalid_state` |

`settlement_preview` returns one row: `(sales_count int, total_sales_cents bigint, commission_pix_cents bigint, commission_manual_cents bigint)`. `p_period_type` is `'event'` or `'month'`, and the month is matched on the São Paulo calendar.

- [ ] **Step 1: Write the failing test**

`tests/db/settlements.test.ts`:
```ts
import { afterAll, describe, expect, it } from 'vitest'
import {
  asUser,
  closePool,
  confirmManual,
  createAdmin,
  createClientRow,
  createEvent,
  createPhotographer,
  deliver,
  pool,
} from './helpers'

afterAll(closePool)

interface Totals {
  n: number
  total: number
  pix: number
  manual: number
}

async function preview(adminId: string, photographerId: string, type: 'event' | 'month', eventId: string | null, month: string | null): Promise<Totals> {
  return asUser(adminId, async c => {
    const { rows } = await c.query(
      `select sales_count as n, total_sales_cents::int as total, commission_pix_cents::int as pix, commission_manual_cents::int as manual
       from public.settlement_preview($1::uuid, $2::text, $3::uuid, $4::date)`,
      [photographerId, type, eventId, month],
    )
    return rows[0]
  })
}

async function payWithPix(regId: string): Promise<void> {
  await pool.query(
    `update public.registrations
     set status = 'paid', payment_method = 'pix', paid_at = now(),
         commission_cents = public.compute_commission(price_cents, 'percent', 1500)
     where id = $1`,
    [regId],
  )
}

async function setup() {
  const adminId = await createAdmin()
  const photographer = await createPhotographer({ commissionType: 'percent', commissionValue: 1500 })
  const eventId = await createEvent(photographer.photographerId, { priceCents: 5000 })
  const manual = await deliver(photographer.userId, eventId, await createClientRow())
  await confirmManual(photographer.userId, manual)
  const pix = await deliver(photographer.userId, eventId, await createClientRow())
  await payWithPix(pix)
  await deliver(photographer.userId, eventId, await createClientRow())
  return { adminId, ...photographer, eventId, manual, pix }
}

describe('settlements', () => {
  it('previews an event separating PIX and manual commissions and ignoring unpaid wristbands', async () => {
    const { adminId, photographerId, eventId } = await setup()
    expect(await preview(adminId, photographerId, 'event', eventId, null)).toEqual({ n: 2, total: 10000, pix: 750, manual: 750 })
  })

  it('creates a settlement once and refuses an empty one', async () => {
    const { adminId, photographerId, eventId } = await setup()
    const settlementId = await asUser(adminId, async c =>
      (await c.query("select public.create_settlement($1, 'event', $2, null) as id", [photographerId, eventId])).rows[0].id,
    )
    const { rows } = await pool.query(
      'select sales_count, commission_manual_cents::int as manual, status from public.settlements where id = $1',
      [settlementId],
    )
    expect(rows[0]).toEqual({ sales_count: 2, manual: 750, status: 'open' })
    expect(await preview(adminId, photographerId, 'event', eventId, null)).toEqual({ n: 0, total: 0, pix: 0, manual: 0 })
    await expect(
      asUser(adminId, c => c.query("select public.create_settlement($1, 'event', $2, null)", [photographerId, eventId])),
    ).rejects.toThrow('no_sales')
  })

  it('assigns monthly sales by the São Paulo calendar', async () => {
    const { adminId, photographerId, manual, pix } = await setup()
    await pool.query("update public.registrations set paid_at = '2026-10-01T02:00:00Z' where id = any($1::uuid[])", [[manual, pix]])
    expect(await preview(adminId, photographerId, 'month', null, '2026-09-01')).toMatchObject({ n: 2 })
    expect(await preview(adminId, photographerId, 'month', null, '2026-10-01')).toMatchObject({ n: 0 })
  })

  it('is admin only', async () => {
    const { userId, photographerId, eventId } = await setup()
    await expect(
      asUser(userId, c => c.query("select * from public.settlement_preview($1, 'event', $2, null)", [photographerId, eventId])),
    ).rejects.toThrow('not_authorized')
  })

  it('lets the admin undo a sale in an open settlement, recomputing totals, but not in a paid one', async () => {
    const { adminId, photographerId, eventId, manual } = await setup()
    const settlementId = await asUser(adminId, async c =>
      (await c.query("select public.create_settlement($1, 'event', $2, null) as id", [photographerId, eventId])).rows[0].id,
    )
    await asUser(adminId, c => c.query('select public.undo_manual_payment($1)', [manual]))
    const { rows } = await pool.query(
      'select sales_count, commission_manual_cents::int as manual from public.settlements where id = $1',
      [settlementId],
    )
    expect(rows[0]).toEqual({ sales_count: 1, manual: 0 })

    const other = await setup()
    const paidSettlement = await asUser(other.adminId, async c =>
      (await c.query("select public.create_settlement($1, 'event', $2, null) as id", [other.photographerId, other.eventId])).rows[0].id,
    )
    await asUser(other.adminId, c => c.query('select public.mark_settlement_paid($1)', [paidSettlement]))
    await expect(asUser(other.adminId, c => c.query('select public.undo_manual_payment($1)', [other.manual]))).rejects.toThrow(
      'undo_locked',
    )
    await expect(asUser(other.adminId, c => c.query('select public.mark_settlement_paid($1)', [paidSettlement]))).rejects.toThrow(
      'invalid_state',
    )
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:db -- tests/db/settlements.test.ts`
Expected: FAIL with `function public.settlement_preview(...) does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261013000400_settlements.sql`:
```sql
create function public.settlement_scope(p_photographer_id uuid, p_period_type text, p_event_id uuid, p_month date)
returns setof public.registrations
language sql stable security definer set search_path = public as $$
  select r.*
  from public.registrations r
  join public.events e on e.id = r.event_id
  where e.photographer_id = p_photographer_id
    and r.status = 'paid'
    and r.settlement_id is null
    and (
      (p_period_type = 'event' and r.event_id = p_event_id)
      or (
        p_period_type = 'month'
        and date_trunc('month', r.paid_at at time zone 'America/Sao_Paulo')::date = date_trunc('month', p_month::timestamp)::date
      )
    )
$$;

create function public.settlement_preview(
  p_photographer_id uuid,
  p_period_type text,
  p_event_id uuid default null,
  p_month date default null
)
returns table (sales_count int, total_sales_cents bigint, commission_pix_cents bigint, commission_manual_cents bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  return query
    select count(*)::int,
           coalesce(sum(s.price_cents), 0)::bigint,
           coalesce(sum(s.commission_cents) filter (where s.payment_method = 'pix'), 0)::bigint,
           coalesce(sum(s.commission_cents) filter (where s.payment_method = 'manual'), 0)::bigint
    from public.settlement_scope(p_photographer_id, p_period_type, p_event_id, p_month) s;
end $$;

create function public.create_settlement(
  p_photographer_id uuid,
  p_period_type text,
  p_event_id uuid default null,
  p_month date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  assigned int;
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  insert into public.settlements (photographer_id, period_type, event_id, month, created_by)
  values (
    p_photographer_id,
    p_period_type,
    case when p_period_type = 'event' then p_event_id end,
    case when p_period_type = 'month' then date_trunc('month', p_month::timestamp)::date end,
    auth.uid()
  )
  returning id into sid;
  update public.registrations r
  set settlement_id = sid
  where r.settlement_id is null
    and r.id in (select s.id from public.settlement_scope(p_photographer_id, p_period_type, p_event_id, p_month) s);
  get diagnostics assigned = row_count;
  if assigned = 0 then
    raise exception 'no_sales' using errcode = 'P0001';
  end if;
  perform public.recompute_settlement(sid);
  return sid;
end $$;

create function public.mark_settlement_paid(p_settlement_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  update public.settlements set status = 'paid', paid_at = now() where id = p_settlement_id and status = 'open';
  if not found then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
end $$;

revoke execute on function public.settlement_scope(uuid, text, uuid, date) from public, anon, authenticated;
revoke execute on function public.settlement_preview(uuid, text, uuid, date) from public, anon;
revoke execute on function public.create_settlement(uuid, text, uuid, date) from public, anon;
revoke execute on function public.mark_settlement_paid(uuid) from public, anon;
grant execute on function public.settlement_preview(uuid, text, uuid, date) to authenticated, service_role;
grant execute on function public.create_settlement(uuid, text, uuid, date) to authenticated, service_role;
grant execute on function public.mark_settlement_paid(uuid) to authenticated, service_role;
```

- [ ] **Step 4: Run all DB tests to verify they pass**

Run: `npm run test:db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261013000400_settlements.sql tests/db/settlements.test.ts
git commit -m "feat: add settlement preview, creation and payment functions"
```

---

### Task 7: Supabase clients, authentication and the first admin

**Files:**
- Create: `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `src/lib/supabase/browser.ts`, `src/lib/supabase/middleware.ts`, `src/middleware.ts`
- Create: `src/lib/auth/session.ts`, `src/lib/auth/guards.ts`, `src/lib/errors.ts`
- Create: `src/app/login/page.tsx`, `src/app/login/login-form.tsx`, `src/app/login/actions.ts`
- Create: `scripts/create-admin.ts`
- Test: `tests/unit/errors.test.ts`

**Interfaces:**
- Produces:
  - **Supabase clients:** `createClient(): Promise<SupabaseClient>` (server, user-scoped, RLS) from `@/lib/supabase/server`; `createAdminClient(): SupabaseClient` (secret key, bypasses RLS, server only) from `@/lib/supabase/admin`; `createClient()` (browser) from `@/lib/supabase/browser`.
  - **Session:** `getSessionProfile(): Promise<SessionProfile | null>`, where `SessionProfile = { userId: string; role: 'admin' | 'photographer'; photographerId: string | null }`.
  - **Guards:** `requireAdmin(): Promise<SessionProfile>` and `requirePhotographer(): Promise<SessionProfile & { photographerId: string }>`. Both redirect to `/login` on failure.
  - **Errors:** `errorMessage(err: { message?: string } | null | undefined): string`.
  - **Auth actions:** `signOut()` (server action), exported from `@/app/login/actions`.

- [ ] **Step 1: Write the failing test**

`tests/unit/errors.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { errorMessage } from '@/lib/errors'

describe('errorMessage', () => {
  it('maps database error codes to Portuguese messages', () => {
    expect(errorMessage({ message: 'undo_locked' })).toBe(
      'Não dá para desfazer: a cliente já acessou as fotos. Fale com o administrador.',
    )
    expect(errorMessage({ message: 'already_registered' })).toBe('Essa cliente já recebeu pulseira neste evento.')
    expect(errorMessage({ message: 'retention_exceeds_max' })).toBe('O prazo de exclusão passa do máximo permitido.')
  })

  it('maps unique violations on phone', () => {
    expect(errorMessage({ message: 'duplicate key value violates unique constraint "clients_phone_e164_key"' })).toBe(
      'Já existe uma cliente com esse celular.',
    )
  })

  it('falls back to a generic message', () => {
    expect(errorMessage({ message: 'boom' })).toBe('Algo deu errado. Tente de novo.')
    expect(errorMessage(null)).toBe('Algo deu errado. Tente de novo.')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project unit tests/unit/errors.test.ts`
Expected: FAIL. The module `@/lib/errors` is not found.

- [ ] **Step 3: Implement**

`src/lib/errors.ts`:
```ts
const MESSAGES: Array<[string, string]> = [
  ['not_authorized', 'Você não tem permissão para isso.'],
  ['not_found', 'Registro não encontrado.'],
  ['already_registered', 'Essa cliente já recebeu pulseira neste evento.'],
  ['event_not_active', 'Este evento não está mais ativo.'],
  ['terms_required', 'Confirme que a cliente aceitou os termos.'],
  ['invalid_state', 'Essa ação não é possível na situação atual.'],
  ['undo_locked', 'Não dá para desfazer: a cliente já acessou as fotos. Fale com o administrador.'],
  ['no_sales', 'Não há vendas para fechar nesse período.'],
  ['retention_exceeds_max', 'O prazo de exclusão passa do máximo permitido.'],
  ['clients_phone_e164_key', 'Já existe uma cliente com esse celular.'],
  ['events_slug_key', 'Já existe um evento com esse endereço. Tente de novo.'],
]

export function errorMessage(err: { message?: string } | null | undefined): string {
  const text = err?.message ?? ''
  const hit = MESSAGES.find(([code]) => text.includes(code))
  return hit ? hit[1] : 'Algo deu errado. Tente de novo.'
}
```

`src/lib/supabase/server.ts`:
```ts
import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component: the middleware refreshes the session cookies.
        }
      },
    },
  })
}
```

`src/lib/supabase/admin.ts`:
```ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

`src/lib/supabase/browser.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!)
}
```

`src/lib/supabase/middleware.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  if (!user && (path.startsWith('/admin') || path.startsWith('/fotografo'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  return response
}
```

`src/middleware.ts`:
```ts
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: ['/admin/:path*', '/fotografo/:path*', '/login', '/api/media/:path*'],
}
```

`src/lib/auth/session.ts`:
```ts
import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export type Role = 'admin' | 'photographer'

export interface SessionProfile {
  userId: string
  role: Role
  photographerId: string | null
}

export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile) return null
  let photographerId: string | null = null
  if (profile.role === 'photographer') {
    const { data: photographer } = await supabase
      .from('photographers')
      .select('id, active')
      .eq('profile_id', user.id)
      .maybeSingle()
    photographerId = photographer?.active ? photographer.id : null
  }
  return { userId: user.id, role: profile.role as Role, photographerId }
})
```

`src/lib/auth/guards.ts`:
```ts
import 'server-only'
import { redirect } from 'next/navigation'
import { getSessionProfile, type SessionProfile } from './session'

export async function requireAdmin(): Promise<SessionProfile> {
  const session = await getSessionProfile()
  if (!session || session.role !== 'admin') redirect('/login')
  return session
}

export async function requirePhotographer(): Promise<SessionProfile & { photographerId: string }> {
  const session = await getSessionProfile()
  if (!session || session.role !== 'photographer' || !session.photographerId) redirect('/login')
  return { ...session, photographerId: session.photographerId }
}
```

`src/app/login/actions.ts`:
```ts
'use server'

import { redirect } from 'next/navigation'
import type { ActionState } from '@/lib/action-state'
import { createClient } from '@/lib/supabase/server'

export async function signIn(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) return { error: 'E-mail ou senha inválidos.' }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle()
  if (!profile) {
    await supabase.auth.signOut()
    return { error: 'Usuário sem acesso ao FotoFácil.' }
  }
  redirect(profile.role === 'admin' ? '/admin' : '/fotografo')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

`src/app/login/login-form.tsx`:
```tsx
'use client'

import { useActionState } from 'react'
import { SubmitButton } from '@/components/submit-button'
import { ErrorText, Field, Input } from '@/components/ui'
import { initialActionState } from '@/lib/action-state'
import { signIn } from './actions'

export function LoginForm() {
  const [state, formAction] = useActionState(signIn, initialActionState)
  return (
    <form action={formAction} className="space-y-3">
      <Field label="E-mail">
        <Input name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Senha">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <ErrorText>{state.error}</ErrorText>
      <SubmitButton pendingText="Entrando…">Entrar</SubmitButton>
    </form>
  )
}
```

`src/app/login/page.tsx`:
```tsx
import { Card, PageTitle } from '@/components/ui'
import { LoginForm } from './login-form'

export default function LoginPage() {
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <PageTitle>Entrar no FotoFácil</PageTitle>
      <Card>
        <LoginForm />
      </Card>
    </div>
  )
}
```

`scripts/create-admin.ts`:
```ts
import { createClient } from '@supabase/supabase-js'

async function main() {
  const [email, password] = process.argv.slice(2)
  if (!email || !password) {
    console.error('Uso: npm run create-admin -- <email> <senha>')
    process.exit(1)
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  })
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(error?.message ?? 'Falha ao criar usuário')
  const { error: profileError } = await supabase.from('profiles').insert({ id: data.user.id, role: 'admin' })
  if (profileError) throw new Error(profileError.message)
  console.log(`Admin criado: ${email}`)
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
```

- [ ] **Step 4: Run the tests and checks**

Run: `npx vitest run --project unit && npm run typecheck && npm run lint`
Expected: PASS. Login only works against a Supabase project; it is exercised end to end in Task 20.

- [ ] **Step 5: Commit**

```bash
git add src scripts tests/unit/errors.test.ts
git commit -m "feat: add Supabase clients, login, route guards and admin bootstrap script"
```

---

### Task 8: Validation schemas and admin area (settings, photographers, clients)

**Files:**
- Create: `src/lib/validation.ts`, `src/lib/photographers/photo.ts`
- Create: `src/app/admin/layout.tsx`, `src/app/admin/page.tsx` (Task 18 replaces the body)
- Create: `src/app/admin/configuracoes/page.tsx`, `src/app/admin/configuracoes/actions.ts`
- Create: `src/app/admin/fotografos/page.tsx`, `src/app/admin/fotografos/[id]/page.tsx`, `src/app/admin/fotografos/actions.ts`, `src/app/admin/fotografos/photographer-fields.tsx`
- Create: `src/app/admin/clientes/page.tsx`, `src/app/admin/clientes/[id]/page.tsx`, `src/app/admin/clientes/actions.ts`
- Test: `tests/unit/validation.test.ts`

**Interfaces:**
- Consumes:
  - From Task 2: `normalizePhone`, `parseBRLToCents`, `parsePercentToBasisPoints`, `formatCommissionInput`, `describeCommission`, `formatBRL`, `centsToInput`, `maskPhone`.
  - From Task 7: `requireAdmin`, `createClient`, `createAdminClient`, `errorMessage`.
  - From Task 1: `ActionForm`.
- Produces:
  - **Form parsing:** `parseForm(schema, input): { ok: true; data } | { ok: false; error: string }`.
  - **Schemas:** `clientSchema` → `{ full_name, phone_e164 }`; `photographerSchema` → `{ name, whatsapp, default_price_cents, commission_type, commission_value }`; `newPhotographerSchema` → `{ email, password, photographer: <photographerSchema output> }`; `profileSchema` → `{ name, whatsapp, default_price_cents }`; `settingsSchema` → the settings columns; `eventSchema` → `{ name, start_date, end_date, price_cents, retention_days }`.
  - **Avatars:** `uploadPhotographerPhoto(photographerId, file): Promise<string>`, `photographerPhotoUrl(path | null): string | null`, and `PUBLIC_BUCKET`.

- [ ] **Step 1: Write the failing test**

`tests/unit/validation.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import {
  clientSchema,
  eventSchema,
  newPhotographerSchema,
  parseForm,
  photographerSchema,
  profileSchema,
  settingsSchema,
} from '@/lib/validation'

describe('clientSchema', () => {
  it('normalizes name and phone', () => {
    expect(parseForm(clientSchema, { fullName: '  Ana   Souza ', phone: '(71) 99123-4567' })).toEqual({
      ok: true,
      data: { full_name: 'Ana Souza', phone_e164: '+5571991234567' },
    })
  })

  it('requires first and last name', () => {
    expect(parseForm(clientSchema, { fullName: 'Ana', phone: '71991234567' })).toEqual({
      ok: false,
      error: 'Informe nome e sobrenome.',
    })
  })

  it('rejects an invalid phone', () => {
    expect(parseForm(clientSchema, { fullName: 'Ana Souza', phone: '123' })).toEqual({ ok: false, error: 'Celular inválido.' })
  })
})

describe('photographerSchema', () => {
  it('parses percent commission into basis points', () => {
    expect(
      parseForm(photographerSchema, {
        name: 'João Foto',
        whatsapp: '71 98888-7777',
        price: '50,00',
        commissionType: 'percent',
        commissionValue: '15',
      }),
    ).toEqual({
      ok: true,
      data: {
        name: 'João Foto',
        whatsapp: '+5571988887777',
        default_price_cents: 5000,
        commission_type: 'percent',
        commission_value: 1500,
      },
    })
  })

  it('parses fixed commission into cents and rejects bad values', () => {
    const base = { name: 'João Foto', whatsapp: '71988887777', price: '50', commissionType: 'fixed' }
    expect(parseForm(photographerSchema, { ...base, commissionValue: '5,00' })).toMatchObject({
      ok: true,
      data: { commission_value: 500 },
    })
    expect(parseForm(photographerSchema, { ...base, commissionValue: 'x' })).toEqual({ ok: false, error: 'Comissão inválida.' })
  })

  it('validates email and password for new photographers', () => {
    const input = {
      name: 'João Foto',
      whatsapp: '71988887777',
      price: '50',
      commissionType: 'percent',
      commissionValue: '10',
      email: ' JOAO@Example.com ',
      password: '12345678',
    }
    expect(parseForm(newPhotographerSchema, input)).toMatchObject({ ok: true, data: { email: 'joao@example.com' } })
    expect(parseForm(newPhotographerSchema, { ...input, password: '123' })).toEqual({
      ok: false,
      error: 'A senha precisa ter 8 caracteres ou mais.',
    })
  })
})

describe('profileSchema', () => {
  it('rejects a zero price', () => {
    expect(parseForm(profileSchema, { name: 'João', whatsapp: '71988887777', price: '0' })).toEqual({
      ok: false,
      error: 'Valor inválido.',
    })
  })
})

describe('settingsSchema', () => {
  const base = {
    defaultRetentionDays: '30',
    maxRetentionDays: '90',
    commissionType: 'percent',
    commissionValue: '10',
    faceMatchThreshold: '90',
    dailySearchLimit: '10',
  }

  it('maps to settings columns', () => {
    expect(parseForm(settingsSchema, base)).toEqual({
      ok: true,
      data: {
        default_retention_days: 30,
        max_retention_days: 90,
        default_commission_type: 'percent',
        default_commission_value: 1000,
        face_match_threshold: 90,
        daily_search_limit: 10,
      },
    })
  })

  it('rejects a default above the maximum', () => {
    expect(parseForm(settingsSchema, { ...base, defaultRetentionDays: '100' })).toEqual({
      ok: false,
      error: 'O prazo padrão não pode passar do máximo.',
    })
  })
})

describe('eventSchema', () => {
  it('maps to event columns', () => {
    expect(
      parseForm(eventSchema, { name: 'Carnaval', startDate: '2027-02-10', endDate: '2027-02-13', price: '60', retentionDays: '30' }),
    ).toEqual({
      ok: true,
      data: { name: 'Carnaval', start_date: '2027-02-10', end_date: '2027-02-13', price_cents: 6000, retention_days: 30 },
    })
  })

  it('rejects an end date before the start date', () => {
    expect(
      parseForm(eventSchema, { name: 'Carnaval', startDate: '2027-02-10', endDate: '2027-02-09', price: '60', retentionDays: '30' }),
    ).toEqual({ ok: false, error: 'A data final deve ser igual ou depois da inicial.' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project unit tests/unit/validation.test.ts`
Expected: FAIL. The module `@/lib/validation` is not found.

- [ ] **Step 3: Implement the validation module**

`src/lib/validation.ts`:
```ts
import { z } from 'zod'
import { parsePercentToBasisPoints, type CommissionType } from './domain/commission'
import { parseBRLToCents } from './domain/money'
import { normalizePhone } from './domain/phone'

export type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string }

export function parseForm<S extends z.ZodTypeAny>(schema: S, input: unknown): ParseResult<z.output<S>> {
  const result = schema.safeParse(input)
  if (result.success) return { ok: true, data: result.data as z.output<S> }
  return { ok: false, error: result.error.issues[0]?.message ?? 'Dados inválidos.' }
}

const phoneField = z.string().transform((value, ctx) => {
  const phone = normalizePhone(value)
  if (!phone) {
    ctx.addIssue({ code: 'custom', message: 'Celular inválido.' })
    return z.NEVER
  }
  return phone
})

const priceField = z.string().transform((value, ctx) => {
  const cents = parseBRLToCents(value)
  if (cents === null || cents <= 0) {
    ctx.addIssue({ code: 'custom', message: 'Valor inválido.' })
    return z.NEVER
  }
  return cents
})

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.')

function parseCommission(type: CommissionType, raw: string): number | null {
  return type === 'percent' ? parsePercentToBasisPoints(raw) : parseBRLToCents(raw)
}

export const clientSchema = z
  .object({
    fullName: z.string().transform(v => v.trim().replace(/\s+/g, ' ')),
    phone: phoneField,
  })
  .transform((v, ctx) => {
    if (v.fullName.split(' ').length < 2 || v.fullName.length < 3) {
      ctx.addIssue({ code: 'custom', message: 'Informe nome e sobrenome.' })
      return z.NEVER
    }
    return { full_name: v.fullName, phone_e164: v.phone }
  })

const photographerShape = {
  name: z.string().trim().min(2, 'Informe o nome.'),
  whatsapp: phoneField,
  price: priceField,
  commissionType: z.enum(['percent', 'fixed']),
  commissionValue: z.string(),
}

export const photographerSchema = z.object(photographerShape).transform((v, ctx) => {
  const commission = parseCommission(v.commissionType, v.commissionValue)
  if (commission === null) {
    ctx.addIssue({ code: 'custom', message: 'Comissão inválida.' })
    return z.NEVER
  }
  return {
    name: v.name,
    whatsapp: v.whatsapp,
    default_price_cents: v.price,
    commission_type: v.commissionType,
    commission_value: commission,
  }
})

export const newPhotographerSchema = z
  .object({
    ...photographerShape,
    email: z.string().trim().toLowerCase().email('E-mail inválido.'),
    password: z.string().min(8, 'A senha precisa ter 8 caracteres ou mais.'),
  })
  .transform((v, ctx) => {
    const commission = parseCommission(v.commissionType, v.commissionValue)
    if (commission === null) {
      ctx.addIssue({ code: 'custom', message: 'Comissão inválida.' })
      return z.NEVER
    }
    return {
      email: v.email,
      password: v.password,
      photographer: {
        name: v.name,
        whatsapp: v.whatsapp,
        default_price_cents: v.price,
        commission_type: v.commissionType,
        commission_value: commission,
      },
    }
  })

export const profileSchema = z
  .object({ name: z.string().trim().min(2, 'Informe o nome.'), whatsapp: phoneField, price: priceField })
  .transform(v => ({ name: v.name, whatsapp: v.whatsapp, default_price_cents: v.price }))

export const settingsSchema = z
  .object({
    defaultRetentionDays: z.coerce.number().int().min(1, 'Prazo padrão inválido.').max(365, 'Prazo padrão inválido.'),
    maxRetentionDays: z.coerce.number().int().min(1, 'Prazo máximo inválido.').max(365, 'Prazo máximo inválido.'),
    commissionType: z.enum(['percent', 'fixed']),
    commissionValue: z.string(),
    faceMatchThreshold: z.coerce.number().int().min(50, 'Use um valor entre 50 e 99.').max(99, 'Use um valor entre 50 e 99.'),
    dailySearchLimit: z.coerce.number().int().min(1, 'Use um valor entre 1 e 100.').max(100, 'Use um valor entre 1 e 100.'),
  })
  .transform((v, ctx) => {
    if (v.defaultRetentionDays > v.maxRetentionDays) {
      ctx.addIssue({ code: 'custom', message: 'O prazo padrão não pode passar do máximo.' })
      return z.NEVER
    }
    const commission = parseCommission(v.commissionType, v.commissionValue)
    if (commission === null) {
      ctx.addIssue({ code: 'custom', message: 'Comissão inválida.' })
      return z.NEVER
    }
    return {
      default_retention_days: v.defaultRetentionDays,
      max_retention_days: v.maxRetentionDays,
      default_commission_type: v.commissionType,
      default_commission_value: commission,
      face_match_threshold: v.faceMatchThreshold,
      daily_search_limit: v.dailySearchLimit,
    }
  })

export const eventSchema = z
  .object({
    name: z.string().trim().min(2, 'Informe o nome do evento.'),
    startDate: isoDate,
    endDate: isoDate,
    price: priceField,
    retentionDays: z.coerce.number().int().min(1, 'Prazo de exclusão inválido.'),
  })
  .transform((v, ctx) => {
    if (v.endDate < v.startDate) {
      ctx.addIssue({ code: 'custom', message: 'A data final deve ser igual ou depois da inicial.' })
      return z.NEVER
    }
    return { name: v.name, start_date: v.startDate, end_date: v.endDate, price_cents: v.price, retention_days: v.retentionDays }
  })
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --project unit tests/unit/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the avatar helper and the admin pages**

`src/lib/photographers/photo.ts`:
```ts
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export const PUBLIC_BUCKET = 'public-assets'

export async function uploadPhotographerPhoto(photographerId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
    throw new Error('Envie uma imagem de até 5 MB.')
  }
  const path = `photographers/${photographerId}-${Date.now()}`
  const { error } = await createAdminClient().storage.from(PUBLIC_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: true,
  })
  if (error) throw new Error('Não foi possível enviar a foto.')
  return path
}

export function photographerPhotoUrl(path: string | null): string | null {
  if (!path) return null
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PUBLIC_BUCKET}/${path}`
}
```

`src/app/admin/layout.tsx`:
```tsx
import Link from 'next/link'
import type { ReactNode } from 'react'
import { signOut } from '@/app/login/actions'
import { requireAdmin } from '@/lib/auth/guards'

const LINKS = [
  ['/admin', 'Painel'],
  ['/admin/fotografos', 'Fotógrafos'],
  ['/admin/clientes', 'Clientes'],
  ['/admin/eventos', 'Eventos'],
  ['/admin/fechamentos', 'Fechamentos'],
  ['/admin/configuracoes', 'Configurações'],
] as const

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireAdmin()
  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap items-center gap-3 text-sm">
        {LINKS.map(([href, label]) => (
          <Link key={href} href={href} className="rounded-md px-2 py-1 hover:bg-gray-200">
            {label}
          </Link>
        ))}
        <form action={signOut} className="ml-auto">
          <button className="text-gray-600 underline">Sair</button>
        </form>
      </nav>
      {children}
    </div>
  )
}
```

`src/app/admin/page.tsx` (Task 18 replaces it with the dashboard):
```tsx
import { PageTitle } from '@/components/ui'

export default function AdminHome() {
  return <PageTitle>Painel</PageTitle>
}
```

`src/app/admin/configuracoes/actions.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/action-state'
import { requireAdmin } from '@/lib/auth/guards'
import { errorMessage } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import { parseForm, settingsSchema } from '@/lib/validation'

export async function updateSettings(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin()
  const parsed = parseForm(settingsSchema, Object.fromEntries(formData))
  if (!parsed.ok) return { error: parsed.error }
  const supabase = await createClient()
  const { error } = await supabase
    .from('settings')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', 1)
  if (error) return { error: errorMessage(error) }
  revalidatePath('/admin/configuracoes')
  return { error: null, ok: true }
}
```

`src/app/admin/configuracoes/page.tsx`:
```tsx
import QRCode from 'qrcode'
import { ActionForm } from '@/components/action-form'
import { Card, Field, Input, PageTitle, Select } from '@/components/ui'
import { formatCommissionInput } from '@/lib/domain/commission'
import { createClient } from '@/lib/supabase/server'
import { updateSettings } from './actions'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: s } = await supabase.from('settings').select('*').eq('id', 1).single()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
  const qr = await QRCode.toDataURL(siteUrl, { width: 512, margin: 1 })

  return (
    <div className="space-y-6">
      <PageTitle>Configurações</PageTitle>
      <Card>
        <ActionForm action={updateSettings} submitLabel="Salvar configurações">
          <Field label="Prazo padrão de exclusão (dias)">
            <Input name="defaultRetentionDays" type="number" min={1} max={365} defaultValue={s.default_retention_days} />
          </Field>
          <Field label="Prazo máximo de exclusão (dias)">
            <Input name="maxRetentionDays" type="number" min={1} max={365} defaultValue={s.max_retention_days} />
          </Field>
          <Field label="Tipo de comissão padrão (novos fotógrafos)">
            <Select name="commissionType" defaultValue={s.default_commission_type}>
              <option value="percent">Percentual (%)</option>
              <option value="fixed">Valor fixo por venda (R$)</option>
            </Select>
          </Field>
          <Field label="Comissão padrão">
            <Input
              name="commissionValue"
              defaultValue={formatCommissionInput(s.default_commission_type, s.default_commission_value)}
            />
          </Field>
          <Field label="Semelhança mínima do reconhecimento (50–99)" hint="Mais alto = menos fotos erradas, mas pode esconder fotos certas.">
            <Input name="faceMatchThreshold" type="number" min={50} max={99} defaultValue={s.face_match_threshold} />
          </Field>
          <Field label="Buscas por dia por cliente">
            <Input name="dailySearchLimit" type="number" min={1} max={100} defaultValue={s.daily_search_limit} />
          </Field>
        </ActionForm>
      </Card>
      <Card className="space-y-2 text-center">
        <h2 className="font-semibold">QR code do link universal</h2>
        <p className="text-sm text-gray-600">{siteUrl}</p>
        <img src={qr} alt="QR code do FotoFácil" className="mx-auto h-48 w-48" />
        <a href={qr} download="fotofacil-qrcode.png" className="text-sm underline">
          Baixar QR code
        </a>
      </Card>
    </div>
  )
}
```

`src/app/admin/fotografos/photographer-fields.tsx`:
```tsx
import { Field, Input, Select } from '@/components/ui'
import { formatCommissionInput, type CommissionType } from '@/lib/domain/commission'
import { centsToInput } from '@/lib/domain/money'

export interface PhotographerDefaults {
  name?: string
  whatsapp?: string
  priceCents?: number
  commissionType: CommissionType
  commissionValue: number
}

export function PhotographerFields({ defaults }: { defaults: PhotographerDefaults }) {
  return (
    <>
      <Field label="Nome">
        <Input name="name" defaultValue={defaults.name} required />
      </Field>
      <Field label="WhatsApp">
        <Input name="whatsapp" type="tel" defaultValue={defaults.whatsapp} required />
      </Field>
      <Field label="Preço padrão do pacote (R$)">
        <Input
          name="price"
          inputMode="decimal"
          defaultValue={defaults.priceCents ? centsToInput(defaults.priceCents) : ''}
          required
        />
      </Field>
      <Field label="Tipo de comissão">
        <Select name="commissionType" defaultValue={defaults.commissionType}>
          <option value="percent">Percentual (%)</option>
          <option value="fixed">Valor fixo por venda (R$)</option>
        </Select>
      </Field>
      <Field label="Comissão">
        <Input name="commissionValue" defaultValue={formatCommissionInput(defaults.commissionType, defaults.commissionValue)} required />
      </Field>
    </>
  )
}
```

`src/app/admin/fotografos/actions.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/action-state'
import { requireAdmin } from '@/lib/auth/guards'
import { errorMessage } from '@/lib/errors'
import { uploadPhotographerPhoto } from '@/lib/photographers/photo'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { newPhotographerSchema, parseForm, photographerSchema } from '@/lib/validation'

export async function createPhotographer(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin()
  const parsed = parseForm(newPhotographerSchema, Object.fromEntries(formData))
  if (!parsed.ok) return { error: parsed.error }
  const admin = createAdminClient()
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
  })
  if (authError || !created.user) {
    return {
      error: authError?.message.toLowerCase().includes('already')
        ? 'Já existe um usuário com esse e-mail.'
        : 'Não foi possível criar o login.',
    }
  }
  const userId = created.user.id
  const { error: profileError } = await admin.from('profiles').insert({ id: userId, role: 'photographer' })
  const { error: photographerError } = profileError
    ? { error: profileError }
    : await admin.from('photographers').insert({ ...parsed.data.photographer, profile_id: userId })
  if (profileError || photographerError) {
    await admin.auth.admin.deleteUser(userId)
    return { error: 'Não foi possível salvar o fotógrafo.' }
  }
  revalidatePath('/admin/fotografos')
  return { error: null, ok: true }
}

export async function updatePhotographer(photographerId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin()
  const parsed = parseForm(photographerSchema, Object.fromEntries(formData))
  if (!parsed.ok) return { error: parsed.error }
  const patch: Record<string, unknown> = { ...parsed.data, active: formData.get('active') === 'on' }
  const photo = formData.get('photo')
  if (photo instanceof File && photo.size > 0) {
    try {
      patch.photo_path = await uploadPhotographerPhoto(photographerId, photo)
    } catch (e) {
      return { error: (e as Error).message }
    }
  }
  const supabase = await createClient()
  const { error } = await supabase.from('photographers').update(patch).eq('id', photographerId)
  if (error) return { error: errorMessage(error) }
  revalidatePath(`/admin/fotografos/${photographerId}`)
  revalidatePath('/admin/fotografos')
  return { error: null, ok: true }
}
```

`src/app/admin/fotografos/page.tsx`:
```tsx
import Link from 'next/link'
import { ActionForm } from '@/components/action-form'
import { Card, Field, Input, PageTitle } from '@/components/ui'
import { describeCommission } from '@/lib/domain/commission'
import { formatBRL } from '@/lib/domain/money'
import { createClient } from '@/lib/supabase/server'
import { createPhotographer } from './actions'
import { PhotographerFields } from './photographer-fields'

export default async function PhotographersPage() {
  const supabase = await createClient()
  const [{ data: photographers }, { data: settings }] = await Promise.all([
    supabase
      .from('photographers')
      .select('id, name, default_price_cents, commission_type, commission_value, active')
      .order('name'),
    supabase.from('settings').select('default_commission_type, default_commission_value').eq('id', 1).single(),
  ])

  return (
    <div className="space-y-6">
      <PageTitle>Fotógrafos</PageTitle>
      <Card>
        {photographers?.length ? (
          <ul className="divide-y">
            {photographers.map(p => (
              <li key={p.id} className="py-2">
                <Link href={`/admin/fotografos/${p.id}`} className="font-medium underline">
                  {p.name}
                </Link>
                {!p.active && <span className="ml-2 text-xs text-gray-500">(inativo)</span>}
                <p className="text-sm text-gray-600">
                  {formatBRL(p.default_price_cents)} · comissão {describeCommission(p.commission_type, p.commission_value)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">Nenhum fotógrafo cadastrado.</p>
        )}
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Novo fotógrafo</h2>
        <ActionForm action={createPhotographer} submitLabel="Criar fotógrafo">
          <PhotographerFields
            defaults={{ commissionType: settings?.default_commission_type ?? 'percent', commissionValue: settings?.default_commission_value ?? 1000 }}
          />
          <Field label="E-mail de login">
            <Input name="email" type="email" required />
          </Field>
          <Field label="Senha inicial">
            <Input name="password" type="password" minLength={8} required />
          </Field>
        </ActionForm>
      </Card>
    </div>
  )
}
```

`src/app/admin/fotografos/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/action-form'
import { Card, Field, Input, PageTitle } from '@/components/ui'
import { photographerPhotoUrl } from '@/lib/photographers/photo'
import { createClient } from '@/lib/supabase/server'
import { updatePhotographer } from '../actions'
import { PhotographerFields } from '../photographer-fields'

export default async function EditPhotographerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: p } = await supabase.from('photographers').select('*').eq('id', id).maybeSingle()
  if (!p) notFound()
  const photoUrl = photographerPhotoUrl(p.photo_path)

  return (
    <div className="space-y-4">
      <PageTitle>{p.name}</PageTitle>
      <Card>
        <ActionForm action={updatePhotographer.bind(null, id)} submitLabel="Salvar">
          {photoUrl ? <img src={photoUrl} alt="" className="h-20 w-20 rounded-full object-cover" /> : null}
          <Field label="Foto">
            <Input name="photo" type="file" accept="image/*" />
          </Field>
          <PhotographerFields
            defaults={{
              name: p.name,
              whatsapp: p.whatsapp,
              priceCents: p.default_price_cents,
              commissionType: p.commission_type,
              commissionValue: p.commission_value,
            }}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={p.active} /> Ativo
          </label>
        </ActionForm>
      </Card>
    </div>
  )
}
```

`src/app/admin/clientes/actions.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/action-state'
import { requireAdmin } from '@/lib/auth/guards'
import { errorMessage } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import { clientSchema, parseForm } from '@/lib/validation'

export async function createClientRecord(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin()
  const parsed = parseForm(clientSchema, Object.fromEntries(formData))
  if (!parsed.ok) return { error: parsed.error }
  const supabase = await createClient()
  const { error } = await supabase.from('clients').insert({ ...parsed.data, created_by: session.userId })
  if (error) return { error: errorMessage(error) }
  revalidatePath('/admin/clientes')
  return { error: null, ok: true }
}

export async function updateClientRecord(clientId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin()
  const parsed = parseForm(clientSchema, Object.fromEntries(formData))
  if (!parsed.ok) return { error: parsed.error }
  const supabase = await createClient()
  const { error } = await supabase.from('clients').update(parsed.data).eq('id', clientId)
  if (error) return { error: errorMessage(error) }
  revalidatePath(`/admin/clientes/${clientId}`)
  return { error: null, ok: true }
}
```

`src/app/admin/clientes/page.tsx`:
```tsx
import Link from 'next/link'
import { ActionForm } from '@/components/action-form'
import { Button, Card, Field, Input, PageTitle } from '@/components/ui'
import { maskPhone, normalizePhone } from '@/lib/domain/phone'
import { createClient } from '@/lib/supabase/server'
import { createClientRecord } from './actions'

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams
  const supabase = await createClient()
  const phone = normalizePhone(q)
  let query = supabase.from('clients').select('id, full_name, phone_e164').order('full_name').limit(50)
  if (phone) query = query.eq('phone_e164', phone)
  else if (q.trim().length >= 2) query = query.ilike('full_name', `%${q.trim()}%`)
  const { data: clients } = await query

  return (
    <div className="space-y-6">
      <PageTitle>Clientes</PageTitle>
      <form className="flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Nome ou celular" />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>
      <Card>
        <ul className="divide-y">
          {(clients ?? []).map(c => (
            <li key={c.id} className="flex justify-between py-2">
              <Link href={`/admin/clientes/${c.id}`} className="underline">
                {c.full_name}
              </Link>
              <span className="text-sm text-gray-600">{maskPhone(c.phone_e164)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h2 className="mb-3 font-semibold">Nova cliente</h2>
        <ActionForm action={createClientRecord} submitLabel="Cadastrar">
          <Field label="Nome completo">
            <Input name="fullName" required />
          </Field>
          <Field label="Celular">
            <Input name="phone" type="tel" required />
          </Field>
        </ActionForm>
      </Card>
    </div>
  )
}
```

`src/app/admin/clientes/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/action-form'
import { Card, Field, Input, PageTitle } from '@/components/ui'
import { formatDate } from '@/lib/domain/dates'
import { createClient } from '@/lib/supabase/server'
import { updateClientRecord } from '../actions'

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: client }, { data: registrations }] = await Promise.all([
    supabase.from('clients').select('id, full_name, phone_e164').eq('id', id).maybeSingle(),
    supabase
      .from('registrations')
      .select('id, status, payment_method, events(name, start_date)')
      .eq('client_id', id)
      .order('delivered_at', { ascending: false }),
  ])
  if (!client) notFound()

  return (
    <div className="space-y-4">
      <PageTitle>{client.full_name}</PageTitle>
      <Card>
        <ActionForm action={updateClientRecord.bind(null, id)} submitLabel="Salvar">
          <Field label="Nome completo">
            <Input name="fullName" defaultValue={client.full_name} required />
          </Field>
          <Field label="Celular">
            <Input name="phone" type="tel" defaultValue={client.phone_e164} required />
          </Field>
        </ActionForm>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Eventos</h2>
        <ul className="divide-y text-sm">
          {(registrations ?? []).map(r => (
            <li key={r.id} className="flex justify-between py-2">
              <span>
                {r.events?.name} · {r.events ? formatDate(r.events.start_date) : ''}
              </span>
              <span>{r.status === 'paid' ? `Pago (${r.payment_method === 'pix' ? 'PIX' : 'manual'})` : 'Pulseira entregue'}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
```

- [ ] **Step 6: Verify**

Run: `npx vitest run --project unit && npm run typecheck && npm run lint && npm run build`
Expected: all succeed.

- [ ] **Step 7: Commit**

```bash
git add src tests/unit/validation.test.ts
git commit -m "feat: add validation schemas and admin settings, photographers and clients pages"
```

---
### Task 9: Photographer area: layout, profile, events and the event page

**Files:**
- Create: `src/lib/domain/events.ts`
- Create: `src/app/fotografo/layout.tsx`, `src/app/fotografo/page.tsx`
- Create: `src/app/fotografo/perfil/page.tsx`, `src/app/fotografo/perfil/actions.ts`
- Create: `src/app/fotografo/eventos/actions.ts`, `src/app/fotografo/eventos/event-form-fields.tsx`, `src/app/fotografo/eventos/novo/page.tsx`
- Create: `src/app/fotografo/eventos/[id]/page.tsx`, `src/app/fotografo/eventos/[id]/event-tabs.tsx`
- Test: `tests/unit/domain/events.test.ts`

**Interfaces:**
- Consumes:
  - From Task 7: `requirePhotographer`, `createClient`, `errorMessage`.
  - From Task 8: `eventSchema`, `profileSchema`, `parseForm`, `uploadPhotographerPhoto`, `photographerPhotoUrl`.
  - From Task 2: `eventSlug`, `todayInSaoPaulo`, `formatDate`, `formatBRL`, `centsToInput`, `describeCommission`, `addDays`, `daysUntil`.
- Produces:
  - **Event helpers:** `EventAvailability = { status: string; expires_at: string }`, `isEventAvailable(ev, today): boolean`, `eventDays(start, end): string[]`, `expiryWarning(ev, today): string | null`.
  - **Event page:** `src/app/fotografo/eventos/[id]/page.tsx`, with the `?aba=pulseiras|fotos|config` tabs. Tasks 10 and 14 add the pulseiras and fotos panels.
  - **Form fields:** `EventFormFields({ defaults, maxRetentionDays })`.

- [ ] **Step 1: Write the failing test**

`tests/unit/domain/events.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { eventDays, expiryWarning, isEventAvailable } from '@/lib/domain/events'

describe('isEventAvailable', () => {
  it('is available while active and not past expires_at', () => {
    expect(isEventAvailable({ status: 'active', expires_at: '2026-10-13' }, '2026-10-13')).toBe(true)
    expect(isEventAvailable({ status: 'active', expires_at: '2026-10-12' }, '2026-10-13')).toBe(false)
    expect(isEventAvailable({ status: 'expired', expires_at: '2026-12-01' }, '2026-10-13')).toBe(false)
  })
})

describe('eventDays', () => {
  it('lists every day of the event', () => {
    expect(eventDays('2026-10-30', '2026-11-01')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01'])
  })
})

describe('expiryWarning', () => {
  it('warns only in the last 3 days', () => {
    expect(expiryWarning({ status: 'active', expires_at: '2026-10-20' }, '2026-10-13')).toBeNull()
    expect(expiryWarning({ status: 'active', expires_at: '2026-10-16' }, '2026-10-13')).toBe(
      'As fotos deste evento serão excluídas em 3 dias.',
    )
    expect(expiryWarning({ status: 'active', expires_at: '2026-10-14' }, '2026-10-13')).toBe(
      'As fotos deste evento serão excluídas em 1 dia.',
    )
    expect(expiryWarning({ status: 'active', expires_at: '2026-10-13' }, '2026-10-13')).toBe(
      'Hoje é o último dia: as fotos deste evento serão excluídas nesta madrugada.',
    )
    expect(expiryWarning({ status: 'expired', expires_at: '2026-10-13' }, '2026-10-13')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project unit tests/unit/domain/events.test.ts`
Expected: FAIL. The module is not found.

- [ ] **Step 3: Implement `src/lib/domain/events.ts`**

```ts
import { addDays, daysUntil } from './dates'

export interface EventAvailability {
  status: string
  expires_at: string
}

export function isEventAvailable(event: EventAvailability, today: string): boolean {
  return event.status === 'active' && event.expires_at >= today
}

export function eventDays(startDate: string, endDate: string): string[] {
  const days: string[] = []
  for (let day = startDate; day <= endDate && days.length < 60; day = addDays(day, 1)) days.push(day)
  return days
}

export function expiryWarning(event: EventAvailability, today: string): string | null {
  if (!isEventAvailable(event, today)) return null
  const left = daysUntil(today, event.expires_at)
  if (left > 3) return null
  if (left === 0) return 'Hoje é o último dia: as fotos deste evento serão excluídas nesta madrugada.'
  return `As fotos deste evento serão excluídas em ${left} ${left === 1 ? 'dia' : 'dias'}.`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --project unit tests/unit/domain/events.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the photographer pages**

`src/app/fotografo/layout.tsx`:
```tsx
import Link from 'next/link'
import type { ReactNode } from 'react'
import { signOut } from '@/app/login/actions'
import { requirePhotographer } from '@/lib/auth/guards'

export default async function PhotographerLayout({ children }: { children: ReactNode }) {
  await requirePhotographer()
  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-3 text-sm">
        <Link href="/fotografo" className="rounded-md px-2 py-1 hover:bg-gray-200">
          Eventos
        </Link>
        <Link href="/fotografo/perfil" className="rounded-md px-2 py-1 hover:bg-gray-200">
          Meu perfil
        </Link>
        <form action={signOut} className="ml-auto">
          <button className="text-gray-600 underline">Sair</button>
        </form>
      </nav>
      {children}
    </div>
  )
}
```

`src/app/fotografo/page.tsx`:
```tsx
import Link from 'next/link'
import { Card, PageTitle, buttonClass } from '@/components/ui'
import { requirePhotographer } from '@/lib/auth/guards'
import { formatDate, todayInSaoPaulo } from '@/lib/domain/dates'
import { expiryWarning, isEventAvailable } from '@/lib/domain/events'
import { createClient } from '@/lib/supabase/server'

export default async function PhotographerHome() {
  const { photographerId } = await requirePhotographer()
  const supabase = await createClient()
  const { data: events } = await supabase
    .from('events')
    .select('id, name, start_date, end_date, status, expires_at')
    .eq('photographer_id', photographerId)
    .order('start_date', { ascending: false })
  const today = todayInSaoPaulo()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageTitle>Meus eventos</PageTitle>
        <Link href="/fotografo/eventos/novo" className={buttonClass('primary')}>
          Novo evento
        </Link>
      </div>
      {(events ?? []).map(event => {
        const warning = expiryWarning(event, today)
        return (
          <Card key={event.id}>
            <Link href={`/fotografo/eventos/${event.id}`} className="font-medium underline">
              {event.name}
            </Link>
            <p className="text-sm text-gray-600">
              {formatDate(event.start_date)} a {formatDate(event.end_date)} ·{' '}
              {isEventAvailable(event, today) ? `fotos até ${formatDate(event.expires_at)}` : 'encerrado'}
            </p>
            {warning ? <p className="mt-1 text-sm text-amber-700">{warning}</p> : null}
          </Card>
        )
      })}
      {events?.length ? null : <p className="text-sm text-gray-600">Nenhum evento ainda.</p>}
    </div>
  )
}
```

`src/app/fotografo/eventos/event-form-fields.tsx`:
```tsx
import { Field, Input } from '@/components/ui'
import { centsToInput } from '@/lib/domain/money'

export interface EventDefaults {
  name: string
  startDate: string
  endDate: string
  priceCents: number
  retentionDays: number
}

export function EventFormFields({ defaults, maxRetentionDays }: { defaults: EventDefaults; maxRetentionDays: number }) {
  return (
    <>
      <Field label="Nome do evento">
        <Input name="name" defaultValue={defaults.name} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data de início">
          <Input name="startDate" type="date" defaultValue={defaults.startDate} required />
        </Field>
        <Field label="Data de término">
          <Input name="endDate" type="date" defaultValue={defaults.endDate} required />
        </Field>
      </div>
      <Field label="Preço do pacote (R$)">
        <Input name="price" inputMode="decimal" defaultValue={centsToInput(defaults.priceCents)} required />
      </Field>
      <Field
        label="Prazo de exclusão (dias)"
        hint={`As fotos ficam disponíveis até o término + este prazo. Máximo: ${maxRetentionDays} dias.`}
      >
        <Input name="retentionDays" type="number" min={1} max={maxRetentionDays} defaultValue={defaults.retentionDays} required />
      </Field>
    </>
  )
}
```

`src/app/fotografo/eventos/actions.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { ActionState } from '@/lib/action-state'
import { requirePhotographer } from '@/lib/auth/guards'
import { eventSlug } from '@/lib/domain/slug'
import { errorMessage } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'
import { eventSchema, parseForm } from '@/lib/validation'

export async function createEvent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { photographerId } = await requirePhotographer()
  const parsed = parseForm(eventSchema, Object.fromEntries(formData))
  if (!parsed.ok) return { error: parsed.error }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('events')
    .insert({ ...parsed.data, photographer_id: photographerId, slug: eventSlug(parsed.data.name) })
    .select('id')
    .single()
  if (error || !data) return { error: errorMessage(error) }
  redirect(`/fotografo/eventos/${data.id}`)
}

export async function updateEvent(eventId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePhotographer()
  const parsed = parseForm(eventSchema, Object.fromEntries(formData))
  if (!parsed.ok) return { error: parsed.error }
  const supabase = await createClient()
  const { data, error } = await supabase.from('events').update(parsed.data).eq('id', eventId).select('id')
  if (error) return { error: errorMessage(error) }
  if (!data?.length) return { error: 'Evento não encontrado.' }
  revalidatePath(`/fotografo/eventos/${eventId}`)
  return { error: null, ok: true }
}
```

`src/app/fotografo/eventos/novo/page.tsx`:
```tsx
import { ActionForm } from '@/components/action-form'
import { Card, PageTitle } from '@/components/ui'
import { requirePhotographer } from '@/lib/auth/guards'
import { todayInSaoPaulo } from '@/lib/domain/dates'
import { createClient } from '@/lib/supabase/server'
import { createEvent } from '../actions'
import { EventFormFields } from '../event-form-fields'

export default async function NewEventPage() {
  const { photographerId } = await requirePhotographer()
  const supabase = await createClient()
  const [{ data: me }, { data: settings }] = await Promise.all([
    supabase.from('photographers').select('default_price_cents').eq('id', photographerId).single(),
    supabase.from('settings').select('default_retention_days, max_retention_days').eq('id', 1).single(),
  ])
  const today = todayInSaoPaulo()

  return (
    <div className="space-y-4">
      <PageTitle>Novo evento</PageTitle>
      <Card>
        <ActionForm action={createEvent} submitLabel="Criar evento" pendingText="Criando…">
          <EventFormFields
            defaults={{
              name: '',
              startDate: today,
              endDate: today,
              priceCents: me?.default_price_cents ?? 5000,
              retentionDays: settings?.default_retention_days ?? 30,
            }}
            maxRetentionDays={settings?.max_retention_days ?? 90}
          />
        </ActionForm>
      </Card>
    </div>
  )
}
```

`src/app/fotografo/eventos/[id]/event-tabs.tsx`:
```tsx
import Link from 'next/link'

const TABS = [
  ['pulseiras', 'Pulseiras'],
  ['fotos', 'Fotos e vídeos'],
  ['config', 'Configurações'],
] as const

export function EventTabs({ eventId, active }: { eventId: string; active: string }) {
  return (
    <nav className="flex gap-2 border-b text-sm">
      {TABS.map(([key, label]) => (
        <Link
          key={key}
          href={`/fotografo/eventos/${eventId}?aba=${key}`}
          className={`-mb-px border-b-2 px-3 py-2 ${active === key ? 'border-pink-600 font-medium' : 'border-transparent text-gray-600'}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
```

`src/app/fotografo/eventos/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { ActionForm } from '@/components/action-form'
import { Card, PageTitle } from '@/components/ui'
import { requirePhotographer } from '@/lib/auth/guards'
import { formatDate, todayInSaoPaulo } from '@/lib/domain/dates'
import { expiryWarning, isEventAvailable } from '@/lib/domain/events'
import { formatBRL } from '@/lib/domain/money'
import { createClient } from '@/lib/supabase/server'
import { updateEvent } from '../actions'
import { EventFormFields } from '../event-form-fields'
import { EventTabs } from './event-tabs'

export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ aba?: string }>
}) {
  const { id } = await params
  const { aba = 'pulseiras' } = await searchParams
  await requirePhotographer()
  const supabase = await createClient()
  const [{ data: event }, { data: settings }] = await Promise.all([
    supabase.from('events').select('*').eq('id', id).maybeSingle(),
    supabase.from('settings').select('max_retention_days').eq('id', 1).single(),
  ])
  if (!event) notFound()
  const today = todayInSaoPaulo()
  const warning = expiryWarning(event, today)

  return (
    <div className="space-y-4">
      <div>
        <PageTitle>{event.name}</PageTitle>
        <p className="text-sm text-gray-600">
          {formatDate(event.start_date)} a {formatDate(event.end_date)} · {formatBRL(event.price_cents)} ·{' '}
          {isEventAvailable(event, today) ? `fotos disponíveis até ${formatDate(event.expires_at)}` : 'encerrado'}
        </p>
      </div>
      {warning ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{warning}</p> : null}
      <EventTabs eventId={id} active={aba} />
      {aba === 'config' ? (
        <Card>
          <ActionForm action={updateEvent.bind(null, id)} submitLabel="Salvar">
            <EventFormFields
              defaults={{
                name: event.name,
                startDate: event.start_date,
                endDate: event.end_date,
                priceCents: event.price_cents,
                retentionDays: event.retention_days,
              }}
              maxRetentionDays={settings?.max_retention_days ?? 90}
            />
          </ActionForm>
        </Card>
      ) : null}
    </div>
  )
}
```

`src/app/fotografo/perfil/actions.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/action-state'
import { requirePhotographer } from '@/lib/auth/guards'
import { errorMessage } from '@/lib/errors'
import { uploadPhotographerPhoto } from '@/lib/photographers/photo'
import { createClient } from '@/lib/supabase/server'
import { parseForm, profileSchema } from '@/lib/validation'

export async function updateProfile(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { photographerId } = await requirePhotographer()
  const parsed = parseForm(profileSchema, Object.fromEntries(formData))
  if (!parsed.ok) return { error: parsed.error }
  const patch: Record<string, unknown> = { ...parsed.data }
  const photo = formData.get('photo')
  if (photo instanceof File && photo.size > 0) {
    try {
      patch.photo_path = await uploadPhotographerPhoto(photographerId, photo)
    } catch (e) {
      return { error: (e as Error).message }
    }
  }
  const supabase = await createClient()
  const { error } = await supabase.from('photographers').update(patch).eq('id', photographerId)
  if (error) return { error: errorMessage(error) }
  revalidatePath('/fotografo/perfil')
  return { error: null, ok: true }
}
```

`src/app/fotografo/perfil/page.tsx`:
```tsx
import { ActionForm } from '@/components/action-form'
import { Card, Field, Input, PageTitle } from '@/components/ui'
import { requirePhotographer } from '@/lib/auth/guards'
import { describeCommission } from '@/lib/domain/commission'
import { centsToInput } from '@/lib/domain/money'
import { photographerPhotoUrl } from '@/lib/photographers/photo'
import { createClient } from '@/lib/supabase/server'
import { updateProfile } from './actions'

export default async function ProfilePage() {
  const { photographerId } = await requirePhotographer()
  const supabase = await createClient()
  const { data: me } = await supabase.from('photographers').select('*').eq('id', photographerId).single()
  const photoUrl = photographerPhotoUrl(me.photo_path)

  return (
    <div className="space-y-4">
      <PageTitle>Meu perfil</PageTitle>
      <Card>
        <ActionForm action={updateProfile} submitLabel="Salvar perfil">
          {photoUrl ? <img src={photoUrl} alt="" className="h-20 w-20 rounded-full object-cover" /> : null}
          <Field label="Foto" hint="Aparece para as clientes na lista de eventos.">
            <Input name="photo" type="file" accept="image/*" />
          </Field>
          <Field label="Nome">
            <Input name="name" defaultValue={me.name} required />
          </Field>
          <Field label="WhatsApp">
            <Input name="whatsapp" type="tel" defaultValue={me.whatsapp} required />
          </Field>
          <Field label="Preço padrão do pacote (R$)">
            <Input name="price" inputMode="decimal" defaultValue={centsToInput(me.default_price_cents)} required />
          </Field>
        </ActionForm>
        <p className="mt-4 text-sm text-gray-600">
          Comissão da plataforma: {describeCommission(me.commission_type, me.commission_value)} por venda (definida pelo
          administrador).
        </p>
      </Card>
    </div>
  )
}
```

- [ ] **Step 6: Verify**

Run: `npx vitest run --project unit && npm run typecheck && npm run lint && npm run build`
Expected: all succeed.

- [ ] **Step 7: Commit**

```bash
git add src tests/unit/domain/events.test.ts
git commit -m "feat: add photographer area with profile, event creation and event page"
```

---

### Task 10: Wristbands tab (search, register, deliver, confirm, undo)

**Files:**
- Create: `src/lib/domain/registrations.ts`, `src/lib/legal.ts`
- Create: `src/app/fotografo/eventos/[id]/pulseiras/actions.ts`, `wristband-panel.tsx`, `registration-list.tsx`, `wristbands-tab.tsx`
- Modify: `src/app/fotografo/eventos/[id]/page.tsx` (render the tab)
- Test: `tests/unit/domain/registrations.test.ts`

**Interfaces:**
- Consumes:
  - SQL functions `find_or_create_client`, `deliver_wristband`, `confirm_manual_payment`, `undo_manual_payment` (Task 5).
  - From Task 8: `clientSchema`.
  - From Task 2: `maskPhone`, `normalizePhone`.
  - From Task 9: `isEventAvailable`.
- Produces:
  - **Types:** `RegistrationStatus`, `PaymentMethod`, `RegistrationSummaryRow`.
  - **Helpers:** `summarizeRegistrations(rows): { delivered: number; paid: number; totalPaidCents: number }`, `canPhotographerUndo(row): boolean`, `statusLabel(row): string`.
  - **Legal:** `WRISTBAND_TERMS_LABEL`.
  - **Server actions:** `searchClients(query)`, `deliverToClient(eventId, clientId, termsAccepted)`, `registerAndDeliver(eventId, prev, formData)`, `confirmPayment(eventId, registrationId)`, `undoPayment(eventId, registrationId)`. `confirmPayment` and `undoPayment` accept any staff session, because the SQL function enforces per-role rules; Task 18 reuses them on the admin event page.
  - **Component:** `RegistrationList({ eventId, items: RegistrationItem[] })`.

- [ ] **Step 1: Write the failing test**

`tests/unit/domain/registrations.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { canPhotographerUndo, statusLabel, summarizeRegistrations } from '@/lib/domain/registrations'

const base = { price_cents: 5000, first_access_at: null, settlement_id: null }

describe('summarizeRegistrations', () => {
  it('counts wristbands, paid and total sold', () => {
    expect(
      summarizeRegistrations([
        { ...base, status: 'wristband', payment_method: null },
        { ...base, status: 'paid', payment_method: 'manual' },
        { ...base, status: 'paid', payment_method: 'pix', price_cents: 6000 },
      ]),
    ).toEqual({ delivered: 3, paid: 2, totalPaidCents: 11000 })
  })
})

describe('canPhotographerUndo', () => {
  it('allows only manual payments not yet accessed nor settled', () => {
    expect(canPhotographerUndo({ ...base, status: 'paid', payment_method: 'manual' })).toBe(true)
    expect(canPhotographerUndo({ ...base, status: 'paid', payment_method: 'manual', first_access_at: '2026-10-13T10:00:00Z' })).toBe(false)
    expect(canPhotographerUndo({ ...base, status: 'paid', payment_method: 'manual', settlement_id: 's1' })).toBe(false)
    expect(canPhotographerUndo({ ...base, status: 'paid', payment_method: 'pix' })).toBe(false)
    expect(canPhotographerUndo({ ...base, status: 'wristband', payment_method: null })).toBe(false)
  })
})

describe('statusLabel', () => {
  it('labels each status', () => {
    expect(statusLabel({ status: 'wristband', payment_method: null })).toBe('Pulseira entregue')
    expect(statusLabel({ status: 'paid', payment_method: 'manual' })).toBe('Pago (manual)')
    expect(statusLabel({ status: 'paid', payment_method: 'pix' })).toBe('Pago (PIX)')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project unit tests/unit/domain/registrations.test.ts`
Expected: FAIL. The module is not found.

- [ ] **Step 3: Implement the domain module and the terms label**

`src/lib/domain/registrations.ts`:
```ts
export type RegistrationStatus = 'wristband' | 'paid'
export type PaymentMethod = 'manual' | 'pix'

export interface RegistrationSummaryRow {
  status: RegistrationStatus
  payment_method: PaymentMethod | null
  price_cents: number
  first_access_at: string | null
  settlement_id: string | null
}

export function summarizeRegistrations(rows: RegistrationSummaryRow[]) {
  const paid = rows.filter(r => r.status === 'paid')
  return {
    delivered: rows.length,
    paid: paid.length,
    totalPaidCents: paid.reduce((sum, r) => sum + r.price_cents, 0),
  }
}

export function canPhotographerUndo(row: RegistrationSummaryRow): boolean {
  return row.status === 'paid' && row.payment_method === 'manual' && row.first_access_at === null && row.settlement_id === null
}

export function statusLabel(row: { status: RegistrationStatus; payment_method: PaymentMethod | null }): string {
  if (row.status === 'wristband') return 'Pulseira entregue'
  return row.payment_method === 'pix' ? 'Pago (PIX)' : 'Pago (manual)'
}
```

`src/lib/legal.ts`:
```ts
export const WRISTBAND_TERMS_LABEL = 'Cliente aceitou os termos (fotos + reconhecimento facial)'
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --project unit tests/unit/domain/registrations.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the server actions and components**

`src/app/fotografo/eventos/[id]/pulseiras/actions.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/action-state'
import { requirePhotographer } from '@/lib/auth/guards'
import { getSessionProfile } from '@/lib/auth/session'
import { maskPhone, normalizePhone } from '@/lib/domain/phone'
import { errorMessage } from '@/lib/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { clientSchema, parseForm } from '@/lib/validation'

export interface ClientSearchResult {
  id: string
  fullName: string
  maskedPhone: string
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, c => `\\${c}`)
}

/** Searches the shared client registry. Runs with the service key because the
 * registry spans every photographer; only masked phones leave the server. */
export async function searchClients(query: string): Promise<ClientSearchResult[]> {
  await requirePhotographer()
  const q = query.trim()
  if (q.length < 2) return []
  const db = createAdminClient()
  let request = db.from('clients').select('id, full_name, phone_e164').order('full_name').limit(20)
  if (/^[\d\s()+-]+$/.test(q)) {
    const digits = q.replace(/\D/g, '')
    if (digits.length < 4) return []
    const phone = normalizePhone(q)
    request = phone ? request.eq('phone_e164', phone) : request.like('phone_e164', `%${digits}`)
  } else {
    request = request.ilike('full_name', `%${escapeLike(q)}%`)
  }
  const { data, error } = await request
  if (error) throw new Error(errorMessage(error))
  return (data ?? []).map(c => ({ id: c.id, fullName: c.full_name, maskedPhone: maskPhone(c.phone_e164) }))
}

function revalidateEvent(eventId: string) {
  revalidatePath(`/fotografo/eventos/${eventId}`)
  revalidatePath(`/admin/eventos/${eventId}`)
}

export async function deliverToClient(eventId: string, clientId: string, termsAccepted: boolean): Promise<ActionState> {
  await requirePhotographer()
  const supabase = await createClient()
  const { error } = await supabase.rpc('deliver_wristband', {
    p_event_id: eventId,
    p_client_id: clientId,
    p_terms_accepted: termsAccepted,
  })
  if (error) return { error: errorMessage(error) }
  revalidateEvent(eventId)
  return { error: null, ok: true }
}

export async function registerAndDeliver(eventId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePhotographer()
  if (formData.get('terms') !== 'on') return { error: errorMessage({ message: 'terms_required' }) }
  const parsed = parseForm(clientSchema, { fullName: formData.get('fullName'), phone: formData.get('phone') })
  if (!parsed.ok) return { error: parsed.error }
  const supabase = await createClient()
  const { data: clientId, error } = await supabase.rpc('find_or_create_client', {
    p_full_name: parsed.data.full_name,
    p_phone_e164: parsed.data.phone_e164,
  })
  if (error || !clientId) return { error: errorMessage(error) }
  return deliverToClient(eventId, clientId as string, true)
}

/** Used by the photographer and by the admin event page; the database function decides who may confirm. */
export async function confirmPayment(eventId: string, registrationId: string): Promise<ActionState> {
  if (!(await getSessionProfile())) return { error: 'Sessão expirada. Entre de novo.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('confirm_manual_payment', { p_registration_id: registrationId })
  if (error) return { error: errorMessage(error) }
  revalidateEvent(eventId)
  return { error: null, ok: true }
}

/** Used by the photographer and by the admin event page; the database function applies the undo rules per role. */
export async function undoPayment(eventId: string, registrationId: string): Promise<ActionState> {
  if (!(await getSessionProfile())) return { error: 'Sessão expirada. Entre de novo.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('undo_manual_payment', { p_registration_id: registrationId })
  if (error) return { error: errorMessage(error) }
  revalidateEvent(eventId)
  return { error: null, ok: true }
}
```

`src/app/fotografo/eventos/[id]/pulseiras/wristband-panel.tsx`:
```tsx
'use client'

import { useActionState, useEffect, useState, useTransition } from 'react'
import { SubmitButton } from '@/components/submit-button'
import { Button, Card, ErrorText, Field, Input } from '@/components/ui'
import { initialActionState } from '@/lib/action-state'
import { WRISTBAND_TERMS_LABEL } from '@/lib/legal'
import { deliverToClient, registerAndDeliver, searchClients, type ClientSearchResult } from './actions'

export function WristbandPanel({ eventId, canDeliver }: { eventId: string; canDeliver: boolean }) {
  const [terms, setTerms] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ClientSearchResult[]>([])
  const [searched, setSearched] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [formState, formAction] = useActionState(registerAndDeliver.bind(null, eventId), initialActionState)

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setSearched(false)
      return
    }
    const timer = setTimeout(() => {
      searchClients(q)
        .then(found => {
          setResults(found)
          setSearched(true)
        })
        .catch(() => setResults([]))
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (formState.ok) {
      setShowNew(false)
      setQuery('')
      setSuccess('Pulseira entregue!')
    }
  }, [formState])

  function deliver(clientId: string) {
    setError(null)
    setSuccess(null)
    startTransition(async () => {
      const result = await deliverToClient(eventId, clientId, terms)
      if (result.error) {
        setError(result.error)
        return
      }
      setSuccess('Pulseira entregue!')
      setQuery('')
    })
  }

  if (!canDeliver) {
    return (
      <Card>
        <p className="text-sm text-gray-600">Este evento está encerrado: não é possível entregar novas pulseiras.</p>
      </Card>
    )
  }

  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">Entregar pulseira</h2>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} />
        {WRISTBAND_TERMS_LABEL}
      </label>
      <Field label="Buscar cliente (nome ou celular)">
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Ex.: Ana ou 71 99123-4567" />
      </Field>
      {results.length > 0 ? (
        <ul className="divide-y">
          {results.map(client => (
            <li key={client.id} className="flex items-center justify-between gap-2 py-2">
              <div>
                <p className="font-medium">{client.fullName}</p>
                <p className="text-xs text-gray-500">{client.maskedPhone}</p>
              </div>
              <Button type="button" onClick={() => deliver(client.id)} disabled={pending || !terms}>
                Entregar pulseira
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {searched && results.length === 0 ? <p className="text-sm text-gray-600">Nenhuma cliente encontrada.</p> : null}
      <ErrorText>{error}</ErrorText>
      {success ? <p className="text-sm text-green-700">{success}</p> : null}
      <Button type="button" variant="secondary" onClick={() => setShowNew(v => !v)}>
        Cadastrar nova cliente
      </Button>
      {showNew ? (
        <form action={formAction} className="space-y-3 border-t pt-3">
          <input type="hidden" name="terms" value={terms ? 'on' : ''} />
          <Field label="Nome completo">
            <Input name="fullName" required />
          </Field>
          <Field label="Celular">
            <Input name="phone" type="tel" required />
          </Field>
          <ErrorText>{formState.error}</ErrorText>
          <SubmitButton pendingText="Salvando…">Cadastrar e entregar pulseira</SubmitButton>
        </form>
      ) : null}
    </Card>
  )
}
```

`src/app/fotografo/eventos/[id]/pulseiras/registration-list.tsx`:
```tsx
'use client'

import { useState, useTransition } from 'react'
import { Button, Card, ErrorText } from '@/components/ui'
import type { ActionState } from '@/lib/action-state'
import { statusLabel, type PaymentMethod, type RegistrationStatus } from '@/lib/domain/registrations'
import { confirmPayment, undoPayment } from './actions'

export interface RegistrationItem {
  id: string
  fullName: string
  maskedPhone: string
  status: RegistrationStatus
  paymentMethod: PaymentMethod | null
  canUndo: boolean
}

const FILTERS = [
  ['all', 'Todas'],
  ['wristband', 'Pulseira entregue'],
  ['paid', 'Pagas'],
] as const

export function RegistrationList({ eventId, items }: { eventId: string; items: RegistrationItem[] }) {
  const [filter, setFilter] = useState<'all' | RegistrationStatus>('all')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const visible = items.filter(item => filter === 'all' || item.status === filter)

  function run(action: () => Promise<ActionState>) {
    startTransition(async () => {
      const result = await action()
      setError(result.error)
    })
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1 ${filter === key ? 'bg-pink-600 text-white' : 'bg-gray-100'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorText>{error}</ErrorText>
      <ul className="divide-y">
        {visible.map(item => (
          <li key={item.id} data-testid="registration-row" className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div>
              <p className="font-medium">{item.fullName}</p>
              <p className="text-xs text-gray-500">
                {item.maskedPhone} · {statusLabel({ status: item.status, payment_method: item.paymentMethod })}
              </p>
            </div>
            <div className="flex gap-2">
              {item.status === 'wristband' ? (
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Confirmar o pagamento de ${item.fullName}?`)) run(() => confirmPayment(eventId, item.id))
                  }}
                >
                  Confirmar pagamento
                </Button>
              ) : null}
              {item.canUndo ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    if (confirm('Desfazer a confirmação de pagamento?')) run(() => undoPayment(eventId, item.id))
                  }}
                >
                  Desfazer
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {visible.length === 0 ? <p className="text-sm text-gray-600">Nenhuma pulseira aqui.</p> : null}
    </Card>
  )
}
```

`src/app/fotografo/eventos/[id]/pulseiras/wristbands-tab.tsx`:
```tsx
import { Card } from '@/components/ui'
import { todayInSaoPaulo } from '@/lib/domain/dates'
import { isEventAvailable, type EventAvailability } from '@/lib/domain/events'
import { formatBRL } from '@/lib/domain/money'
import { maskPhone } from '@/lib/domain/phone'
import { canPhotographerUndo, summarizeRegistrations } from '@/lib/domain/registrations'
import { createClient } from '@/lib/supabase/server'
import { RegistrationList, type RegistrationItem } from './registration-list'
import { WristbandPanel } from './wristband-panel'

export async function WristbandsTab({ event }: { event: EventAvailability & { id: string } }) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('registrations')
    .select('id, status, payment_method, price_cents, first_access_at, settlement_id, clients(full_name, phone_e164)')
    .eq('event_id', event.id)
    .order('delivered_at', { ascending: false })
  const rows = data ?? []
  const summary = summarizeRegistrations(rows)
  const items: RegistrationItem[] = rows.map(r => ({
    id: r.id,
    fullName: r.clients.full_name,
    maskedPhone: maskPhone(r.clients.phone_e164),
    status: r.status,
    paymentMethod: r.payment_method,
    canUndo: canPhotographerUndo(r),
  }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <Card>
          <p className="text-2xl font-semibold">{summary.delivered}</p>
          <p className="text-xs text-gray-600">Pulseiras</p>
        </Card>
        <Card>
          <p className="text-2xl font-semibold">{summary.paid}</p>
          <p className="text-xs text-gray-600">Pagas</p>
        </Card>
        <Card>
          <p className="text-lg font-semibold">{formatBRL(summary.totalPaidCents)}</p>
          <p className="text-xs text-gray-600">Vendido</p>
        </Card>
      </div>
      <WristbandPanel eventId={event.id} canDeliver={isEventAvailable(event, todayInSaoPaulo())} />
      <RegistrationList eventId={event.id} items={items} />
    </div>
  )
}
```

In `src/app/fotografo/eventos/[id]/page.tsx`, add the import:
```tsx
import { WristbandsTab } from './pulseiras/wristbands-tab'
```
and render the tab right after `<EventTabs eventId={id} active={aba} />`:
```tsx
      {aba === 'pulseiras' ? <WristbandsTab event={event} /> : null}
```

- [ ] **Step 6: Verify**

Run: `npx vitest run --project unit && npm run typecheck && npm run lint && npm run build`
Expected: all succeed.

- [ ] **Step 7: Commit**

```bash
git add src tests/unit/domain/registrations.test.ts
git commit -m "feat: add wristband delivery, client registration and manual payment confirmation"
```

---

### Task 11: Face providers (Rekognition and deterministic fake)

**Files:**
- Create: `src/lib/faces/provider.ts`, `src/lib/faces/rekognition.ts`, `src/lib/faces/fake.ts`, `src/lib/faces/index.ts`
- Test: `tests/unit/faces/rekognition.test.ts`, `tests/unit/faces/fake.test.ts`, `tests/unit/faces/png.ts` (test helper)

**Interfaces:**
- Produces:

```ts
interface FaceMatch { faceId: string; externalImageId: string }
interface FaceProvider {
  ensureCollection(collectionId: string): Promise<void>
  indexFaces(collectionId: string, image: Uint8Array, externalImageId: string): Promise<string[]>
  countFaces(image: Uint8Array): Promise<number>
  searchFaces(collectionId: string, image: Uint8Array, threshold: number): Promise<FaceMatch[]>
  deleteFaces(collectionId: string, faceIds: string[]): Promise<void>
  deleteCollection(collectionId: string): Promise<void>
}
```

- Plus: `collectionIdFor(eventId): string` (returns `fotofacil-<eventId>`), `createRekognitionProvider(client?)`, `createFakeFaceProvider(store?)`, `getFaceProvider()` (server only; reads `FACE_PROVIDER`).

- [ ] **Step 1: Write the failing tests**

`tests/unit/faces/png.ts`:
```ts
/** Minimal PNG header (signature + IHDR) that image-size can measure. */
export function pngHeader(width: number, height: number): Uint8Array {
  const bytes = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0)
  bytes.writeUInt32BE(13, 8)
  bytes.write('IHDR', 12, 'ascii')
  bytes.writeUInt32BE(width, 16)
  bytes.writeUInt32BE(height, 20)
  return new Uint8Array(bytes)
}
```

`tests/unit/faces/rekognition.test.ts`:
```ts
import {
  CreateCollectionCommand,
  DeleteCollectionCommand,
  DeleteFacesCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
} from '@aws-sdk/client-rekognition'
import { describe, expect, it, vi } from 'vitest'
import { collectionIdFor } from '@/lib/faces/provider'
import { createRekognitionProvider } from '@/lib/faces/rekognition'

function awsError(name: string): Error {
  const error = new Error(name)
  error.name = name
  return error
}

function fakeClient(handler: (command: unknown) => unknown) {
  return { send: vi.fn(async (command: unknown) => handler(command)) }
}

describe('collectionIdFor', () => {
  it('builds a Rekognition-safe collection id', () => {
    expect(collectionIdFor('0b7e-11')).toBe('fotofacil-0b7e-11')
  })
})

describe('createRekognitionProvider', () => {
  it('treats an existing collection as success', async () => {
    const client = fakeClient(command => {
      if (command instanceof CreateCollectionCommand) throw awsError('ResourceAlreadyExistsException')
    })
    await expect(createRekognitionProvider(client).ensureCollection('c1')).resolves.toBeUndefined()
  })

  it('indexes faces with the media id as external id', async () => {
    const client = fakeClient(() => ({ FaceRecords: [{ Face: { FaceId: 'f1' } }, { Face: { FaceId: 'f2' } }] }))
    const ids = await createRekognitionProvider(client).indexFaces('c1', new Uint8Array([1, 2]), 'media-1')
    expect(ids).toEqual(['f1', 'f2'])
    const command = client.send.mock.calls[0][0] as IndexFacesCommand
    expect(command).toBeInstanceOf(IndexFacesCommand)
    expect(command.input).toMatchObject({ CollectionId: 'c1', ExternalImageId: 'media-1', MaxFaces: 100, QualityFilter: 'AUTO' })
  })

  it('counts only confident faces', async () => {
    const client = fakeClient(() => ({ FaceDetails: [{ Confidence: 99.5 }, { Confidence: 40 }] }))
    expect(await createRekognitionProvider(client).countFaces(new Uint8Array([1]))).toBe(1)
  })

  it('maps search matches and returns no matches when the image has no face', async () => {
    const client = fakeClient(() => ({ FaceMatches: [{ Face: { FaceId: 'f1', ExternalImageId: 'm1' } }] }))
    const provider = createRekognitionProvider(client)
    expect(await provider.searchFaces('c1', new Uint8Array([1]), 92)).toEqual([{ faceId: 'f1', externalImageId: 'm1' }])
    const command = client.send.mock.calls[0][0] as SearchFacesByImageCommand
    expect(command.input).toMatchObject({ CollectionId: 'c1', FaceMatchThreshold: 92, MaxFaces: 4096 })

    const noFace = fakeClient(() => {
      throw awsError('InvalidParameterException')
    })
    expect(await createRekognitionProvider(noFace).searchFaces('c1', new Uint8Array([1]), 90)).toEqual([])
  })

  it('deletes faces in chunks of 4096 and skips empty lists', async () => {
    const client = fakeClient(() => ({}))
    const provider = createRekognitionProvider(client)
    await provider.deleteFaces('c1', [])
    expect(client.send).not.toHaveBeenCalled()
    await provider.deleteFaces('c1', Array.from({ length: 5000 }, (_, i) => `f${i}`))
    const sizes = client.send.mock.calls.map(([command]) => (command as DeleteFacesCommand).input.FaceIds?.length)
    expect(sizes).toEqual([4096, 904])
  })

  it('treats a missing collection as already deleted', async () => {
    const client = fakeClient(command => {
      if (command instanceof DeleteCollectionCommand) throw awsError('ResourceNotFoundException')
    })
    await expect(createRekognitionProvider(client).deleteCollection('c1')).resolves.toBeUndefined()
  })
})
```

`tests/unit/faces/fake.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFakeFaceProvider } from '@/lib/faces/fake'
import { getFaceProvider } from '@/lib/faces'
import { pngHeader } from './png'

describe('createFakeFaceProvider', () => {
  it('detects 0 faces in tiny images, 2 in square images and 1 otherwise', async () => {
    const faces = createFakeFaceProvider(new Map())
    expect(await faces.countFaces(pngHeader(20, 20))).toBe(0)
    expect(await faces.countFaces(pngHeader(500, 500))).toBe(2)
    expect(await faces.countFaces(pngHeader(640, 480))).toBe(1)
    expect(await faces.countFaces(new Uint8Array([1, 2, 3]))).toBe(0)
  })

  it('matches images with the same size inside the same collection only', async () => {
    const faces = createFakeFaceProvider(new Map())
    await faces.indexFaces('c1', pngHeader(640, 480), 'm1')
    await faces.indexFaces('c1', pngHeader(800, 600), 'm2')
    await faces.indexFaces('c2', pngHeader(640, 480), 'm3')
    const matches = await faces.searchFaces('c1', pngHeader(640, 480), 90)
    expect(matches.map(m => m.externalImageId)).toEqual(['m1'])
  })

  it('deletes faces and collections', async () => {
    const faces = createFakeFaceProvider(new Map())
    const [faceId] = await faces.indexFaces('c1', pngHeader(640, 480), 'm1')
    await faces.indexFaces('c1', pngHeader(640, 480), 'm2')
    await faces.deleteFaces('c1', [faceId])
    expect((await faces.searchFaces('c1', pngHeader(640, 480), 90)).map(m => m.externalImageId)).toEqual(['m2'])
    await faces.deleteCollection('c1')
    expect(await faces.searchFaces('c1', pngHeader(640, 480), 90)).toEqual([])
  })
})

describe('getFaceProvider', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('requires an explicit provider', () => {
    vi.stubEnv('FACE_PROVIDER', 'nope')
    expect(() => getFaceProvider()).toThrow('FACE_PROVIDER')
    vi.stubEnv('FACE_PROVIDER', 'fake')
    expect(typeof getFaceProvider().searchFaces).toBe('function')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/faces`
Expected: FAIL. The modules are not found.

- [ ] **Step 3: Implement the providers**

`src/lib/faces/provider.ts`:
```ts
export interface FaceMatch {
  faceId: string
  externalImageId: string
}

export interface FaceProvider {
  ensureCollection(collectionId: string): Promise<void>
  /** Indexes every face in the image and returns the new face ids. */
  indexFaces(collectionId: string, image: Uint8Array, externalImageId: string): Promise<string[]>
  /** Number of clearly visible faces in the image. */
  countFaces(image: Uint8Array): Promise<number>
  searchFaces(collectionId: string, image: Uint8Array, threshold: number): Promise<FaceMatch[]>
  deleteFaces(collectionId: string, faceIds: string[]): Promise<void>
  deleteCollection(collectionId: string): Promise<void>
}

export function collectionIdFor(eventId: string): string {
  return `fotofacil-${eventId}`
}
```

`src/lib/faces/rekognition.ts`:
```ts
import {
  CreateCollectionCommand,
  DeleteCollectionCommand,
  DeleteFacesCommand,
  DetectFacesCommand,
  IndexFacesCommand,
  RekognitionClient,
  SearchFacesByImageCommand,
  type DetectFacesCommandOutput,
  type IndexFacesCommandOutput,
  type SearchFacesByImageCommandOutput,
} from '@aws-sdk/client-rekognition'
import type { FaceMatch, FaceProvider } from './provider'

export interface RekognitionSender {
  send(command: unknown): Promise<unknown>
}

const DELETE_CHUNK = 4096
const MIN_FACE_CONFIDENCE = 90

function errorName(error: unknown): string | undefined {
  return (error as { name?: string } | null)?.name
}

export function createRekognitionProvider(
  client: RekognitionSender = new RekognitionClient({ region: process.env.AWS_REGION ?? 'us-east-1' }),
): FaceProvider {
  return {
    async ensureCollection(collectionId) {
      try {
        await client.send(new CreateCollectionCommand({ CollectionId: collectionId }))
      } catch (error) {
        if (errorName(error) !== 'ResourceAlreadyExistsException') throw error
      }
    },

    async indexFaces(collectionId, image, externalImageId) {
      const out = (await client.send(
        new IndexFacesCommand({
          CollectionId: collectionId,
          Image: { Bytes: image },
          ExternalImageId: externalImageId,
          MaxFaces: 100,
          QualityFilter: 'AUTO',
          DetectionAttributes: [],
        }),
      )) as IndexFacesCommandOutput
      return (out.FaceRecords ?? []).map(r => r.Face?.FaceId).filter((id): id is string => Boolean(id))
    },

    async countFaces(image) {
      const out = (await client.send(new DetectFacesCommand({ Image: { Bytes: image } }))) as DetectFacesCommandOutput
      return (out.FaceDetails ?? []).filter(face => (face.Confidence ?? 0) >= MIN_FACE_CONFIDENCE).length
    },

    async searchFaces(collectionId, image, threshold) {
      try {
        const out = (await client.send(
          new SearchFacesByImageCommand({
            CollectionId: collectionId,
            Image: { Bytes: image },
            FaceMatchThreshold: threshold,
            MaxFaces: 4096,
          }),
        )) as SearchFacesByImageCommandOutput
        return (out.FaceMatches ?? []).flatMap((match): FaceMatch[] =>
          match.Face?.FaceId && match.Face.ExternalImageId
            ? [{ faceId: match.Face.FaceId, externalImageId: match.Face.ExternalImageId }]
            : [],
        )
      } catch (error) {
        if (errorName(error) === 'InvalidParameterException') return []
        throw error
      }
    },

    async deleteFaces(collectionId, faceIds) {
      for (let i = 0; i < faceIds.length; i += DELETE_CHUNK) {
        await client.send(new DeleteFacesCommand({ CollectionId: collectionId, FaceIds: faceIds.slice(i, i + DELETE_CHUNK) }))
      }
    },

    async deleteCollection(collectionId) {
      try {
        await client.send(new DeleteCollectionCommand({ CollectionId: collectionId }))
      } catch (error) {
        if (errorName(error) !== 'ResourceNotFoundException') throw error
      }
    },
  }
}
```

`src/lib/faces/fake.ts`:
```ts
import { randomUUID } from 'node:crypto'
import { imageSize } from 'image-size'
import type { FaceProvider } from './provider'

/**
 * Deterministic stand-in for Rekognition, used in development and E2E tests.
 * A "person" is identified by the image's pixel size: two images with the same
 * width×height are the same person. Images under 50px have no face and square
 * images contain two faces.
 */
export type FakeFaceStore = Map<string, Array<{ faceId: string; person: string; externalImageId: string }>>

const holder = globalThis as unknown as { __fotofacilFakeFaces?: FakeFaceStore }

function sharedStore(): FakeFaceStore {
  holder.__fotofacilFakeFaces ??= new Map()
  return holder.__fotofacilFakeFaces
}

function measure(image: Uint8Array): { width: number; height: number } | null {
  try {
    const { width, height } = imageSize(image)
    return width && height ? { width, height } : null
  } catch {
    return null
  }
}

function hasFace(size: { width: number; height: number } | null): size is { width: number; height: number } {
  return size !== null && size.width >= 50 && size.height >= 50
}

export function createFakeFaceProvider(store: FakeFaceStore = sharedStore()): FaceProvider {
  const collection = (id: string) => {
    let faces = store.get(id)
    if (!faces) {
      faces = []
      store.set(id, faces)
    }
    return faces
  }

  return {
    async ensureCollection(collectionId) {
      collection(collectionId)
    },
    async indexFaces(collectionId, image, externalImageId) {
      const size = measure(image)
      if (!hasFace(size)) return []
      const faceId = randomUUID()
      collection(collectionId).push({ faceId, person: `${size.width}x${size.height}`, externalImageId })
      return [faceId]
    },
    async countFaces(image) {
      const size = measure(image)
      if (!hasFace(size)) return 0
      return size.width === size.height ? 2 : 1
    },
    async searchFaces(collectionId, image) {
      const size = measure(image)
      if (!hasFace(size)) return []
      const person = `${size.width}x${size.height}`
      return collection(collectionId)
        .filter(face => face.person === person)
        .map(face => ({ faceId: face.faceId, externalImageId: face.externalImageId }))
    },
    async deleteFaces(collectionId, faceIds) {
      const doomed = new Set(faceIds)
      store.set(collectionId, collection(collectionId).filter(face => !doomed.has(face.faceId)))
    },
    async deleteCollection(collectionId) {
      store.delete(collectionId)
    },
  }
}
```

`src/lib/faces/index.ts`:
```ts
import 'server-only'
import { createFakeFaceProvider } from './fake'
import type { FaceProvider } from './provider'
import { createRekognitionProvider } from './rekognition'

export function getFaceProvider(): FaceProvider {
  switch (process.env.FACE_PROVIDER) {
    case 'rekognition':
      return createRekognitionProvider()
    case 'fake':
      return createFakeFaceProvider()
    default:
      throw new Error('FACE_PROVIDER must be "rekognition" or "fake"')
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/unit/faces`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/faces tests/unit/faces
git commit -m "feat: add Rekognition and fake face providers"
```

---

### Task 12: Media indexing pipeline (server side)

**Files:**
- Create: `src/lib/async.ts`, `src/lib/cron.ts`, `src/lib/media/paths.ts`, `src/lib/media/processing.ts`, `src/lib/media/processing-repo.ts`
- Create: `src/app/api/media/[id]/process/route.ts`, `src/app/api/cron/retry-media/route.ts`
- Test: `tests/unit/async.test.ts`, `tests/unit/cron.test.ts`, `tests/unit/media/paths.test.ts`, `tests/unit/media/processing.test.ts`

**Interfaces:**
- Consumes: `FaceProvider` and `collectionIdFor` (Task 11), `createAdminClient` and `createClient` (Task 7).
- Produces:
  - **Async helpers:** `mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>` and `withRetry<T>(fn, attempts = 3, baseDelayMs = 1000): Promise<T>`.
  - **Cron auth:** `isCronAuthorized(authHeader: string | null, secret: string | undefined): boolean`.
  - **Storage paths:** `MEDIA_BUCKET = 'media'`, `mediaPaths(eventId, mediaId, type, ext): { full: string; thumb: string }`, `framePath(eventId, mediaId, index)`, `framePaths(eventId, mediaId, count)`.
  - **Processing (`media/processing.ts`):** `MediaStatus`, `MAX_ATTEMPTS = 3`, `ProcessingMedia`, `MediaProcessingRepo`, `processMedia(mediaId, deps): Promise<'ready' | 'error' | 'skipped'>`, `retryStuckMedia(now, deps, limit?)`, `ensureEventCollection(eventId, deps)`.
  - **Supabase repo (`media/processing-repo.ts`):** `createSupabaseProcessingRepo(db)` and `removeMediaObjects(db, paths)`.
  - **Routes:**
    - `POST /api/media/:id/process` (photographer or admin session) → `{ result }`
    - `POST /api/cron/retry-media` (`Authorization: Bearer CRON_SECRET`) → `{ retried }`

- [ ] **Step 1: Write the failing tests**

`tests/unit/async.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { mapLimit, withRetry } from '@/lib/async'

describe('mapLimit', () => {
  it('keeps order and never exceeds the concurrency limit', async () => {
    let running = 0
    let peak = 0
    const out = await mapLimit([30, 10, 20, 5], 2, async ms => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise(resolve => setTimeout(resolve, ms))
      running -= 1
      return ms * 2
    })
    expect(out).toEqual([60, 20, 40, 10])
    expect(peak).toBe(2)
  })

  it('handles an empty list', async () => {
    expect(await mapLimit([], 3, async (x: number) => x)).toEqual([])
  })
})

describe('withRetry', () => {
  it('retries until it succeeds', async () => {
    let calls = 0
    const result = await withRetry(
      async () => {
        calls += 1
        if (calls < 3) throw new Error('flaky')
        return 'ok'
      },
      3,
      0,
    )
    expect(result).toBe('ok')
    expect(calls).toBe(3)
  })

  it('throws the last error after the last attempt', async () => {
    await expect(withRetry(async () => Promise.reject(new Error('nope')), 2, 0)).rejects.toThrow('nope')
  })
})
```

`tests/unit/cron.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isCronAuthorized } from '@/lib/cron'

describe('isCronAuthorized', () => {
  const secret = 'abcdefghijklmnop'

  it('accepts the bearer secret', () => {
    expect(isCronAuthorized(`Bearer ${secret}`, secret)).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isCronAuthorized('Bearer wrong', secret)).toBe(false)
    expect(isCronAuthorized(null, secret)).toBe(false)
    expect(isCronAuthorized('Bearer short', 'short')).toBe(false)
    expect(isCronAuthorized('Bearer x', undefined)).toBe(false)
  })
})
```

`tests/unit/media/paths.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { framePath, framePaths, mediaPaths } from '@/lib/media/paths'

describe('media paths', () => {
  it('builds photo and video paths', () => {
    expect(mediaPaths('e1', 'm1', 'photo', 'jpg')).toEqual({ full: 'events/e1/m1/full.jpg', thumb: 'events/e1/m1/thumb.jpg' })
    expect(mediaPaths('e1', 'm1', 'video', 'mov')).toEqual({ full: 'events/e1/m1/video.mov', thumb: 'events/e1/m1/poster.jpg' })
  })

  it('numbers frames from 1 with 4 digits', () => {
    expect(framePath('e1', 'm1', 7)).toBe('events/e1/m1/frames/0007.jpg')
    expect(framePaths('e1', 'm1', 2)).toEqual(['events/e1/m1/frames/0001.jpg', 'events/e1/m1/frames/0002.jpg'])
  })
})
```

`tests/unit/media/processing.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import type { FaceProvider } from '@/lib/faces/provider'
import {
  processMedia,
  retryStuckMedia,
  type MediaProcessingRepo,
  type MediaStatus,
  type ProcessingMedia,
} from '@/lib/media/processing'

class FakeRepo implements MediaProcessingRepo {
  media = new Map<string, ProcessingMedia>()
  collections = new Map<string, string>()
  objects = new Map<string, Uint8Array>()
  faces: Array<{ mediaId: string; faceId: string }> = []
  removed: string[] = []
  statuses: Array<{ id: string; status: MediaStatus; attempts: number; error_msg: string | null }> = []

  async getMedia(id: string) {
    return this.media.get(id) ?? null
  }
  async getEventCollection(eventId: string) {
    return this.collections.get(eventId) ?? null
  }
  async setEventCollection(eventId: string, collectionId: string) {
    this.collections.set(eventId, collectionId)
  }
  async download(path: string) {
    const bytes = this.objects.get(path)
    if (!bytes) throw new Error(`missing ${path}`)
    return bytes
  }
  async removeObjects(paths: string[]) {
    this.removed.push(...paths)
  }
  async saveFaces(mediaId: string, _eventId: string, faceIds: string[]) {
    for (const faceId of faceIds) this.faces.push({ mediaId, faceId })
  }
  async markStatus(id: string, patch: { status: MediaStatus; attempts: number; error_msg: string | null }) {
    this.statuses.push({ id, ...patch })
    const current = this.media.get(id)
    if (current) this.media.set(id, { ...current, status: patch.status, attempts: patch.attempts })
  }
  async listRetryable() {
    return [...this.media.values()].filter(m => m.status !== 'ready').map(m => m.id)
  }
}

function fakeFaces() {
  let n = 0
  return {
    ensureCollection: vi.fn(async () => {}),
    indexFaces: vi.fn(async () => [`face-${++n}`]),
    countFaces: vi.fn(async () => 1),
    searchFaces: vi.fn(async () => []),
    deleteFaces: vi.fn(async () => {}),
    deleteCollection: vi.fn(async () => {}),
  } satisfies FaceProvider
}

function photo(overrides: Partial<ProcessingMedia> = {}): ProcessingMedia {
  return {
    id: 'm1',
    event_id: 'e1',
    type: 'photo',
    storage_path: 'events/e1/m1/full.jpg',
    frame_count: 0,
    face_indexing: 'enabled',
    status: 'uploading',
    attempts: 0,
    deleted: false,
    ...overrides,
  }
}

describe('processMedia', () => {
  it('creates the event collection once, indexes the photo and marks it ready', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    repo.media.set('m1', photo())
    repo.objects.set('events/e1/m1/full.jpg', new Uint8Array([1]))
    expect(await processMedia('m1', { repo, faces })).toBe('ready')
    expect(faces.ensureCollection).toHaveBeenCalledWith('fotofacil-e1')
    expect(faces.indexFaces).toHaveBeenCalledWith('fotofacil-e1', new Uint8Array([1]), 'm1')
    expect(repo.collections.get('e1')).toBe('fotofacil-e1')
    expect(repo.faces).toEqual([{ mediaId: 'm1', faceId: 'face-1' }])
    expect(repo.statuses.at(-1)).toEqual({ id: 'm1', status: 'ready', attempts: 1, error_msg: null })
  })

  it('reuses an existing collection', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    repo.collections.set('e1', 'fotofacil-e1')
    repo.media.set('m1', photo())
    repo.objects.set('events/e1/m1/full.jpg', new Uint8Array([1]))
    await processMedia('m1', { repo, faces })
    expect(faces.ensureCollection).not.toHaveBeenCalled()
  })

  it('indexes every video frame and removes the frames afterwards', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    repo.media.set('v1', photo({ id: 'v1', type: 'video', storage_path: 'events/e1/v1/video.mp4', frame_count: 2 }))
    repo.objects.set('events/e1/v1/frames/0001.jpg', new Uint8Array([1]))
    repo.objects.set('events/e1/v1/frames/0002.jpg', new Uint8Array([2]))
    expect(await processMedia('v1', { repo, faces })).toBe('ready')
    expect(repo.faces.map(f => f.faceId)).toEqual(['face-1', 'face-2'])
    expect(repo.removed).toEqual(['events/e1/v1/frames/0001.jpg', 'events/e1/v1/frames/0002.jpg'])
  })

  it('marks an undecodable video ready without indexing', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    repo.media.set('v1', photo({ id: 'v1', type: 'video', face_indexing: 'unsupported', frame_count: 0 }))
    expect(await processMedia('v1', { repo, faces })).toBe('ready')
    expect(faces.indexFaces).not.toHaveBeenCalled()
  })

  it('records the error and the attempt when indexing fails', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    faces.indexFaces.mockRejectedValueOnce(new Error('aws down'))
    repo.media.set('m1', photo({ attempts: 1, status: 'error' }))
    repo.objects.set('events/e1/m1/full.jpg', new Uint8Array([1]))
    expect(await processMedia('m1', { repo, faces })).toBe('error')
    expect(repo.statuses.at(-1)).toEqual({ id: 'm1', status: 'error', attempts: 2, error_msg: 'aws down' })
  })

  it('skips media that is ready or deleted', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    repo.media.set('m1', photo({ status: 'ready' }))
    repo.media.set('m2', photo({ id: 'm2', deleted: true }))
    expect(await processMedia('m1', { repo, faces })).toBe('skipped')
    expect(await processMedia('m2', { repo, faces })).toBe('skipped')
    expect(await processMedia('missing', { repo, faces })).toBe('skipped')
  })
})

describe('retryStuckMedia', () => {
  it('reprocesses what the repo reports as retryable', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    repo.media.set('m1', photo({ status: 'error', attempts: 1 }))
    repo.objects.set('events/e1/m1/full.jpg', new Uint8Array([1]))
    expect(await retryStuckMedia(new Date(), { repo, faces })).toBe(1)
    expect(repo.media.get('m1')?.status).toBe('ready')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/async.test.ts tests/unit/cron.test.ts tests/unit/media`
Expected: FAIL. The modules are not found.

- [ ] **Step 3: Implement the helpers and the processing service**

`src/lib/async.ts`:
```ts
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export async function withRetry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 1000): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (attempt < attempts - 1) await new Promise(resolve => setTimeout(resolve, baseDelayMs * 2 ** attempt))
    }
  }
  throw lastError
}
```

`src/lib/cron.ts`:
```ts
import { timingSafeEqual } from 'node:crypto'

export function isCronAuthorized(authHeader: string | null, secret: string | undefined): boolean {
  if (!secret || secret.length < 16 || !authHeader) return false
  const given = Buffer.from(authHeader)
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}
```

`src/lib/media/paths.ts`:
```ts
export const MEDIA_BUCKET = 'media'

export type MediaType = 'photo' | 'video'

export function mediaPaths(eventId: string, mediaId: string, type: MediaType, ext: string): { full: string; thumb: string } {
  const base = `events/${eventId}/${mediaId}`
  return type === 'photo'
    ? { full: `${base}/full.jpg`, thumb: `${base}/thumb.jpg` }
    : { full: `${base}/video.${ext}`, thumb: `${base}/poster.jpg` }
}

export function framePath(eventId: string, mediaId: string, index: number): string {
  return `events/${eventId}/${mediaId}/frames/${String(index).padStart(4, '0')}.jpg`
}

export function framePaths(eventId: string, mediaId: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => framePath(eventId, mediaId, i + 1))
}
```

`src/lib/media/processing.ts`:
```ts
import { mapLimit } from '@/lib/async'
import { collectionIdFor, type FaceProvider } from '@/lib/faces/provider'
import { framePaths, type MediaType } from './paths'

export type MediaStatus = 'uploading' | 'processing' | 'ready' | 'error'
export const MAX_ATTEMPTS = 3
export const RETRY_AFTER_MS = 10 * 60_000

export interface ProcessingMedia {
  id: string
  event_id: string
  type: MediaType
  storage_path: string
  frame_count: number
  face_indexing: 'enabled' | 'unsupported'
  status: MediaStatus
  attempts: number
  deleted: boolean
}

export interface MediaProcessingRepo {
  getMedia(id: string): Promise<ProcessingMedia | null>
  getEventCollection(eventId: string): Promise<string | null>
  setEventCollection(eventId: string, collectionId: string): Promise<void>
  download(path: string): Promise<Uint8Array>
  removeObjects(paths: string[]): Promise<void>
  saveFaces(mediaId: string, eventId: string, faceIds: string[]): Promise<void>
  markStatus(id: string, patch: { status: MediaStatus; attempts: number; error_msg: string | null }): Promise<void>
  listRetryable(createdBefore: string, maxAttempts: number, limit: number): Promise<string[]>
}

export interface ProcessingDeps {
  repo: MediaProcessingRepo
  faces: FaceProvider
}

export type ProcessResult = 'ready' | 'error' | 'skipped'

export async function ensureEventCollection(eventId: string, { repo, faces }: ProcessingDeps): Promise<string> {
  const existing = await repo.getEventCollection(eventId)
  if (existing) return existing
  const collectionId = collectionIdFor(eventId)
  await faces.ensureCollection(collectionId)
  await repo.setEventCollection(eventId, collectionId)
  return collectionId
}

export async function processMedia(mediaId: string, deps: ProcessingDeps): Promise<ProcessResult> {
  const { repo, faces } = deps
  const media = await repo.getMedia(mediaId)
  if (!media || media.deleted || media.status === 'ready') return 'skipped'
  const attempts = media.attempts + 1
  try {
    if (media.face_indexing === 'enabled') {
      const collectionId = await ensureEventCollection(media.event_id, deps)
      const sources =
        media.type === 'photo' ? [media.storage_path] : framePaths(media.event_id, media.id, media.frame_count)
      const faceIds = await mapLimit(sources, 6, async path => faces.indexFaces(collectionId, await repo.download(path), media.id))
      await repo.saveFaces(media.id, media.event_id, faceIds.flat())
      if (media.type === 'video' && sources.length > 0) await repo.removeObjects(sources)
    }
    await repo.markStatus(media.id, { status: 'ready', attempts, error_msg: null })
    return 'ready'
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'erro desconhecido'
    await repo.markStatus(media.id, { status: 'error', attempts, error_msg: message })
    return 'error'
  }
}

export async function retryStuckMedia(now: Date, deps: ProcessingDeps, limit = 10): Promise<number> {
  const createdBefore = new Date(now.getTime() - RETRY_AFTER_MS).toISOString()
  const ids = await deps.repo.listRetryable(createdBefore, MAX_ATTEMPTS, limit)
  for (const id of ids) await processMedia(id, deps)
  return ids.length
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/unit/async.test.ts tests/unit/cron.test.ts tests/unit/media`
Expected: PASS.

- [ ] **Step 5: Write the Supabase repo and the routes**

`src/lib/media/processing-repo.ts`:
```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MEDIA_BUCKET } from './paths'
import type { MediaProcessingRepo, ProcessingMedia } from './processing'

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export async function removeMediaObjects(db: SupabaseClient, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db.storage.from(MEDIA_BUCKET).remove(paths.slice(i, i + 100))
    check(error)
  }
}

export function createSupabaseProcessingRepo(db: SupabaseClient): MediaProcessingRepo {
  return {
    async getMedia(id) {
      const { data, error } = await db
        .from('media')
        .select('id, event_id, type, storage_path, frame_count, face_indexing, status, attempts, deleted_at')
        .eq('id', id)
        .maybeSingle()
      check(error)
      if (!data) return null
      const { deleted_at: deletedAt, ...rest } = data
      return { ...rest, deleted: deletedAt !== null } as ProcessingMedia
    },
    async getEventCollection(eventId) {
      const { data, error } = await db.from('events').select('rekognition_collection_id').eq('id', eventId).single()
      check(error)
      return data?.rekognition_collection_id ?? null
    },
    async setEventCollection(eventId, collectionId) {
      const { error } = await db.from('events').update({ rekognition_collection_id: collectionId }).eq('id', eventId)
      check(error)
    },
    async download(path) {
      const { data, error } = await db.storage.from(MEDIA_BUCKET).download(path)
      if (error || !data) throw new Error(`Arquivo não encontrado: ${path}`)
      return new Uint8Array(await data.arrayBuffer())
    },
    async removeObjects(paths) {
      await removeMediaObjects(db, paths)
    },
    async saveFaces(mediaId, eventId, faceIds) {
      if (faceIds.length === 0) return
      const { error } = await db
        .from('media_faces')
        .upsert(faceIds.map(faceId => ({ face_id: faceId, media_id: mediaId, event_id: eventId })))
      check(error)
    },
    async markStatus(id, patch) {
      const { error } = await db.from('media').update(patch).eq('id', id)
      check(error)
    },
    async listRetryable(createdBefore, maxAttempts, limit) {
      const { data, error } = await db
        .from('media')
        .select('id')
        .in('status', ['uploading', 'processing', 'error'])
        .lt('attempts', maxAttempts)
        .lt('created_at', createdBefore)
        .is('deleted_at', null)
        .order('created_at')
        .limit(limit)
      check(error)
      return (data ?? []).map(row => row.id as string)
    },
  }
}
```

`src/app/api/media/[id]/process/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { getFaceProvider } from '@/lib/faces'
import { processMedia } from '@/lib/media/processing'
import { createSupabaseProcessingRepo } from '@/lib/media/processing-repo'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  // RLS only returns media from events this user may access.
  const { data: media } = await supabase.from('media').select('id').eq('id', id).maybeSingle()
  if (!media) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const result = await processMedia(id, {
    repo: createSupabaseProcessingRepo(createAdminClient()),
    faces: getFaceProvider(),
  })
  return NextResponse.json({ result })
}
```

`src/app/api/cron/retry-media/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron'
import { getFaceProvider } from '@/lib/faces'
import { retryStuckMedia } from '@/lib/media/processing'
import { createSupabaseProcessingRepo } from '@/lib/media/processing-repo'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

export async function POST(request: Request) {
  if (!isCronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const retried = await retryStuckMedia(new Date(), {
    repo: createSupabaseProcessingRepo(createAdminClient()),
    faces: getFaceProvider(),
  })
  return NextResponse.json({ retried })
}
```

- [ ] **Step 6: Verify**

Run: `npx vitest run --project unit && npm run typecheck && npm run lint && npm run build`
Expected: all succeed.

- [ ] **Step 7: Commit**

```bash
git add src tests/unit
git commit -m "feat: add media face-indexing pipeline with retry endpoint"
```

---
### Task 13: Media deletion, event expiry and the cron jobs

**Files:**
- Create: `src/lib/media/deletion.ts`, `src/lib/media/deletion-repo.ts`
- Create: `src/app/api/cron/expire/route.ts`
- Create: `src/app/fotografo/eventos/[id]/fotos/delete-actions.ts`
- Create: `supabase/cron.sql`
- Test: `tests/unit/media/deletion.test.ts`

**Interfaces:**
- Consumes:
  - From Task 12: `framePaths`, `removeMediaObjects`, `isCronAuthorized`.
  - From Task 11: `FaceProvider`.
  - From Task 2: `todayInSaoPaulo`.
- Produces:
  - **Repo:** `MediaDeletionRepo` and `DeletableMedia`.
  - **Services:** `deleteMedia(ids: string[], deps): Promise<number>`, `expireEvent(eventId, deps): Promise<void>`, `expireEvents(today: string, deps): Promise<number>`.
  - **Supabase repo:** `createSupabaseDeletionRepo(db)`.
  - **Server actions:** `deleteSelectedMedia(eventId: string, mediaIds: string[]): Promise<ActionState>` and `closeEventAndDeleteMedia(eventId: string): Promise<ActionState>`.
  - **Route:** `POST /api/cron/expire` (`Authorization: Bearer CRON_SECRET`) → `{ expired }`.

- [ ] **Step 1: Write the failing test**

`tests/unit/media/deletion.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import type { FaceProvider } from '@/lib/faces/provider'
import { deleteMedia, expireEvents, type DeletableMedia, type MediaDeletionRepo } from '@/lib/media/deletion'

class FakeRepo implements MediaDeletionRepo {
  media = new Map<string, DeletableMedia>()
  faces: Array<{ face_id: string; media_id: string; event_id: string }> = []
  collections = new Map<string, string | null>()
  deleted = new Set<string>()
  removed: string[] = []
  expiredEvents: string[] = []
  activeEventsPastExpiry: string[] = []

  async getLiveMedia(ids: string[]) {
    return ids.flatMap(id => (this.media.has(id) && !this.deleted.has(id) ? [this.media.get(id)!] : []))
  }
  async listLiveMediaIds(eventId: string) {
    return [...this.media.values()].filter(m => m.event_id === eventId && !this.deleted.has(m.id)).map(m => m.id)
  }
  async getFaces(mediaIds: string[]) {
    return this.faces.filter(f => mediaIds.includes(f.media_id)).map(({ face_id, event_id }) => ({ face_id, event_id }))
  }
  async getEventCollection(eventId: string) {
    return this.collections.get(eventId) ?? null
  }
  async setEventCollection(eventId: string, collectionId: string | null) {
    this.collections.set(eventId, collectionId)
  }
  async removeObjects(paths: string[]) {
    this.removed.push(...paths)
  }
  async deleteFaceRows(mediaIds: string[]) {
    this.faces = this.faces.filter(f => !mediaIds.includes(f.media_id))
  }
  async markMediaDeleted(ids: string[]) {
    ids.forEach(id => this.deleted.add(id))
  }
  async listExpiredEventIds() {
    return this.activeEventsPastExpiry
  }
  async markEventExpired(eventId: string) {
    this.expiredEvents.push(eventId)
  }
}

function fakeFaces() {
  return {
    ensureCollection: vi.fn(async () => {}),
    indexFaces: vi.fn(async () => []),
    countFaces: vi.fn(async () => 1),
    searchFaces: vi.fn(async () => []),
    deleteFaces: vi.fn(async () => {}),
    deleteCollection: vi.fn(async () => {}),
  } satisfies FaceProvider
}

function seed(repo: FakeRepo) {
  repo.collections.set('e1', 'fotofacil-e1')
  repo.media.set('p1', { id: 'p1', event_id: 'e1', type: 'photo', storage_path: 'events/e1/p1/full.jpg', thumb_path: 'events/e1/p1/thumb.jpg', frame_count: 0 })
  repo.media.set('v1', { id: 'v1', event_id: 'e1', type: 'video', storage_path: 'events/e1/v1/video.mp4', thumb_path: 'events/e1/v1/poster.jpg', frame_count: 1 })
  repo.faces.push({ face_id: 'f1', media_id: 'p1', event_id: 'e1' }, { face_id: 'f2', media_id: 'v1', event_id: 'e1' })
}

describe('deleteMedia', () => {
  it('removes faces, files (including leftover frames) and marks media deleted', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    seed(repo)
    expect(await deleteMedia(['p1', 'v1', 'unknown'], { repo, faces })).toBe(2)
    expect(faces.deleteFaces).toHaveBeenCalledWith('fotofacil-e1', ['f1', 'f2'])
    expect(repo.removed).toEqual([
      'events/e1/p1/full.jpg',
      'events/e1/p1/thumb.jpg',
      'events/e1/v1/video.mp4',
      'events/e1/v1/poster.jpg',
      'events/e1/v1/frames/0001.jpg',
    ])
    expect([...repo.deleted]).toEqual(['p1', 'v1'])
    expect(repo.faces).toEqual([])
  })

  it('does nothing for an empty or already deleted selection', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    expect(await deleteMedia([], { repo, faces })).toBe(0)
    expect(faces.deleteFaces).not.toHaveBeenCalled()
  })
})

describe('expireEvents', () => {
  it('deletes files, drops the face collection and marks each expired event', async () => {
    const repo = new FakeRepo()
    const faces = fakeFaces()
    seed(repo)
    repo.activeEventsPastExpiry = ['e1']
    expect(await expireEvents('2026-10-13', { repo, faces })).toBe(1)
    expect(faces.deleteCollection).toHaveBeenCalledWith('fotofacil-e1')
    expect(faces.deleteFaces).not.toHaveBeenCalled()
    expect(repo.deleted.size).toBe(2)
    expect(repo.collections.get('e1')).toBeNull()
    expect(repo.expiredEvents).toEqual(['e1'])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project unit tests/unit/media/deletion.test.ts`
Expected: FAIL. The module is not found.

- [ ] **Step 3: Implement the service**

`src/lib/media/deletion.ts`:
```ts
import type { FaceProvider } from '@/lib/faces/provider'
import { framePaths, type MediaType } from './paths'

export interface DeletableMedia {
  id: string
  event_id: string
  type: MediaType
  storage_path: string
  thumb_path: string
  frame_count: number
}

export interface MediaDeletionRepo {
  getLiveMedia(ids: string[]): Promise<DeletableMedia[]>
  listLiveMediaIds(eventId: string): Promise<string[]>
  getFaces(mediaIds: string[]): Promise<Array<{ face_id: string; event_id: string }>>
  getEventCollection(eventId: string): Promise<string | null>
  setEventCollection(eventId: string, collectionId: string | null): Promise<void>
  removeObjects(paths: string[]): Promise<void>
  deleteFaceRows(mediaIds: string[]): Promise<void>
  markMediaDeleted(ids: string[]): Promise<void>
  listExpiredEventIds(today: string): Promise<string[]>
  markEventExpired(eventId: string): Promise<void>
}

export interface DeletionDeps {
  repo: MediaDeletionRepo
  faces: FaceProvider
}

const CHUNK = 200

function storagePaths(items: DeletableMedia[]): string[] {
  return items.flatMap(item => [
    item.storage_path,
    item.thumb_path,
    ...(item.type === 'video' ? framePaths(item.event_id, item.id, item.frame_count) : []),
  ])
}

export async function deleteMedia(ids: string[], { repo, faces }: DeletionDeps): Promise<number> {
  let deleted = 0
  for (let i = 0; i < ids.length; i += CHUNK) {
    const items = await repo.getLiveMedia(ids.slice(i, i + CHUNK))
    if (items.length === 0) continue
    const itemIds = items.map(item => item.id)
    const faceRows = await repo.getFaces(itemIds)
    const byEvent = new Map<string, string[]>()
    for (const row of faceRows) byEvent.set(row.event_id, [...(byEvent.get(row.event_id) ?? []), row.face_id])
    for (const [eventId, faceIds] of byEvent) {
      const collectionId = await repo.getEventCollection(eventId)
      if (collectionId) await faces.deleteFaces(collectionId, faceIds)
    }
    await repo.removeObjects(storagePaths(items))
    await repo.deleteFaceRows(itemIds)
    await repo.markMediaDeleted(itemIds)
    deleted += items.length
  }
  return deleted
}

export async function expireEvent(eventId: string, { repo, faces }: DeletionDeps): Promise<void> {
  const ids = await repo.listLiveMediaIds(eventId)
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const items = await repo.getLiveMedia(chunk)
    await repo.removeObjects(storagePaths(items))
    await repo.deleteFaceRows(chunk)
    await repo.markMediaDeleted(chunk)
  }
  const collectionId = await repo.getEventCollection(eventId)
  if (collectionId) await faces.deleteCollection(collectionId)
  await repo.setEventCollection(eventId, null)
  await repo.markEventExpired(eventId)
}

export async function expireEvents(today: string, deps: DeletionDeps): Promise<number> {
  const eventIds = await deps.repo.listExpiredEventIds(today)
  for (const eventId of eventIds) await expireEvent(eventId, deps)
  return eventIds.length
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --project unit tests/unit/media/deletion.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the Supabase repo, the actions, the route and the cron script**

`src/lib/media/deletion-repo.ts`:
```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DeletableMedia, MediaDeletionRepo } from './deletion'
import { removeMediaObjects } from './processing-repo'

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export function createSupabaseDeletionRepo(db: SupabaseClient): MediaDeletionRepo {
  return {
    async getLiveMedia(ids) {
      if (ids.length === 0) return []
      const { data, error } = await db
        .from('media')
        .select('id, event_id, type, storage_path, thumb_path, frame_count')
        .in('id', ids)
        .is('deleted_at', null)
      check(error)
      return (data ?? []) as DeletableMedia[]
    },
    async listLiveMediaIds(eventId) {
      const { data, error } = await db.from('media').select('id').eq('event_id', eventId).is('deleted_at', null)
      check(error)
      return (data ?? []).map(row => row.id as string)
    },
    async getFaces(mediaIds) {
      if (mediaIds.length === 0) return []
      const { data, error } = await db.from('media_faces').select('face_id, event_id').in('media_id', mediaIds)
      check(error)
      return data ?? []
    },
    async getEventCollection(eventId) {
      const { data, error } = await db.from('events').select('rekognition_collection_id').eq('id', eventId).single()
      check(error)
      return data?.rekognition_collection_id ?? null
    },
    async setEventCollection(eventId, collectionId) {
      const { error } = await db.from('events').update({ rekognition_collection_id: collectionId }).eq('id', eventId)
      check(error)
    },
    async removeObjects(paths) {
      await removeMediaObjects(db, paths)
    },
    async deleteFaceRows(mediaIds) {
      if (mediaIds.length === 0) return
      const { error } = await db.from('media_faces').delete().in('media_id', mediaIds)
      check(error)
    },
    async markMediaDeleted(ids) {
      if (ids.length === 0) return
      const { error } = await db.from('media').update({ deleted_at: new Date().toISOString() }).in('id', ids)
      check(error)
    },
    async listExpiredEventIds(today) {
      const { data, error } = await db.from('events').select('id').eq('status', 'active').lt('expires_at', today)
      check(error)
      return (data ?? []).map(row => row.id as string)
    },
    async markEventExpired(eventId) {
      const { error } = await db.from('events').update({ status: 'expired' }).eq('id', eventId)
      check(error)
    },
  }
}
```

`src/app/api/cron/expire/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { isCronAuthorized } from '@/lib/cron'
import { todayInSaoPaulo } from '@/lib/domain/dates'
import { getFaceProvider } from '@/lib/faces'
import { expireEvents } from '@/lib/media/deletion'
import { createSupabaseDeletionRepo } from '@/lib/media/deletion-repo'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 60

export async function POST(request: Request) {
  if (!isCronAuthorized(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const expired = await expireEvents(todayInSaoPaulo(), {
    repo: createSupabaseDeletionRepo(createAdminClient()),
    faces: getFaceProvider(),
  })
  return NextResponse.json({ expired })
}
```

`src/app/fotografo/eventos/[id]/fotos/delete-actions.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/action-state'
import { getSessionProfile } from '@/lib/auth/session'
import { getFaceProvider } from '@/lib/faces'
import { deleteMedia, expireEvent } from '@/lib/media/deletion'
import { createSupabaseDeletionRepo } from '@/lib/media/deletion-repo'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

function deps() {
  return { repo: createSupabaseDeletionRepo(createAdminClient()), faces: getFaceProvider() }
}

function revalidate(eventId: string) {
  revalidatePath(`/fotografo/eventos/${eventId}`)
  revalidatePath(`/admin/eventos/${eventId}`)
}

/** Photographer (own events) or admin (any event). Ownership is checked by reading through RLS. */
export async function deleteSelectedMedia(eventId: string, mediaIds: string[]): Promise<ActionState> {
  if (!(await getSessionProfile())) return { error: 'Sessão expirada. Entre de novo.' }
  const supabase = await createClient()
  const { data } = await supabase.from('media').select('id').eq('event_id', eventId).in('id', mediaIds)
  const allowed = (data ?? []).map(row => row.id as string)
  if (allowed.length === 0) return { error: 'Nada para excluir.' }
  await deleteMedia(allowed, deps())
  revalidate(eventId)
  return { error: null, ok: true }
}

export async function closeEventAndDeleteMedia(eventId: string): Promise<ActionState> {
  if (!(await getSessionProfile())) return { error: 'Sessão expirada. Entre de novo.' }
  const supabase = await createClient()
  const { data: event } = await supabase.from('events').select('id').eq('id', eventId).maybeSingle()
  if (!event) return { error: 'Evento não encontrado.' }
  await expireEvent(eventId, deps())
  revalidate(eventId)
  return { error: null, ok: true }
}
```

`supabase/cron.sql`:
```sql
-- Run once per environment in the Supabase SQL editor, after the site is deployed.
-- Replace https://fotofacil.example.com with the deployed site URL and
-- CRON_SECRET_VALUE with the value of the CRON_SECRET environment variable.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 03:00 in São Paulo (06:00 UTC): delete media of expired events.
select cron.schedule(
  'fotofacil-expire-events',
  '0 6 * * *',
  $$ select net.http_post(
       url := 'https://fotofacil.example.com/api/cron/expire',
       headers := '{"Authorization": "Bearer CRON_SECRET_VALUE", "Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb
     ) $$
);

-- Every 10 minutes: retry media whose face indexing failed or got stuck.
select cron.schedule(
  'fotofacil-retry-media',
  '*/10 * * * *',
  $$ select net.http_post(
       url := 'https://fotofacil.example.com/api/cron/retry-media',
       headers := '{"Authorization": "Bearer CRON_SECRET_VALUE", "Content-Type": "application/json"}'::jsonb,
       body := '{}'::jsonb
     ) $$
);
```

- [ ] **Step 6: Verify**

Run: `npx vitest run --project unit && npm run typecheck && npm run lint && npm run build`
Expected: all succeed.

- [ ] **Step 7: Commit**

```bash
git add src supabase/cron.sql tests/unit/media/deletion.test.ts
git commit -m "feat: add manual media deletion, event expiry job and cron schedule"
```

---

### Task 14: Browser upload pipeline and the "Fotos e vídeos" tab

**Files:**
- Create: `src/lib/domain/media-math.ts`, `src/lib/media/upload-request.ts`, `src/lib/media/signed-urls.ts`
- Create: `src/lib/upload/prepare-image.ts`, `src/lib/upload/prepare-video.ts`
- Create: `src/app/fotografo/eventos/[id]/fotos/actions.ts`, `media-uploader.tsx`, `media-grid.tsx`, `media-tab.tsx`
- Modify: `src/app/fotografo/eventos/[id]/page.tsx` (render the tab)
- Test: `tests/unit/domain/media-math.test.ts`, `tests/unit/media/upload-request.test.ts`

**Interfaces:**
- Consumes:
  - From Task 12: `mediaPaths`, `framePath`, `MEDIA_BUCKET`, `mapLimit`, `withRetry`.
  - From Task 13: `deleteSelectedMedia`, `closeEventAndDeleteMedia`.
  - From Task 9: `isEventAvailable`, `eventDays`.
  - From Task 2: `localDateOf`, `todayInSaoPaulo`, `formatDayMonth`.
- Produces:
  - **Media math:** `fitWithin(w, h, max): { width; height }`, `frameTimes(durationS, maxFrames = 120): number[]`, `takenOnFrom(exifDate: Date | null, now: Date): string`.
  - **Upload request:** `UploadRequest`, `isValidUploadRequest(req): boolean`, `videoExt(fileName): VideoExt`.
  - **Browser prep:**
    - `prepareImage(file, now?) → { full: Blob; thumb: Blob; width; height; takenOn }`
    - `drawToJpeg(source, size, quality): Promise<Blob>`
    - `resizeImageFile(file, maxSide): Promise<Blob>`
    - `prepareVideo(file, now?) → { poster; frames; width; height; durationS; takenOn; faceIndexing }`
    - `UnsupportedMediaError`
  - **Signed URLs:** `signMediaPaths(db, paths): Promise<Map<string, string>>` and `SIGNED_URL_SECONDS = 600`.
  - **Server actions:** `createUpload(eventId, req) → { ticket } | { error }` and `updateMediaDay(eventId, mediaId, day)`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/domain/media-math.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { fitWithin, frameTimes, takenOnFrom } from '@/lib/domain/media-math'

describe('fitWithin', () => {
  it('scales the longest side down to the limit keeping the ratio', () => {
    expect(fitWithin(6000, 4000, 3000)).toEqual({ width: 3000, height: 2000 })
    expect(fitWithin(4000, 6000, 400)).toEqual({ width: 267, height: 400 })
  })

  it('never upscales', () => {
    expect(fitWithin(640, 480, 3000)).toEqual({ width: 640, height: 480 })
  })
})

describe('frameTimes', () => {
  it('takes one frame per second for short videos', () => {
    expect(frameTimes(3.2)).toEqual([0.5, 1.5, 2.5, 3.1])
  })

  it('spreads at most 120 frames over long videos', () => {
    const times = frameTimes(300)
    expect(times).toHaveLength(120)
    expect(times[0]).toBe(0.5)
    expect(times[1]).toBe(3)
    expect(times.at(-1)).toBeLessThan(300)
  })

  it('returns a single frame for zero or unknown durations', () => {
    expect(frameTimes(0)).toEqual([0])
    expect(frameTimes(Number.NaN)).toEqual([0])
  })
})

describe('takenOnFrom', () => {
  const now = new Date(2026, 9, 13, 10, 0)

  it('uses the camera date when present', () => {
    expect(takenOnFrom(new Date(2026, 9, 12, 23, 30), now)).toBe('2026-10-12')
  })

  it('falls back to today when the photo has no usable EXIF date', () => {
    expect(takenOnFrom(null, now)).toBe('2026-10-13')
    expect(takenOnFrom(new Date(Number.NaN), now)).toBe('2026-10-13')
    expect(takenOnFrom(new Date(1980, 0, 1), now)).toBe('2026-10-13')
  })
})
```

`tests/unit/media/upload-request.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isValidUploadRequest, videoExt, type UploadRequest } from '@/lib/media/upload-request'

const photo: UploadRequest = {
  type: 'photo',
  originalName: 'IMG_0001.JPG',
  ext: 'jpg',
  takenOn: '2026-10-12',
  width: 3000,
  height: 2000,
  durationS: null,
  frameCount: 0,
  faceIndexing: 'enabled',
}

describe('isValidUploadRequest', () => {
  it('accepts a well-formed photo and video', () => {
    expect(isValidUploadRequest(photo)).toBe(true)
    expect(
      isValidUploadRequest({ ...photo, type: 'video', ext: 'mp4', durationS: 12.5, frameCount: 13, originalName: 'v.mp4' }),
    ).toBe(true)
  })

  it('rejects inconsistent requests', () => {
    expect(isValidUploadRequest({ ...photo, ext: 'mp4' })).toBe(false)
    expect(isValidUploadRequest({ ...photo, frameCount: 3 })).toBe(false)
    expect(isValidUploadRequest({ ...photo, takenOn: '12/10/2026' })).toBe(false)
    expect(isValidUploadRequest({ ...photo, type: 'video', ext: 'mp4', frameCount: 121 })).toBe(false)
    expect(isValidUploadRequest({ ...photo, type: 'video', ext: 'mp4', faceIndexing: 'unsupported', frameCount: 2 })).toBe(false)
  })
})

describe('videoExt', () => {
  it('keeps known extensions and defaults to mp4', () => {
    expect(videoExt('Clip.MOV')).toBe('mov')
    expect(videoExt('a.webm')).toBe('webm')
    expect(videoExt('noext')).toBe('mp4')
    expect(videoExt('x.avi')).toBe('mp4')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/domain/media-math.test.ts tests/unit/media/upload-request.test.ts`
Expected: FAIL. The modules are not found.

- [ ] **Step 3: Implement the pure modules**

`src/lib/domain/media-math.ts`:
```ts
import { localDateOf } from './dates'

export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export function frameTimes(durationS: number, maxFrames = 120): number[] {
  if (!(durationS > 0)) return [0]
  const step = Math.max(1, durationS / maxFrames)
  const count = Math.min(maxFrames, Math.ceil(durationS / step))
  const last = Math.max(0, durationS - 0.1)
  return Array.from({ length: count }, (_, i) => Math.round(Math.min(i * step + 0.5, last) * 100) / 100)
}

export function takenOnFrom(exifDate: Date | null, now: Date): string {
  if (exifDate && !Number.isNaN(exifDate.getTime()) && exifDate.getFullYear() >= 2000) return localDateOf(exifDate)
  return localDateOf(now)
}
```

`src/lib/media/upload-request.ts`:
```ts
export type VideoExt = 'mp4' | 'mov' | 'webm' | 'm4v'

export interface UploadRequest {
  type: 'photo' | 'video'
  originalName: string
  ext: 'jpg' | VideoExt
  takenOn: string
  width: number
  height: number
  durationS: number | null
  frameCount: number
  faceIndexing: 'enabled' | 'unsupported'
}

const VIDEO_EXTS: VideoExt[] = ['mp4', 'mov', 'webm', 'm4v']

export function videoExt(fileName: string): VideoExt {
  const ext = fileName.split('.').pop()?.toLowerCase()
  return VIDEO_EXTS.includes(ext as VideoExt) ? (ext as VideoExt) : 'mp4'
}

export function isValidUploadRequest(req: UploadRequest): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.takenOn)) return false
  if (!Number.isInteger(req.frameCount) || req.frameCount < 0 || req.frameCount > 120) return false
  if (typeof req.originalName !== 'string' || req.originalName.length === 0) return false
  if (req.type === 'photo') return req.ext === 'jpg' && req.frameCount === 0 && req.faceIndexing === 'enabled'
  if (req.type === 'video') {
    if (!VIDEO_EXTS.includes(req.ext as VideoExt)) return false
    return req.faceIndexing === 'enabled' || req.frameCount === 0
  }
  return false
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/unit/domain/media-math.test.ts tests/unit/media/upload-request.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the browser preparation modules**

These run only in the browser (they use `document`, `createImageBitmap` and `<video>`). The E2E test in Task 20 covers them.

`src/lib/upload/prepare-image.ts`:
```ts
import exifr from 'exifr'
import { fitWithin, takenOnFrom } from '@/lib/domain/media-math'

export class UnsupportedMediaError extends Error {}

export interface PreparedImage {
  full: Blob
  thumb: Blob
  width: number
  height: number
  takenOn: string
}

export async function drawToJpeg(
  source: CanvasImageSource,
  size: { width: number; height: number },
  quality: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas indisponível neste navegador.')
  context.drawImage(source, 0, 0, size.width, size.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Falha ao gerar a imagem.'))), 'image/jpeg', quality),
  )
}

async function decode(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new UnsupportedMediaError('Formato de imagem não suportado. Envie JPEG ou PNG.')
  }
}

async function readExifDate(file: File): Promise<Date | null> {
  try {
    const exif = await exifr.parse(file, ['DateTimeOriginal'])
    return exif?.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal : null
  } catch {
    return null
  }
}

export async function prepareImage(file: File, now: Date = new Date()): Promise<PreparedImage> {
  const bitmap = await decode(file)
  try {
    const fullSize = fitWithin(bitmap.width, bitmap.height, 3000)
    const thumbSize = fitWithin(bitmap.width, bitmap.height, 400)
    const [full, thumb, exifDate] = await Promise.all([
      drawToJpeg(bitmap, fullSize, 0.85),
      drawToJpeg(bitmap, thumbSize, 0.75),
      readExifDate(file),
    ])
    return { full, thumb, width: fullSize.width, height: fullSize.height, takenOn: takenOnFrom(exifDate, now) }
  } finally {
    bitmap.close()
  }
}

export async function resizeImageFile(file: Blob, maxSide: number): Promise<Blob> {
  const bitmap = await decode(file)
  try {
    return await drawToJpeg(bitmap, fitWithin(bitmap.width, bitmap.height, maxSide), 0.9)
  } finally {
    bitmap.close()
  }
}
```

`src/lib/upload/prepare-video.ts`:
```ts
import { fitWithin, frameTimes, takenOnFrom } from '@/lib/domain/media-math'
import { drawToJpeg } from './prepare-image'

export interface PreparedVideo {
  poster: Blob
  frames: Blob[]
  width: number
  height: number
  durationS: number
  takenOn: string
  faceIndexing: 'enabled' | 'unsupported'
}

function waitFor(video: HTMLVideoElement, event: 'loadeddata' | 'seeked', timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => cleanup(new Error('timeout')), timeoutMs)
    const onEvent = () => cleanup()
    const onError = () => cleanup(new Error('decode'))
    function cleanup(error?: Error) {
      clearTimeout(timer)
      video.removeEventListener(event, onEvent)
      video.removeEventListener('error', onError)
      if (error) reject(error)
      else resolve()
    }
    video.addEventListener(event, onEvent)
    video.addEventListener('error', onError)
  })
}

async function placeholderPoster(): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 225
  const context = canvas.getContext('2d')!
  context.fillStyle = '#374151'
  context.fillRect(0, 0, 400, 225)
  context.fillStyle = '#ffffff'
  context.font = '28px sans-serif'
  context.textAlign = 'center'
  context.fillText('▶ vídeo', 200, 122)
  return drawToJpeg(canvas, { width: 400, height: 225 }, 0.8)
}

export async function prepareVideo(file: File, now: Date = new Date()): Promise<PreparedVideo> {
  const takenOn = takenOnFrom(null, now)
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  try {
    await waitFor(video, 'loadeddata', 15_000)
    const durationS = Number.isFinite(video.duration) ? video.duration : 0
    const frameSize = fitWithin(video.videoWidth, video.videoHeight, 1280)
    const posterSize = fitWithin(video.videoWidth, video.videoHeight, 400)
    const frames: Blob[] = []
    let poster: Blob | null = null
    for (const time of frameTimes(durationS)) {
      video.currentTime = time
      await waitFor(video, 'seeked', 5_000)
      if (!poster) poster = await drawToJpeg(video, posterSize, 0.75)
      frames.push(await drawToJpeg(video, frameSize, 0.8))
    }
    return {
      poster: poster ?? (await placeholderPoster()),
      frames,
      width: video.videoWidth,
      height: video.videoHeight,
      durationS: Math.round(durationS * 100) / 100,
      takenOn,
      faceIndexing: 'enabled',
    }
  } catch {
    return { poster: await placeholderPoster(), frames: [], width: 0, height: 0, durationS: 0, takenOn, faceIndexing: 'unsupported' }
  } finally {
    URL.revokeObjectURL(url)
    video.removeAttribute('src')
    video.load()
  }
}
```

- [ ] **Step 6: Write the server side of uploads and signed URLs**

`src/lib/media/signed-urls.ts`:
```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { MEDIA_BUCKET } from './paths'

export const SIGNED_URL_SECONDS = 600

export async function signMediaPaths(db: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map()
  const { data, error } = await db.storage.from(MEDIA_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS)
  if (error) throw new Error(error.message)
  const urls = new Map<string, string>()
  for (const item of data ?? []) if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl)
  return urls
}
```

`src/app/fotografo/eventos/[id]/fotos/actions.ts`:
```ts
'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/action-state'
import { getSessionProfile } from '@/lib/auth/session'
import { todayInSaoPaulo } from '@/lib/domain/dates'
import { isEventAvailable } from '@/lib/domain/events'
import { errorMessage } from '@/lib/errors'
import { framePath, MEDIA_BUCKET, mediaPaths } from '@/lib/media/paths'
import { isValidUploadRequest, type UploadRequest } from '@/lib/media/upload-request'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export interface SignedUpload {
  path: string
  token: string
}

export interface UploadTicket {
  mediaId: string
  full: SignedUpload
  thumb: SignedUpload
  frames: SignedUpload[]
}

export async function createUpload(eventId: string, req: UploadRequest): Promise<{ ticket: UploadTicket } | { error: string }> {
  if (!(await getSessionProfile())) return { error: 'Sessão expirada. Entre de novo.' }
  if (!isValidUploadRequest(req)) return { error: 'Arquivo inválido.' }
  const supabase = await createClient()
  const { data: event } = await supabase.from('events').select('id, status, expires_at').eq('id', eventId).maybeSingle()
  if (!event) return { error: 'Evento não encontrado.' }
  if (!isEventAvailable(event, todayInSaoPaulo())) return { error: 'Este evento está encerrado.' }

  const mediaId = randomUUID()
  const paths = mediaPaths(eventId, mediaId, req.type, req.ext)
  const { error } = await supabase.from('media').insert({
    id: mediaId,
    event_id: eventId,
    type: req.type,
    original_name: req.originalName.slice(0, 200),
    storage_path: paths.full,
    thumb_path: paths.thumb,
    taken_on: req.takenOn,
    width: req.width || null,
    height: req.height || null,
    duration_s: req.durationS,
    frame_count: req.frameCount,
    face_indexing: req.faceIndexing,
  })
  if (error) return { error: errorMessage(error) }

  const storage = createAdminClient().storage.from(MEDIA_BUCKET)
  const sign = async (path: string): Promise<SignedUpload> => {
    const { data, error: signError } = await storage.createSignedUploadUrl(path, { upsert: true })
    if (signError || !data) throw new Error('Não foi possível preparar o envio.')
    return { path, token: data.token }
  }
  const frames = await Promise.all(Array.from({ length: req.frameCount }, (_, i) => sign(framePath(eventId, mediaId, i + 1))))
  return { ticket: { mediaId, full: await sign(paths.full), thumb: await sign(paths.thumb), frames } }
}

export async function updateMediaDay(eventId: string, mediaId: string, day: string): Promise<ActionState> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: 'Data inválida.' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('media').update({ taken_on: day }).eq('id', mediaId).eq('event_id', eventId).select('id')
  if (error) return { error: errorMessage(error) }
  if (!data?.length) return { error: 'Foto não encontrada.' }
  revalidatePath(`/fotografo/eventos/${eventId}`)
  return { error: null, ok: true }
}
```

- [ ] **Step 7: Write the uploader, the grid and the tab**

`src/app/fotografo/eventos/[id]/fotos/media-uploader.tsx`:
```tsx
'use client'

import { useRef, useState, type DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { buttonClass } from '@/components/ui'
import { mapLimit, withRetry } from '@/lib/async'
import { MEDIA_BUCKET } from '@/lib/media/paths'
import { videoExt, type UploadRequest } from '@/lib/media/upload-request'
import { createClient } from '@/lib/supabase/browser'
import { prepareImage, UnsupportedMediaError } from '@/lib/upload/prepare-image'
import { prepareVideo } from '@/lib/upload/prepare-video'
import { createUpload, type SignedUpload } from './actions'

type ItemState = 'waiting' | 'preparing' | 'uploading' | 'processing' | 'done' | 'error'

interface QueueItem {
  name: string
  state: ItemState
  message?: string
}

const STATE_LABEL: Record<ItemState, string> = {
  waiting: 'Na fila',
  preparing: 'Preparando',
  uploading: 'Enviando',
  processing: 'Reconhecendo rostos',
  done: 'Pronto',
  error: 'Erro',
}

const FILES_AT_ONCE = 2
const MAX_VIDEO_BYTES = 500 * 1024 * 1024

export function MediaUploader({ eventId }: { eventId: string }) {
  const router = useRouter()
  const filesRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [busy, setBusy] = useState(false)

  function update(index: number, patch: Partial<QueueItem>) {
    setQueue(previous => previous.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  async function put(target: SignedUpload, blob: Blob) {
    const supabase = createClient()
    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .uploadToSignedUrl(target.path, target.token, blob, { contentType: blob.type || 'application/octet-stream' })
    if (error) throw new Error(`Falha ao enviar: ${error.message}`)
  }

  async function uploadOne(file: File, index: number) {
    try {
      update(index, { state: 'preparing' })
      let request: UploadRequest
      let full: Blob
      let thumb: Blob
      let frames: Blob[] = []
      if (file.type.startsWith('video/')) {
        if (file.size > MAX_VIDEO_BYTES) throw new UnsupportedMediaError('Vídeo maior que 500 MB.')
        const video = await prepareVideo(file)
        request = {
          type: 'video',
          originalName: file.name,
          ext: videoExt(file.name),
          takenOn: video.takenOn,
          width: video.width,
          height: video.height,
          durationS: video.durationS,
          frameCount: video.frames.length,
          faceIndexing: video.faceIndexing,
        }
        full = file
        thumb = video.poster
        frames = video.frames
      } else {
        const image = await prepareImage(file)
        request = {
          type: 'photo',
          originalName: file.name,
          ext: 'jpg',
          takenOn: image.takenOn,
          width: image.width,
          height: image.height,
          durationS: null,
          frameCount: 0,
          faceIndexing: 'enabled',
        }
        full = image.full
        thumb = image.thumb
      }

      update(index, { state: 'uploading' })
      const response = await createUpload(eventId, request)
      if ('error' in response) throw new Error(response.error)
      const { ticket } = response
      await withRetry(() => put(ticket.full, full))
      await withRetry(() => put(ticket.thumb, thumb))
      await mapLimit(frames, 4, (frame, i) => withRetry(() => put(ticket.frames[i], frame)))

      update(index, { state: 'processing' })
      const processed = await fetch(`/api/media/${ticket.mediaId}/process`, { method: 'POST' })
      const body = (await processed.json().catch(() => ({}))) as { result?: string }
      if (!processed.ok || body.result === 'error') {
        update(index, { state: 'error', message: 'Enviado, mas o reconhecimento falhou. Use "Tentar de novo" na galeria.' })
      } else {
        update(index, {
          state: 'done',
          message: request.faceIndexing === 'unsupported' ? 'Vídeo enviado sem reconhecimento facial (formato não suportado pelo navegador).' : undefined,
        })
      }
    } catch (error) {
      update(index, { state: 'error', message: error instanceof Error ? error.message : 'Falha no envio.' })
    }
  }

  async function handleFiles(list: FileList | null) {
    const files = Array.from(list ?? []).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    if (files.length === 0 || busy) return
    setQueue(files.map(file => ({ name: file.name, state: 'waiting' })))
    setBusy(true)
    await mapLimit(files, FILES_AT_ONCE, (file, index) => uploadOne(file, index))
    setBusy(false)
    if (filesRef.current) filesRef.current.value = ''
    if (folderRef.current) folderRef.current.value = ''
    router.refresh()
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    void handleFiles(event.dataTransfer.files)
  }

  const done = queue.filter(item => item.state === 'done').length

  return (
    <div
      onDragOver={event => event.preventDefault()}
      onDrop={onDrop}
      className="space-y-3 rounded-xl border-2 border-dashed border-gray-300 bg-white p-4"
    >
      <p className="text-sm text-gray-600">Arraste fotos e vídeos aqui ou escolha abaixo.</p>
      <div className="flex flex-wrap gap-2">
        <label className={buttonClass('primary')}>
          Escolher arquivos
          <input
            ref={filesRef}
            type="file"
            multiple
            accept="image/*,video/*"
            className="sr-only"
            disabled={busy}
            onChange={event => void handleFiles(event.target.files)}
          />
        </label>
        <label className={buttonClass('secondary')}>
          Escolher pasta
          <input
            ref={folderRef}
            type="file"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={event => void handleFiles(event.target.files)}
            {...{ webkitdirectory: '' }}
          />
        </label>
      </div>
      {queue.length > 0 ? (
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {done} de {queue.length} prontos
          </p>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
            {queue.map((item, index) => (
              <li key={`${item.name}-${index}`} data-testid="upload-item">
                <span className="font-medium">{item.name}</span> · {STATE_LABEL[item.state]}
                {item.message ? <span className="block text-xs text-gray-600">{item.message}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
```

`src/app/fotografo/eventos/[id]/fotos/media-grid.tsx`:
```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button, ErrorText, Select } from '@/components/ui'
import type { ActionState } from '@/lib/action-state'
import { formatDayMonth } from '@/lib/domain/dates'
import { updateMediaDay } from './actions'
import { closeEventAndDeleteMedia, deleteSelectedMedia } from './delete-actions'

export interface GridItem {
  id: string
  type: 'photo' | 'video'
  takenOn: string
  status: 'uploading' | 'processing' | 'ready' | 'error'
  faceIndexing: 'enabled' | 'unsupported'
  originalName: string
  thumbUrl: string | null
}

const STATUS_LABEL: Record<GridItem['status'], string> = {
  uploading: 'Enviando',
  processing: 'Processando',
  ready: '',
  error: 'Erro',
}

export function MediaGrid({
  eventId,
  items,
  days,
  canClose,
}: {
  eventId: string
  items: GridItem[]
  days: string[]
  canClose: boolean
}) {
  const router = useRouter()
  const [day, setDay] = useState('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const visible = items.filter(item => day === 'all' || item.takenOn === day)

  function toggle(id: string) {
    setSelected(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function run(action: () => Promise<ActionState>) {
    startTransition(async () => {
      const result = await action()
      setError(result.error)
      if (!result.error) setSelected(new Set())
    })
  }

  function retry(id: string) {
    startTransition(async () => {
      await fetch(`/api/media/${id}/process`, { method: 'POST' })
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={day} onChange={event => setDay(event.target.value)} className="w-auto">
          <option value="all">Todos os dias ({items.length})</option>
          {days.map(d => (
            <option key={d} value={d}>
              {formatDayMonth(d)} ({items.filter(item => item.takenOn === d).length})
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setSelected(new Set(visible.map(item => item.id)))}
          disabled={visible.length === 0}
        >
          Selecionar tudo
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={pending || selected.size === 0}
          onClick={() => {
            if (confirm(`Excluir ${selected.size} arquivo(s)? Isso não pode ser desfeito.`)) {
              run(() => deleteSelectedMedia(eventId, [...selected]))
            }
          }}
        >
          Excluir selecionadas ({selected.size})
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {visible.map(item => (
          <li key={item.id} className="space-y-1" data-testid="media-tile">
            <label className="relative block aspect-square overflow-hidden rounded-lg bg-gray-200">
              {item.thumbUrl ? <img src={item.thumbUrl} alt={item.originalName} className="h-full w-full object-cover" /> : null}
              <input
                type="checkbox"
                aria-label={`Selecionar ${item.originalName}`}
                checked={selected.has(item.id)}
                onChange={() => toggle(item.id)}
                className="absolute left-1 top-1 h-5 w-5"
              />
              {item.type === 'video' ? <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-xs text-white">vídeo</span> : null}
              {item.status !== 'ready' ? (
                <span className="absolute inset-x-0 bottom-0 bg-black/60 text-center text-xs text-white">{STATUS_LABEL[item.status]}</span>
              ) : null}
            </label>
            {item.faceIndexing === 'unsupported' ? <p className="text-xs text-amber-700">Sem reconhecimento facial</p> : null}
            {item.status === 'error' ? (
              <button type="button" className="text-xs underline" onClick={() => retry(item.id)} disabled={pending}>
                Tentar de novo
              </button>
            ) : null}
            <select
              aria-label={`Dia de ${item.originalName}`}
              value={item.takenOn}
              onChange={event => run(() => updateMediaDay(eventId, item.id, event.target.value))}
              className="w-full rounded border border-gray-300 text-xs"
            >
              {(days.includes(item.takenOn) ? days : [item.takenOn, ...days]).map(d => (
                <option key={d} value={d}>
                  {formatDayMonth(d)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      {items.length === 0 ? <p className="text-sm text-gray-600">Nenhuma foto enviada ainda.</p> : null}
      {canClose ? (
        <div className="border-t pt-4">
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() => {
              if (confirm('Excluir TODAS as fotos e vídeos e encerrar o evento? As vendas continuam registradas.')) {
                run(() => closeEventAndDeleteMedia(eventId))
              }
            }}
          >
            Excluir todas as fotos e encerrar o evento
          </Button>
        </div>
      ) : null}
    </div>
  )
}
```

`src/app/fotografo/eventos/[id]/fotos/media-tab.tsx`:
```tsx
import { todayInSaoPaulo } from '@/lib/domain/dates'
import { eventDays, isEventAvailable } from '@/lib/domain/events'
import { signMediaPaths } from '@/lib/media/signed-urls'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { MediaGrid, type GridItem } from './media-grid'
import { MediaUploader } from './media-uploader'

export async function MediaTab({
  event,
}: {
  event: { id: string; status: string; expires_at: string; start_date: string; end_date: string }
}) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('media')
    .select('id, type, taken_on, status, face_indexing, original_name, thumb_path')
    .eq('event_id', event.id)
    .is('deleted_at', null)
    .order('taken_on')
    .order('created_at')
  const rows = data ?? []
  const urls = await signMediaPaths(createAdminClient(), rows.filter(r => r.status !== 'uploading').map(r => r.thumb_path))
  const items: GridItem[] = rows.map(r => ({
    id: r.id,
    type: r.type,
    takenOn: r.taken_on,
    status: r.status,
    faceIndexing: r.face_indexing,
    originalName: r.original_name,
    thumbUrl: urls.get(r.thumb_path) ?? null,
  }))
  const days = [...new Set([...eventDays(event.start_date, event.end_date), ...items.map(i => i.takenOn)])].sort()
  const available = isEventAvailable(event, todayInSaoPaulo())

  return (
    <div className="space-y-4">
      {available ? <MediaUploader eventId={event.id} /> : <p className="text-sm text-gray-600">Evento encerrado: envio desativado.</p>}
      <MediaGrid eventId={event.id} items={items} days={days} canClose={available} />
    </div>
  )
}
```

In `src/app/fotografo/eventos/[id]/page.tsx`, add the import:
```tsx
import { MediaTab } from './fotos/media-tab'
```
and render it next to the wristbands tab:
```tsx
      {aba === 'fotos' ? <MediaTab event={event} /> : null}
```

- [ ] **Step 8: Verify**

Run: `npx vitest run --project unit && npm run typecheck && npm run lint && npm run build`
Expected: all succeed.

- [ ] **Step 9: Commit**

```bash
git add src tests/unit
git commit -m "feat: add browser upload pipeline with compression, video frames and media grid"
```

---

### Task 15: Client entry: universal link, name list and 4-digit access

**Files:**
- Create: `src/lib/client-session/token.ts`, `src/lib/client-session/cookie.ts`, `src/lib/domain/access.ts`, `src/lib/http.ts`, `src/lib/public/queries.ts`
- Create: `src/app/page.tsx` (replace), `src/app/e/[slug]/page.tsx`, `src/app/e/[slug]/name-list.tsx`, `src/app/e/[slug]/acesso/page.tsx`, `src/app/e/[slug]/acesso/access-form.tsx`, `src/app/api/e/[slug]/access/route.ts`
- Test: `tests/unit/client-session.test.ts`, `tests/unit/domain/access.test.ts`, `tests/unit/http.test.ts`

**Interfaces:**
- Consumes:
  - From Task 2: `buildNameList`, `matchesNameFilter`, `phoneLast4`, `todayInSaoPaulo`, `formatDate`.
  - From Task 9: `isEventAvailable`.
  - From Task 8: `photographerPhotoUrl`.
  - From Task 7: `createAdminClient`.
- Produces:
  - **Token:** `signClientSession(payload, secret)`, `verifyClientSession(token, secret, nowS?)`, `CLIENT_SESSION_DAYS = 30`.
  - **Cookie:** `setClientSession(eventId, registrationId)` and `getClientRegistrationId(eventId): Promise<string | null>`.
  - **Access:** `isAccessBlocked(failuresForRegistration, failuresForIp, limit = 5)` and `ACCESS_WINDOW_MS`.
  - **HTTP:** `clientIp(headers)`.
  - **Public queries:** `PublicEvent`, `listActiveEvents(db, today)`, `getPublicEvent(db, slug)`, `listEventNames(db, eventId)`, `getRegistrationForAccess(db, id)`.
  - **Route:** `POST /api/e/:slug/access` with body `{ registrationId, last4 }` → `{ ok: true }` or `{ error }`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/client-session.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { signClientSession, verifyClientSession } from '@/lib/client-session/token'

const secret = 'x'.repeat(32)

describe('client session token', () => {
  it('round-trips a valid token', () => {
    const token = signClientSession({ rid: 'reg-1', exp: 2_000 }, secret)
    expect(verifyClientSession(token, secret, 1_000)).toEqual({ rid: 'reg-1', exp: 2_000 })
  })

  it('rejects expired, tampered or foreign tokens', () => {
    const token = signClientSession({ rid: 'reg-1', exp: 2_000 }, secret)
    expect(verifyClientSession(token, secret, 3_000)).toBeNull()
    const [body, sig] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ rid: 'reg-2', exp: 2_000 })).toString('base64url')
    expect(verifyClientSession(`${forged}.${sig}`, secret, 1_000)).toBeNull()
    expect(verifyClientSession(`${body}.${sig}`, 'y'.repeat(32), 1_000)).toBeNull()
    expect(verifyClientSession(undefined, secret, 1_000)).toBeNull()
    expect(verifyClientSession('garbage', secret, 1_000)).toBeNull()
  })
})
```

`tests/unit/domain/access.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isAccessBlocked } from '@/lib/domain/access'

describe('isAccessBlocked', () => {
  it('blocks after 5 failures for the registration or the IP', () => {
    expect(isAccessBlocked(4, 4)).toBe(false)
    expect(isAccessBlocked(5, 0)).toBe(true)
    expect(isAccessBlocked(0, 5)).toBe(true)
  })
})
```

`tests/unit/http.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { clientIp } from '@/lib/http'

describe('clientIp', () => {
  it('takes the first forwarded address', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '200.1.2.3, 10.0.0.1' }))).toBe('200.1.2.3')
    expect(clientIp(new Headers({ 'x-real-ip': '200.1.2.4' }))).toBe('200.1.2.4')
    expect(clientIp(new Headers())).toBe('unknown')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/client-session.test.ts tests/unit/domain/access.test.ts tests/unit/http.test.ts`
Expected: FAIL. The modules are not found.

- [ ] **Step 3: Implement the modules**

`src/lib/client-session/token.ts`:
```ts
import { createHmac, timingSafeEqual } from 'node:crypto'

export interface ClientSessionPayload {
  rid: string
  exp: number
}

export const CLIENT_SESSION_DAYS = 30

function sign(body: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(body).digest()
}

export function signClientSession(payload: ClientSessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body, secret).toString('base64url')}`
}

export function verifyClientSession(
  token: string | undefined,
  secret: string,
  nowS: number = Math.floor(Date.now() / 1000),
): ClientSessionPayload | null {
  if (!token) return null
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  const expected = sign(body, secret)
  const given = Buffer.from(signature, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as ClientSessionPayload
    if (typeof payload.rid !== 'string' || typeof payload.exp !== 'number' || payload.exp < nowS) return null
    return payload
  } catch {
    return null
  }
}
```

`src/lib/client-session/cookie.ts`:
```ts
import 'server-only'
import { cookies } from 'next/headers'
import { CLIENT_SESSION_DAYS, signClientSession, verifyClientSession } from './token'

function secret(): string {
  const value = process.env.CLIENT_SESSION_SECRET
  if (!value || value.length < 32) throw new Error('CLIENT_SESSION_SECRET must have at least 32 characters')
  return value
}

function cookieName(eventId: string): string {
  return `ff_${eventId.replace(/-/g, '')}`
}

export async function setClientSession(eventId: string, registrationId: string): Promise<void> {
  const maxAge = CLIENT_SESSION_DAYS * 86_400
  const token = signClientSession({ rid: registrationId, exp: Math.floor(Date.now() / 1000) + maxAge }, secret())
  ;(await cookies()).set(cookieName(eventId), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge,
  })
}

export async function getClientRegistrationId(eventId: string): Promise<string | null> {
  const token = (await cookies()).get(cookieName(eventId))?.value
  return verifyClientSession(token, secret())?.rid ?? null
}
```

`src/lib/domain/access.ts`:
```ts
export const ACCESS_WINDOW_MS = 15 * 60_000
export const MAX_FAILED_ATTEMPTS = 5

export function isAccessBlocked(failuresForRegistration: number, failuresForIp: number, limit = MAX_FAILED_ATTEMPTS): boolean {
  return failuresForRegistration >= limit || failuresForIp >= limit
}
```

`src/lib/http.ts`:
```ts
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/unit/client-session.test.ts tests/unit/domain/access.test.ts tests/unit/http.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the public queries, pages and access route**

`src/lib/public/queries.ts`:
```ts
/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase embeds are untyped without generated types */
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PublicEvent {
  id: string
  name: string
  slug: string
  start_date: string
  end_date: string
  expires_at: string
  status: string
  price_cents: number
  photographer: { name: string; photo_path: string | null; whatsapp: string }
}

const EVENT_COLUMNS = 'id, name, slug, start_date, end_date, expires_at, status, price_cents, photographers(name, photo_path, whatsapp)'

function toPublicEvent(row: Record<string, any>): PublicEvent {
  const { photographers, ...event } = row
  return { ...(event as Omit<PublicEvent, 'photographer'>), photographer: photographers }
}

export async function listActiveEvents(db: SupabaseClient, today: string): Promise<PublicEvent[]> {
  const { data, error } = await db
    .from('events')
    .select(EVENT_COLUMNS)
    .eq('status', 'active')
    .gte('expires_at', today)
    .order('start_date', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []).map(toPublicEvent)
}

export async function getPublicEvent(db: SupabaseClient, slug: string): Promise<PublicEvent | null> {
  const { data, error } = await db.from('events').select(EVENT_COLUMNS).eq('slug', slug).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? toPublicEvent(data) : null
}

export async function listEventNames(db: SupabaseClient, eventId: string): Promise<Array<{ registrationId: string; fullName: string }>> {
  const { data, error } = await db.from('registrations').select('id, clients(full_name)').eq('event_id', eventId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row: Record<string, any>) => ({ registrationId: row.id, fullName: row.clients.full_name }))
}

export interface AccessRegistration {
  id: string
  event_id: string
  status: 'wristband' | 'paid'
  full_name: string
  phone_e164: string
}

export async function getRegistrationForAccess(db: SupabaseClient, id: string): Promise<AccessRegistration | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data, error } = await db
    .from('registrations')
    .select('id, event_id, status, clients(full_name, phone_e164)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const row = data as Record<string, any>
  return { id: row.id, event_id: row.event_id, status: row.status, full_name: row.clients.full_name, phone_e164: row.clients.phone_e164 }
}
```

`src/app/page.tsx` (replace):
```tsx
import Link from 'next/link'
import { Card } from '@/components/ui'
import { formatDate, todayInSaoPaulo } from '@/lib/domain/dates'
import { photographerPhotoUrl } from '@/lib/photographers/photo'
import { listActiveEvents } from '@/lib/public/queries'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const events = await listActiveEvents(createAdminClient(), todayInSaoPaulo())
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">FotoFácil</h1>
        <p className="text-gray-600">Escolha o seu evento para encontrar suas fotos.</p>
      </div>
      {events.map(event => {
        const photo = photographerPhotoUrl(event.photographer.photo_path)
        return (
          <Link key={event.id} href={`/e/${event.slug}`} className="block">
            <Card className="flex items-center gap-3 hover:ring-pink-400">
              {photo ? (
                <img src={photo} alt="" className="h-12 w-12 rounded-full object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-full bg-gray-200" />
              )}
              <div>
                <p className="font-medium">{event.name}</p>
                <p className="text-sm text-gray-600">
                  {event.photographer.name} · {formatDate(event.start_date)}
                </p>
              </div>
            </Card>
          </Link>
        )
      })}
      {events.length === 0 ? <p className="text-center text-sm text-gray-600">Nenhum evento disponível agora.</p> : null}
    </div>
  )
}
```

`src/app/e/[slug]/name-list.tsx`:
```tsx
'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Input } from '@/components/ui'
import { matchesNameFilter, type NameListItem } from '@/lib/domain/names'

export function NameList({ slug, items }: { slug: string; items: NameListItem[] }) {
  const [filter, setFilter] = useState('')
  const visible = items.filter(item => matchesNameFilter(item.label, filter))
  return (
    <div className="space-y-3">
      <Input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Digite seu nome" aria-label="Buscar seu nome" />
      <ul className="grid grid-cols-2 gap-2">
        {visible.map(item => (
          <li key={item.registrationId}>
            <Link
              href={`/e/${slug}/acesso?r=${item.registrationId}`}
              className="block rounded-lg bg-white px-3 py-3 text-center shadow-sm ring-1 ring-gray-200 hover:ring-pink-400"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      {visible.length === 0 ? <p className="text-sm text-gray-600">Nenhum nome encontrado.</p> : null}
    </div>
  )
}
```

`src/app/e/[slug]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { Card, PageTitle } from '@/components/ui'
import { formatDate, todayInSaoPaulo } from '@/lib/domain/dates'
import { isEventAvailable } from '@/lib/domain/events'
import { buildNameList } from '@/lib/domain/names'
import { photographerPhotoUrl } from '@/lib/photographers/photo'
import { getPublicEvent, listEventNames } from '@/lib/public/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { NameList } from './name-list'

export const dynamic = 'force-dynamic'

export default async function EventEntryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const db = createAdminClient()
  const event = await getPublicEvent(db, slug)
  if (!event) notFound()
  const photo = photographerPhotoUrl(event.photographer.photo_path)
  const available = isEventAvailable(event, todayInSaoPaulo())

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-3">
        {photo ? <img src={photo} alt="" className="h-14 w-14 rounded-full object-cover" /> : null}
        <div>
          <PageTitle>{event.name}</PageTitle>
          <p className="text-sm text-gray-600">Fotos de {event.photographer.name}</p>
          {available ? <p className="text-sm text-gray-600">Fotos disponíveis até {formatDate(event.expires_at)}</p> : null}
        </div>
      </Card>
      {available ? (
        <>
          <h2 className="font-medium">Toque no seu nome</h2>
          <NameList slug={slug} items={buildNameList(await listEventNames(db, event.id))} />
        </>
      ) : (
        <Card>
          <p>As fotos deste evento não estão mais disponíveis.</p>
        </Card>
      )}
    </div>
  )
}
```

`src/app/e/[slug]/acesso/access-form.tsx`:
```tsx
'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Button, ErrorText, Field, Input } from '@/components/ui'

export function AccessForm({ slug, registrationId }: { slug: string; registrationId: string }) {
  const router = useRouter()
  const [last4, setLast4] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const response = await fetch(`/api/e/${slug}/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationId, last4 }),
    })
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string }
    setPending(false)
    if (body.ok) router.push(`/e/${slug}/minhas-fotos`)
    else setError(body.error ?? 'Algo deu errado. Tente de novo.')
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Últimos 4 dígitos do celular">
        <Input
          value={last4}
          onChange={event => setLast4(event.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          autoComplete="off"
          pattern="\d{4}"
          required
        />
      </Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" disabled={pending || last4.length !== 4}>
        {pending ? 'Conferindo…' : 'Entrar'}
      </Button>
    </form>
  )
}
```

`src/app/e/[slug]/acesso/page.tsx`:
```tsx
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Card, PageTitle } from '@/components/ui'
import { getClientRegistrationId } from '@/lib/client-session/cookie'
import { displayName } from '@/lib/domain/names'
import { getPublicEvent, getRegistrationForAccess } from '@/lib/public/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { AccessForm } from './access-form'

export const dynamic = 'force-dynamic'

export default async function AccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ r?: string }>
}) {
  const { slug } = await params
  const { r = '' } = await searchParams
  const db = createAdminClient()
  const event = await getPublicEvent(db, slug)
  if (!event) notFound()
  const registration = await getRegistrationForAccess(db, r)
  if (!registration || registration.event_id !== event.id) redirect(`/e/${slug}`)
  if ((await getClientRegistrationId(event.id)) === registration.id) redirect(`/e/${slug}/minhas-fotos`)

  return (
    <div className="space-y-4">
      <PageTitle>Olá, {displayName(registration.full_name)}!</PageTitle>
      <Card>
        <p className="mb-3 text-sm text-gray-600">Para confirmar que é você, digite os 4 últimos dígitos do seu celular.</p>
        <AccessForm slug={slug} registrationId={registration.id} />
      </Card>
      <Link href={`/e/${slug}`} className="text-sm underline">
        Não sou eu
      </Link>
    </div>
  )
}
```

`src/app/api/e/[slug]/access/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { setClientSession } from '@/lib/client-session/cookie'
import { ACCESS_WINDOW_MS, isAccessBlocked } from '@/lib/domain/access'
import { phoneLast4 } from '@/lib/domain/phone'
import { clientIp } from '@/lib/http'
import { getPublicEvent, getRegistrationForAccess } from '@/lib/public/queries'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const body = (await request.json().catch(() => null)) as { registrationId?: string; last4?: string } | null
  if (!body?.registrationId || !/^\d{4}$/.test(body.last4 ?? '')) {
    return NextResponse.json({ error: 'Digite os 4 últimos dígitos do seu celular.' }, { status: 400 })
  }
  const db = createAdminClient()
  const event = await getPublicEvent(db, slug)
  const registration = await getRegistrationForAccess(db, body.registrationId)
  if (!event || !registration || registration.event_id !== event.id) {
    return NextResponse.json({ error: 'Cadastro não encontrado.' }, { status: 404 })
  }

  const ip = clientIp(request.headers)
  const since = new Date(Date.now() - ACCESS_WINDOW_MS).toISOString()
  const failures = (column: 'registration_id' | 'ip', value: string) =>
    db
      .from('access_attempts')
      .select('id', { count: 'exact', head: true })
      .eq(column, value)
      .eq('success', false)
      .gte('created_at', since)
  const [byRegistration, byIp] = await Promise.all([failures('registration_id', registration.id), failures('ip', ip)])
  if (isAccessBlocked(byRegistration.count ?? 0, byIp.count ?? 0)) {
    return NextResponse.json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente de novo.' }, { status: 429 })
  }

  const success = phoneLast4(registration.phone_e164) === body.last4
  await db.from('access_attempts').insert({ registration_id: registration.id, ip, success })
  if (!success) return NextResponse.json({ error: 'Os dígitos não conferem.' }, { status: 401 })

  await setClientSession(event.id, registration.id)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: Verify**

Run: `npx vitest run --project unit && npm run typecheck && npm run lint && npm run build`
Expected: all succeed.

- [ ] **Step 7: Commit**

```bash
git add src tests/unit
git commit -m "feat: add universal event list, client name list and 4-digit access"
```

---

### Task 16: Face search service, API and selfie component

**Files:**
- Create: `src/lib/domain/luminance.ts`, `src/lib/search/search.ts`, `src/lib/search/search-repo.ts`, `src/lib/search/messages.ts`
- Create: `src/app/api/e/[slug]/search/route.ts`, `src/app/e/[slug]/minhas-fotos/face-search.tsx`
- Modify: `src/lib/legal.ts` (add the face consent texts)
- Test: `tests/unit/domain/luminance.test.ts`, `tests/unit/search/search.test.ts`

**Interfaces:**
- Consumes:
  - From Task 11: `FaceProvider`, `getFaceProvider`.
  - From Task 9: `isEventAvailable`.
  - From Task 2: `todayInSaoPaulo`, `startOfTodaySaoPauloISO`.
  - From Task 15: `getPublicEvent`, `getClientRegistrationId`.
  - From Task 14: `drawToJpeg`, `resizeImageFile`.
  - The `record_face_search` SQL function (Task 5).
- Produces:
  - **Luminance:** `averageLuminance(rgba: Uint8ClampedArray): number` and `isTooDark(l): boolean`.
  - **Search:** `SearchFailure`, `SearchOutcome`, `SearchRepo`, `searchClientMedia(input, deps)`, `createSupabaseSearchRepo(db)`, `SEARCH_MESSAGES`.
  - **Legal:** `FACE_CONSENT_LABEL` and `FACE_CONSENT_TEXT`.
  - **Route:** `POST /api/e/:slug/search` (multipart: `selfie`, `consent`) → `SearchOutcome`.
  - **Component:** `<FaceSearch slug needsConsent />`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/domain/luminance.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { averageLuminance, isTooDark } from '@/lib/domain/luminance'

function pixels(rgb: [number, number, number], count = 4): Uint8ClampedArray {
  return new Uint8ClampedArray(Array.from({ length: count }, () => [...rgb, 255]).flat())
}

describe('luminance', () => {
  it('averages perceived brightness', () => {
    expect(averageLuminance(pixels([255, 255, 255]))).toBeCloseTo(255)
    expect(averageLuminance(pixels([0, 0, 0]))).toBe(0)
    expect(averageLuminance(new Uint8ClampedArray())).toBe(0)
  })

  it('flags dark selfies', () => {
    expect(isTooDark(averageLuminance(pixels([20, 20, 20])))).toBe(true)
    expect(isTooDark(averageLuminance(pixels([120, 110, 100])))).toBe(false)
  })
})
```

`tests/unit/search/search.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import type { FaceProvider } from '@/lib/faces/provider'
import { searchClientMedia, type SearchRegistration, type SearchRepo } from '@/lib/search/search'

const NOW = new Date('2026-10-13T15:00:00Z')

class FakeRepo implements SearchRepo {
  registration: SearchRegistration | null = { id: 'r1', event_id: 'e1', status: 'paid', face_consent_at: null }
  event: { status: string; expires_at: string; rekognition_collection_id: string | null } | null = {
    status: 'active',
    expires_at: '2026-11-01',
    rekognition_collection_id: 'fotofacil-e1',
  }
  searchesToday = 0
  live = new Set(['m1', 'm2'])
  consentSet = false
  logged = 0
  recorded: string[] | null = null

  async getRegistration() {
    return this.registration
  }
  async getEvent() {
    return this.event
  }
  async getSearchSettings() {
    return { faceMatchThreshold: 90, dailySearchLimit: 10 }
  }
  async countSearchesSince() {
    return this.searchesToday
  }
  async logSearch() {
    this.logged += 1
  }
  async setConsent() {
    this.consentSet = true
  }
  async filterLiveMedia(_eventId: string, ids: string[]) {
    return ids.filter(id => this.live.has(id))
  }
  async recordMatches(_registrationId: string, mediaIds: string[]) {
    this.recorded = mediaIds
  }
}

function faces(count = 1, matches = [{ faceId: 'f1', externalImageId: 'm1' }, { faceId: 'f2', externalImageId: 'm1' }, { faceId: 'f3', externalImageId: 'gone' }]) {
  return {
    ensureCollection: vi.fn(async () => {}),
    indexFaces: vi.fn(async () => []),
    countFaces: vi.fn(async () => count),
    searchFaces: vi.fn(async () => matches),
    deleteFaces: vi.fn(async () => {}),
    deleteCollection: vi.fn(async () => {}),
  } satisfies FaceProvider
}

const input = { registrationId: 'r1', selfie: new Uint8Array([1]), consent: true, now: NOW }

describe('searchClientMedia', () => {
  it('records consent, searches the event collection and stores unique live matches', async () => {
    const repo = new FakeRepo()
    const provider = faces()
    expect(await searchClientMedia(input, { repo, faces: provider })).toEqual({ ok: true, matchCount: 1 })
    expect(repo.consentSet).toBe(true)
    expect(repo.logged).toBe(1)
    expect(provider.searchFaces).toHaveBeenCalledWith('fotofacil-e1', input.selfie, 90)
    expect(repo.recorded).toEqual(['m1'])
  })

  it('refuses unpaid registrations without calling the provider', async () => {
    const repo = new FakeRepo()
    repo.registration = { ...repo.registration!, status: 'wristband' }
    const provider = faces()
    expect(await searchClientMedia(input, { repo, faces: provider })).toEqual({ ok: false, reason: 'not_paid' })
    expect(provider.countFaces).not.toHaveBeenCalled()
  })

  it('requires consent the first time', async () => {
    const repo = new FakeRepo()
    expect(await searchClientMedia({ ...input, consent: false }, { repo, faces: faces() })).toEqual({ ok: false, reason: 'no_consent' })
  })

  it('enforces the daily limit', async () => {
    const repo = new FakeRepo()
    repo.searchesToday = 10
    expect(await searchClientMedia(input, { repo, faces: faces() })).toEqual({ ok: false, reason: 'limit' })
  })

  it('reports an event without indexed photos as not ready and records nothing', async () => {
    const repo = new FakeRepo()
    repo.event = { ...repo.event!, rekognition_collection_id: null }
    expect(await searchClientMedia(input, { repo, faces: faces() })).toEqual({ ok: false, reason: 'not_ready' })
    expect(repo.recorded).toBeNull()
  })

  it('rejects selfies with no face or several faces without recording matches', async () => {
    const repo = new FakeRepo()
    expect(await searchClientMedia(input, { repo, faces: faces(0) })).toEqual({ ok: false, reason: 'no_face' })
    expect(await searchClientMedia(input, { repo, faces: faces(2) })).toEqual({ ok: false, reason: 'many_faces' })
    expect(repo.recorded).toBeNull()
  })

  it('refuses expired events', async () => {
    const repo = new FakeRepo()
    repo.event = { ...repo.event!, expires_at: '2026-10-12' }
    expect(await searchClientMedia(input, { repo, faces: faces() })).toEqual({ ok: false, reason: 'event_unavailable' })
  })

  it('records an empty result when nobody matches', async () => {
    const repo = new FakeRepo()
    expect(await searchClientMedia(input, { repo, faces: faces(1, []) })).toEqual({ ok: true, matchCount: 0 })
    expect(repo.recorded).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/domain/luminance.test.ts tests/unit/search`
Expected: FAIL. The modules are not found.

- [ ] **Step 3: Implement the service and helpers**

`src/lib/domain/luminance.ts`:
```ts
export const DARK_THRESHOLD = 50

export function averageLuminance(rgba: Uint8ClampedArray): number {
  const pixels = rgba.length / 4
  if (pixels === 0) return 0
  let sum = 0
  for (let i = 0; i < rgba.length; i += 4) sum += 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]
  return sum / pixels
}

export function isTooDark(luminance: number): boolean {
  return luminance < DARK_THRESHOLD
}
```

`src/lib/search/search.ts`:
```ts
import { startOfTodaySaoPauloISO, todayInSaoPaulo } from '@/lib/domain/dates'
import { isEventAvailable } from '@/lib/domain/events'
import type { FaceProvider } from '@/lib/faces/provider'

export type SearchFailure =
  | 'not_found'
  | 'not_paid'
  | 'event_unavailable'
  | 'no_consent'
  | 'limit'
  | 'not_ready'
  | 'no_face'
  | 'many_faces'

export type SearchOutcome = { ok: true; matchCount: number } | { ok: false; reason: SearchFailure }

export interface SearchRegistration {
  id: string
  event_id: string
  status: 'wristband' | 'paid'
  face_consent_at: string | null
}

export interface SearchRepo {
  getRegistration(id: string): Promise<SearchRegistration | null>
  getEvent(eventId: string): Promise<{ status: string; expires_at: string; rekognition_collection_id: string | null } | null>
  getSearchSettings(): Promise<{ faceMatchThreshold: number; dailySearchLimit: number }>
  countSearchesSince(registrationId: string, sinceIso: string): Promise<number>
  logSearch(registrationId: string): Promise<void>
  setConsent(registrationId: string): Promise<void>
  filterLiveMedia(eventId: string, mediaIds: string[]): Promise<string[]>
  recordMatches(registrationId: string, mediaIds: string[]): Promise<void>
}

export interface SearchInput {
  registrationId: string
  selfie: Uint8Array
  consent: boolean
  now: Date
}

function fail(reason: SearchFailure): SearchOutcome {
  return { ok: false, reason }
}

export async function searchClientMedia(input: SearchInput, deps: { repo: SearchRepo; faces: FaceProvider }): Promise<SearchOutcome> {
  const { repo, faces } = deps
  const registration = await repo.getRegistration(input.registrationId)
  if (!registration) return fail('not_found')
  if (registration.status !== 'paid') return fail('not_paid')
  const event = await repo.getEvent(registration.event_id)
  if (!event || !isEventAvailable(event, todayInSaoPaulo(input.now))) return fail('event_unavailable')
  if (!registration.face_consent_at) {
    if (!input.consent) return fail('no_consent')
    await repo.setConsent(registration.id)
  }
  const settings = await repo.getSearchSettings()
  const searchesToday = await repo.countSearchesSince(registration.id, startOfTodaySaoPauloISO(input.now))
  if (searchesToday >= settings.dailySearchLimit) return fail('limit')
  if (!event.rekognition_collection_id) return fail('not_ready')

  await repo.logSearch(registration.id)
  const faceCount = await faces.countFaces(input.selfie)
  if (faceCount === 0) return fail('no_face')
  if (faceCount > 1) return fail('many_faces')

  const matches = await faces.searchFaces(event.rekognition_collection_id, input.selfie, settings.faceMatchThreshold)
  const candidateIds = [...new Set(matches.map(match => match.externalImageId))]
  const mediaIds = await repo.filterLiveMedia(registration.event_id, candidateIds)
  await repo.recordMatches(registration.id, mediaIds)
  return { ok: true, matchCount: mediaIds.length }
}
```

`src/lib/search/messages.ts`:
```ts
import type { SearchFailure } from './search'

export const SEARCH_MESSAGES: Record<SearchFailure, string> = {
  not_found: 'Cadastro não encontrado. Volte e escolha seu nome de novo.',
  not_paid: 'Seu pagamento ainda não foi confirmado.',
  event_unavailable: 'As fotos deste evento não estão mais disponíveis.',
  no_consent: 'Marque o consentimento para continuar.',
  limit: 'Você atingiu o limite de buscas de hoje. Tente amanhã.',
  not_ready: 'As fotos deste evento ainda estão sendo enviadas. Tente mais tarde.',
  no_face: 'Não encontramos um rosto. Fique sozinha na moldura, com o rosto bem iluminado.',
  many_faces: 'Apareceu mais de um rosto. Fique sozinha na moldura, com o rosto bem iluminado.',
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/unit/domain/luminance.test.ts tests/unit/search`
Expected: PASS.

- [ ] **Step 5: Write the repo, the route, the consent texts and the selfie component**

Append to `src/lib/legal.ts`:
```ts
export const FACE_CONSENT_LABEL = 'Concordo com o uso do meu rosto para encontrar minhas fotos.'

export const FACE_CONSENT_TEXT =
  'Para encontrar suas fotos, comparamos o seu rosto com os rostos das fotos deste evento. ' +
  'A sua selfie é usada só nesta busca e não fica guardada. O reconhecimento é feito pela Amazon Web Services (AWS), ' +
  'em servidores fora do Brasil. Os dados de rosto das fotos são apagados junto com as fotos, no fim do prazo do evento.'
```

`src/lib/search/search-repo.ts`:
```ts
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SearchRepo } from './search'

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export function createSupabaseSearchRepo(db: SupabaseClient): SearchRepo {
  return {
    async getRegistration(id) {
      const { data, error } = await db.from('registrations').select('id, event_id, status, face_consent_at').eq('id', id).maybeSingle()
      check(error)
      return data
    },
    async getEvent(eventId) {
      const { data, error } = await db
        .from('events')
        .select('status, expires_at, rekognition_collection_id')
        .eq('id', eventId)
        .maybeSingle()
      check(error)
      return data
    },
    async getSearchSettings() {
      const { data, error } = await db.from('settings').select('face_match_threshold, daily_search_limit').eq('id', 1).single()
      check(error)
      return { faceMatchThreshold: data!.face_match_threshold, dailySearchLimit: data!.daily_search_limit }
    },
    async countSearchesSince(registrationId, sinceIso) {
      const { count, error } = await db
        .from('search_log')
        .select('id', { count: 'exact', head: true })
        .eq('registration_id', registrationId)
        .gte('created_at', sinceIso)
      check(error)
      return count ?? 0
    },
    async logSearch(registrationId) {
      const { error } = await db.from('search_log').insert({ registration_id: registrationId })
      check(error)
    },
    async setConsent(registrationId) {
      const { error } = await db.from('registrations').update({ face_consent_at: new Date().toISOString() }).eq('id', registrationId)
      check(error)
    },
    async filterLiveMedia(eventId, mediaIds) {
      if (mediaIds.length === 0) return []
      const { data, error } = await db
        .from('media')
        .select('id')
        .eq('event_id', eventId)
        .eq('status', 'ready')
        .is('deleted_at', null)
        .in('id', mediaIds)
      check(error)
      return (data ?? []).map(row => row.id as string)
    },
    async recordMatches(registrationId, mediaIds) {
      const { error } = await db.rpc('record_face_search', { p_registration_id: registrationId, p_media_ids: mediaIds })
      check(error)
    },
  }
}
```

`src/app/api/e/[slug]/search/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { getClientRegistrationId } from '@/lib/client-session/cookie'
import { getFaceProvider } from '@/lib/faces'
import { getPublicEvent } from '@/lib/public/queries'
import { searchClientMedia } from '@/lib/search/search'
import { createSupabaseSearchRepo } from '@/lib/search/search-repo'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 30
const MAX_SELFIE_BYTES = 4_000_000

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const db = createAdminClient()
  const event = await getPublicEvent(db, slug)
  if (!event) return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 })
  const registrationId = await getClientRegistrationId(event.id)
  if (!registrationId) return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 401 })

  const form = await request.formData()
  const selfie = form.get('selfie')
  if (!(selfie instanceof File) || selfie.size === 0 || selfie.size > MAX_SELFIE_BYTES) {
    return NextResponse.json({ ok: false, reason: 'no_face' }, { status: 422 })
  }
  const outcome = await searchClientMedia(
    {
      registrationId,
      selfie: new Uint8Array(await selfie.arrayBuffer()),
      consent: form.get('consent') === 'true',
      now: new Date(),
    },
    { repo: createSupabaseSearchRepo(db), faces: getFaceProvider() },
  )
  return NextResponse.json(outcome, { status: outcome.ok ? 200 : 422 })
}
```

`src/app/e/[slug]/minhas-fotos/face-search.tsx`:
```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, Card, ErrorText, buttonClass } from '@/components/ui'
import { averageLuminance, isTooDark } from '@/lib/domain/luminance'
import { fitWithin } from '@/lib/domain/media-math'
import { FACE_CONSENT_LABEL, FACE_CONSENT_TEXT } from '@/lib/legal'
import { SEARCH_MESSAGES } from '@/lib/search/messages'
import type { SearchOutcome } from '@/lib/search/search'
import { resizeImageFile, UnsupportedMediaError } from '@/lib/upload/prepare-image'

type Mode = 'choose' | 'camera' | 'searching'

export function FaceSearch({ slug, needsConsent }: { slug: string; needsConsent: boolean }) {
  const router = useRouter()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [consent, setConsent] = useState(!needsConsent)
  const [mode, setMode] = useState<Mode>('choose')
  const [error, setError] = useState<string | null>(null)

  function stopCamera() {
    streamRef.current?.getTracks().forEach(track => track.stop())
    streamRef.current = null
  }

  useEffect(() => {
    const streams = streamRef
    return () => streams.current?.getTracks().forEach(track => track.stop())
  }, [])

  useEffect(() => {
    if (mode === 'camera' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      void videoRef.current.play().catch(() => undefined)
    }
  }, [mode])

  async function openCamera() {
    setError(null)
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false,
      })
      setMode('camera')
    } catch {
      setError('Não foi possível abrir a câmera. Use "Enviar foto".')
    }
  }

  async function submit(selfie: Blob) {
    setMode('searching')
    setError(null)
    const form = new FormData()
    form.append('selfie', selfie, 'selfie.jpg')
    form.append('consent', String(consent))
    const response = await fetch(`/api/e/${slug}/search`, { method: 'POST', body: form })
    const outcome = (await response.json().catch(() => null)) as SearchOutcome | null
    if (outcome?.ok) {
      router.replace(`/e/${slug}/minhas-fotos`)
      router.refresh()
      return
    }
    setError(outcome ? SEARCH_MESSAGES[outcome.reason] : 'Algo deu errado. Tente de novo.')
    setMode('choose')
  }

  async function capture() {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const size = fitWithin(video.videoWidth, video.videoHeight, 1600)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(video, 0, 0, size.width, size.height)
    const center = context.getImageData(
      Math.floor(size.width / 4),
      Math.floor(size.height / 4),
      Math.floor(size.width / 2),
      Math.floor(size.height / 2),
    ).data
    if (isTooDark(averageLuminance(center))) {
      setError('Está muito escuro. Procure um lugar com mais luz e tente de novo.')
      return
    }
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
    if (!blob) return
    stopCamera()
    await submit(blob)
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    try {
      await submit(await resizeImageFile(file, 1600))
    } catch (e) {
      setMode('choose')
      setError(e instanceof UnsupportedMediaError ? e.message : 'Não foi possível ler essa foto.')
    }
  }

  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-semibold">Encontre suas fotos</h2>
      {needsConsent ? (
        <div className="space-y-2 text-sm">
          <p className="text-gray-600">{FACE_CONSENT_TEXT}</p>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />
            {FACE_CONSENT_LABEL}
          </label>
        </div>
      ) : null}

      {mode === 'camera' ? (
        <div className="space-y-3">
          <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} playsInline muted className="h-full w-full -scale-x-100 object-cover" />
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[62%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
            />
            <p className="absolute inset-x-0 bottom-3 text-center text-sm text-white">Centralize o rosto na moldura e procure luz</p>
          </div>
          <div className="flex justify-center gap-2">
            <Button type="button" onClick={capture}>
              Tirar foto
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                stopCamera()
                setMode('choose')
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      {mode === 'choose' ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={openCamera} disabled={!consent}>
            Tirar selfie
          </Button>
          <label className={`${buttonClass('secondary')} ${consent ? '' : 'pointer-events-none opacity-50'}`}>
            Enviar foto
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={!consent}
              onChange={event => void onFile(event.target.files?.[0])}
            />
          </label>
        </div>
      ) : null}

      {mode === 'searching' ? <p className="text-sm text-gray-600">Procurando suas fotos…</p> : null}
      <ErrorText>{error}</ErrorText>
    </Card>
  )
}
```

- [ ] **Step 6: Verify**

Run: `npx vitest run --project unit && npm run typecheck && npm run lint && npm run build`
Expected: all succeed. `FaceSearch` gets mounted by the page in Task 17.

- [ ] **Step 7: Commit**

```bash
git add src tests/unit
git commit -m "feat: add face search service, API route and selfie capture with oval frame"
```

---
### Task 17: "Minhas fotos" page: payment notice, search and gallery

**Files:**
- Create: `src/lib/domain/client-view.ts`, `src/lib/domain/gallery.ts`, `src/lib/gallery/queries.ts`
- Create: `src/app/api/e/[slug]/media/[mediaId]/hide/route.ts`
- Create: `src/app/e/[slug]/minhas-fotos/page.tsx`, `payment-notice.tsx`, `gallery.tsx`
- Test: `tests/unit/domain/client-view.test.ts`, `tests/unit/domain/gallery.test.ts`

**Interfaces:**
- Consumes:
  - From Task 15: `getPublicEvent`, `getClientRegistrationId`.
  - From Task 16: `FaceSearch`.
  - From Task 14: `signMediaPaths`.
  - From Task 2: `whatsappLink`, `paymentRequestMessage`, `displayName`, `formatDate`, `formatDayMonth`, `formatBRL`.
  - From Task 9: `isEventAvailable`.
- Produces:
  - **View state:** `clientView({ status, lastSearchAt, forceSearch }): 'payment' | 'search' | 'gallery'` and `hasNewMedia(lastSearchAt, latestMediaAt): boolean`.
  - **Gallery helpers:** `GalleryItem`, `TypeFilter`, `filterMedia`, `distinctDays`, `downloadName`, `chunk`, `extOf`.
  - **Queries:** `getClientRegistration(db, id)`, `listClientMedia(db, registrationId)`, `latestEventMediaAt(db, eventId)`.
  - **Route:** `POST /api/e/:slug/media/:mediaId/hide`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/domain/client-view.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { clientView, hasNewMedia } from '@/lib/domain/client-view'

describe('clientView', () => {
  it('shows the payment notice until the registration is paid', () => {
    expect(clientView({ status: 'wristband', lastSearchAt: null, forceSearch: false })).toBe('payment')
    expect(clientView({ status: 'wristband', lastSearchAt: null, forceSearch: true })).toBe('payment')
  })

  it('asks for a selfie before the first search or when forced', () => {
    expect(clientView({ status: 'paid', lastSearchAt: null, forceSearch: false })).toBe('search')
    expect(clientView({ status: 'paid', lastSearchAt: '2026-10-13T10:00:00Z', forceSearch: true })).toBe('search')
  })

  it('shows the gallery after a search', () => {
    expect(clientView({ status: 'paid', lastSearchAt: '2026-10-13T10:00:00Z', forceSearch: false })).toBe('gallery')
  })
})

describe('hasNewMedia', () => {
  it('is true only when media arrived after the last search', () => {
    expect(hasNewMedia('2026-10-13T10:00:00Z', '2026-10-13T11:00:00Z')).toBe(true)
    expect(hasNewMedia('2026-10-13T10:00:00Z', '2026-10-13T09:00:00Z')).toBe(false)
    expect(hasNewMedia(null, '2026-10-13T09:00:00Z')).toBe(false)
    expect(hasNewMedia('2026-10-13T10:00:00Z', null)).toBe(false)
  })
})
```

`tests/unit/domain/gallery.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { chunk, distinctDays, downloadName, extOf, filterMedia, type GalleryItem } from '@/lib/domain/gallery'

const item = (id: string, type: 'photo' | 'video', takenOn: string): GalleryItem => ({
  id,
  type,
  takenOn,
  ext: type === 'photo' ? 'jpg' : 'mp4',
  thumbUrl: `t/${id}`,
  fullUrl: `f/${id}`,
})

const items = [item('a', 'photo', '2026-10-12'), item('b', 'video', '2026-10-12'), item('c', 'photo', '2026-10-13')]

describe('gallery helpers', () => {
  it('filters by type and day', () => {
    expect(filterMedia(items, { type: 'all', day: 'all' }).map(i => i.id)).toEqual(['a', 'b', 'c'])
    expect(filterMedia(items, { type: 'video', day: 'all' }).map(i => i.id)).toEqual(['b'])
    expect(filterMedia(items, { type: 'photo', day: '2026-10-12' }).map(i => i.id)).toEqual(['a'])
  })

  it('lists distinct days in order', () => {
    expect(distinctDays([items[2], items[0], items[1]])).toEqual(['2026-10-12', '2026-10-13'])
  })

  it('names downloads by day and position', () => {
    expect(downloadName(items[0], 0)).toBe('fotofacil-2026-10-12-001.jpg')
    expect(downloadName(items[1], 41)).toBe('fotofacil-2026-10-12-042.mp4')
  })

  it('splits lists in chunks and reads extensions', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(extOf('events/e/m/video.MOV')).toBe('mov')
    expect(extOf('events/e/m/full.jpg')).toBe('jpg')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/domain/client-view.test.ts tests/unit/domain/gallery.test.ts`
Expected: FAIL. The modules are not found.

- [ ] **Step 3: Implement the domain modules**

`src/lib/domain/client-view.ts`:
```ts
export type ClientView = 'payment' | 'search' | 'gallery'

export function clientView(input: { status: 'wristband' | 'paid'; lastSearchAt: string | null; forceSearch: boolean }): ClientView {
  if (input.status !== 'paid') return 'payment'
  if (!input.lastSearchAt || input.forceSearch) return 'search'
  return 'gallery'
}

export function hasNewMedia(lastSearchAt: string | null, latestMediaAt: string | null): boolean {
  if (!lastSearchAt || !latestMediaAt) return false
  return Date.parse(latestMediaAt) > Date.parse(lastSearchAt)
}
```

`src/lib/domain/gallery.ts`:
```ts
export type TypeFilter = 'all' | 'photo' | 'video'

export interface GalleryItem {
  id: string
  type: 'photo' | 'video'
  takenOn: string
  ext: string
  thumbUrl: string
  fullUrl: string
}

export function filterMedia(items: GalleryItem[], filter: { type: TypeFilter; day: string }): GalleryItem[] {
  return items.filter(
    item => (filter.type === 'all' || item.type === filter.type) && (filter.day === 'all' || item.takenOn === filter.day),
  )
}

export function distinctDays(items: GalleryItem[]): string[] {
  return [...new Set(items.map(item => item.takenOn))].sort()
}

export function downloadName(item: GalleryItem, index: number): string {
  return `fotofacil-${item.takenOn}-${String(index + 1).padStart(3, '0')}.${item.ext}`
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function extOf(path: string): string {
  return path.split('.').pop()?.toLowerCase() || 'jpg'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/unit/domain/client-view.test.ts tests/unit/domain/gallery.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the queries, the hide route and the page components**

`src/lib/gallery/queries.ts`:
```ts
/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase embeds are untyped without generated types */
import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface ClientRegistration {
  id: string
  event_id: string
  status: 'wristband' | 'paid'
  face_consent_at: string | null
  last_search_at: string | null
  full_name: string
}

export async function getClientRegistration(db: SupabaseClient, id: string): Promise<ClientRegistration | null> {
  const { data, error } = await db
    .from('registrations')
    .select('id, event_id, status, face_consent_at, last_search_at, clients(full_name)')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const row = data as Record<string, any>
  return {
    id: row.id,
    event_id: row.event_id,
    status: row.status,
    face_consent_at: row.face_consent_at,
    last_search_at: row.last_search_at,
    full_name: row.clients.full_name,
  }
}

export interface ClientMediaRow {
  id: string
  type: 'photo' | 'video'
  taken_on: string
  storage_path: string
  thumb_path: string
  created_at: string
}

export async function listClientMedia(db: SupabaseClient, registrationId: string): Promise<ClientMediaRow[]> {
  const { data, error } = await db
    .from('client_matches')
    .select('media!inner(id, type, taken_on, storage_path, thumb_path, created_at, deleted_at)')
    .eq('registration_id', registrationId)
    .eq('hidden', false)
    .is('media.deleted_at', null)
  if (error) throw new Error(error.message)
  return (data ?? [])
    .map((row: Record<string, any>) => row.media as ClientMediaRow)
    .sort((a, b) => a.taken_on.localeCompare(b.taken_on) || a.created_at.localeCompare(b.created_at))
}

export async function latestEventMediaAt(db: SupabaseClient, eventId: string): Promise<string | null> {
  const { data, error } = await db
    .from('media')
    .select('created_at')
    .eq('event_id', eventId)
    .eq('status', 'ready')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data?.created_at ?? null
}
```

`src/app/api/e/[slug]/media/[mediaId]/hide/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { getClientRegistrationId } from '@/lib/client-session/cookie'
import { getPublicEvent } from '@/lib/public/queries'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(_request: Request, { params }: { params: Promise<{ slug: string; mediaId: string }> }) {
  const { slug, mediaId } = await params
  const db = createAdminClient()
  const event = await getPublicEvent(db, slug)
  if (!event) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const registrationId = await getClientRegistrationId(event.id)
  if (!registrationId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { error } = await db
    .from('client_matches')
    .update({ hidden: true })
    .eq('registration_id', registrationId)
    .eq('media_id', mediaId)
  if (error) return NextResponse.json({ error: 'failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

`src/app/e/[slug]/minhas-fotos/payment-notice.tsx`:
```tsx
import { Card, buttonClass } from '@/components/ui'
import { formatBRL } from '@/lib/domain/money'

export function PaymentNotice({
  eventName,
  priceCents,
  photographerName,
  photographerPhotoUrl,
  whatsappUrl,
}: {
  eventName: string
  priceCents: number
  photographerName: string
  photographerPhotoUrl: string | null
  whatsappUrl: string
}) {
  return (
    <Card className="space-y-4 text-center">
      {photographerPhotoUrl ? <img src={photographerPhotoUrl} alt="" className="mx-auto h-20 w-20 rounded-full object-cover" /> : null}
      <h2 className="text-lg font-semibold">Pagamento ainda não confirmado pelo fotógrafo</h2>
      <p>
        Para ver suas fotos de <strong>{eventName}</strong>, o pagamento de <strong>{formatBRL(priceCents)}</strong> precisa ser
        confirmado por {photographerName}.
      </p>
      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={buttonClass('primary')}>
        Falar no WhatsApp
      </a>
      <p className="text-sm text-gray-600">Já pagou? Peça a confirmação pelo WhatsApp e depois volte a esta página.</p>
    </Card>
  )
}
```

`src/app/e/[slug]/minhas-fotos/gallery.tsx`:
```tsx
'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { downloadZip } from 'client-zip'
import { Button, Card, ErrorText, Select, buttonClass } from '@/components/ui'
import { formatDayMonth } from '@/lib/domain/dates'
import { chunk, distinctDays, downloadName, filterMedia, type GalleryItem, type TypeFilter } from '@/lib/domain/gallery'

const ZIP_BATCH = 200
const SHARE_BATCH = 10
const TYPE_LABEL: Record<TypeFilter, string> = { all: 'Todos', photo: 'Fotos', video: 'Vídeos' }

class ExpiredLinkError extends Error {}

async function fetchMedia(item: GalleryItem): Promise<Response> {
  const response = await fetch(item.fullUrl)
  if (!response.ok) throw new ExpiredLinkError()
  return response
}

async function* zipEntries(items: GalleryItem[], offset: number) {
  for (const [i, item] of items.entries()) {
    yield { name: downloadName(item, offset + i), input: await fetchMedia(item) }
  }
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function Gallery({
  slug,
  items: allItems,
  hasNewMedia,
  whatsappUrl,
}: {
  slug: string
  items: GalleryItem[]
  hasNewMedia: boolean
  whatsappUrl: string
}) {
  const router = useRouter()
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set())
  const [type, setType] = useState<TypeFilter>('all')
  const [day, setDay] = useState('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [viewer, setViewer] = useState<GalleryItem | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [shareFiles, setShareFiles] = useState<File[] | null>(null)
  const [shareNext, setShareNext] = useState<{ items: GalleryItem[]; offset: number } | null>(null)

  const items = useMemo(() => allItems.filter(item => !hiddenIds.has(item.id)), [allItems, hiddenIds])
  const visible = useMemo(() => filterMedia(items, { type, day }), [items, type, day])
  const days = useMemo(() => distinctDays(items), [items])
  const selectedItems = items.filter(item => selected.has(item.id))
  const photoCount = items.filter(item => item.type === 'photo').length
  const videoCount = items.length - photoCount

  function toggle(id: string) {
    setSelected(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleError(e: unknown) {
    if (e instanceof ExpiredLinkError) {
      setError('Os links expiraram. Atualizamos a página: tente de novo.')
      router.refresh()
    } else {
      setError('Não foi possível baixar. Tente de novo.')
    }
  }

  async function downloadZipOf(list: GalleryItem[]) {
    setError(null)
    try {
      const parts = chunk(list, ZIP_BATCH)
      for (const [p, part] of parts.entries()) {
        setBusy(parts.length > 1 ? `Preparando o ZIP ${p + 1} de ${parts.length}…` : 'Preparando o ZIP…')
        const blob = await downloadZip(zipEntries(part, p * ZIP_BATCH)).blob()
        saveBlob(blob, parts.length > 1 ? `fotofacil-parte-${p + 1}.zip` : 'fotofacil.zip')
      }
    } catch (e) {
      handleError(e)
    } finally {
      setBusy(null)
    }
  }

  async function downloadOne(item: GalleryItem) {
    setError(null)
    try {
      saveBlob(await (await fetchMedia(item)).blob(), downloadName(item, items.indexOf(item)))
    } catch (e) {
      handleError(e)
    }
  }

  // Sharing needs a fresh tap, so files are fetched first and shared on a second button.
  async function prepareShare(list: GalleryItem[], offset: number) {
    setError(null)
    setBusy('Preparando…')
    try {
      const batch = list.slice(0, SHARE_BATCH)
      const files = await Promise.all(
        batch.map(async (item, i) => {
          const blob = await (await fetchMedia(item)).blob()
          return new File([blob], downloadName(item, offset + i), {
            type: blob.type || (item.type === 'photo' ? 'image/jpeg' : 'video/mp4'),
          })
        }),
      )
      if (!navigator.canShare?.({ files })) {
        await downloadZipOf(list)
        return
      }
      setShareFiles(files)
      setShareNext(list.length > SHARE_BATCH ? { items: list.slice(SHARE_BATCH), offset: offset + SHARE_BATCH } : null)
    } catch (e) {
      handleError(e)
    } finally {
      setBusy(null)
    }
  }

  async function shareNow() {
    if (!shareFiles) return
    try {
      await navigator.share({ files: shareFiles })
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError('Não foi possível salvar. Use "Baixar ZIP".')
    }
    setShareFiles(null)
    if (shareNext) await prepareShare(shareNext.items, shareNext.offset)
  }

  async function hide(item: GalleryItem) {
    await fetch(`/api/e/${slug}/media/${item.id}/hide`, { method: 'POST' })
    setHiddenIds(previous => new Set(previous).add(item.id))
    setSelected(previous => {
      const next = new Set(previous)
      next.delete(item.id)
      return next
    })
    setViewer(null)
  }

  if (items.length === 0) {
    return (
      <Card className="space-y-3 text-center">
        <p className="font-medium">Não achamos fotos suas neste evento.</p>
        <p className="text-sm text-gray-600">
          Tente com outra selfie, de frente e com boa luz. Se ainda assim não aparecer, fale com o fotógrafo.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={`/e/${slug}/minhas-fotos?buscar=1`} className={buttonClass('primary')}>
            Tentar outra selfie
          </Link>
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={buttonClass('secondary')}>
            Falar no WhatsApp
          </a>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      {hasNewMedia ? (
        <p className="rounded-lg bg-pink-50 p-3 text-sm">
          O fotógrafo enviou fotos novas.{' '}
          <Link href={`/e/${slug}/minhas-fotos?buscar=1`} className="font-medium underline">
            Buscar fotos novas
          </Link>
        </p>
      ) : null}
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Suas fotos</h2>
        <p className="text-sm text-gray-600">
          {photoCount} fotos e {videoCount} vídeos
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'photo', 'video'] as const).map(option => (
          <button
            key={option}
            type="button"
            onClick={() => setType(option)}
            className={`rounded-full px-3 py-1 text-sm ${type === option ? 'bg-pink-600 text-white' : 'bg-white ring-1 ring-gray-300'}`}
          >
            {TYPE_LABEL[option]}
          </button>
        ))}
        {days.length > 1 ? (
          <Select value={day} onChange={event => setDay(event.target.value)} className="w-auto" aria-label="Dia">
            <option value="all">Todos os dias</option>
            {days.map(d => (
              <option key={d} value={d}>
                {formatDayMonth(d)}
              </option>
            ))}
          </Select>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => setSelected(new Set(visible.map(item => item.id)))}>
          {day === 'all' ? 'Selecionar tudo' : `Selecionar o dia ${formatDayMonth(day)}`}
        </Button>
        {selected.size > 0 ? (
          <Button type="button" variant="secondary" onClick={() => setSelected(new Set())}>
            Limpar seleção
          </Button>
        ) : null}
      </div>
      <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4">
        {visible.map((item, index) => (
          <li key={item.id} className="relative aspect-square overflow-hidden rounded-md bg-gray-200">
            <button
              type="button"
              aria-label={`Abrir ${item.type === 'photo' ? 'foto' : 'vídeo'} ${index + 1}`}
              onClick={() => setViewer(item)}
              className="h-full w-full"
            >
              <img src={item.thumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
            {item.type === 'video' ? (
              <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/60 px-1 text-xs text-white">▶</span>
            ) : null}
            <input
              type="checkbox"
              aria-label={`Selecionar ${index + 1}`}
              checked={selected.has(item.id)}
              onChange={() => toggle(item.id)}
              className="absolute left-1 top-1 h-5 w-5"
            />
          </li>
        ))}
      </ul>
      <div className="sticky bottom-0 space-y-2 bg-gray-50 py-2">
        <ErrorText>{error}</ErrorText>
        {busy ? <p className="text-sm text-gray-600">{busy}</p> : null}
        {shareFiles ? (
          <Button type="button" onClick={shareNow}>
            Salvar agora ({shareFiles.length} arquivos)
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={Boolean(busy) || selectedItems.length === 0} onClick={() => prepareShare(selectedItems, 0)}>
              Salvar na galeria ({selectedItems.length})
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={Boolean(busy) || selectedItems.length === 0}
              onClick={() => downloadZipOf(selectedItems)}
            >
              Baixar ZIP
            </Button>
          </div>
        )}
      </div>
      {viewer ? (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4">
          <div className="flex min-h-0 flex-1 items-center justify-center">
            {viewer.type === 'photo' ? (
              <img src={viewer.fullUrl} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <video src={viewer.fullUrl} controls playsInline className="max-h-full max-w-full" />
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-3">
            <Button type="button" onClick={() => downloadOne(viewer)}>
              Baixar
            </Button>
            <Button type="button" variant="secondary" onClick={() => hide(viewer)}>
              Não sou eu
            </Button>
            <Button type="button" variant="secondary" onClick={() => setViewer(null)}>
              Fechar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
```

`src/app/e/[slug]/minhas-fotos/page.tsx`:
```tsx
import { notFound, redirect } from 'next/navigation'
import { Card, PageTitle } from '@/components/ui'
import { getClientRegistrationId } from '@/lib/client-session/cookie'
import { clientView, hasNewMedia } from '@/lib/domain/client-view'
import { formatDate, todayInSaoPaulo } from '@/lib/domain/dates'
import { isEventAvailable } from '@/lib/domain/events'
import { extOf, type GalleryItem } from '@/lib/domain/gallery'
import { displayName } from '@/lib/domain/names'
import { paymentRequestMessage, whatsappLink } from '@/lib/domain/whatsapp'
import { getClientRegistration, latestEventMediaAt, listClientMedia } from '@/lib/gallery/queries'
import { signMediaPaths } from '@/lib/media/signed-urls'
import { photographerPhotoUrl } from '@/lib/photographers/photo'
import { getPublicEvent } from '@/lib/public/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { FaceSearch } from './face-search'
import { Gallery } from './gallery'
import { PaymentNotice } from './payment-notice'

export const dynamic = 'force-dynamic'

export default async function MyPhotosPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ buscar?: string }>
}) {
  const { slug } = await params
  const { buscar } = await searchParams
  const db = createAdminClient()
  const event = await getPublicEvent(db, slug)
  if (!event) notFound()
  if (!isEventAvailable(event, todayInSaoPaulo())) {
    return (
      <Card>
        <p>As fotos deste evento não estão mais disponíveis.</p>
      </Card>
    )
  }
  const registrationId = await getClientRegistrationId(event.id)
  if (!registrationId) redirect(`/e/${slug}`)
  const registration = await getClientRegistration(db, registrationId)
  if (!registration || registration.event_id !== event.id) redirect(`/e/${slug}`)

  const whatsappUrl = whatsappLink(event.photographer.whatsapp, paymentRequestMessage(registration.full_name, event.name))
  const view = clientView({ status: registration.status, lastSearchAt: registration.last_search_at, forceSearch: buscar === '1' })
  const header = (
    <div>
      <PageTitle>{event.name}</PageTitle>
      <p className="text-sm text-gray-600">
        Olá, {displayName(registration.full_name)}! Fotos disponíveis até {formatDate(event.expires_at)}.
      </p>
    </div>
  )

  if (view === 'payment') {
    return (
      <div className="space-y-4">
        {header}
        <PaymentNotice
          eventName={event.name}
          priceCents={event.price_cents}
          photographerName={event.photographer.name}
          photographerPhotoUrl={photographerPhotoUrl(event.photographer.photo_path)}
          whatsappUrl={whatsappUrl}
        />
      </div>
    )
  }

  if (view === 'search') {
    return (
      <div className="space-y-4">
        {header}
        <FaceSearch slug={slug} needsConsent={!registration.face_consent_at} />
      </div>
    )
  }

  const rows = await listClientMedia(db, registration.id)
  const urls = await signMediaPaths(db, rows.flatMap(row => [row.thumb_path, row.storage_path]))
  const items: GalleryItem[] = rows.map(row => ({
    id: row.id,
    type: row.type,
    takenOn: row.taken_on,
    ext: extOf(row.storage_path),
    thumbUrl: urls.get(row.thumb_path) ?? '',
    fullUrl: urls.get(row.storage_path) ?? '',
  }))
  const newMedia = hasNewMedia(registration.last_search_at, await latestEventMediaAt(db, event.id))

  return (
    <div className="space-y-4">
      {header}
      <Gallery slug={slug} items={items} hasNewMedia={newMedia} whatsappUrl={whatsappUrl} />
    </div>
  )
}
```

- [ ] **Step 6: Verify**

Run: `npx vitest run --project unit && npm run typecheck && npm run lint && npm run build`
Expected: all succeed.

- [ ] **Step 7: Commit**

```bash
git add src tests/unit
git commit -m "feat: add client page with payment notice, face search and downloadable gallery"
```

---

### Task 18: Admin dashboard, events and settlements

**Files:**
- Create: `src/lib/domain/dashboard.ts`
- Modify: `src/lib/domain/registrations.ts` (add `canAdminUndo`)
- Modify: `src/app/admin/page.tsx` (replace with the dashboard)
- Create: `src/app/admin/eventos/page.tsx`, `src/app/admin/eventos/[id]/page.tsx`
- Create: `src/app/admin/fechamentos/page.tsx`, `src/app/admin/fechamentos/actions.ts`, `src/app/admin/fechamentos/mark-paid-button.tsx`
- Test: `tests/unit/domain/dashboard.test.ts`; append to `tests/unit/domain/registrations.test.ts`

**Interfaces:**
- Consumes:
  - From Task 6: the SQL functions `settlement_preview`, `create_settlement`, `mark_settlement_paid`.
  - From Task 10: `RegistrationList`, `confirmPayment`, `undoPayment`.
  - From Task 14: `MediaTab`.
  - From Task 2: `formatBRL`, `formatDate`, `todayInSaoPaulo`, `maskPhone`.
- Produces:
  - **Dashboard:** `SaleRow`, `summarizeSales(rows)`, `salesByPhotographer(rows)`, `monthRange(month: 'YYYY-MM')`.
  - **Undo rule:** `canAdminUndo(row)`.
  - **Server actions:** `createSettlementAction(input, prev, formData)` and `markSettlementPaid(id)`.

- [ ] **Step 1: Write the failing tests**

`tests/unit/domain/dashboard.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { monthRange, salesByPhotographer, summarizeSales, type SaleRow } from '@/lib/domain/dashboard'

const rows: SaleRow[] = [
  { price_cents: 5000, commission_cents: 750, payment_method: 'manual', photographer_name: 'João' },
  { price_cents: 5000, commission_cents: 750, payment_method: 'pix', photographer_name: 'João' },
  { price_cents: 8000, commission_cents: 500, payment_method: 'manual', photographer_name: 'Maria' },
]

describe('dashboard', () => {
  it('summarizes sales and splits commission by payment method', () => {
    expect(summarizeSales(rows)).toEqual({ count: 3, totalCents: 18000, commissionPixCents: 750, commissionManualCents: 1250 })
  })

  it('groups sales by photographer, biggest first', () => {
    expect(salesByPhotographer(rows)).toEqual([
      { name: 'João', count: 2, totalCents: 10000, commissionPixCents: 750, commissionManualCents: 750 },
      { name: 'Maria', count: 1, totalCents: 8000, commissionPixCents: 0, commissionManualCents: 500 },
    ])
  })

  it('computes a São Paulo month range', () => {
    expect(monthRange('2026-12')).toEqual({
      startIso: '2026-12-01T00:00:00-03:00',
      endIso: '2027-01-01T00:00:00-03:00',
      monthStart: '2026-12-01',
    })
  })
})
```

In `tests/unit/domain/registrations.test.ts`, add `canAdminUndo` to the existing import from `@/lib/domain/registrations` and append:
```ts
describe('canAdminUndo', () => {
  it('allows manual payments unless the settlement is already paid', () => {
    expect(canAdminUndo({ status: 'paid', payment_method: 'manual', settlement_status: null })).toBe(true)
    expect(canAdminUndo({ status: 'paid', payment_method: 'manual', settlement_status: 'open' })).toBe(true)
    expect(canAdminUndo({ status: 'paid', payment_method: 'manual', settlement_status: 'paid' })).toBe(false)
    expect(canAdminUndo({ status: 'paid', payment_method: 'pix', settlement_status: null })).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project unit tests/unit/domain/dashboard.test.ts tests/unit/domain/registrations.test.ts`
Expected: FAIL. `@/lib/domain/dashboard` is not found and `canAdminUndo` is not exported.

- [ ] **Step 3: Implement**

`src/lib/domain/dashboard.ts`:
```ts
export interface SaleRow {
  price_cents: number
  commission_cents: number
  payment_method: 'manual' | 'pix'
  photographer_name: string
}

export interface SalesSummary {
  count: number
  totalCents: number
  commissionPixCents: number
  commissionManualCents: number
}

export function summarizeSales(rows: SaleRow[]): SalesSummary {
  return rows.reduce<SalesSummary>(
    (acc, row) => ({
      count: acc.count + 1,
      totalCents: acc.totalCents + row.price_cents,
      commissionPixCents: acc.commissionPixCents + (row.payment_method === 'pix' ? row.commission_cents : 0),
      commissionManualCents: acc.commissionManualCents + (row.payment_method === 'manual' ? row.commission_cents : 0),
    }),
    { count: 0, totalCents: 0, commissionPixCents: 0, commissionManualCents: 0 },
  )
}

export function salesByPhotographer(rows: SaleRow[]): Array<{ name: string } & SalesSummary> {
  const groups = new Map<string, SaleRow[]>()
  for (const row of rows) groups.set(row.photographer_name, [...(groups.get(row.photographer_name) ?? []), row])
  return [...groups.entries()]
    .map(([name, group]) => ({ name, ...summarizeSales(group) }))
    .sort((a, b) => b.totalCents - a.totalCents)
}

export function monthRange(month: string): { startIso: string; endIso: string; monthStart: string } {
  const [year, monthNumber] = month.split('-').map(Number)
  const nextYear = monthNumber === 12 ? year + 1 : year
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    startIso: `${year}-${pad(monthNumber)}-01T00:00:00-03:00`,
    endIso: `${nextYear}-${pad(nextMonth)}-01T00:00:00-03:00`,
    monthStart: `${year}-${pad(monthNumber)}-01`,
  }
}
```

Append to `src/lib/domain/registrations.ts`:
```ts
export function canAdminUndo(row: {
  status: RegistrationStatus
  payment_method: PaymentMethod | null
  settlement_status: 'open' | 'paid' | null
}): boolean {
  return row.status === 'paid' && row.payment_method === 'manual' && row.settlement_status !== 'paid'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project unit tests/unit/domain/dashboard.test.ts tests/unit/domain/registrations.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the admin pages and actions**

`src/app/admin/page.tsx` (replace):
```tsx
import { Card, Input, PageTitle, Button } from '@/components/ui'
import { monthRange, salesByPhotographer, summarizeSales, type SaleRow } from '@/lib/domain/dashboard'
import { formatDate, todayInSaoPaulo } from '@/lib/domain/dates'
import { formatBRL } from '@/lib/domain/money'
import { createClient } from '@/lib/supabase/server'

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes = '' } = await searchParams
  const month = /^\d{4}-\d{2}$/.test(mes) ? mes : todayInSaoPaulo().slice(0, 7)
  const { startIso, endIso } = monthRange(month)
  const supabase = await createClient()
  const [{ data: sales }, { data: undos }] = await Promise.all([
    supabase
      .from('registrations')
      .select('price_cents, commission_cents, payment_method, events(name, photographers(name))')
      .eq('status', 'paid')
      .gte('paid_at', startIso)
      .lt('paid_at', endIso),
    supabase
      .from('registration_log')
      .select('id, action, created_at, registrations(clients(full_name), events(name))')
      .in('action', ['undone', 'admin_undo'])
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: false }),
  ])
  const rows: SaleRow[] = (sales ?? []).map(sale => ({
    price_cents: sale.price_cents,
    commission_cents: sale.commission_cents,
    payment_method: sale.payment_method,
    photographer_name: sale.events.photographers.name,
  }))
  const total = summarizeSales(rows)
  const stats = [
    ['Vendas', String(total.count)],
    ['Faturado pelos fotógrafos', formatBRL(total.totalCents)],
    ['Comissão já recebida (PIX)', formatBRL(total.commissionPixCents)],
    ['Comissão a cobrar (manual)', formatBRL(total.commissionManualCents)],
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle>Painel</PageTitle>
        <form className="flex gap-2">
          <Input type="month" name="mes" defaultValue={month} aria-label="Mês" />
          <Button type="submit" variant="secondary">
            Ver
          </Button>
        </form>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {stats.map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs text-gray-600">{label}</p>
            <p className="text-xl font-semibold">{value}</p>
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="mb-2 font-semibold">Por fotógrafo</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-gray-600">
            <tr>
              <th>Fotógrafo</th>
              <th>Vendas</th>
              <th>Total</th>
              <th>A cobrar</th>
            </tr>
          </thead>
          <tbody>
            {salesByPhotographer(rows).map(row => (
              <tr key={row.name} className="border-t">
                <td className="py-1">{row.name}</td>
                <td>{row.count}</td>
                <td>{formatBRL(row.totalCents)}</td>
                <td>{formatBRL(row.commissionManualCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Alertas: confirmações desfeitas</h2>
        {undos?.length ? (
          <ul className="divide-y text-sm">
            {undos.map(undo => (
              <li key={undo.id} className="py-1">
                {formatDate(undo.created_at.slice(0, 10))} · {undo.registrations?.events?.name} · {undo.registrations?.clients?.full_name} ·{' '}
                {undo.action === 'admin_undo' ? 'pelo admin' : 'pelo fotógrafo'}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-600">Nenhuma confirmação desfeita neste mês.</p>
        )}
      </Card>
    </div>
  )
}
```

`src/app/admin/eventos/page.tsx`:
```tsx
import Link from 'next/link'
import { Button, Card, PageTitle, Select } from '@/components/ui'
import { formatDate, todayInSaoPaulo } from '@/lib/domain/dates'
import { isEventAvailable } from '@/lib/domain/events'
import { createClient } from '@/lib/supabase/server'

export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<{ fotografo?: string }> }) {
  const { fotografo = '' } = await searchParams
  const supabase = await createClient()
  let query = supabase
    .from('events')
    .select('id, name, start_date, status, expires_at, photographers(name)')
    .order('start_date', { ascending: false })
    .limit(200)
  if (fotografo) query = query.eq('photographer_id', fotografo)
  const [{ data: events }, { data: photographers }] = await Promise.all([
    query,
    supabase.from('photographers').select('id, name').order('name'),
  ])
  const today = todayInSaoPaulo()

  return (
    <div className="space-y-4">
      <PageTitle>Eventos</PageTitle>
      <form className="flex gap-2">
        <Select name="fotografo" defaultValue={fotografo} aria-label="Fotógrafo">
          <option value="">Todos os fotógrafos</option>
          {(photographers ?? []).map(p => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>
      <Card>
        <ul className="divide-y">
          {(events ?? []).map(event => (
            <li key={event.id} className="py-2">
              <Link href={`/admin/eventos/${event.id}`} className="font-medium underline">
                {event.name}
              </Link>
              <p className="text-sm text-gray-600">
                {event.photographers?.name} · {formatDate(event.start_date)} ·{' '}
                {isEventAvailable(event, today) ? `ativo até ${formatDate(event.expires_at)}` : 'encerrado'}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
```

`src/app/admin/eventos/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { PageTitle } from '@/components/ui'
import { RegistrationList, type RegistrationItem } from '@/app/fotografo/eventos/[id]/pulseiras/registration-list'
import { MediaTab } from '@/app/fotografo/eventos/[id]/fotos/media-tab'
import { formatDate } from '@/lib/domain/dates'
import { maskPhone } from '@/lib/domain/phone'
import { canAdminUndo } from '@/lib/domain/registrations'
import { createClient } from '@/lib/supabase/server'

export default async function AdminEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const [{ data: event }, { data: registrations }] = await Promise.all([
    supabase.from('events').select('*, photographers(name)').eq('id', id).maybeSingle(),
    supabase
      .from('registrations')
      .select('id, status, payment_method, clients(full_name, phone_e164), settlements(status)')
      .eq('event_id', id)
      .order('delivered_at', { ascending: false }),
  ])
  if (!event) notFound()
  const items: RegistrationItem[] = (registrations ?? []).map(r => ({
    id: r.id,
    fullName: r.clients.full_name,
    maskedPhone: maskPhone(r.clients.phone_e164),
    status: r.status,
    paymentMethod: r.payment_method,
    canUndo: canAdminUndo({ status: r.status, payment_method: r.payment_method, settlement_status: r.settlements?.status ?? null }),
  }))

  return (
    <div className="space-y-6">
      <div>
        <PageTitle>{event.name}</PageTitle>
        <p className="text-sm text-gray-600">
          {event.photographers?.name} · {formatDate(event.start_date)} a {formatDate(event.end_date)} · fotos até{' '}
          {formatDate(event.expires_at)} · {event.status === 'active' ? 'ativo' : 'encerrado'}
        </p>
      </div>
      <section className="space-y-2">
        <h2 className="font-semibold">Pulseiras e pagamentos</h2>
        <RegistrationList eventId={id} items={items} />
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Fotos e vídeos</h2>
        <MediaTab event={event} />
      </section>
    </div>
  )
}
```

`src/app/admin/fechamentos/actions.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import type { ActionState } from '@/lib/action-state'
import { requireAdmin } from '@/lib/auth/guards'
import { errorMessage } from '@/lib/errors'
import { createClient } from '@/lib/supabase/server'

export interface SettlementInput {
  photographerId: string
  type: 'event' | 'month'
  eventId: string | null
  month: string | null
}

export async function createSettlementAction(input: SettlementInput, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase.rpc('create_settlement', {
    p_photographer_id: input.photographerId,
    p_period_type: input.type,
    p_event_id: input.eventId,
    p_month: input.month,
  })
  if (error) return { error: errorMessage(error) }
  revalidatePath('/admin/fechamentos')
  return { error: null, ok: true }
}

export async function markSettlementPaid(settlementId: string): Promise<ActionState> {
  await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase.rpc('mark_settlement_paid', { p_settlement_id: settlementId })
  if (error) return { error: errorMessage(error) }
  revalidatePath('/admin/fechamentos')
  return { error: null, ok: true }
}
```

`src/app/admin/fechamentos/mark-paid-button.tsx`:
```tsx
'use client'

import { useState, useTransition } from 'react'
import { Button, ErrorText } from '@/components/ui'
import { markSettlementPaid } from './actions'

export function MarkPaidButton({ settlementId }: { settlementId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={pending}
        onClick={() => {
          if (!confirm('Marcar este fechamento como pago?')) return
          startTransition(async () => setError((await markSettlementPaid(settlementId)).error))
        }}
      >
        Marcar como pago
      </Button>
      <ErrorText>{error}</ErrorText>
    </>
  )
}
```

`src/app/admin/fechamentos/page.tsx`:
```tsx
import { ActionForm } from '@/components/action-form'
import { Button, Card, Field, Input, PageTitle, Select } from '@/components/ui'
import { formatDate, todayInSaoPaulo } from '@/lib/domain/dates'
import { formatBRL } from '@/lib/domain/money'
import { createClient } from '@/lib/supabase/server'
import { createSettlementAction } from './actions'
import { MarkPaidButton } from './mark-paid-button'

function monthLabel(isoDate: string): string {
  return `${isoDate.slice(5, 7)}/${isoDate.slice(0, 4)}`
}

export default async function SettlementsPage({
  searchParams,
}: {
  searchParams: Promise<{ fotografo?: string; tipo?: string; evento?: string; mes?: string }>
}) {
  const params = await searchParams
  const photographerId = params.fotografo ?? ''
  const type: 'event' | 'month' = params.tipo === 'event' ? 'event' : 'month'
  const month = /^\d{4}-\d{2}$/.test(params.mes ?? '') ? params.mes! : todayInSaoPaulo().slice(0, 7)
  const eventId = params.evento ?? ''
  const supabase = await createClient()

  const [{ data: photographers }, { data: events }, { data: settlements }] = await Promise.all([
    supabase.from('photographers').select('id, name').order('name'),
    photographerId
      ? supabase.from('events').select('id, name, start_date').eq('photographer_id', photographerId).order('start_date', { ascending: false })
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; start_date: string }> }),
    supabase
      .from('settlements')
      .select('id, period_type, month, sales_count, total_sales_cents, commission_pix_cents, commission_manual_cents, status, paid_at, photographers(name), events(name)')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const input = {
    photographerId,
    type,
    eventId: type === 'event' ? eventId : null,
    month: type === 'month' ? `${month}-01` : null,
  }
  const ready = Boolean(photographerId) && (type === 'month' || Boolean(eventId))
  const preview = ready
    ? (
        await supabase.rpc('settlement_preview', {
          p_photographer_id: input.photographerId,
          p_period_type: input.type,
          p_event_id: input.eventId,
          p_month: input.month,
        })
      ).data?.[0]
    : null

  return (
    <div className="space-y-6">
      <PageTitle>Fechamentos</PageTitle>
      <Card className="space-y-4">
        <form className="grid gap-3 sm:grid-cols-2">
          <Field label="Fotógrafo">
            <Select name="fotografo" defaultValue={photographerId}>
              <option value="">Escolha…</option>
              {(photographers ?? []).map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Período">
            <Select name="tipo" defaultValue={type}>
              <option value="month">Mês</option>
              <option value="event">Evento</option>
            </Select>
          </Field>
          <Field label="Mês (fechamento mensal)">
            <Input type="month" name="mes" defaultValue={month} />
          </Field>
          <Field label="Evento (fechamento por evento)" hint="Escolha o fotógrafo e clique em Ver prévia para listar os eventos.">
            <Select name="evento" defaultValue={eventId}>
              <option value="">Escolha…</option>
              {(events ?? []).map(e => (
                <option key={e.id} value={e.id}>
                  {e.name} ({formatDate(e.start_date)})
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="secondary">
            Ver prévia
          </Button>
        </form>
        {preview ? (
          <div className="space-y-1 border-t pt-4">
            <p>
              Vendas: {preview.sales_count} · Total vendido: {formatBRL(Number(preview.total_sales_cents))}
            </p>
            <p>Comissão já recebida (PIX): {formatBRL(Number(preview.commission_pix_cents))}</p>
            <p className="text-lg font-semibold">A cobrar do fotógrafo: {formatBRL(Number(preview.commission_manual_cents))}</p>
            <ActionForm action={createSettlementAction.bind(null, input)} submitLabel="Gerar fechamento" pendingText="Gerando…">
              <p className="text-sm text-gray-600">As vendas incluídas não entram em outro fechamento.</p>
            </ActionForm>
          </div>
        ) : null}
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold">Fechamentos gerados</h2>
        <ul className="divide-y text-sm">
          {(settlements ?? []).map(s => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <p className="font-medium">
                  {s.photographers?.name} · {s.period_type === 'event' ? s.events?.name : monthLabel(s.month)}
                </p>
                <p className="text-gray-600">
                  {s.sales_count} vendas · {formatBRL(Number(s.total_sales_cents))} · PIX recebido{' '}
                  {formatBRL(Number(s.commission_pix_cents))} · a cobrar {formatBRL(Number(s.commission_manual_cents))}
                </p>
                <p className="text-gray-600">{s.status === 'paid' ? `Pago em ${formatDate(s.paid_at.slice(0, 10))}` : 'Em aberto'}</p>
              </div>
              {s.status === 'open' ? <MarkPaidButton settlementId={s.id} /> : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
```

- [ ] **Step 6: Verify**

Run: `npx vitest run --project unit && npm run typecheck && npm run lint && npm run build`
Expected: all succeed.

- [ ] **Step 7: Commit**

```bash
git add src tests/unit
git commit -m "feat: add admin dashboard, events overview and settlements"
```

---

### Task 19: Terms and privacy pages

**Files:**
- Modify: `src/lib/legal.ts` (add `TERMS_SECTIONS` and `PRIVACY_SECTIONS`)
- Create: `src/app/termos/page.tsx`, `src/app/privacidade/page.tsx`, `src/components/legal-page.tsx`
- Modify: `src/app/layout.tsx` (footer links)
- Test: `tests/unit/legal.test.ts`

**Interfaces:**
- Produces: `LegalSection = { title: string; body: string }`, `TERMS_SECTIONS`, `PRIVACY_SECTIONS`, and the routes `/termos` and `/privacidade`.

- [ ] **Step 1: Write the failing test**

`tests/unit/legal.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { FACE_CONSENT_TEXT, PRIVACY_SECTIONS, TERMS_SECTIONS } from '@/lib/legal'

const privacy = PRIVACY_SECTIONS.map(s => `${s.title} ${s.body}`).join(' ')

describe('legal texts', () => {
  it('discloses what the spec requires about face recognition', () => {
    expect(privacy).toContain('não fica guardada')
    expect(privacy).toContain('fora do Brasil')
    expect(privacy).toContain('excluídos no fim do prazo')
    expect(privacy).toContain('consentimento')
    expect(FACE_CONSENT_TEXT).toContain('não fica guardada')
  })

  it('has terms about payment and availability', () => {
    const terms = TERMS_SECTIONS.map(s => s.body).join(' ')
    expect(terms).toContain('pagamento')
    expect(terms).toContain('prazo')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project unit tests/unit/legal.test.ts`
Expected: FAIL. `PRIVACY_SECTIONS` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/legal.ts`:
```ts
export interface LegalSection {
  title: string
  body: string
}

export const TERMS_SECTIONS: LegalSection[] = [
  {
    title: 'O que é o FotoFácil',
    body: 'O FotoFácil ajuda fotógrafos de eventos a entregar fotos e vídeos às clientes que receberam a pulseira do fotógrafo.',
  },
  {
    title: 'Pulseira e cadastro',
    body: 'Ao aceitar a pulseira, a cliente informa nome completo e celular e concorda em ser fotografada no evento e em ter as fotos organizadas por reconhecimento facial.',
  },
  {
    title: 'Pagamento e acesso',
    body: 'O pagamento é combinado diretamente com o fotógrafo. As fotos ficam disponíveis no site somente depois que o pagamento é confirmado.',
  },
  {
    title: 'Prazo de disponibilidade',
    body: 'As fotos e vídeos ficam disponíveis por um prazo definido para cada evento e depois são excluídos definitivamente. Baixe suas fotos antes do fim do prazo.',
  },
  {
    title: 'Uso das fotos',
    body: 'As fotos são para uso pessoal da cliente. Os direitos autorais continuam sendo do fotógrafo.',
  },
  {
    title: 'Contato',
    body: 'Dúvidas sobre pagamento ou fotos: fale com o fotógrafo pelo WhatsApp indicado na página do evento.',
  },
]

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    title: 'Dados que coletamos',
    body: 'Nome completo e celular (no cadastro da pulseira), as fotos e vídeos do evento e, no momento da busca, uma selfie ou foto enviada por você.',
  },
  {
    title: 'Reconhecimento facial',
    body: 'Usamos reconhecimento facial apenas para encontrar as fotos em que você aparece, e só com o seu consentimento, dado na entrega da pulseira e de novo antes da busca.',
  },
  {
    title: 'Sua selfie',
    body: 'A selfie é usada apenas durante a busca e não fica guardada.',
  },
  {
    title: 'Onde os dados são processados',
    body: 'O reconhecimento facial é feito pela Amazon Web Services (AWS), em servidores fora do Brasil.',
  },
  {
    title: 'Por quanto tempo guardamos',
    body: 'Fotos, vídeos e os dados de rosto extraídos deles são excluídos no fim do prazo de cada evento. Nome, celular e o histórico de compras são mantidos para controle financeiro.',
  },
  {
    title: 'Seus direitos (LGPD)',
    body: 'Você pode pedir acesso, correção ou exclusão dos seus dados e revogar o consentimento a qualquer momento, falando com o fotógrafo ou com a administração da plataforma.',
  },
]
```

`src/components/legal-page.tsx`:
```tsx
import type { LegalSection } from '@/lib/legal'
import { Card, PageTitle } from './ui'

export function LegalPage({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <div className="space-y-4">
      <PageTitle>{title}</PageTitle>
      <Card className="space-y-4">
        {sections.map(section => (
          <section key={section.title}>
            <h2 className="font-semibold">{section.title}</h2>
            <p className="text-gray-700">{section.body}</p>
          </section>
        ))}
      </Card>
    </div>
  )
}
```

`src/app/termos/page.tsx`:
```tsx
import { LegalPage } from '@/components/legal-page'
import { TERMS_SECTIONS } from '@/lib/legal'

export default function TermsPage() {
  return <LegalPage title="Termos de uso" sections={TERMS_SECTIONS} />
}
```

`src/app/privacidade/page.tsx`:
```tsx
import { LegalPage } from '@/components/legal-page'
import { PRIVACY_SECTIONS } from '@/lib/legal'

export default function PrivacyPage() {
  return <LegalPage title="Política de privacidade" sections={PRIVACY_SECTIONS} />
}
```

In `src/app/layout.tsx`, add `import Link from 'next/link'` and put this footer right after `<main>…</main>` inside `<body>`:
```tsx
        <footer className="mx-auto max-w-3xl px-4 pb-8 text-center text-xs text-gray-500">
          <Link href="/termos" className="underline">
            Termos de uso
          </Link>{' '}
          ·{' '}
          <Link href="/privacidade" className="underline">
            Privacidade
          </Link>
        </footer>
```

- [ ] **Step 4: Verify**

Run: `npx vitest run --project unit && npm run typecheck && npm run lint && npm run build`
Expected: all succeed.

- [ ] **Step 5: Commit**

```bash
git add src tests/unit/legal.test.ts
git commit -m "feat: add terms of use and privacy pages"
```

---

### Task 20: End-to-end test and deployment guide

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/state.ts`, `tests/e2e/fixtures.ts`, `tests/e2e/global-setup.ts`, `tests/e2e/global-teardown.ts`, `tests/e2e/flow.spec.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: every route and label defined in Tasks 7–19.

**Labels the test relies on** (keep them in sync if the UI copy changes):

| Area | Labels |
|---|---|
| Login | "E-mail", "Senha", "Entrar" |
| Events list | link "Novo evento", heading "Meus eventos" |
| Event form | "Nome do evento", button "Criar evento" |
| Wristbands | checkbox "Cliente aceitou os termos (fotos + reconhecimento facial)", button "Cadastrar nova cliente", fields "Nome completo" and "Celular", button "Cadastrar e entregar pulseira", rows with `data-testid="registration-row"`, buttons "Confirmar pagamento" and "Desfazer" |
| Photo upload | tab "Fotos e vídeos", file label "Escolher arquivos", text "N de N prontos" |
| Client access | "Últimos 4 dígitos do celular", "Entrar" |
| Client page | "Pagamento ainda não confirmado pelo fotógrafo", link "Falar no WhatsApp", checkbox "Concordo com o uso do meu rosto para encontrar minhas fotos.", file label "Enviar foto", heading "Suas fotos", buttons "Selecionar tudo" and "Baixar ZIP" |

- [ ] **Step 1: Write the Playwright configuration and helpers**

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test'

try {
  process.loadEnvFile('.env.local')
} catch {
  // Variables may come from the shell instead.
}

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  workers: 1,
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  use: {
    ...devices['Pixel 7'],
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    timeout: 300_000,
    reuseExistingServer: false,
    env: { ...(process.env as Record<string, string>), FACE_PROVIDER: 'fake', NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' },
  },
})
```

`tests/e2e/state.ts`:
```ts
import { readFileSync, writeFileSync } from 'node:fs'

export interface E2EState {
  email: string
  password: string
  userId: string
  photographerId: string
  clientPhone: string
  eventName: string
}

const STATE_FILE = 'tests/e2e/.state.json'

export function writeState(state: E2EState): void {
  writeFileSync(STATE_FILE, JSON.stringify(state))
}

export function readState(): E2EState {
  return JSON.parse(readFileSync(STATE_FILE, 'utf8')) as E2EState
}
```

`tests/e2e/fixtures.ts`:
```ts
import { deflateSync } from 'node:zlib'

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** Solid-color RGB PNG. The fake face provider treats images of the same size as the same person. */
export function solidPng(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  const row = Buffer.alloc(1 + width * 3)
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r
    row[2 + x * 3] = g
    row[3 + x * 3] = b
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row))
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}
```

`tests/e2e/global-setup.ts`:
```ts
import { createClient } from '@supabase/supabase-js'
import { writeState } from './state'

export default async function globalSetup() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  })
  const stamp = Date.now()
  const email = `e2e-foto-${stamp}@example.com`
  const password = `E2e-${stamp}-senha`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`)
  const { error: profileError } = await admin.from('profiles').insert({ id: data.user.id, role: 'photographer' })
  if (profileError) throw new Error(profileError.message)
  const { data: photographer, error: photographerError } = await admin
    .from('photographers')
    .insert({
      profile_id: data.user.id,
      name: 'Fotógrafo E2E',
      whatsapp: '+5571999990000',
      default_price_cents: 5000,
      commission_type: 'percent',
      commission_value: 1500,
    })
    .select('id')
    .single()
  if (photographerError || !photographer) throw new Error(photographerError?.message)
  writeState({
    email,
    password,
    userId: data.user.id,
    photographerId: photographer.id,
    clientPhone: `+55719${String(stamp).slice(-8)}`,
    eventName: `Festa E2E ${stamp}`,
  })
}
```

`tests/e2e/global-teardown.ts`:
```ts
import { createClient } from '@supabase/supabase-js'
import { readState } from './state'

export default async function globalTeardown() {
  const state = readState()
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  })
  const { data: events } = await admin.from('events').select('id').eq('photographer_id', state.photographerId)
  for (const { id } of events ?? []) {
    const { data: media } = await admin.from('media').select('storage_path, thumb_path').eq('event_id', id)
    const paths = (media ?? []).flatMap(m => [m.storage_path, m.thumb_path])
    if (paths.length) await admin.storage.from('media').remove(paths)
    await admin.from('registrations').delete().eq('event_id', id)
    await admin.from('media').delete().eq('event_id', id)
    await admin.from('events').delete().eq('id', id)
  }
  await admin.from('clients').delete().eq('phone_e164', state.clientPhone)
  await admin.from('photographers').delete().eq('id', state.photographerId)
  await admin.auth.admin.deleteUser(state.userId)
}
```

- [ ] **Step 2: Write the end-to-end test**

`tests/e2e/flow.spec.ts`:
```ts
import { expect, test } from '@playwright/test'
import { solidPng } from './fixtures'
import { readState } from './state'

const ANA_PHOTO = solidPng(640, 480, [200, 120, 120])
const OTHER_PHOTO = solidPng(800, 600, [120, 120, 200])
const ANA_SELFIE = solidPng(640, 480, [180, 140, 130])

test('a client finds only her photos after the photographer confirms payment', async ({ browser }) => {
  const state = readState()
  const last4 = state.clientPhone.slice(-4)

  // Photographer: log in and create the event
  const photographer = await browser.newPage()
  photographer.on('dialog', dialog => void dialog.accept())
  await photographer.goto('/login')
  await photographer.getByLabel('E-mail').fill(state.email)
  await photographer.getByLabel('Senha').fill(state.password)
  await photographer.getByRole('button', { name: 'Entrar' }).click()
  await expect(photographer.getByRole('heading', { name: 'Meus eventos' })).toBeVisible()
  await photographer.getByRole('link', { name: 'Novo evento' }).click()
  await photographer.getByLabel('Nome do evento').fill(state.eventName)
  await photographer.getByRole('button', { name: 'Criar evento' }).click()
  await expect(photographer.getByRole('heading', { name: state.eventName })).toBeVisible()

  // Photographer: register a new client and deliver the wristband
  await photographer.getByLabel('Cliente aceitou os termos (fotos + reconhecimento facial)').check()
  await photographer.getByRole('button', { name: 'Cadastrar nova cliente' }).click()
  await photographer.getByLabel('Nome completo').fill('Ana Teste')
  await photographer.getByLabel('Celular', { exact: true }).fill(state.clientPhone)
  await photographer.getByRole('button', { name: 'Cadastrar e entregar pulseira' }).click()
  const row = photographer.getByTestId('registration-row').filter({ hasText: 'Ana Teste' })
  await expect(row).toContainText('Pulseira entregue')

  // Photographer: upload two photos of Ana and one of someone else
  await photographer.getByRole('link', { name: 'Fotos e vídeos' }).click()
  await photographer.getByLabel('Escolher arquivos').setInputFiles([
    { name: 'ana-1.png', mimeType: 'image/png', buffer: ANA_PHOTO },
    { name: 'ana-2.png', mimeType: 'image/png', buffer: ANA_PHOTO },
    { name: 'outra.png', mimeType: 'image/png', buffer: OTHER_PHOTO },
  ])
  await expect(photographer.getByText('3 de 3 prontos')).toBeVisible({ timeout: 90_000 })

  // Client: universal link → event → name → wrong digits → right digits → payment notice
  const client = await browser.newPage()
  await client.goto('/')
  await client.getByRole('link', { name: new RegExp(state.eventName) }).click()
  await client.getByRole('link', { name: 'Ana T.' }).click()
  await client.getByLabel('Últimos 4 dígitos do celular').fill(last4 === '0000' ? '1111' : '0000')
  await client.getByRole('button', { name: 'Entrar' }).click()
  await expect(client.getByText('Os dígitos não conferem.')).toBeVisible()
  await client.getByLabel('Últimos 4 dígitos do celular').fill(last4)
  await client.getByRole('button', { name: 'Entrar' }).click()
  await expect(client.getByText('Pagamento ainda não confirmado pelo fotógrafo')).toBeVisible()
  await expect(client.getByRole('link', { name: 'Falar no WhatsApp' })).toHaveAttribute('href', /wa\.me\/5571999990000/)

  // Photographer: confirm payment
  await photographer.getByRole('link', { name: 'Pulseiras' }).click()
  await row.getByRole('button', { name: 'Confirmar pagamento' }).click()
  await expect(row).toContainText('Pago (manual)')
  await expect(row.getByRole('button', { name: 'Desfazer' })).toBeVisible()

  // Client: consent, send a photo and see only her two photos
  await client.reload()
  await client.getByLabel('Concordo com o uso do meu rosto para encontrar minhas fotos.').check()
  await client.getByLabel('Enviar foto').setInputFiles({ name: 'selfie.png', mimeType: 'image/png', buffer: ANA_SELFIE })
  await expect(client.getByRole('heading', { name: 'Suas fotos' })).toBeVisible({ timeout: 30_000 })
  await expect(client.getByText('2 fotos e 0 vídeos')).toBeVisible()

  // Client: download everything as a ZIP
  await client.getByRole('button', { name: 'Selecionar tudo' }).click()
  const [download] = await Promise.all([
    client.waitForEvent('download'),
    client.getByRole('button', { name: 'Baixar ZIP' }).click(),
  ])
  expect(download.suggestedFilename()).toBe('fotofacil.zip')

  // Photographer: the client has seen her photos, so undo is no longer offered
  await photographer.reload()
  await expect(row).toContainText('Pago (manual)')
  await expect(row.getByRole('button', { name: 'Desfazer' })).toHaveCount(0)
})
```

- [ ] **Step 3: Write `README.md`**

````markdown
# FotoFácil

Site where event photographers deliver photos to their clients: the client finds her own photos by face recognition after the photographer confirms payment. Spec: `docs/superpowers/specs/2026-10-13-fotofacil-design.md`.

## Local development

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase values. Use `FACE_PROVIDER=fake` to work without AWS.
3. Apply the migrations to your Supabase project (see Deployment), then `npm run create-admin -- you@example.com 'a-strong-password'`.
4. `npm run dev` and open http://localhost:3000/login.

The fake face provider identifies a "person" by image size (same width × height = same person; square images contain two faces; images under 50 px contain none). It keeps its data in memory, so restart the server to reset it.

## Tests

| Command | What it needs |
|---|---|
| `npm test` | nothing (unit tests) |
| `npm run test:db` | any Postgres 15+ reachable as superuser. Defaults to `postgres://postgres:postgres@127.0.0.1:5432/postgres`; override with `TEST_DATABASE_URL`. With the Supabase CLI: `npx supabase start` and use port 54322. |
| `npm run test:e2e` | `.env.local` pointing at a Supabase project with the migrations applied (use a development project, the test creates and deletes its own data). In the cloud container set `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`. |

## Deployment

**Supabase**
1. Create a project (São Paulo region recommended).
2. Apply `supabase/migrations/*.sql` in name order. Either use the SQL editor, or run `npx supabase init` (once), `npx supabase link --project-ref <ref>` and `npx supabase db push`.
3. In Authentication → Sign In / Providers, turn off "Allow new users to sign up". Accounts are created only by the admin.
4. In Storage settings, raise the upload file size limit to at least 500 MB (for videos).
5. Create the first admin: `npm run create-admin -- email senha`.

**AWS Rekognition**
1. Create an IAM user with this policy and an access key:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": [
         "rekognition:CreateCollection", "rekognition:DeleteCollection", "rekognition:IndexFaces",
         "rekognition:DetectFaces", "rekognition:SearchFacesByImage", "rekognition:DeleteFaces"
       ],
       "Resource": "*"
     }]
   }
   ```
2. Set `FACE_PROVIDER=rekognition`, `AWS_REGION=us-east-1`, `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

**Vercel**
1. Import the repository and set every variable from `.env.example`. `NEXT_PUBLIC_SITE_URL` is the public URL that the QR code points to.
2. Deploy, then run `supabase/cron.sql` in the Supabase SQL editor with the deployed URL and `CRON_SECRET` filled in.

**Before launch:** have a lawyer review `/termos` and `/privacidade` (LGPD, biometric data), and run a pilot event to tune "Semelhança mínima do reconhecimento" in the admin settings.
````

- [ ] **Step 4: Run every check**

Run: `npm test && npm run test:db && npm run typecheck && npm run lint && npm run build`
Expected: all succeed.

If a Supabase development project is configured in `.env.local`, run `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e`.
Expected: `1 passed`. Without a project, note in the handoff that E2E was not run.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e README.md
git commit -m "test: add end-to-end flow and deployment guide"
```
