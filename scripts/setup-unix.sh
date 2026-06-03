#!/usr/bin/env bash
set -euo pipefail

echo "DongneOn setup"

node_version="$(node --version)"
echo "Node ${node_version}"

if [[ "${node_version}" != v22.* ]]; then
  echo "Warning: Node 22.x is recommended. Current version: ${node_version}" >&2
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example. Fill Supabase and AdMob public values before backend testing."
else
  echo ".env already exists."
fi

npm ci
npm run typecheck
npx expo-doctor

echo "Setup complete. Run: npm run web"
