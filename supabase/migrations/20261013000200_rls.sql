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
