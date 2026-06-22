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
    const disco = url.searchParams.get('disco') ?? '';
    const meter_number = url.searchParams.get('meter_number') ?? '';
    const meter_type = url.searchParams.get('meter_type') ?? 'prepaid';

    if (!disco || !meter_number) {
      return jsonResponse({ success: false, message: 'disco and meter_number are required' }, 400);
    }

    const settings = await getSettings(supabaseAdmin);
    if (!settings?.cheapdatahub_api_key) {
      return jsonResponse({ success: true, customer_name: null, skipped: true });
    }

    const apiKey = settings.cheapdatahub_api_key as string;

    const verifyEndpoints = [
      `electricity/verify/?disco=${disco.toLowerCase()}&meter_number=${meter_number}&meter_type=${meter_type}`,
      `electricity/validate/?disco=${disco.toLowerCase()}&meter_number=${meter_number}`,
      `electricity/lookup/?disco=${disco.toLowerCase()}&meter_number=${meter_number}`,
    ];

    for (const endpoint of verifyEndpoints) {
      try {
        const r = await fetch(`https://www.cheapdatahub.ng/api/v1/resellers/${endpoint}`, {
          headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json' },
        });
        if (r.status === 404) continue;
        const body = await r.json() as Record<string, unknown>;
        const ok = r.ok && (body.status === 'true' || body.status === true || body.code === 'success');
        if (ok) {
          const data = (body.data ?? body) as Record<string, unknown>;
          const name = (
            data.customer_name ?? data.name ?? data.meter_name ?? data.account_name ??
            body.customer_name ?? body.name ?? null
          ) as string | null;
          const address = (data.address ?? body.address ?? null) as string | null;
          return jsonResponse({ success: true, customer_name: name, address });
        }
        if (r.status !== 404 && r.status !== 405 && r.status !== 500) {
          const msg = String(body.message ?? body.detail ?? 'Invalid meter number');
          return jsonResponse({ success: false, message: msg });
        }
      } catch { continue; }
    }

    // No verify endpoint available — allow proceeding without name
    return jsonResponse({ success: true, customer_name: null, skipped: true });

  } catch (err) {
    console.error('verify-meter error', err);
    return jsonResponse({ success: true, customer_name: null, skipped: true });
  }
});
