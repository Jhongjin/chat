$ErrorActionPreference = "Stop"

Write-Host "DongneOn setup"

$nodeVersion = node --version
Write-Host "Node $nodeVersion"

if ($nodeVersion -notmatch "^v22\.") {
  Write-Warning "Node 22.x is recommended. Current version: $nodeVersion"
}

if (-not (Test-Path ".env")) {
  Copy-Item ".env.example" ".env"
  Write-Host "Created .env from .env.example. Fill Supabase and AdMob public values before backend testing."
} else {
  Write-Host ".env already exists."
}

npm ci
npm run typecheck
npx expo-doctor

Write-Host "Setup complete. Run: npm run web"
