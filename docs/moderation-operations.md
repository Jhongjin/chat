# 신고 검수 운영

기준일: 2026-05-31.

신고 검수 RPC는 `service_role`로만 실행한다. 모바일 앱, 클라이언트 웹, 공개 Edge Function에는 `service_role` key를 넣지 않는다.

## 신고 큐 조회

```sql
select *
from public.admin_report_queue('open', 50);
```

상태값:

- `open`: 새 신고
- `reviewing`: 검토 중
- `resolved`: 처리 완료
- `dismissed`: 신고 기각 또는 중복 종결

## 상태 변경

```sql
select public.admin_update_report_status(
  'REPORT_UUID',
  'reviewing',
  '운영자가 검토를 시작했습니다.'
);
```

## 계정 제재

```sql
select public.admin_suspend_profile(
  'TARGET_USER_UUID',
  '반복적인 외부 메신저 유도',
  now() + interval '7 days'
);
```

제재 해제:

```sql
select public.admin_restore_profile(
  'TARGET_USER_UUID',
  '소명 확인 후 복구'
);
```

## 운영 기준

- 신고/차단/계정 삭제는 결제나 광고 뒤에 숨기지 않는다.
- 위험한 만남 유도, 연락처 강요, 주소 요구는 즉시 검토한다.
- 제재 판단과 사유는 `moderation_actions`에 남긴다.
- 반복 신고 계정은 리워드 부스트와 추가 쪽지권 사용을 제한하는 후속 정책을 적용한다.
