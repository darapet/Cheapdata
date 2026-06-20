# CheapDataHub — GitHub Push Guide

## How to push this code to GitHub

### Step 1: Set up your Supabase database
1. Open your Supabase project at https://supabase.com
2. Go to **SQL Editor** → **New Query**
3. Copy and paste the entire contents of `supabase-schema.sql` and run it
4. This will create all 4 tables: `profiles`, `data_plans`, `wallet_fundings`, `system_settings`

### Step 2: Get your Supabase Service Role Key
1. In Supabase, go to **Settings** → **API**
2. Copy the **service_role** key (secret key)
3. You'll use this when deploying your app

### Step 3: Push to GitHub
Use these commands in your terminal:

```bash
git init
git remote add origin https://github.com/darapet/Cheapdata.git
git add .
git commit -m "Initial commit: CheapDataHub VTU platform"
git branch -M main
git push -u origin main --force
```

When prompted for credentials:
- Username: your GitHub username
- Password: your GitHub Personal Access Token (PAT)

### Step 4: Deploy your app
For deployment (e.g., Railway, Render, Vercel):

**Frontend environment variables:**
```
VITE_SUPABASE_URL=https://vumuvcghlumvenmnaky.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_UhIqZjLUKYN2maABbWpUKg
```

**Backend environment variables:**
```
SUPABASE_URL=https://vumuvcghlumvenmnaky.supabase.co
SUPABASE_ANON_KEY=sb_publishable_UhIqZjLUKYN2maABbWpUKg
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
PAYSTACK_SECRET_KEY=your_paystack_secret_key
CHEAPDATAHUB_API_KEY=your_cheapdatahub_api_key
BREVO_API_KEY=your_brevo_api_key
ADMIN_EMAIL=daramolapeter98@gmail.com
PORT=5000
```

### Step 5: Configure Paystack Webhook
1. Log in to your Paystack dashboard
2. Go to **Settings** → **Webhooks**
3. Add your deployed API URL: `https://your-domain.com/api/webhooks/paystack`
4. Select the `charge.success` event

### Admin Access
Login at `/login` with:
- Email: daramolapeter98@gmail.com  
- Password: Daramolapet@12

After logging in, you'll be automatically routed to `/admin/dashboard`.

## Security Notes
- `.env` is in `.gitignore` — your secrets will NEVER be committed to GitHub
- Use `.env.example` as a reference for required variables
- The `supabase-schema.sql` file sets up Row Level Security (RLS) on all tables
