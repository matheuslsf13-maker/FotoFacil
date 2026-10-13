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
