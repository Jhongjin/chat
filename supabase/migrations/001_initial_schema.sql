create extension if not exists postgis;
create extension if not exists pgcrypto;

create type public.gender as enum ('female', 'male', 'nonbinary', 'private');
create type public.profile_status as enum ('active', 'paused', 'suspended', 'deleted');
create type public.message_request_status as enum ('pending', 'accepted', 'declined', 'expired');
create type public.conversation_status as enum ('active', 'closed');
create type public.message_status as enum ('visible', 'hidden', 'deleted');
create type public.moderation_state as enum ('clean', 'flagged', 'reviewed');
create type public.report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 24),
  birth_year int not null check (birth_year between 1900 and extract(year from now())::int - 18),
  gender public.gender not null default 'private',
  bio text check (char_length(coalesce(bio, '')) <= 220),
  avatar_color text not null default '#177E76',
  status public.profile_status not null default 'active',
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table public.user_locations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  point geography(point, 4326) not null,
  accuracy_m int check (accuracy_m is null or accuracy_m between 0 and 5000),
  geohash text,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '48 hours'
);

create index user_locations_point_idx on public.user_locations using gist (point);
create index user_locations_expires_at_idx on public.user_locations (expires_at);

create table public.discovery_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  visible boolean not null default true,
  radius_m int not null default 5000 check (radius_m between 1000 and 5000),
  age_min int not null default 18 check (age_min >= 18),
  age_max int not null default 80 check (age_max between 18 and 100),
  gender_filter public.gender,
  pause_until timestamptz,
  updated_at timestamptz not null default now()
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.message_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  body_preview text not null check (char_length(body_preview) between 1 and 160),
  status public.message_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  check (from_user_id <> to_user_id)
);

create index message_requests_to_user_idx on public.message_requests (to_user_id, status, created_at desc);
create index message_requests_from_user_idx on public.message_requests (from_user_id, created_at desc);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  status public.conversation_status not null default 'active',
  created_at timestamptz not null default now(),
  last_message_at timestamptz
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  muted_until timestamptz,
  primary key (conversation_id, user_id)
);

create index conversation_members_user_idx on public.conversation_members (user_id, joined_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  status public.message_status not null default 'visible',
  moderation_state public.moderation_state not null default 'clean',
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index messages_conversation_idx on public.messages (conversation_id, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  reason text not null check (char_length(reason) between 2 and 80),
  details text check (char_length(coalesce(details, '')) <= 1000),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now()
);

create index reports_status_idx on public.reports (status, created_at asc);

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  actor_admin_id uuid,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null,
  reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.push_tokens (
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  expo_push_token text not null,
  device_id_hash text,
  created_at timestamptz not null default now(),
  primary key (user_id, expo_push_token)
);

create table public.ad_reward_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ad_network text not null default 'admob',
  reward_type text not null,
  amount int not null check (amount > 0),
  ssv_id text unique,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.account_deletion_requests (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'requested',
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  retention_reason text
);

create or replace function public.update_my_location(
  lat double precision,
  lng double precision,
  accuracy_m int default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  if lat < -90 or lat > 90 or lng < -180 or lng > 180 then
    raise exception 'invalid coordinates';
  end if;

  insert into public.user_locations (user_id, point, accuracy_m, updated_at, expires_at)
  values (
    auth.uid(),
    st_setsrid(st_makepoint(lng, lat), 4326)::geography,
    accuracy_m,
    now(),
    now() + interval '48 hours'
  )
  on conflict (user_id) do update
  set point = excluded.point,
      accuracy_m = excluded.accuracy_m,
      updated_at = excluded.updated_at,
      expires_at = excluded.expires_at;
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
    and not exists (
      select 1 from public.blocks b
      where (b.blocker_id = auth.uid() and b.blocked_id = p.id)
         or (b.blocker_id = p.id and b.blocked_id = auth.uid())
    )
  order by distance_m asc
  limit 50;
$$;

alter table public.profiles enable row level security;
alter table public.user_locations enable row level security;
alter table public.discovery_settings enable row level security;
alter table public.blocks enable row level security;
alter table public.message_requests enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.push_tokens enable row level security;
alter table public.ad_reward_events enable row level security;
alter table public.account_deletion_requests enable row level security;

create policy "profiles self select" on public.profiles
  for select using (id = auth.uid());

create policy "profiles self insert" on public.profiles
  for insert with check (id = auth.uid());

create policy "profiles self update" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "locations self upsert" on public.user_locations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "discovery self manage" on public.discovery_settings
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "blocks self manage" on public.blocks
  for all using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy "message requests participants select" on public.message_requests
  for select using (from_user_id = auth.uid() or to_user_id = auth.uid());

create policy "message requests sender insert" on public.message_requests
  for insert with check (from_user_id = auth.uid());

create policy "message requests receiver update" on public.message_requests
  for update using (to_user_id = auth.uid()) with check (to_user_id = auth.uid());

create policy "conversation members self select" on public.conversation_members
  for select using (user_id = auth.uid());

create policy "conversations participant select" on public.conversations
  for select using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = id and cm.user_id = auth.uid()
    )
  );

create policy "messages participant select" on public.messages
  for select using (
    exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id and cm.user_id = auth.uid()
    )
  );

create policy "messages participant insert" on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id and cm.user_id = auth.uid()
    )
  );

create policy "reports self insert" on public.reports
  for insert with check (reporter_id = auth.uid());

create policy "reports self select" on public.reports
  for select using (reporter_id = auth.uid());

create policy "push tokens self manage" on public.push_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "ad reward events self select" on public.ad_reward_events
  for select using (user_id = auth.uid());

create policy "deletion requests self manage" on public.account_deletion_requests
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
