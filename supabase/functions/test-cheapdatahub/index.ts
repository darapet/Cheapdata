import { corsHeaders, getSupabaseAdmin, verifyAuthToken, getSettings, jsonResponse } from '../_shared/helpers.ts';

  const ADMIN_EMAIL = 'daramolapeter98@gmail.com';

  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

      const supabaseAdmin = getSupabaseAdmin();
      const token = authHeader.replace('Bearer ', '');
      const user = await verifyAuthToken(supabaseAdmin, token);
      if (!user || user.email !== ADMIN_EMAIL) return jsonResponse({ error: 'Forbidden' }, 403);

      const settings = await getSettings(supabaseAdmin);
      const key = (settings?.cheapdatahub_api_key as string | null)?.trim();
      if (!key) return jsonResponse({ error: 'No CheapDataHub API key saved. Save your key first in Settings.' }, 400);

      // Correct endpoint from CheapDataHub API docs: GET /api/v1/resellers/wallet/balance/
      const r = await fetch('https://www.cheapdatahub.ng/api/v1/resellers/wallet/balance/', {
        headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
      });

      if (!r.ok) {
        return jsonResponse({ error: `CheapDataHub returned HTTP ${r.status}. Verify your API key is correct.` }, 400);
      }

      const body = await r.json() as Record<string, unknown>;
      // Response format: { "status": "true", "data": { "balance": 2200 } }
      if (body.status !== 'true' && body.status !== true) {
        const msg = String(body.message ?? body.detail ?? 'API key rejected');
        return jsonResponse({ error: `CheapDataHub error: ${msg}` }, 400);
      }

      const data = body.data as Record<string, unknown> | undefined;
      const balance = data?.balance ?? body.balance ?? body.wallet_balance ?? 'unknown';
      return jsonResponse({
        ok: true,
        balance,
        message: `CheapDataHub key is valid ✓ — Wallet Balance: ₦${Number(balance).toLocaleString()}`,
      });
    } catch (err) {
      console.error('test-cheapdatahub error', err);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  });
  
