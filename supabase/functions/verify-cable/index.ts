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
    const provider    = (url.searchParams.get('provider')    ?? '').toUpperCase();
    const cardnumber  = (url.searchParams.get('cardnumber')  ?? '').trim();

    if (!provider || !cardnumber) {
      return jsonResponse({ success: false, message: 'provider and cardnumber are required' }, 400);
    }

    const settings = await getSettings(supabaseAdmin);
    if (!settings?.cheapdatahub_api_key) {
      return jsonResponse({ success: true, customer_name: null, skipped: true });
    }

    const apiKey  = settings.cheapdatahub_api_key as string;
    const base    = 'https://www.cheapdatahub.ng/api/v1/resellers';
    const provLow = provider.toLowerCase();

    // Helper to extract name from any response shape
    function extractName(body: Record<string, unknown>): string | null {
      const data = (body.data ?? body) as Record<string, unknown>;
      return (
        data.customer_name ?? data.name ?? data.subscriber_name ??
        data.customerName  ?? data.full_name ??
        body.customer_name ?? body.name ?? body.subscriber_name ?? null
      ) as string | null;
    }

    function isOk(res: Response, body: Record<string, unknown>): boolean {
      return res.ok && (
        body.status === 'true' || body.status === true ||
        body.code === 'success' || body.success === true
      );
    }

    // ── 1. Try POST requests (most CheapDataHub endpoints use POST) ──────────
    const postPayloads = [
      { provider: provider, smart_card_number: cardnumber },
      { provider: provLow,  smart_card_number: cardnumber },
      { provider: provider, cardnumber },
      { provider: provLow,  cardnumber },
    ];

    const postEndpoints = [
      `${base}/cable/verify/`,
      `${base}/cable/validate/`,
      `${base}/cable-tv/verify/`,
      `${base}/cable-subscription/verify/`,
    ];

    for (const endpoint of postEndpoints) {
      for (const payload of postPayloads) {
        try {
          const r = await fetch(endpoint, {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (r.status === 404 || r.status === 405) break; // endpoint doesn't exist, try next
          const body = await r.json() as Record<string, unknown>;
          if (isOk(r, body)) {
            return jsonResponse({ success: true, customer_name: extractName(body) });
          }
          // Got a real 4xx error — return the message so UI can show it
          if (r.status >= 400 && r.status < 500) {
            const msg = String(body.message ?? body.detail ?? 'Invalid card number');
            // Only stop if it's clearly a card error, not an auth/format error
            if (!msg.toLowerCase().includes('invalid') && !msg.toLowerCase().includes('not found')) continue;
            return jsonResponse({ success: false, message: msg });
          }
        } catch { continue; }
      }
    }

    // ── 2. Try GET requests as fallback ────────────────────────────────────────
    const getEndpoints = [
      `${base}/cable/verify/?provider=${provLow}&cardnumber=${cardnumber}`,
      `${base}/cable/verify/?provider=${provider}&smart_card_number=${cardnumber}`,
      `${base}/cable/validate/?provider=${provLow}&cardnumber=${cardnumber}`,
      `${base}/cable/lookup/?provider=${provLow}&smart_card_number=${cardnumber}`,
    ];

    for (const endpoint of getEndpoints) {
      try {
        const r = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        });
        if (r.status === 404 || r.status === 405) continue;
        const body = await r.json() as Record<string, unknown>;
        if (isOk(r, body)) {
          return jsonResponse({ success: true, customer_name: extractName(body) });
        }
        if (r.status >= 400 && r.status < 500) {
          const msg = String(body.message ?? body.detail ?? 'Invalid card number');
          return jsonResponse({ success: false, message: msg });
        }
      } catch { continue; }
    }

    // Nothing worked — allow proceeding without name
    return jsonResponse({ success: true, customer_name: null, skipped: true });

  } catch (err) {
    console.error('verify-cable error', err);
    return jsonResponse({ success: true, customer_name: null, skipped: true });
  }
});
