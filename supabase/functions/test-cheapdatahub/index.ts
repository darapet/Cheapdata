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

    const endpoints = [
      'https://www.cheapdatahub.ng/api/v1/resellers/wallet/',
      'https://www.cheapdatahub.ng/api/v1/resellers/balance/',
      'https://www.cheapdatahub.ng/api/v1/wallet/',
    ];

    for (const url of endpoints) {
      try {
        const r = await fetch(url, {
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        });
        if (r.ok) {
          const body = await r.json() as Record<string, unknown>;
          const balance =
            (body.balance as number) ??
            ((body.data as Record<string, unknown>)?.balance as number) ??
            (body.wallet_balance as number) ??
            (body.amount as number) ??
            'unknown';
          return jsonResponse({
            ok: true,
            balance,
            message: `CheapDataHub key is valid ✓ — Wallet Balance: ₦${Number(balance).toLocaleString()}`,
          });
        }
      } catch { continue; }
    }

    return jsonResponse({
      error: 'Could not reach CheapDataHub. Verify your API key is correct and try again.',
    }, 400);
  } catch (err) {
    console.error('test-cheapdatahub error', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
