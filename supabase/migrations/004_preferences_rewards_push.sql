create or replace function public.save_profile_interests(
  interests text[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  delete from public.profile_interests
  where user_id = auth.uid();

  insert into public.profile_interests (user_id, interest)
  select auth.uid(), interest
  from (
    select distinct trim(value) as interest
    from unnest(coalesce(interests, array[]::text[])) as value
    where char_length(trim(value)) between 1 and 24
    limit 5
  ) cleaned;
end;
$$;

create or replace function public.save_discovery_preferences(
  radius_m int default 5000,
  visible boolean default true
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  insert into public.discovery_settings (user_id, radius_m, visible, updated_at)
  values (
    auth.uid(),
    least(greatest(coalesce(radius_m, 5000), 1000), 5000),
    coalesce(visible, true),
    now()
  )
  on conflict (user_id) do update
  set radius_m = excluded.radius_m,
      visible = excluded.visible,
      updated_at = excluded.updated_at;
end;
$$;

create or replace function public.my_preference_state()
returns table (
  radius_m int,
  visible boolean,
  interests text[]
)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(ds.radius_m, 5000) as radius_m,
    coalesce(ds.visible, true) as visible,
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

create or replace function public.claim_ad_reward(
  reward_type text default 'credit',
  amount int default 1,
  ssv_id text default null
) returns table (
  earned_today int,
  granted_amount int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  today_count int;
  safe_amount int;
  safe_reward_type text;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  safe_amount := least(greatest(coalesce(amount, 1), 1), 3);
  safe_reward_type := left(coalesce(nullif(trim(reward_type), ''), 'credit'), 40);

  select coalesce(sum(e.amount), 0)::int into today_count
  from public.ad_reward_events e
  where e.user_id = auth.uid()
    and e.status = 'confirmed'
    and e.created_at >= date_trunc('day', now());

  if today_count >= 3 then
    raise exception 'daily reward limit reached';
  end if;

  safe_amount := least(safe_amount, 3 - today_count);

  insert into public.ad_reward_events (user_id, reward_type, amount, ssv_id, status)
  values (auth.uid(), safe_reward_type, safe_amount, nullif(trim(ssv_id), ''), 'confirmed');

  earned_today := today_count + safe_amount;
  granted_amount := safe_amount;
  return next;
end;
$$;

create or replace function public.my_reward_summary()
returns table (
  earned_today int
)
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(e.amount), 0)::int as earned_today
  from public.ad_reward_events e
  where e.user_id = auth.uid()
    and e.status = 'confirmed'
    and e.created_at >= date_trunc('day', now());
$$;

create or replace function public.save_push_token(
  platform text,
  expo_push_token text,
  device_id_hash text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  if platform not in ('ios', 'android') then
    raise exception 'unsupported platform';
  end if;

  if char_length(trim(expo_push_token)) < 12 then
    raise exception 'invalid push token';
  end if;

  insert into public.push_tokens (user_id, platform, expo_push_token, device_id_hash, created_at)
  values (auth.uid(), platform, trim(expo_push_token), nullif(trim(device_id_hash), ''), now())
  on conflict on constraint push_tokens_pkey do update
  set platform = excluded.platform,
      device_id_hash = excluded.device_id_hash,
      created_at = excluded.created_at;
end;
$$;

grant execute on function public.save_profile_interests(text[]) to authenticated;
grant execute on function public.save_discovery_preferences(int, boolean) to authenticated;
grant execute on function public.my_preference_state() to authenticated;
grant execute on function public.claim_ad_reward(text, int, text) to authenticated;
grant execute on function public.my_reward_summary() to authenticated;
grant execute on function public.save_push_token(text, text, text) to authenticated;
