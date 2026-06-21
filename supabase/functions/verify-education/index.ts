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
    const examBody = (url.searchParams.get('exam_body') ?? '').toUpperCase();
    const regNumber = (url.searchParams.get('reg_number') ?? '').trim();

    if (!examBody || !regNumber) {
      return jsonResponse({ success: false, message: 'exam_body and reg_number are required' }, 400);
    }

    const settings = await getSettings(supabaseAdmin);
    if (!settings?.cheapdatahub_api_key) {
      // No API key — allow proceeding without name lookup
      return jsonResponse({ success: true, student_name: null, skipped: true });
    }

    const apiKey = settings.cheapdatahub_api_key as string;
    const baseUrl = 'https://www.cheapdatahub.ng/api/v1/resellers';

    // Try multiple endpoint patterns CheapDataHub might use
    const endpoints = [
      `${baseUrl}/exam-pin/verify/?exam_body=${examBody}&reg_number=${encodeURIComponent(regNumber)}`,
      `${baseUrl}/exam-pin/verify/?exam_body=${examBody}&registration_number=${encodeURIComponent(regNumber)}`,
      `${baseUrl}/education/verify/?exam_body=${examBody}&reg_number=${encodeURIComponent(regNumber)}`,
      `${baseUrl}/waec/verify/?reg_number=${encodeURIComponent(regNumber)}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const r = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        });

        if (r.status === 404 || r.status === 405) continue;

        const body = await r.json() as Record<string, unknown>;
        const ok = r.ok && (
          body.status === 'true' || body.status === true ||
          body.code === 'success' || body.success === true
        );

        if (ok) {
          const data = (body.data ?? body) as Record<string, unknown>;
          const name = (
            data.student_name ?? data.name ?? data.candidate_name ??
            data.full_name ?? data.customer_name ??
            body.student_name ?? body.name ?? body.candidate_name ?? null
          ) as string | null;
          return jsonResponse({ success: true, student_name: name });
        }

        // Got a real response (not 404) but failed — return error
        if (r.status < 500) {
          const msg = String(body.message ?? body.detail ?? 'Could not verify this registration number');
          return jsonResponse({ success: false, message: msg });
        }
      } catch {
        continue;
      }
    }

    // No endpoint responded — allow without name
    return jsonResponse({ success: true, student_name: null, skipped: true });

  } catch (err) {
    console.error('verify-education error', err);
    return jsonResponse({ success: true, student_name: null, skipped: true });
  }
});
