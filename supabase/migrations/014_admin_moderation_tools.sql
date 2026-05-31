create or replace function public.ensure_service_role()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'service role required';
  end if;
end;
$$;

create or replace function public.admin_report_queue(
  report_state public.report_status default 'open',
  limit_count int default 50
) returns table (
  report_id uuid,
  reporter_id uuid,
  reporter_display_name text,
  target_user_id uuid,
  target_display_name text,
  message_id uuid,
  reason text,
  details text,
  status public.report_status,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_service_role();

  return query
  select
    r.id as report_id,
    r.reporter_id,
    coalesce(reporter.display_name, '알 수 없는 신고자') as reporter_display_name,
    r.target_user_id,
    coalesce(target.display_name, '알 수 없는 사용자') as target_display_name,
    r.message_id,
    r.reason,
    r.details,
    r.status,
    r.created_at
  from public.reports r
  left join public.profiles reporter on reporter.id = r.reporter_id
  left join public.profiles target on target.id = r.target_user_id
  where r.status = report_state
  order by r.created_at asc
  limit least(greatest(coalesce(limit_count, 50), 1), 100);
end;
$$;

create or replace function public.admin_update_report_status(
  target_report_id uuid,
  next_status public.report_status,
  resolution_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
begin
  perform public.ensure_service_role();

  update public.reports
  set status = next_status,
      details = case
        when nullif(trim(coalesce(resolution_note, '')), '') is null then details
        else concat_ws(E'\n', details, concat('[admin] ', left(trim(resolution_note), 500)))
      end
  where id = target_report_id
  returning target_user_id into target_user;

  if not found then
    raise exception 'report not found';
  end if;
end;
$$;

create or replace function public.admin_suspend_profile(
  target_user_id uuid,
  reason text,
  expires_at timestamptz default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_service_role();

  update public.profiles
  set status = 'suspended',
      updated_at = now()
  where id = target_user_id
    and is_deleted = false;

  if not found then
    raise exception 'profile not found';
  end if;

  insert into public.moderation_actions (target_user_id, action, reason, expires_at)
  values (target_user_id, 'suspend', left(coalesce(reason, 'admin action'), 500), expires_at);
end;
$$;

create or replace function public.admin_restore_profile(
  target_user_id uuid,
  reason text default 'restore profile'
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_service_role();

  update public.profiles
  set status = 'active',
      updated_at = now()
  where id = target_user_id
    and is_deleted = false;

  if not found then
    raise exception 'profile not found';
  end if;

  insert into public.moderation_actions (target_user_id, action, reason)
  values (target_user_id, 'restore', left(coalesce(reason, 'restore profile'), 500));
end;
$$;

revoke all on function public.ensure_service_role() from public;
revoke all on function public.admin_report_queue(public.report_status, int) from public;
revoke all on function public.admin_update_report_status(uuid, public.report_status, text) from public;
revoke all on function public.admin_suspend_profile(uuid, text, timestamptz) from public;
revoke all on function public.admin_restore_profile(uuid, text) from public;

grant execute on function public.admin_report_queue(public.report_status, int) to service_role;
grant execute on function public.admin_update_report_status(uuid, public.report_status, text) to service_role;
grant execute on function public.admin_suspend_profile(uuid, text, timestamptz) to service_role;
grant execute on function public.admin_restore_profile(uuid, text) to service_role;
