#!/bin/bash
# full-run.sh - Runs a complete Silicon Pulse data collection cycle
# Schedule this with cron, GitHub Actions, or Supabase scheduled functions.

set -e
cd "$(dirname "$0")/.."

echo "=== Silicon Pulse Full Run $(date -u '+%Y-%m-%dT%H:%M:%SZ') ==="

# Step 1: Update model registry
echo -e "\n[1/5] Updating model registry..."
npx ts-node scripts/update-models.ts

# Step 2: Build news briefs
echo -e "\n[2/5] Building news briefs..."
npx ts-node scripts/build-briefs.ts

# Step 3: Run survey
echo -e "\n[3/5] Running survey..."
npx ts-node scripts/run-survey.ts

# Step 4: Classify open priorities into themes
echo -e "\n[4/5] Classifying open priorities (theme labels)..."
npx ts-node scripts/classify-priority-themes.ts

# Step 5: LLM briefing digest (#1 model in roster)
echo -e "\n[5/5] Generating run digest newsletter..."
npx ts-node --project scripts/tsconfig.json scripts/generate-run-digest.ts

echo -e "\n=== Run complete ==="
