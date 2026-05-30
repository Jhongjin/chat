create table if not exists public.profile_interests (
  user_id uuid not null references public.profiles(id) on delete cascade,
  interest text not null check (char_length(interest) between 1 and 24),
  created_at timestamptz not null default now(),
  primary key (user_id, interest)
);

alter table public.profile_interests enable row level security;

drop policy if exists "profile interests self manage" on public.profile_interests;
create policy "profile interests self manage" on public.profile_interests
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop function if exists public.nearby_profiles(int);
create or replace function public.nearby_profiles(
  radius_m int default 5000
) returns table (
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
    st_distance(l.point, me.point)::int as distance_m,
    p.last_seen_at,
    p.avatar_color,
    coalesce(
      array_remove(array_agg(pi.interest order by pi.interest), null),
      array[]::text[]
    ) as interests
  from me
  join public.user_locations l on st_dwithin(l.point, me.point, least(greatest(radius_m, 1000), 5000))
  join public.profiles p on p.id = l.user_id
  left join public.discovery_settings ds on ds.user_id = p.id
  left join public.profile_interests pi on pi.user_id = p.id
  where p.id <> auth.uid()
    and p.status = 'active'
    and p.is_deleted = false
    and l.expires_at > now()
    and coalesce(ds.visible, true) = true
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  group by p.id, p.display_name, p.birth_year, p.gender, p.last_seen_at, p.avatar_color, l.point, me.point
  order by distance_m asc
  limit 50;
$$;

create or replace function public.create_message_request(
  target_user_id uuid,
  body text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id uuid;
  daily_count int;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'cannot message yourself';
  end if;

  body := trim(body);

  if char_length(body) < 8 or char_length(body) > 160 then
    raise exception 'message request must be between 8 and 160 characters';
  end if;

  if body ~* '(01[016789]-?[0-9]{3,4}-?[0-9]{4})'
     or body ~* '(카톡|카카오톡|오픈채팅|라인|텔레그램|인스타|dm|아이디|id)'
     or body ~* '(주소|몇동|몇호|집앞|집 앞|현관|공동현관)' then
    raise exception 'contact or address sharing is limited in first messages';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = target_user_id
      and status = 'active'
      and is_deleted = false
  ) then
    raise exception 'target user is not available';
  end if;

  if exists (
    select 1 from public.blocks
    where (blocker_id = auth.uid() and blocked_id = target_user_id)
       or (blocker_id = target_user_id and blocked_id = auth.uid())
  ) then
    raise exception 'blocked relationship';
  end if;

  select count(*) into daily_count
  from public.message_requests
  where from_user_id = auth.uid()
    and created_at >= date_trunc('day', now());

  if daily_count >= 3 then
    raise exception 'daily message request limit reached';
  end if;

  insert into public.message_requests (from_user_id, to_user_id, body_preview)
  values (auth.uid(), target_user_id, body)
  returning id into request_id;

  return request_id;
end;
$$;

create or replace function public.accept_message_request(
  request_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.message_requests%rowtype;
  conversation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  select * into request_row
  from public.message_requests
  where id = request_id
    and to_user_id = auth.uid()
    and status = 'pending'
    and expires_at > now()
  for update;

  if not found then
    raise exception 'message request not found';
  end if;

  update public.message_requests
  set status = 'accepted'
  where id = request_id;

  insert into public.conversations (status, last_message_at)
  values ('active', now())
  returning id into conversation_id;

  insert into public.conversation_members (conversation_id, user_id)
  values
    (conversation_id, request_row.from_user_id),
    (conversation_id, request_row.to_user_id);

  insert into public.messages (conversation_id, sender_id, body)
  values (conversation_id, request_row.from_user_id, request_row.body_preview);

  return conversation_id;
end;
$$;

grant execute on function public.nearby_profiles(int) to authenticated;
grant execute on function public.create_message_request(uuid, text) to authenticated;
grant execute on function public.accept_message_request(uuid) to authenticated;
