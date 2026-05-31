create or replace function public.claim_notification_jobs(
  batch_size int default 50
) returns table (
  id uuid,
  user_id uuid,
  kind text,
  payload jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with claimed as (
    select nj.id
    from public.notification_jobs nj
    where nj.status = 'pending'
    order by nj.created_at asc
    limit least(greatest(coalesce(batch_size, 50), 1), 100)
    for update skip locked
  )
  update public.notification_jobs nj
  set status = 'processing',
      claimed_at = now(),
      error_text = null
  from claimed
  where nj.id = claimed.id
  returning nj.id, nj.user_id, nj.kind, nj.payload;
end;
$$;

create or replace function public.complete_notification_job(
  job_id uuid,
  next_status text,
  error_message text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if next_status not in ('sent', 'failed', 'skipped') then
    raise exception 'invalid notification job status';
  end if;

  update public.notification_jobs
  set status = next_status,
      sent_at = case when next_status = 'sent' then now() else sent_at end,
      error_text = nullif(left(coalesce(error_message, ''), 1000), '')
  where id = job_id;

  if not found then
    raise exception 'notification job not found';
  end if;
end;
$$;

create or replace function public.reset_stale_notification_jobs()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  reset_count int;
begin
  update public.notification_jobs
  set status = 'pending',
      claimed_at = null,
      error_text = 'processing timeout, reset for retry'
  where status = 'processing'
    and claimed_at < now() - interval '10 minutes';

  get diagnostics reset_count = row_count;
  return reset_count;
end;
$$;

revoke all on function public.claim_notification_jobs(int) from public;
revoke all on function public.complete_notification_job(uuid, text, text) from public;
revoke all on function public.reset_stale_notification_jobs() from public;
