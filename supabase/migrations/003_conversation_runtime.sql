create or replace function public.my_message_requests()
returns table (
  request_id uuid,
  direction text,
  status public.message_request_status,
  body_preview text,
  created_at timestamptz,
  peer_id uuid,
  display_name text,
  age int,
  gender public.gender,
  avatar_color text,
  distance_m int,
  last_seen_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with my_location as (
    select point
    from public.user_locations
    where user_id = auth.uid()
      and expires_at > now()
  )
  select
    mr.id as request_id,
    case when mr.from_user_id = auth.uid() then 'sent' else 'received' end as direction,
    mr.status,
    mr.body_preview,
    mr.created_at,
    peer.id as peer_id,
    peer.display_name,
    extract(year from age(make_date(peer.birth_year, 1, 1)))::int as age,
    peer.gender,
    peer.avatar_color,
    coalesce(st_distance(peer_location.point, my_location.point)::int, 0) as distance_m,
    peer.last_seen_at
  from public.message_requests mr
  join public.profiles peer on peer.id = case
    when mr.from_user_id = auth.uid() then mr.to_user_id
    else mr.from_user_id
  end
  left join my_location on true
  left join public.user_locations peer_location
    on peer_location.user_id = peer.id
   and peer_location.expires_at > now()
  where (mr.from_user_id = auth.uid() or mr.to_user_id = auth.uid())
    and mr.status = 'pending'
    and mr.expires_at > now()
  order by mr.created_at desc
  limit 50;
$$;

create or replace function public.decline_message_request(
  request_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  update public.message_requests
  set status = 'declined'
  where id = request_id
    and to_user_id = auth.uid()
    and status = 'pending'
    and expires_at > now();

  if not found then
    raise exception 'message request not found';
  end if;
end;
$$;

create or replace function public.my_conversations()
returns table (
  conversation_id uuid,
  peer_id uuid,
  display_name text,
  age int,
  gender public.gender,
  avatar_color text,
  distance_m int,
  last_seen_at timestamptz,
  last_message_body text,
  last_message_at timestamptz,
  last_message_sender_id uuid,
  unread_count int
)
language sql
security definer
set search_path = public
as $$
  with my_location as (
    select point
    from public.user_locations
    where user_id = auth.uid()
      and expires_at > now()
  )
  select
    c.id as conversation_id,
    peer.id as peer_id,
    peer.display_name,
    extract(year from age(make_date(peer.birth_year, 1, 1)))::int as age,
    peer.gender,
    peer.avatar_color,
    coalesce(st_distance(peer_location.point, my_location.point)::int, 0) as distance_m,
    peer.last_seen_at,
    latest.body as last_message_body,
    coalesce(latest.created_at, c.last_message_at, c.created_at) as last_message_at,
    latest.sender_id as last_message_sender_id,
    (
      select count(*)::int
      from public.messages unread
      where unread.conversation_id = c.id
        and unread.sender_id <> auth.uid()
        and unread.status = 'visible'
        and (mine.last_read_at is null or unread.created_at > mine.last_read_at)
    ) as unread_count
  from public.conversations c
  join public.conversation_members mine
    on mine.conversation_id = c.id
   and mine.user_id = auth.uid()
  join public.conversation_members peer_member
    on peer_member.conversation_id = c.id
   and peer_member.user_id <> auth.uid()
  join public.profiles peer on peer.id = peer_member.user_id
  left join my_location on true
  left join public.user_locations peer_location
    on peer_location.user_id = peer.id
   and peer_location.expires_at > now()
  left join lateral (
    select body, created_at, sender_id
    from public.messages m
    where m.conversation_id = c.id
      and m.status = 'visible'
    order by m.created_at desc
    limit 1
  ) latest on true
  where c.status = 'active'
  order by coalesce(latest.created_at, c.last_message_at, c.created_at) desc
  limit 50;
$$;

create or replace function public.conversation_messages(
  target_conversation_id uuid
) returns table (
  message_id uuid,
  conversation_id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select m.id, m.conversation_id, m.sender_id, m.body, m.created_at
  from public.messages m
  where m.conversation_id = target_conversation_id
    and m.status = 'visible'
    and exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = m.conversation_id
        and cm.user_id = auth.uid()
    )
  order by m.created_at asc
  limit 200;
$$;

create or replace function public.send_conversation_message(
  target_conversation_id uuid,
  body text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  message_id uuid;
  peer_user_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  body := trim(body);

  if char_length(body) < 1 or char_length(body) > 2000 then
    raise exception 'message must be between 1 and 2000 characters';
  end if;

  if not exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id = target_conversation_id
      and cm.user_id = auth.uid()
  ) then
    raise exception 'conversation not found';
  end if;

  select cm.user_id into peer_user_id
  from public.conversation_members cm
  where cm.conversation_id = target_conversation_id
    and cm.user_id <> auth.uid()
  limit 1;

  if peer_user_id is not null and exists (
    select 1
    from public.blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = peer_user_id)
       or (b.blocker_id = peer_user_id and b.blocked_id = auth.uid())
  ) then
    raise exception 'blocked relationship';
  end if;

  insert into public.messages (conversation_id, sender_id, body)
  values (target_conversation_id, auth.uid(), body)
  returning id into message_id;

  update public.conversations
  set last_message_at = now()
  where id = target_conversation_id;

  return message_id;
end;
$$;

create or replace function public.mark_conversation_read(
  target_conversation_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  update public.conversation_members
  set last_read_at = now()
  where conversation_id = target_conversation_id
    and user_id = auth.uid();
end;
$$;

create or replace function public.touch_conversation_last_message()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
after insert on public.messages
for each row execute function public.touch_conversation_last_message();

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

grant execute on function public.my_message_requests() to authenticated;
grant execute on function public.decline_message_request(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.conversation_messages(uuid) to authenticated;
grant execute on function public.send_conversation_message(uuid, text) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;
