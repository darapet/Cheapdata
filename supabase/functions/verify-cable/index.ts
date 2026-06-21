import { corsHeaders, getSupabaseAdmin, verifyAuthToken, getSettings, jsonResponse } from '../_shared/helpers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ success: false, message: 'Unauthorized' }, 401);

    const supabaseAdmin = getSupabaseAdmin();
    const token = authHeader.replace('Bearer ', '');
    const user = await verifyAuthToken(supabaseAdmin, token);
    if (!user) return jsonResponse({ success: false, message: 'Invalid or expired token' }, 401);

    const url = new URL(req.url);
    const provider = url.searchParams.get('provider') ?? '';
    const cardnumber = url.searchParams.get('cardnumber') ?? '';

    if (!provider || !cardnumber) {
      return jsonResponse({ success: false, message: 'provider and cardnumber are required' }, 400);
    }

    const settings = await getSettings(supabaseAdmin);
    if (!settings?.cheapdatahub_api_key) {
      return jsonResponse({ success: true, customer_name: null, skipped: true });
    }

    const apiKey = settings.cheapdatahub_api_key as string;

    // Try GET verify endpoint first
    const verifyEndpoints = [
      `cable/verify/?provider=${provider.toLowerCase()}&cardnumber=${cardnumber}`,
      `cable/validate/?provider=${provider.toLowerCase()}&cardnumber=${cardnumber}`,
      `cable/lookup/?provider=${provider.toLowerCase()}&smart_card_number=${cardnumber}`,
    ];

    for (const endpoint of verifyEndpoints) {
      try {
        const r = await fetch(`https://www.cheapdatahub.ng/api/v1/resellers/${endpoint}`, {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        });
        if (r.status === 404) continue;
        const body = await r.json() as Record<string, unknown>;
        const ok = r.ok && (body.status === 'true' || body.status === true || body.code === 'success');
        if (ok) {
          const data = (body.data ?? body) as Record<string, unknown>;
          const name = (
            data.customer_name ?? data.name ?? data.subscriber_name ??
            body.customer_name ?? body.name ?? null
          ) as string | null;
          return jsonResponse({ success: true, customer_name: name });
        }
        // If endpoint responded (not 404) but said not ok — return the error
        if (r.status !== 404 && r.status !== 405 && r.status !== 500) {
          const msg = String(body.message ?? body.detail ?? 'Invalid card number');
          return jsonResponse({ success: false, message: msg });
        }
      } catch { continue; }
    }

    // No verify endpoint available — allow proceeding without name
    return jsonResponse({ success: true, customer_name: null, skipped: true });

  } catch (err) {
    console.error('verify-cable error', err);
    return jsonResponse({ success: true, customer_name: null, skipped: true });
  }
});
