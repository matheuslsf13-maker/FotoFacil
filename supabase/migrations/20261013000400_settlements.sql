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
