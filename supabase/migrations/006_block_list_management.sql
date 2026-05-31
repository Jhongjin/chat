create or replace function public.my_blocked_profiles()
returns table (
  user_id uuid,
  display_name text,
  age int,
  gender public.gender,
  distance_m int,
  last_seen_at timestamptz,
  avatar_color text,
  interests text[]
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
    coalesce(st_distance(l.point, me.point)::int, 0) as distance_m,
    p.last_seen_at,
    p.avatar_color,
    coalesce(
      array(
        select pi.interest
        from public.profile_interests pi
        where pi.user_id = p.id
        order by pi.interest
      ),
      array[]::text[]
    ) as interests
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  left join public.user_locations l on l.user_id = p.id and l.expires_at > now()
  left join me on true
  where b.blocker_id = auth.uid()
    and p.is_deleted = false
  order by b.created_at desc;
$$;

create or replace function public.unblock_profile(
  blocked_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  delete from public.blocks
  where blocker_id = auth.uid()
    and blocked_id = blocked_user_id;
end;
$$;

grant execute on function public.my_blocked_profiles() to authenticated;
grant execute on function public.unblock_profile(uuid) to authenticated;
