import { corsHeaders, getSupabaseAdmin, getSettings, jsonResponse } from '../_shared/helpers.ts';

const MARKUPS: Record<string, number> = { data: 50, cable: 100, electricity: 150, education: 200 };
const NETWORK_ID_MAP: Record<number, string> = { 1: 'MTN', 2: 'AIRTEL', 3: 'GLO', 4: '9MOBILE' };

const PLAN_ENDPOINTS: Record<string, string[]> = {
  data: [
    'api/v1/data-plans/',
    'api/data-plans/',
    'api/v1/plans/',
    'api/plans/',
    'api/v1/data/',
    'api/data/',
    'api/v1/resellers/data/',
    'api/v1/resellers/data/plans/',
    'api/v1/resellers/bundles/',
    'api/services/data/',
  ],
  cable: [
    'api/v1/cable-plans/',
    'api/cable-plans/',
    'api/v1/cable/',
    'api/cable/',
    'api/v1/resellers/cable/',
    'api/v1/resellers/cable/plans/',
    'api/v1/tv/',
    'api/tv/',
  ],
  education: [
    'api/v1/exam-pins/',
    'api/exam-pins/',
    'api/v1/education/',
    'api/education/',
    'api/v1/resellers/exam-pin/',
    'api/v1/waec/',
    'api/waec/',
    'api/v1/result-checker/',
  ],
};

async function cdhGet(baseUrl: string, endpoint: string, key: string): Promise<{ data: any | null; status: number | string; url: string; preview: string }> {
  const url = `${baseUrl}/${endpoint}`;
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Token ${key}`,
        'Content-Type': 'application/json',
      },
    });
    const text = await res.text();
    const preview = text.slice(0, 300);
    if (!res.ok) return { data: null, status: res.status, url, preview };

    let body: any = null;
    try { body = JSON.parse(text); } catch { return { data: null, status: res.status, url, preview }; }

    const ok = body.status === 'true' || body.status === true || body.success === true || body.code === 'success';
    if (!ok) return { data: null, status: res.status, url, preview };

    const data = body.data ?? body.plans ?? body.bundles ?? body.results ?? body;
    return { data, status: res.status, url, preview };
  } catch (e: any) {
    return { data: null, status: `error: ${e.message}`, url, preview: '' };
  }
}

function normalizeNetwork(raw: any): string {
  if (typeof raw === 'number') return NETWORK_ID_MAP[raw] ?? String(raw);
  return String(raw ?? 'MTN').toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const supabaseAdmin = getSupabaseAdmin();
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { data: profile } = await supabaseAdmin.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) return jsonResponse({ error: 'Forbidden' }, 403);

    const settings = await getSettings(supabaseAdmin);
    const key = (settings?.cheapdatahub_api_key as string | null)?.trim();
    if (!key) return jsonResponse({ error: 'No CheapDataHub API key. Save it in Settings first.' }, 400);

    const baseUrl = ((settings?.cheapdatahub_base_url as string | null)?.trim() || 'https://www.cheapdatahub.ng').replace(/\/$/, '');

    const body = await req.json() as { service_type: string };
    const { service_type } = body;
    if (!service_type) return jsonResponse({ error: 'Missing service_type' }, 400);

    const markup = MARKUPS[service_type] ?? 50;
    const endpoints = PLAN_ENDPOINTS[service_type] ?? [];
    const debugLog: { url: string; status: number | string; preview: string }[] = [];

    let raw: any = null;
    for (const ep of endpoints) {
      const { data, status, url, preview } = await cdhGet(baseUrl, ep, key);
      debugLog.push({ url, status, preview });
      if (data != null) { raw = data; break; }
    }

    if (!raw) {
      return jsonResponse({
        ok: false,
        imported: 0,
        message: `CheapDataHub returned no ${service_type} plans. Try setting the correct Base URL in Settings, or verify your API key has reseller access.`,
        debug: debugLog,
      });
    }

    const imported: number[] = [];
    const warnings: string[] = [];

    const planList: any[] = Array.isArray(raw) ? raw : Object.values(raw).flat();

    for (const p of planList) {
      const wholesale = Number(p.price ?? p.amount ?? p.cost ?? p.plan_price ?? p.bundle_price ?? 0);
      if (!wholesale) continue;

      const network = normalizeNetwork(p.network ?? p.network_id ?? p.provider ?? p.network_name ?? 'MTN');
      const cdhId = String(p.id ?? p.bundle_id ?? p.plan_id ?? '');
      const planId = `${service_type}-${network.toLowerCase()}-${cdhId || Date.now()}`;

      const { error } = await supabaseAdmin.from('data_plans').upsert({
        network,
        plan_name: p.name ?? p.plan_name ?? p.description ?? p.title ?? `${network} Plan`,
        data_size: p.data_size ?? p.size ?? p.volume ?? p.allowance ?? p.mb ?? '',
        retail_price: wholesale + markup,
        wholesale_price: wholesale,
        plan_id: planId,
        validity: p.validity ?? p.duration ?? p.period ?? p.expiry ?? '',
        is_active: true,
        service_type,
        cheapdatahub_plan_id: cdhId || null,
      }, { onConflict: 'plan_id' });

      if (error) warnings.push(`${planId}: ${error.message}`);
      else imported.push(1);
    }

    if (imported.length > 0) {
      return jsonResponse({
        ok: true,
        imported: imported.length,
        message: `Synced ${imported.length} ${service_type} plans (wholesale + ₦${markup} markup)`,
        warnings: warnings.length ? warnings : undefined,
      });
    }

    return jsonResponse({
      ok: false,
      imported: 0,
      message: 'CheapDataHub returned plans but none could be saved. Check for DB errors.',
      warnings,
      debug: debugLog,
    });

  } catch (err) {
    console.error('sync-plans error', err);
    return jsonResponse({ error: `Sync error: ${(err as Error).message}` }, 500);
  }
});
