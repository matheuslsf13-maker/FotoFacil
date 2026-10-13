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
