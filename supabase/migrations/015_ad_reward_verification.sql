alter table public.ad_reward_events
  add column if not exists transaction_id text,
  add column if not exists ad_unit_id text,
  add column if not exists custom_data text,
  add column if not exists verification_source text not null default 'client_callback',
  add column if not exists verification_payload jsonb not null default '{}'::jsonb,
  add column if not exists confirmed_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text;

update public.ad_reward_events
set confirmed_at = coalesce(confirmed_at, created_at),
    verification_source = coalesce(nullif(verification_source, ''), 'client_callback')
where status = 'confirmed';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.ad_reward_events'::regclass
      and conname = 'ad_reward_events_status_value_check'
  ) then
    alter table public.ad_reward_events
      add constraint ad_reward_events_status_value_check
      check (status in ('pending', 'confirmed', 'rejected'));
  end if;
end;
$$;

create unique index if not exists ad_reward_events_transaction_id_idx
  on public.ad_reward_events (transaction_id)
  where transaction_id is not null;

create index if not exists ad_reward_events_user_status_created_idx
  on public.ad_reward_events (user_id, status, created_at desc);

create or replace function public.prepare_ad_reward_attempt(
  reward_type text default 'credit',
  amount int default 1,
  ad_unit_id text default null
) returns table (
  attempt_id uuid,
  viewer_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_count int;
  safe_amount int;
  safe_reward_type text;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  select count(*) into pending_count
  from public.ad_reward_events e
  where e.user_id = auth.uid()
    and e.status = 'pending'
    and e.created_at >= now() - interval '1 hour';

  if pending_count >= 5 then
    raise exception 'too many pending reward attempts';
  end if;

  safe_amount := least(greatest(coalesce(amount, 1), 1), 3);
  safe_reward_type := left(coalesce(nullif(trim(reward_type), ''), 'credit'), 40);

  insert into public.ad_reward_events (
    user_id,
    reward_type,
    amount,
    ad_unit_id,
    custom_data,
    status,
    verification_source,
    verification_payload
  )
  values (
    auth.uid(),
    safe_reward_type,
    safe_amount,
    nullif(trim(ad_unit_id), ''),
    null,
    'pending',
    'client_prepared',
    jsonb_build_object('preparedAt', now())
  )
  returning id, user_id into attempt_id, viewer_id;

  update public.ad_reward_events
  set custom_data = attempt_id::text
  where id = attempt_id;

  return next;
end;
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
  attempt_id uuid;
  attempt_amount int;
  attempt_status text;
  already_client_claimed boolean;
  safe_amount int;
  safe_reward_type text;
  today_count int;
  updated_count int;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  safe_amount := least(greatest(coalesce(amount, 1), 1), 3);
  safe_reward_type := left(coalesce(nullif(trim(reward_type), ''), 'credit'), 40);

  begin
    attempt_id := nullif(trim(ssv_id), '')::uuid;
  exception
    when invalid_text_representation then
      attempt_id := null;
  end;

  select coalesce(sum(e.amount), 0)::int into today_count
  from public.ad_reward_events e
  where e.user_id = auth.uid()
    and e.status = 'confirmed'
    and e.created_at >= date_trunc('day', now());

  if today_count >= 3 then
    raise exception 'daily reward limit reached';
  end if;

  safe_amount := least(safe_amount, 3 - today_count);

  if attempt_id is not null then
    update public.ad_reward_events e
    set amount = safe_amount,
        reward_type = safe_reward_type,
        status = 'confirmed',
        confirmed_at = coalesce(e.confirmed_at, now()),
        verification_source = 'client_callback',
        verification_payload = coalesce(e.verification_payload, '{}'::jsonb) ||
          jsonb_build_object('clientClaimedAt', now())
    where e.id = attempt_id
      and e.user_id = auth.uid()
      and e.status = 'pending';

    get diagnostics updated_count = row_count;

    if updated_count > 0 then
      earned_today := today_count + safe_amount;
      granted_amount := safe_amount;
      return next;
      return;
    end if;

    select e.status,
           e.amount,
           coalesce(e.verification_payload ? 'clientClaimedAt', false)
      into attempt_status, attempt_amount, already_client_claimed
    from public.ad_reward_events e
    where e.id = attempt_id
      and e.user_id = auth.uid();

    if attempt_status = 'confirmed' then
      update public.ad_reward_events e
      set verification_payload = coalesce(e.verification_payload, '{}'::jsonb) ||
        case
          when already_client_claimed then '{}'::jsonb
          else jsonb_build_object('clientClaimedAt', now())
        end
      where e.id = attempt_id;

      earned_today := today_count;
      granted_amount := case when already_client_claimed then 0 else coalesce(attempt_amount, 0) end;
      return next;
      return;
    end if;

    if attempt_status = 'rejected' then
      raise exception 'reward attempt rejected';
    end if;
  end if;

  insert into public.ad_reward_events (
    user_id,
    reward_type,
    amount,
    ssv_id,
    status,
    verification_source,
    verification_payload,
    confirmed_at
  )
  values (
    auth.uid(),
    safe_reward_type,
    safe_amount,
    case when attempt_id is null then nullif(trim(ssv_id), '') else null end,
    'confirmed',
    'client_callback',
    jsonb_build_object('clientClaimedAt', now()),
    now()
  );

  earned_today := today_count + safe_amount;
  granted_amount := safe_amount;
  return next;
end;
$$;

create or replace function public.confirm_ad_reward_from_ssv(
  user_id_param text,
  transaction_id_param text,
  reward_item_param text,
  reward_amount_param int,
  ad_network_param text default 'admob',
  ad_unit_param text default null,
  custom_data_param text default null,
  verification_payload jsonb default '{}'::jsonb
) returns table (
  event_id uuid,
  reward_status text,
  granted_amount int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  attempt_id uuid;
  existing_event public.ad_reward_events%rowtype;
  reward_user_id uuid;
  safe_amount int;
  safe_reward_type text;
  safe_transaction_id text;
  today_count int;
begin
  begin
    reward_user_id := nullif(trim(user_id_param), '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'invalid user id';
  end;

  if reward_user_id is null then
    raise exception 'missing user id';
  end if;

  begin
    attempt_id := nullif(trim(custom_data_param), '')::uuid;
  exception
    when invalid_text_representation then
      attempt_id := null;
  end;

  safe_transaction_id := left(nullif(trim(transaction_id_param), ''), 160);

  if safe_transaction_id is null then
    raise exception 'missing transaction id';
  end if;

  safe_amount := least(greatest(coalesce(reward_amount_param, 1), 1), 3);
  safe_reward_type := left(coalesce(nullif(trim(reward_item_param), ''), 'credit'), 40);

  select e.* into existing_event
  from public.ad_reward_events e
  where e.transaction_id = safe_transaction_id
     or e.ssv_id = safe_transaction_id
     or (attempt_id is not null and e.id = attempt_id)
  order by case when e.user_id = reward_user_id then 0 else 1 end
  limit 1;

  if existing_event.id is not null then
    if existing_event.user_id <> reward_user_id then
      event_id := existing_event.id;
      reward_status := 'rejected';
      granted_amount := 0;
      return next;
      return;
    end if;

    if existing_event.status = 'pending' then
      select coalesce(sum(e.amount), 0)::int into today_count
      from public.ad_reward_events e
      where e.user_id = reward_user_id
        and e.status = 'confirmed'
        and e.created_at >= date_trunc('day', now());

      if today_count >= 3 then
        update public.ad_reward_events e
        set ad_network = left(coalesce(nullif(trim(ad_network_param), ''), 'admob'), 40),
            ad_unit_id = left(nullif(trim(ad_unit_param), ''), 120),
            custom_data = left(nullif(trim(custom_data_param), ''), 240),
            ssv_id = safe_transaction_id,
            transaction_id = safe_transaction_id,
            status = 'rejected',
            verification_source = 'admob_ssv',
            verification_payload = coalesce(e.verification_payload, '{}'::jsonb) ||
              coalesce(verification_payload, '{}'::jsonb),
            rejected_at = now(),
            rejection_reason = 'daily reward limit reached'
        where e.id = existing_event.id
        returning e.id, e.status into event_id, reward_status;

        granted_amount := 0;
        return next;
        return;
      end if;

      safe_amount := least(safe_amount, 3 - today_count);

      update public.ad_reward_events e
      set ad_network = left(coalesce(nullif(trim(ad_network_param), ''), 'admob'), 40),
          ad_unit_id = left(nullif(trim(ad_unit_param), ''), 120),
          amount = safe_amount,
          custom_data = left(nullif(trim(custom_data_param), ''), 240),
          reward_type = safe_reward_type,
          ssv_id = safe_transaction_id,
          transaction_id = safe_transaction_id,
          status = 'confirmed',
          verification_source = 'admob_ssv',
          verification_payload = coalesce(e.verification_payload, '{}'::jsonb) ||
            coalesce(verification_payload, '{}'::jsonb),
          confirmed_at = now()
      where e.id = existing_event.id
      returning e.id, e.status, e.amount into event_id, reward_status, granted_amount;

      return next;
      return;
    end if;

    update public.ad_reward_events e
    set ad_network = left(coalesce(nullif(trim(ad_network_param), ''), 'admob'), 40),
        ad_unit_id = left(nullif(trim(ad_unit_param), ''), 120),
        custom_data = left(nullif(trim(custom_data_param), ''), 240),
        ssv_id = safe_transaction_id,
        transaction_id = safe_transaction_id,
        verification_source = 'admob_ssv',
        verification_payload = coalesce(e.verification_payload, '{}'::jsonb) ||
          coalesce(verification_payload, '{}'::jsonb),
        confirmed_at = case when e.status = 'confirmed' then coalesce(e.confirmed_at, now()) else e.confirmed_at end
    where e.id = existing_event.id
    returning e.id, e.status, e.amount into event_id, reward_status, granted_amount;

    if reward_status = 'rejected' then
      granted_amount := 0;
    end if;

    return next;
    return;
  end if;

  select coalesce(sum(e.amount), 0)::int into today_count
  from public.ad_reward_events e
  where e.user_id = reward_user_id
    and e.status = 'confirmed'
    and e.created_at >= date_trunc('day', now());

  if today_count >= 3 then
    insert into public.ad_reward_events (
      user_id,
      ad_network,
      reward_type,
      amount,
      ssv_id,
      transaction_id,
      ad_unit_id,
      custom_data,
      status,
      verification_source,
      verification_payload,
      rejected_at,
      rejection_reason
    )
    values (
      reward_user_id,
      left(coalesce(nullif(trim(ad_network_param), ''), 'admob'), 40),
      safe_reward_type,
      safe_amount,
      safe_transaction_id,
      safe_transaction_id,
      left(nullif(trim(ad_unit_param), ''), 120),
      left(nullif(trim(custom_data_param), ''), 240),
      'rejected',
      'admob_ssv',
      coalesce(verification_payload, '{}'::jsonb),
      now(),
      'daily reward limit reached'
    )
    returning id, status into event_id, reward_status;

    granted_amount := 0;
    return next;
    return;
  end if;

  safe_amount := least(safe_amount, 3 - today_count);

  insert into public.ad_reward_events (
    user_id,
    ad_network,
    reward_type,
    amount,
    ssv_id,
    transaction_id,
    ad_unit_id,
    custom_data,
    status,
    verification_source,
    verification_payload,
    confirmed_at
  )
  values (
    reward_user_id,
    left(coalesce(nullif(trim(ad_network_param), ''), 'admob'), 40),
    safe_reward_type,
    safe_amount,
    safe_transaction_id,
    safe_transaction_id,
    left(nullif(trim(ad_unit_param), ''), 120),
    left(nullif(trim(custom_data_param), ''), 240),
    'confirmed',
    'admob_ssv',
    coalesce(verification_payload, '{}'::jsonb),
    now()
  )
  returning id, status, amount into event_id, reward_status, granted_amount;

  return next;
end;
$$;

create or replace function public.admin_reject_ad_reward(
  event_id uuid,
  reason text default 'manual review rejected'
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ad_reward_events e
  set status = 'rejected',
      rejected_at = now(),
      rejection_reason = left(coalesce(nullif(trim(reason), ''), 'manual review rejected'), 240)
  where e.id = event_id
    and e.status <> 'rejected';
end;
$$;

grant execute on function public.prepare_ad_reward_attempt(text, int, text) to authenticated;
grant execute on function public.claim_ad_reward(text, int, text) to authenticated;

revoke all on function public.confirm_ad_reward_from_ssv(text, text, text, int, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.confirm_ad_reward_from_ssv(text, text, text, int, text, text, text, jsonb)
  to service_role;

revoke all on function public.admin_reject_ad_reward(uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_reject_ad_reward(uuid, text) to service_role;
