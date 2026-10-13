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
