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
