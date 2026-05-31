create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('message_request', 'message')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  error_text text
);

create index if not exists notification_jobs_pending_idx
  on public.notification_jobs (status, created_at asc)
  where status = 'pending';

create index if not exists notification_jobs_user_idx
  on public.notification_jobs (user_id, created_at desc);

alter table public.notification_jobs enable row level security;

create or replace function public.has_active_push_token(
  target_user_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.push_tokens pt
    where pt.user_id = target_user_id
  );
$$;

create or replace function public.enqueue_message_request_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
begin
  if not public.has_active_push_token(new.to_user_id) then
    return new;
  end if;

  select display_name into sender_name
  from public.profiles
  where id = new.from_user_id;

  insert into public.notification_jobs (user_id, kind, payload)
  values (
    new.to_user_id,
    'message_request',
    jsonb_build_object(
      'requestId', new.id,
      'fromUserId', new.from_user_id,
      'fromName', coalesce(sender_name, '동네 친구'),
      'bodyPreview', left(new.body_preview, 80)
    )
  );

  return new;
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

drop trigger if exists message_requests_enqueue_notification on public.message_requests;
create trigger message_requests_enqueue_notification
after insert on public.message_requests
for each row execute function public.enqueue_message_request_notification();

drop trigger if exists messages_enqueue_notification on public.messages;
create trigger messages_enqueue_notification
after insert on public.messages
for each row execute function public.enqueue_message_notification();

revoke all on function public.has_active_push_token(uuid) from public;
