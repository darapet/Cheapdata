import { corsHeaders, getSupabaseAdmin, verifyAuthToken, getSettings, jsonResponse } from '../_shared/helpers.ts';

const ADMIN_EMAIL = 'daramolapeter98@gmail.com';
const MARKUPS: Record<string, number> = { data: 50, cable: 100, electricity: 150, education: 200 };
const CDH_BASE = 'https://www.cheapdatahub.ng/api/v1/resellers';

// Network ID → name mapping used by CheapDataHub
const NETWORK_ID_MAP: Record<number, string> = { 1: 'MTN', 2: 'AIRTEL', 3: 'GLO', 4: '9MOBILE' };

async function cdhGet(endpoint: string, key: string) {
  const res = await fetch(`${CDH_BASE}/${endpoint}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return null;
  const body = await res.json() as any;
  // CheapDataHub returns status as string "true"
  const ok = body.status === 'true' || body.status === true || body.success === true || body.code === 'success';
  if (!ok) return null;
  // Unwrap common envelope shapes
  return body.data ?? body.plans ?? body.bundles ?? body.results ?? body;
}

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
    if (!key) return jsonResponse({ error: 'No CheapDataHub API key. Save it in Settings first.' }, 400);

    const { service_type } = await req.json() as { service_type: string };
    if (!service_type) return jsonResponse({ error: 'Missing service_type' }, 400);

    const markup = MARKUPS[service_type] ?? 50;
    let imported = 0;
    const warnings: string[] = [];

    // ──────────────────────────────────────────────────────────
    // DATA PLANS
    // CheapDataHub endpoint: GET /resellers/data/
    // Returns: { "status":"true","data":[{"id":1,"network":1,"name":"MTN 1GB","price":"200","validity":"30 days"},...] }
    // OR dict keyed by network name: { "MTN":[...], "AIRTEL":[...] }
    // ──────────────────────────────────────────────────────────
    if (service_type === 'data') {
      // Try endpoints in order — first one that returns data wins
      const endpoints = ['data/', 'data/bundles/', 'data/plans/'];
      let raw: any = null;
      for (const ep of endpoints) {
        raw = await cdhGet(ep, key);
        if (raw != null) break;
      }

      if (!raw) {
        return jsonResponse({ ok: false, imported: 0,
          message: 'CheapDataHub did not return any data plans. Verify your API key has reseller access.' }, 200);
      }

      // Shape A: flat array [{ id, network (int|str), name, price, ... }]
      if (Array.isArray(raw)) {
        for (const p of raw) {
          const wholesale = Number(p.price ?? p.amount ?? p.cost ?? p.plan_price ?? 0);
          if (!wholesale) continue;

          // network can be an int (1=MTN) or a string ("MTN")
          const networkRaw = p.network ?? p.network_id ?? p.provider;
          const network = typeof networkRaw === 'number'
            ? (NETWORK_ID_MAP[networkRaw] ?? String(networkRaw))
            : String(networkRaw ?? 'MTN').toUpperCase();

          const planId = `${network.toLowerCase()}-cdh-${p.id ?? p.bundle_id ?? p.plan_id}`;
          const { error } = await supabaseAdmin.from('data_plans').upsert({
            network,
            plan_name: p.name ?? p.plan_name ?? p.description ?? `${network} Data`,
            data_size: p.data_size ?? p.size ?? p.volume ?? p.allowance ?? '',
            retail_price: wholesale + markup,
            wholesale_price: wholesale,
            plan_id: planId,
            validity: p.validity ?? p.duration ?? p.period ?? '',
            is_active: true,
            service_type: 'data',
            cheapdatahub_plan_id: String(p.id ?? p.bundle_id ?? p.plan_id ?? ''),
          }, { onConflict: 'plan_id' });
          if (!error) imported++;
        }
      } else if (typeof raw === 'object') {
        // Shape B: dict keyed by network name { "MTN": [...], "AIRTEL": [...] }
        for (const [networkKey, planList] of Object.entries(raw)) {
          if (!Array.isArray(planList)) continue;
          const network = networkKey.toUpperCase();
          for (const p of planList as any[]) {
            const wholesale = Number((p as any).price ?? (p as any).amount ?? 0);
            if (!wholesale) continue;
            const planId = `${network.toLowerCase()}-cdh-${(p as any).id ?? (p as any).bundle_id ?? Date.now()}`;
            const { error } = await supabaseAdmin.from('data_plans').upsert({
              network,
              plan_name: (p as any).name ?? (p as any).plan_name ?? `${network} Data`,
              data_size: (p as any).data_size ?? (p as any).size ?? '',
              retail_price: wholesale + markup,
              wholesale_price: wholesale,
              plan_id: planId,
              validity: (p as any).validity ?? (p as any).duration ?? '',
              is_active: true,
              service_type: 'data',
              cheapdatahub_plan_id: String((p as any).id ?? (p as any).bundle_id ?? ''),
            }, { onConflict: 'plan_id' });
            if (!error) imported++;
          }
        }
      }

    // ──────────────────────────────────────────────────────────
    // CABLE TV
    // CheapDataHub endpoint: GET /resellers/cable/plans/
    // Returns: [{ "id":1,"name":"DStv Compact","provider":"DSTV","price":"7900","validity":"Monthly" }]
    // ──────────────────────────────────────────────────────────
    } else if (service_type === 'cable') {
      const endpoints = ['cable/plans/', 'cable/', 'cable/bouquets/'];
      let raw: any = null;
      for (const ep of endpoints) {
        raw = await cdhGet(ep, key);
        if (raw != null) break;
      }

      if (!raw || !Array.isArray(raw)) {
        return jsonResponse({ ok: false, imported: 0,
          message: 'CheapDataHub returned no cable plans. Verify your API key has reseller access.' }, 200);
      }

      for (const p of raw) {
        const wholesale = Number(p.price ?? p.amount ?? p.plan_price ?? 0);
        if (!wholesale) continue;
        const network = (p.provider ?? p.network ?? p.cable_provider ?? 'DSTV').toString().toUpperCase();
        const planId = `cable-${network.toLowerCase()}-${p.id ?? p.plan_id}`;
        const { error } = await supabaseAdmin.from('data_plans').upsert({
          network,
          plan_name: p.name ?? p.plan_name ?? p.bouquet_name ?? '',
          data_size: '',
          retail_price: wholesale + markup,
          wholesale_price: wholesale,
          plan_id: planId,
          validity: p.validity ?? p.duration ?? 'Monthly',
          is_active: true,
          service_type: 'cable',
          cheapdatahub_plan_id: String(p.id ?? p.plan_id ?? ''),
        }, { onConflict: 'plan_id' });
        if (!error) imported++;
      }

    // ──────────────────────────────────────────────────────────
    // EDUCATION / EXAM PINS
    // CheapDataHub endpoint: GET /resellers/exam-pin/
    // Returns: [{ "id":1,"name":"WAEC Result Checker","exam_body":"WAEC","price":"3500" }]
    // ──────────────────────────────────────────────────────────
    } else if (service_type === 'education') {
      const endpoints = ['exam-pin/', 'exam-pin/plans/', 'education/', 'education/plans/'];
      let raw: any = null;
      for (const ep of endpoints) {
        raw = await cdhGet(ep, key);
        if (raw != null) break;
      }

      if (!raw || !Array.isArray(raw)) {
        return jsonResponse({ ok: false, imported: 0,
          message: 'CheapDataHub returned no education plans. Verify your API key has reseller access.' }, 200);
      }

      for (const p of raw) {
        const wholesale = Number(p.price ?? p.amount ?? p.plan_price ?? 0);
        if (!wholesale) continue;
        const network = (p.exam_body ?? p.provider ?? p.name ?? 'WAEC').toString().toUpperCase().split(' ')[0];
        const planId = `edu-${network.toLowerCase()}-${p.id ?? p.plan_id}`;
        const { error } = await supabaseAdmin.from('data_plans').upsert({
          network,
          plan_name: p.name ?? p.plan_name ?? p.description ?? `${network} Result Checker`,
          data_size: '',
          retail_price: wholesale + markup,
          wholesale_price: wholesale,
          plan_id: planId,
          validity: '',
          is_active: true,
          service_type: 'education',
          cheapdatahub_plan_id: String(p.id ?? p.product_id ?? p.plan_id ?? ''),
        }, { onConflict: 'plan_id' });
        if (!error) imported++;
      }
    }

    if (imported > 0) {
      return jsonResponse({ ok: true, imported,
        message: `Synced ${imported} ${service_type} plans (CheapDataHub price + ₦${markup} markup)`,
        warnings: warnings.length ? warnings : undefined });
    }

    return jsonResponse({ ok: false, imported: 0,
      message: 'CheapDataHub returned plans but none could be saved. Check for duplicate plan IDs or DB errors.',
      warnings }, 200);

  } catch (err) {
    console.error('sync-plans error', err);
    return jsonResponse({ error: `Sync error: ${(err as Error).message}` }, 500);
  }
});
