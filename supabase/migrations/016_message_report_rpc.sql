create or replace function public.report_message(
  target_message_id uuid,
  reason text,
  details text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_details text;
  clean_reason text;
  report_id uuid;
  target_sender_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;

  clean_reason := left(coalesce(nullif(trim(reason), ''), 'message report'), 80);
  clean_details := left(nullif(trim(details), ''), 1000);

  if char_length(clean_reason) < 2 then
    clean_reason := 'message report';
  end if;

  select m.sender_id into target_sender_id
  from public.messages m
  where m.id = target_message_id
    and m.status = 'visible'
    and exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = m.conversation_id
        and cm.user_id = auth.uid()
    );

  if target_sender_id is null then
    raise exception 'message not found';
  end if;

  insert into public.reports (
    reporter_id,
    target_user_id,
    message_id,
    reason,
    details
  )
  values (
    auth.uid(),
    case when target_sender_id = auth.uid() then null else target_sender_id end,
    target_message_id,
    clean_reason,
    clean_details
  )
  returning id into report_id;

  return report_id;
end;
$$;

grant execute on function public.report_message(uuid, text, text) to authenticated;
