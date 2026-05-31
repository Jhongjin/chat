drop function if exists public.my_preference_state();

create or replace function public.my_preference_state()
returns table (
  radius_m int,
  visible boolean,
  pause_until timestamptz,
  interests text[]
)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(ds.radius_m, 5000) as radius_m,
    coalesce(ds.visible, true) as visible,
    ds.pause_until,
    coalesce(
      array(
        select pi.interest
        from public.profile_interests pi
        where pi.user_id = auth.uid()
        order by pi.interest
      ),
      array[]::text[]
    ) as interests
  from (select auth.uid() as user_id) me
  left join public.discovery_settings ds on ds.user_id = me.user_id;
$$;

create or replace function public.pause_discovery_until(
  paused_until timestamptz default null
) returns table (
  pause_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  insert into public.discovery_settings (user_id, pause_until, updated_at)
  values (auth.uid(), paused_until, now())
  on conflict (user_id) do update
  set pause_until = excluded.pause_until,
      updated_at = excluded.updated_at;

  return query
  select ds.pause_until
  from public.discovery_settings ds
  where ds.user_id = auth.uid();
end;
$$;

create or replace function public.nearby_profiles(
  radius_m int default 5000
) returns table (
  user_id uuid,
  display_name text,
  age int,
  gender public.gender,
  distance_m int,
  last_seen_at timestamptz,
  avatar_color text
)
language sql
security definer
set search_path = public
as $$
  with me as (
    select point
    from public.user_locations
    where user_id = auth.uid()
      and expires_at > now()
  )
  select
    p.id as user_id,
    p.display_name,
    extract(year from age(make_date(p.birth_year, 1, 1)))::int as age,
    p.gender,
    st_distance(l.point, me.point)::int as distance_m,
    p.last_seen_at,
    p.avatar_color
  from me
  join public.user_locations l on st_dwithin(l.point, me.point, least(greatest(radius_m, 1000), 5000))
  join public.profiles p on p.id = l.user_id
  left join public.discovery_settings ds on ds.user_id = p.id
  where p.id <> auth.uid()
    and p.status = 'active'
    and p.is_deleted = false
    and l.expires_at > now()
    and coalesce(ds.visible, true) = true
    and coalesce(ds.pause_until, '-infinity'::timestamptz) <= now()
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  order by distance_m asc
  limit 50;
$$;

grant execute on function public.my_preference_state() to authenticated;
grant execute on function public.pause_discovery_until(timestamptz) to authenticated;
grant execute on function public.nearby_profiles(int) to authenticated;
