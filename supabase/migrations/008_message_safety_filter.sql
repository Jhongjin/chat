create or replace function public.contains_sensitive_contact(
  content text
) returns boolean
language sql
immutable
set search_path = public
as $$
  select
    regexp_replace(coalesce(content, ''), '\s+', '', 'g') ~* '01[016789]-?[0-9]{3,4}-?[0-9]{4}'
    or coalesce(content, '') ~* '(카톡|카카오톡|오픈채팅|라인|텔레그램|인스타|dm|아이디|id)'
    or coalesce(content, '') ~* '(주소|몇동|몇호|집앞|집 앞|현관|공동현관)';
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

  insert into public.messages (conversation_id, sender_id, body)
  values (target_conversation_id, auth.uid(), body)
  returning id into message_id;

  update public.conversations
  set last_message_at = now()
  where id = target_conversation_id;

  return message_id;
end;
$$;

grant execute on function public.contains_sensitive_contact(text) to authenticated;
grant execute on function public.create_message_request(uuid, text) to authenticated;
grant execute on function public.send_conversation_message(uuid, text) to authenticated;
