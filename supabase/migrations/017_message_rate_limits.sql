create or replace function public.create_message_request(
  target_user_id uuid,
  body text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  daily_count int;
  recent_count int;
  request_id uuid;
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

  if public.contains_sensitive_contact(body) then
    raise exception 'contact or address sharing is limited in early conversations';
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

  if exists (
    select 1
    from public.message_requests mr
    where mr.from_user_id = auth.uid()
      and mr.to_user_id = target_user_id
      and mr.status in ('pending', 'accepted')
      and mr.created_at >= now() - interval '24 hours'
  ) then
    raise exception 'recent message request already exists';
  end if;

  select count(*) into recent_count
  from public.message_requests
  where from_user_id = auth.uid()
    and created_at >= now() - interval '1 hour';

  if recent_count >= 3 then
    raise exception 'hourly message request limit reached';
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

create or replace function public.send_conversation_message(
  target_conversation_id uuid,
  body text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  burst_count int;
  global_recent_count int;
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

  if public.contains_sensitive_contact(body) then
    raise exception 'contact or address sharing is limited in early conversations';
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

  select count(*) into burst_count
  from public.messages m
  where m.sender_id = auth.uid()
    and m.conversation_id = target_conversation_id
    and m.created_at >= now() - interval '30 seconds';

  if burst_count >= 5 then
    raise exception 'conversation message burst limit reached';
  end if;

  select count(*) into global_recent_count
  from public.messages m
  where m.sender_id = auth.uid()
    and m.created_at >= now() - interval '10 minutes';

  if global_recent_count >= 60 then
    raise exception 'message rate limit reached';
  end if;

  if exists (
    select 1
    from public.messages m
    where m.sender_id = auth.uid()
      and m.conversation_id = target_conversation_id
      and m.body = body
      and m.created_at >= now() - interval '2 minutes'
  ) then
    raise exception 'duplicate message blocked';
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

grant execute on function public.create_message_request(uuid, text) to authenticated;
grant execute on function public.send_conversation_message(uuid, text) to authenticated;
