create or replace function public.request_account_deletion()
returns table (
  status text,
  requested_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  insert into public.account_deletion_requests (user_id, status, requested_at, completed_at, retention_reason)
  values (auth.uid(), 'requested', now(), null, null)
  on conflict (user_id) do update
  set status = 'requested',
      requested_at = excluded.requested_at,
      completed_at = null,
      retention_reason = null
  returning account_deletion_requests.status, account_deletion_requests.requested_at
  into status, requested_at;

  update public.profiles
  set status = 'deleted',
      is_deleted = true,
      updated_at = now(),
      last_seen_at = now()
  where id = auth.uid();

  delete from public.user_locations
  where user_id = auth.uid();

  delete from public.push_tokens
  where user_id = auth.uid();

  update public.discovery_settings
  set visible = false,
      updated_at = now()
  where user_id = auth.uid();

  return next;
end;
$$;

grant execute on function public.request_account_deletion() to authenticated;
