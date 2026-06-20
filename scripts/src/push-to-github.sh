#!/bin/bash
# Push CheapDataHub code to GitHub
set -e

REPO_URL="https://darapet:${GITHUB_PAT}@github.com/darapet/Cheapdata.git"

cd /home/runner/workspace

git config --local user.email "daramolapeter98@gmail.com"
git config --local user.name "CheapDataHub"

# Remove any existing remote and re-add with PAT
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"

# Stage all files (respecting .gitignore)
git add -A

# Commit
git commit -m "feat: CheapDataHub VTU & bill payment platform

- Full React + Vite frontend (red & white fintech theme)
- Express API server with Supabase integration
- Supabase Auth (email/password) + 4-digit transaction PIN
- Services: Data, Airtime, Cable TV, Electricity
- Paystack webhook for automated wallet crediting
- CheapDataHub & Brevo API integration
- Admin dashboard: users, transactions, CSV export, settings
- Registration: name, address, phone, username, email, password
- Wallet funding with ₦50 gateway fee display
- supabase-schema.sql for database setup
- .env.example with all required environment variables" || echo "Nothing new to commit"

# Push to GitHub
git push -u origin main --force

echo "Successfully pushed to https://github.com/darapet/Cheapdata"
