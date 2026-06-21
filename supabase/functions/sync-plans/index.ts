import { corsHeaders, getSupabaseAdmin, verifyAuthToken, getSettings, jsonResponse } from '../_shared/helpers.ts';

const ADMIN_EMAIL = 'daramolapeter98@gmail.com';
const MARKUPS: Record<string, number> = { data: 50, cable: 100, electricity: 150, education: 200 };
const CDH_BASE = 'https://www.cheapdatahub.ng/api/v1/resellers';

const NETWORK_ID_MAP: Record<number, string> = { 1: 'MTN', 2: 'AIRTEL', 3: 'GLO', 4: '9MOBILE' };

type TriedEndpoint = { url: string; status: number | string; body_preview: string };

async function cdhGetWithDebug(endpoint: string, key: string): Promise<{ data: any; tried: TriedEndpoint }> {
  const url = `${CDH_BASE}/${endpoint}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    });
    const text = await res.text();
    let body: any = null;
    try { body = JSON.parse(text); } catch { /* not JSON */ }

    const preview = text.slice(0, 300);
    const tried: TriedEndpoint = { url, status: res.status, body_preview: preview };

    if (!res.ok || !body) return { data: null, tried };

    // CheapDataHub returns status as string "true" or boolean true
    const ok = body.status === 'true' || body.status === true || body.success === true || body.code === 'success';
    if (!ok) return { data: null, tried };

    // Unwrap common envelope shapes
    const data = body.data ?? body.plans ?? body.bundles ?? body.results ?? body;
    return { data, tried };
  } catch (e: any) {
    return { data: null, tried: { url, status: `error: ${e.message}`, body_preview: '' } };
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
    const user = await verifyAuthToken(supabaseAdmin, token);
    if (!user || user.email !== ADMIN_EMAIL) return jsonResponse({ error: 'Forbidden' }, 403);

    const settings = await getSettings(supabaseAdmin);
    const key = (settings?.cheapdatahub_api_key as string | null)?.trim();
    if (!key) return jsonResponse({ error: 'No CheapDataHub API key. Save it in Settings first.' }, 400);

    const body = await req.json() as { service_type: string };
    const { service_type } = body;
    if (!service_type) return jsonResponse({ error: 'Missing service_type' }, 400);

    const markup = MARKUPS[service_type] ?? 50;
    let imported = 0;
    const warnings: string[] = [];
    const debugLog: TriedEndpoint[] = [];

    // ──────────────────────────────────────────────────────────
    // DATA PLANS
    // ──────────────────────────────────────────────────────────
    if (service_type === 'data') {
      const endpoints = [
        'data/',
        'data/plans/',
        'data/bundles/',
        'plans/data/',
        'bundles/',
        'bundles/data/',
        'available-plans/',
        'service-plans/',
      ];

      let raw: any = null;
      for (const ep of endpoints) {
        const { data, tried } = await cdhGetWithDebug(ep, key);
        debugLog.push(tried);
        if (data != null) { raw = data; break; }
      }

      if (!raw) {
        return jsonResponse({
          ok: false,
          imported: 0,
          message: 'CheapDataHub did not return any data plans. Verify your API key has reseller access.',
          debug: debugLog,
        }, 200);
      }

      // Shape A: flat array
      if (Array.isArray(raw)) {
        for (const p of raw) {
          const wholesale = Number(p.price ?? p.amount ?? p.cost ?? p.plan_price ?? p.bundle_price ?? 0);
          if (!wholesale) continue;
          const network = normalizeNetwork(p.network ?? p.network_id ?? p.provider ?? p.network_name);
          const cdhId = String(p.id ?? p.bundle_id ?? p.plan_id ?? '');
          const planId = `${network.toLowerCase()}-cdh-${cdhId || Date.now()}`;
          const { error } = await supabaseAdmin.from('data_plans').upsert({
            network,
            plan_name: p.name ?? p.plan_name ?? p.description ?? p.title ?? `${network} Data`,
            data_size: p.data_size ?? p.size ?? p.volume ?? p.allowance ?? p.mb ?? '',
            retail_price: wholesale + markup,
            wholesale_price: wholesale,
            plan_id: planId,
            validity: p.validity ?? p.duration ?? p.period ?? p.expiry ?? '',
            is_active: true,
            service_type: 'data',
            cheapdatahub_plan_id: cdhId,
          }, { onConflict: 'plan_id' });
          if (error) warnings.push(`Plan ${planId}: ${error.message}`);
          else imported++;
        }
      } else if (typeof raw === 'object') {
        // Shape B: dict keyed by network { "MTN": [...], "AIRTEL": [...] }
        for (const [networkKey, planList] of Object.entries(raw)) {
          if (!Array.isArray(planList)) continue;
          const network = networkKey.toUpperCase();
          for (const p of planList as any[]) {
            const wholesale = Number(p.price ?? p.amount ?? p.plan_price ?? 0);
            if (!wholesale) continue;
            const cdhId = String(p.id ?? p.bundle_id ?? p.plan_id ?? '');
            const planId = `${network.toLowerCase()}-cdh-${cdhId || Date.now()}`;
            const { error } = await supabaseAdmin.from('data_plans').upsert({
              network,
              plan_name: p.name ?? p.plan_name ?? p.description ?? p.title ?? `${network} Data`,
              data_size: p.data_size ?? p.size ?? p.volume ?? p.allowance ?? '',
              retail_price: wholesale + markup,
              wholesale_price: wholesale,
              plan_id: planId,
              validity: p.validity ?? p.duration ?? p.period ?? '',
              is_active: true,
              service_type: 'data',
              cheapdatahub_plan_id: cdhId,
            }, { onConflict: 'plan_id' });
            if (error) warnings.push(`Plan ${planId}: ${error.message}`);
            else imported++;
          }
        }
      }

    // ──────────────────────────────────────────────────────────
    // CABLE TV
    // ──────────────────────────────────────────────────────────
    } else if (service_type === 'cable') {
      const endpoints = [
        'cable/plans/',
        'cable/',
        'cable/bouquets/',
        'plans/cable/',
        'cable/packages/',
        'cable/subscriptions/',
      ];
      let raw: any = null;
      for (const ep of endpoints) {
        const { data, tried } = await cdhGetWithDebug(ep, key);
        debugLog.push(tried);
        if (data != null) { raw = data; break; }
      }

      if (!raw) {
        return jsonResponse({
          ok: false, imported: 0,
          message: 'CheapDataHub returned no cable plans. Verify your API key has reseller access.',
          debug: debugLog,
        }, 200);
      }

      const list = Array.isArray(raw) ? raw : Object.values(raw).flat();
      for (const p of list as any[]) {
        const wholesale = Number(p.price ?? p.amount ?? p.plan_price ?? 0);
        if (!wholesale) continue;
        const network = (p.provider ?? p.network ?? p.cable_provider ?? p.decoder ?? 'DSTV').toString().toUpperCase();
        const cdhId = String(p.id ?? p.plan_id ?? '');
        const planId = `cable-${network.toLowerCase()}-${cdhId || Date.now()}`;
        const { error } = await supabaseAdmin.from('data_plans').upsert({
          network,
          plan_name: p.name ?? p.plan_name ?? p.bouquet_name ?? p.package_name ?? '',
          data_size: '',
          retail_price: wholesale + markup,
          wholesale_price: wholesale,
          plan_id: planId,
          validity: p.validity ?? p.duration ?? 'Monthly',
          is_active: true,
          service_type: 'cable',
          cheapdatahub_plan_id: cdhId,
        }, { onConflict: 'plan_id' });
        if (error) warnings.push(`Cable ${planId}: ${error.message}`);
        else imported++;
      }

    // ──────────────────────────────────────────────────────────
    // EDUCATION / EXAM PINS
    // ──────────────────────────────────────────────────────────
    } else if (service_type === 'education') {
      const endpoints = [
        'exam-pin/',
        'exam-pin/plans/',
        'education/',
        'education/plans/',
        'result-checker/',
        'waec/',
        'jamb/',
        'plans/education/',
      ];
      let raw: any = null;
      for (const ep of endpoints) {
        const { data, tried } = await cdhGetWithDebug(ep, key);
        debugLog.push(tried);
        if (data != null) { raw = data; break; }
      }

      if (!raw) {
        return jsonResponse({
          ok: false, imported: 0,
          message: 'CheapDataHub returned no education plans. Verify your API key has reseller access.',
          debug: debugLog,
        }, 200);
      }

      const list = Array.isArray(raw) ? raw : Object.values(raw).flat();
      for (const p of list as any[]) {
        const wholesale = Number(p.price ?? p.amount ?? p.plan_price ?? 0);
        if (!wholesale) continue;
        const network = (p.exam_body ?? p.provider ?? p.name ?? 'WAEC').toString().toUpperCase().split(' ')[0];
        const cdhId = String(p.id ?? p.product_id ?? p.plan_id ?? '');
        const planId = `edu-${network.toLowerCase()}-${cdhId || Date.now()}`;
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
          cheapdatahub_plan_id: cdhId,
        }, { onConflict: 'plan_id' });
        if (error) warnings.push(`Edu ${planId}: ${error.message}`);
        else imported++;
      }
    }

    if (imported > 0) {
      return jsonResponse({
        ok: true,
        imported,
        message: `Synced ${imported} ${service_type} plans (CheapDataHub price + ₦${markup} markup)`,
        warnings: warnings.length ? warnings : undefined,
      });
    }

    return jsonResponse({
      ok: false,
      imported: 0,
      message: 'CheapDataHub returned plans but none could be saved. Check for duplicate plan IDs or DB errors.',
      warnings,
      debug: debugLog,
    }, 200);

  } catch (err) {
    console.error('sync-plans error', err);
    return jsonResponse({ error: `Sync error: ${(err as Error).message}` }, 500);
  }
});
