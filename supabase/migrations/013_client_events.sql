create table if not exists public.client_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  event_name text not null check (event_name ~ '^[a-z][a-z0-9_]{2,60}$'),
  properties jsonb not null default '{}'::jsonb,
  platform text,
  created_at timestamptz not null default now()
);

create index if not exists client_events_name_time_idx
  on public.client_events (event_name, created_at desc);

create index if not exists client_events_user_time_idx
  on public.client_events (user_id, created_at desc);

alter table public.client_events enable row level security;

create policy "client events self select" on public.client_events
  for select using (user_id = auth.uid());

create or replace function public.track_client_event(
  event_name text,
  properties jsonb default '{}'::jsonb,
  platform text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  if event_name !~ '^[a-z][a-z0-9_]{2,60}$' then
    raise exception 'invalid event name';
  end if;

  if pg_column_size(coalesce(properties, '{}'::jsonb)) > 4096 then
    raise exception 'event properties too large';
  end if;

  insert into public.client_events (user_id, event_name, properties, platform)
  values (
    auth.uid(),
    event_name,
    coalesce(properties, '{}'::jsonb),
    left(nullif(trim(platform), ''), 24)
  );
end;
$$;

grant execute on function public.track_client_event(text, jsonb, text) to authenticated;
