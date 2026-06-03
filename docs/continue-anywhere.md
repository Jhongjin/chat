# 어디서든 이어가기

기준일: 2026-06-03.

DongneOn의 공통 기준점은 GitHub 브랜치, Supabase 클라우드 프로젝트, 문서화된 SQL 적용 순서다. 로컬 `localhost` 프리뷰는 각 PC 안에서만 열리므로 새 PC에서는 repo를 다시 열고 같은 브랜치와 환경 변수를 맞춘다.

## 기준점

- GitHub: `https://github.com/Jhongjin/chat.git`
- 브랜치: `codex/mobile-app-mvp`
- Supabase project ref: `zmmukecvxhehaizwnhpz`
- Supabase URL: `https://zmmukecvxhehaizwnhpz.supabase.co`
- Node: `22.13.0`

## 새 PC에서 시작

```bash
git clone https://github.com/Jhongjin/chat.git
cd chat
git checkout codex/mobile-app-mvp
npm ci
cp .env.example .env
npm run web
```

Windows PowerShell:

```powershell
git clone https://github.com/Jhongjin/chat.git
cd chat
git checkout codex/mobile-app-mvp
.\scripts\setup-windows.ps1
npm run web
```

macOS/Linux:

```bash
git clone https://github.com/Jhongjin/chat.git
cd chat
git checkout codex/mobile-app-mvp
bash scripts/setup-unix.sh
npm run web
```

`.env`에는 모바일 앱에 들어가도 되는 public 값만 넣는다.

```env
EXPO_PUBLIC_SUPABASE_URL=https://zmmukecvxhehaizwnhpz.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_ADMOB_ANDROID_APP_ID=...
EXPO_PUBLIC_ADMOB_IOS_APP_ID=...
EXPO_PUBLIC_ADMOB_ANDROID_REWARDED_ID=...
EXPO_PUBLIC_ADMOB_IOS_REWARDED_ID=...
```

`SUPABASE_SERVICE_ROLE_KEY`, DB password, worker secret은 앱 `.env`나 Git에 넣지 않는다.

## Codespaces 또는 Dev Container

GitHub Codespaces나 VS Code Dev Containers를 쓰면 Node 설치 차이를 줄일 수 있다.

1. GitHub에서 `codex/mobile-app-mvp` 브랜치로 Codespace를 연다.
2. container 생성 후 `npm ci`가 자동 실행된다.
3. `.env.example`을 `.env`로 복사하고 public 값을 입력한다.
4. `npm run web`으로 Expo Web을 실행한다.

## Supabase 적용 상태

라이브 DB 적용은 [라이브 Supabase 적용 체크리스트](./live-supabase-rollout.md)를 기준으로 한다.

- 새 프로젝트: `001`부터 `017`까지 순서대로 SQL 실행
- 기존 프로젝트: 마지막으로 적용한 번호 다음부터 이어서 실행
- Edge Functions: `send-notifications`, `verify-ad-reward`

## 이어받을 때 확인

```bash
git pull --ff-only
npm ci
npm run check
```

작업 전에는 `git status --short --branch`로 브랜치와 변경 상태를 확인한다. 작업 후에는 커밋 메시지에 기능 단위가 드러나게 남긴다.
