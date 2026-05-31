drop function if exists public.my_conversations();

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
  unread_count int,
  muted_until timestamptz
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
    ) as unread_count,
    mine.muted_until
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

create or replace function public.mute_conversation_until(
  target_conversation_id uuid,
  next_muted_until timestamptz default null
) returns table (
  muted_until timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  update public.conversation_members
  set muted_until = next_muted_until
  where conversation_id = target_conversation_id
    and user_id = auth.uid();

  if not found then
    raise exception 'conversation not found';
  end if;

  return query
  select cm.muted_until
  from public.conversation_members cm
  where cm.conversation_id = target_conversation_id
    and cm.user_id = auth.uid();
end;
$$;

create or replace function public.enqueue_message_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_id uuid;
  sender_name text;
begin
  select display_name into sender_name
  from public.profiles
  where id = new.sender_id;

  for recipient_id in
    select cm.user_id
    from public.conversation_members cm
    where cm.conversation_id = new.conversation_id
      and cm.user_id <> new.sender_id
      and coalesce(cm.muted_until, '-infinity'::timestamptz) <= now()
  loop
    if public.has_active_push_token(recipient_id) and not exists (
      select 1
      from public.blocks b
      where (b.blocker_id = recipient_id and b.blocked_id = new.sender_id)
         or (b.blocker_id = new.sender_id and b.blocked_id = recipient_id)
    ) then
      insert into public.notification_jobs (user_id, kind, payload)
      values (
        recipient_id,
        'message',
        jsonb_build_object(
          'conversationId', new.conversation_id,
          'messageId', new.id,
          'fromUserId', new.sender_id,
          'fromName', coalesce(sender_name, '동네 친구'),
          'bodyPreview', left(new.body, 80)
        )
      );
    end if;
  end loop;

  return new;
end;
$$;

grant execute on function public.my_conversations() to authenticated;
grant execute on function public.mute_conversation_until(uuid, timestamptz) to authenticated;
