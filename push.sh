#!/bin/bash
# Run this in the Replit Shell tab to push to GitHub
# Usage: bash push.sh

set -e

cd /home/runner/workspace

echo "Configuring git..."
git config user.email "daramolapeter98@gmail.com"
git config user.name "CheapDataHub"

echo "Staging all files..."
git add -A

echo "Committing..."
git commit -m "feat: CheapDataHub VTU & bill payment platform

- Red & white premium fintech React + Vite frontend
- Express API server with full Supabase integration
- Supabase Auth (email/password) + 4-digit transaction PIN
- Services: Buy Data, Airtime, Cable TV, Electricity
- Paystack charge.success webhook with auto wallet crediting
- CheapDataHub REST API integration for service delivery
- Brevo SMS/Email transactional notifications
- Admin dashboard: all users, all transactions, CSV export
- System settings panel (payment gateway, API keys)
- Registration: name, address, phone, username, email, password
- Wallet funding with dynamic ₦50 gateway fee display
- supabase-schema.sql: complete DB schema with RLS policies
- .env.example: all required environment variables listed
- .gitignore: .env excluded from git" 2>/dev/null || echo "Nothing new to commit - all changes already committed"

echo "Setting remote..."
git remote remove origin 2>/dev/null || true
git remote add origin https://darapet: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@github.com/darapet/Cheapdata.git

echo "Pushing to GitHub..."
git push origin main --force

echo ""
echo "SUCCESS! Code pushed to https://github.com/darapet/Cheapdata"
echo ""
echo "Next steps:"
echo "1. Run supabase-schema.sql in your Supabase SQL Editor"
echo "2. Deploy on Railway/Render/Vercel - see GITHUB-PUSH-GUIDE.md"
