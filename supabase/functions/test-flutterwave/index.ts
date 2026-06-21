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
      const key = (settings?.flutterwave_secret_key as string | null)?.trim();
      if (!key) return jsonResponse({ error: 'No Flutterwave secret key saved. Save your key first.' }, 400);

      const r = await fetch('https://api.flutterwave.com/v3/banks/NG', {
        headers: { Authorization: `Bearer ${key}` },
      });
      const body = await r.json() as { status: string; message: string };
      if (body.status === 'success') {
        return jsonResponse({ ok: true, message: 'Flutterwave key is valid ✓' });
      }
      return jsonResponse({ error: `Flutterwave rejected the key: ${body.message}` }, 400);
    } catch (err) {
      console.error('test-flutterwave error', err);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  });
  