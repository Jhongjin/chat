create or replace function public.my_report_history()
returns table (
  report_id uuid,
  target_user_id uuid,
  target_display_name text,
  reason text,
  status public.report_status,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    r.id as report_id,
    r.target_user_id,
    coalesce(p.display_name, '알 수 없는 사용자') as target_display_name,
    r.reason,
    r.status,
    r.created_at
  from public.reports r
  left join public.profiles p on p.id = r.target_user_id
  where r.reporter_id = auth.uid()
  order by r.created_at desc
  limit 50;
$$;

grant execute on function public.my_report_history() to authenticated;
